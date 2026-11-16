function assertEqual<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. ${msg || ""}`
    );
  }
}

const assert = {
  equal: assertEqual,
};

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

(globalThis as any).sessionStorage = new MemoryStorage();
(globalThis as any).localStorage = new MemoryStorage();
(globalThis as any).window = { location: { pathname: "/" } };

async function run() {
  const axiosModule = await import("axios");
  const axios = axiosModule.default;
  const { apiClient } = await import("./authService");
  const { platformApiClient } = await import("./platformApiClient");
  const {
    completeAuthenticatedLogin,
    invalidateVerifiedSessionCache,
    isAuthStorageModifiedSinceVerification,
    signOutAndRedirect,
    verifyExistingSession,
  } = await import("./authSession");

  const revokedTokens: string[] = [];

  function getAuthHeader(config: any): string {
    if (!config?.headers) return "";
    if (typeof config.headers.get === "function") {
      return String(config.headers.get("Authorization") || "");
    }
    return String(
      config.headers.Authorization || config.headers.authorization || ""
    );
  }

  const mockAdapter = async (config: any) => {
    const url = String(config.url || "");
    const auth = getAuthHeader(config);

    if (url.includes("/api/v1/auth/logout")) {
      const parsed =
        typeof config.data === "string" ? JSON.parse(config.data) : config.data;
      if (parsed?.refresh_token) {
        revokedTokens.push(parsed.refresh_token);
      }
      return {
        data: { message: "Logged out successfully." },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    }

    if (url.includes("/api/v1/auth/me")) {
      const map: Record<string, any> = {
        "Bearer platform-super-token": {
          user_id: "u-plat-1",
          tenant_id: "t-plat",
          role: "Platform Super Admin",
          status: "active",
          must_change_password: false,
        },
        "Bearer platform-first-login-token": {
          user_id: "u-plat-2",
          tenant_id: "t-plat",
          role: "Platform Admin",
          status: "active",
          must_change_password: true,
        },
        "Bearer crm-software-admin-token": {
          user_id: "u-soft-1",
          tenant_id: "t-soft",
          role: "Tenant Admin",
          status: "active",
          must_change_password: false,
        },
        "Bearer crm-re-sales-token": {
          user_id: "u-re-sales",
          tenant_id: "t-re",
          role: "Sales User",
          status: "active",
          must_change_password: false,
        },
        "Bearer invalid-role-token": {
          user_id: "u-bad-role",
          tenant_id: "t-re",
          role: "",
          status: "active",
          must_change_password: false,
        },
        "Bearer unknown-industry-token": {
          user_id: "u-unk-ind",
          tenant_id: "t-unk",
          role: "Tenant Admin",
          status: "active",
          must_change_password: false,
        },
      };
      const user = map[auth];
      if (!user) {
        throw new axios.AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, {
          status: 401,
          statusText: "Unauthorized",
          headers: {},
          config,
          data: { detail: "Invalid token" },
        });
      }
      return {
        data: { message: "Authenticated user", user },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    }

    if (url.includes("/api/v1/platform/auth/me")) {
      if (auth === "Bearer platform-super-token") {
        return {
          data: {
            employee: {
              user_id: "u-plat-1",
              employee_code: "EMP001",
              full_name: "Platform Super User",
              email: "super@scuilone.com",
              role: "Platform Super Admin",
              role_scope: "platform",
              status: "Active",
              availability_status: "Available",
              max_ticket_load: 10,
              must_change_password: false,
            },
            dashboard: { dashboard_key: "super_admin" },
            sidebar_modules: [],
            permissions: ["*"],
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }
      throw new axios.AxiosError("Forbidden", "ERR_BAD_REQUEST", config, null, {
        status: 403,
        statusText: "Forbidden",
        headers: {},
        config,
        data: { detail: "Password change required" },
      });
    }

    if (url.includes("/api/v1/subscription/billing-profile")) {
      const profiles: Record<string, any> = {
        "Bearer crm-software-admin-token": {
          tenant_id: "t-soft",
          company_name: "Acme Soft",
          industry: "Software Company",
        },
        "Bearer crm-re-sales-token": {
          tenant_id: "t-re",
          company_name: "Acme Homes",
          industry: "Real Estate",
        },
        "Bearer invalid-role-token": {
          tenant_id: "t-re",
          company_name: "Acme Homes",
          industry: "Real Estate",
        },
        "Bearer unknown-industry-token": {
          tenant_id: "t-unk",
          company_name: "Mars Health",
          industry: "Healthcare",
        },
      };
      const profile = profiles[auth];
      if (!profile) {
        throw new axios.AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, {
          status: 401,
          statusText: "Unauthorized",
          headers: {},
          config,
          data: { detail: "Unauthorized" },
        });
      }
      return {
        data: profile,
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    }

    throw new Error(`Unexpected test request URL: ${url}`);
  };

  axios.defaults.adapter = mockAdapter;
  apiClient.defaults.adapter = mockAdapter;
  platformApiClient.defaults.adapter = mockAdapter;

  console.log("=== Running Auth Session Integration & Tamper Resistance Tests ===");

  // Test 1: Platform Super Admin logging in through CRM /login (NEVER lands on /real-estate/dashboard)
  sessionStorage.clear();
  localStorage.clear();
  invalidateVerifiedSessionCache();
  sessionStorage.setItem("access_token", "stale-crm-token");
  sessionStorage.setItem("tenant", JSON.stringify({ id: "old", industry: "Real Estate" }));

  const platLoginRes = await completeAuthenticatedLogin({
    access_token: "platform-super-token",
    refresh_token: "plat-rt-1",
    token_type: "bearer",
    role: "Platform Super Admin",
    tenant: {
      id: "t-plat",
      name: "SCuilONE Platform",
      industry: "Platform Operations",
      is_platform: true,
    },
    message: "ok",
  });
  assert.equal(platLoginRes.ok, true);
  if (platLoginRes.ok) {
    assert.equal(platLoginRes.session.kind, "platform");
    assert.equal(platLoginRes.session.destination, "/platform/dashboard");
  }
  assert.equal(sessionStorage.getItem("access_token"), null, "CRM keys must be cleared on platform login");
  assert.equal(sessionStorage.getItem("platform_access_token"), "platform-super-token");

  // Simulate F5 refresh on Platform session
  invalidateVerifiedSessionCache();
  const platRefresh = await verifyExistingSession();
  assert.equal(platRefresh.status, "authenticated");
  if (platRefresh.status === "authenticated") {
    assert.equal(platRefresh.session.kind, "platform");
    assert.equal(platRefresh.session.destination, "/platform/dashboard");
  }
  console.log("✓ Test 1: Platform Super Admin login & reload stay on /platform/dashboard");

  // Test 2: Platform user with must_change_password -> /platform/change-password
  sessionStorage.clear();
  localStorage.clear();
  invalidateVerifiedSessionCache();
  const firstPlatRes = await completeAuthenticatedLogin({
    access_token: "platform-first-login-token",
    refresh_token: "plat-rt-2",
    token_type: "bearer",
    role: "Platform Admin",
    tenant: {
      id: "t-plat",
      name: "SCuilONE Platform",
      industry: "Platform Operations",
    },
    message: "ok",
  });
  assert.equal(firstPlatRes.ok, true);
  if (firstPlatRes.ok) {
    assert.equal(firstPlatRes.session.kind, "platform");
    assert.equal(firstPlatRes.session.destination, "/platform/change-password");
  }
  console.log("✓ Test 2: Platform first-login must_change_password routes to /platform/change-password");

  // Test 3: Tenant Admin (Software Company) -> /software-company/dashboard
  sessionStorage.clear();
  localStorage.clear();
  invalidateVerifiedSessionCache();
  const softRes = await completeAuthenticatedLogin({
    access_token: "crm-software-admin-token",
    refresh_token: "soft-rt-1",
    token_type: "bearer",
    // Even if login payload omitted/mismatched role/industry, server /auth/me + /billing-profile prevail
    role: "Real Estate Wrong Role",
    tenant: { id: "t-soft", name: "Wrong", industry: "Real Estate" },
    message: "ok",
  });
  assert.equal(softRes.ok, true);
  if (softRes.ok) {
    assert.equal(softRes.session.kind, "crm");
    assert.equal(softRes.session.destination, "/software-company/dashboard");
  }
  console.log("✓ Test 3: Server DB profile overrides stale/mismatched payload to /software-company/dashboard");

  // Test 4: Storage tampering detection & auto-repair (Sales User edits storage to Tenant Admin + Software Company)
  sessionStorage.clear();
  localStorage.clear();
  invalidateVerifiedSessionCache();
  const salesRes = await completeAuthenticatedLogin({
    access_token: "crm-re-sales-token",
    refresh_token: "sales-rt-1",
    token_type: "bearer",
    role: "Sales User",
    tenant: { id: "t-re", name: "Acme Homes", industry: "Real Estate" },
    message: "ok",
  });
  assert.equal(salesRes.ok, true);
  assert.equal(isAuthStorageModifiedSinceVerification(), false);

  // Tamper sessionStorage as an attacker in DevTools
  sessionStorage.setItem(
    "user",
    JSON.stringify({ id: "u-re-sales", role: "Tenant Admin" })
  );
  sessionStorage.setItem(
    "tenant",
    JSON.stringify({ id: "t-soft", name: "Tampered", industry: "Software Company" })
  );
  assert.equal(isAuthStorageModifiedSinceVerification(), true);

  const reVerified = await verifyExistingSession();
  assert.equal(reVerified.status, "authenticated");
  if (reVerified.status === "authenticated") {
    assert.equal(reVerified.session.kind, "crm");
    assert.equal(reVerified.session.destination, "/sales/dashboard");
    assert.equal(reVerified.session.role, "Sales User");
  }
  const repairedUser = JSON.parse(sessionStorage.getItem("user") || "{}");
  const repairedTenant = JSON.parse(sessionStorage.getItem("tenant") || "{}");
  assert.equal(repairedUser.role, "Sales User");
  assert.equal(repairedTenant.industry, "Real Estate");
  console.log("✓ Test 4: Storage tampering detected, rejected, and overwritten with DB truth");

  // Test 5: Missing/invalid role is denied safely (never falls back to Tenant Admin)
  sessionStorage.clear();
  invalidateVerifiedSessionCache();
  const badRoleRes = await completeAuthenticatedLogin({
    access_token: "invalid-role-token",
    refresh_token: "bad-rt",
    token_type: "bearer",
    role: "Tenant Admin",
    tenant: { id: "t-re", name: "Acme Homes", industry: "Real Estate" },
    message: "ok",
  });
  assert.equal(badRoleRes.ok, false);
  if (!badRoleRes.ok) {
    assert.equal(badRoleRes.reason, "MISSING_OR_INVALID_ROLE");
  }
  assert.equal(sessionStorage.getItem("access_token"), null);
  console.log("✓ Test 5: Missing/invalid server role rejected cleanly without session persistence");

  // Test 6: Unknown industry fails closed (never falls back to /real-estate/dashboard)
  sessionStorage.clear();
  invalidateVerifiedSessionCache();
  const badIndRes = await completeAuthenticatedLogin({
    access_token: "unknown-industry-token",
    refresh_token: "bad-ind-rt",
    token_type: "bearer",
    role: "Tenant Admin",
    tenant: { id: "t-unk", name: "Mars Health", industry: "Healthcare" },
    message: "ok",
  });
  assert.equal(badIndRes.ok, false);
  if (!badIndRes.ok) {
    assert.equal(badIndRes.reason, "INVALID_INDUSTRY");
  }
  assert.equal(sessionStorage.getItem("access_token"), null);
  console.log("✓ Test 6: Unknown industry rejected safely without /real-estate/dashboard fallback");

  // Test 7: Logout revokes refresh token, clears storage, invalidates cache
  await completeAuthenticatedLogin({
    access_token: "crm-re-sales-token",
    refresh_token: "sales-rt-logout",
    token_type: "bearer",
    message: "ok",
  });
  await signOutAndRedirect();
  assert.equal(revokedTokens.includes("sales-rt-logout"), true);
  assert.equal(sessionStorage.getItem("access_token"), null);
  assert.equal(sessionStorage.getItem("user"), null);
  const afterLogout = await verifyExistingSession();
  assert.equal(afterLogout.status, "unauthenticated");
  console.log("✓ Test 7: Logout revokes token, clears storage, and invalidates verification cache");

  console.log("=== All Auth Session Integration Tests Passed! ===");
}

run().catch((err) => {
  console.error(err);
  throw err;
});
