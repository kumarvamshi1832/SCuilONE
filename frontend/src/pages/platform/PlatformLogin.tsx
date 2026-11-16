import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LockIcon,
  ShieldCheckIcon,
  ZapIcon,
} from "../../components/common/SupportPortalIcons";
import { useTheme } from "../../context/ThemeContext";
import {
  clearPlatformSession,
  savePlatformSession,
} from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type { PlatformMfaEnrollStartResponse } from "../../types/platform";
import "./PlatformPages.css";

type AuthStep =
  | "credentials"
  | "mfa_enroll"
  | "mfa_verify"
  | "recovery_codes"
  | "change_password";

interface PasswordFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  toggleLabel?: string;
}

function PasswordInputWithToggle({
  toggleLabel = "password",
  className = "platform-input",
  ...inputProps
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="platform-password-wrap">
      <input
        {...inputProps}
        type={visible ? "text" : "password"}
        className={className}
      />
      <button
        type="button"
        className="platform-password-toggle"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? `Hide ${toggleLabel}` : `Show ${toggleLabel}`}
        aria-pressed={visible}
        title={visible ? `Hide ${toggleLabel}` : `Show ${toggleLabel}`}
      >
        {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
      </button>
    </div>
  );
}

export default function PlatformLogin({
  initialStep = "credentials",
}: {
  initialStep?: "credentials" | "change_password";
}) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [tab, setTab] = useState<"login" | "bootstrap">("login");
  const [step, setStep] = useState<AuthStep>(initialStep);
  const [rememberMe, setRememberMe] = useState(false);

  // Login / Bootstrap fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");

  // MFA fields
  const [mfaToken, setMfaToken] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [enrollData, setEnrollData] =
    useState<PlatformMfaEnrollStartResponse | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  // First password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBootstrapShortcut, setShowBootstrapShortcut] = useState(false);
  const [showLoginShortcut, setShowLoginShortcut] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const validateStrongPassword = (
    candidate: string,
    identifiers: string[]
  ): string | null => {
    if (candidate.length < 15) {
      return "Password must contain at least 15 characters.";
    }
    if (candidate.length > 128) {
      return "Password cannot exceed 128 characters.";
    }
    if (!/[A-Z]/.test(candidate)) {
      return "Password must contain at least one uppercase letter.";
    }
    if (!/[a-z]/.test(candidate)) {
      return "Password must contain at least one lowercase letter.";
    }
    if (!/[0-9]/.test(candidate)) {
      return "Password must contain at least one number.";
    }
    if (!/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(candidate)) {
      return "Password must contain at least one special character.";
    }
    const normalized = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
    const seqs = [
      "abcdefghijklmnopqrstuvwxyz",
      "zyxwvutsrqponmlkjihgfedcba",
      "0123456789",
      "9876543210",
    ];
    for (const seq of seqs) {
      for (let i = 0; i <= seq.length - 3; i += 1) {
        if (normalized.includes(seq.slice(i, i + 3))) {
          return "Password cannot contain sequential letters or numbers such as abc, cba, 123, or 321.";
        }
      }
    }
    if (/(.)\1{3,}/i.test(candidate)) {
      return "Password cannot contain four or more repeated characters.";
    }
    for (const raw of identifiers) {
      if (!raw) continue;
      const base = raw.includes("@") ? raw.split("@", 1)[0] : raw;
      const cleaned = (base || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleaned.length >= 4 && normalized.includes(cleaned)) {
        return "Password cannot contain your email username or name.";
      }
    }
    return null;
  };

  const formatAuthError = (err: any, mode: "login" | "bootstrap"): string => {
    const status = err?.response?.status;
    const rawData = err?.response?.data;
    const hasBackendPayload =
      typeof rawData === "string"
        ? Boolean(rawData.trim())
        : Boolean(rawData && typeof rawData === "object" && Object.keys(rawData).length > 0);
    const baseMsg = extractApiErrorMessage(
      err,
      mode === "bootstrap" ? "Bootstrap failed." : "Platform sign-in failed."
    );
    if (status === 503 && mode === "bootstrap") {
      return `${baseMsg} Set PLATFORM_BOOTSTRAP_TOKEN in backend/.env and restart the backend server, or seed an admin with: python -m app.database.seed_platform`;
    }
    if (status === 500 && !hasBackendPayload) {
      return "Cannot reach the FastAPI backend server (HTTP 500 from dev proxy). Start uvicorn on port 8000 and retry.";
    }
    if (status === 409 && mode === "bootstrap") {
      if (baseMsg.toLowerCase().includes("already exists")) {
        setShowLoginShortcut(true);
      }
      return baseMsg;
    }
    if (status === 503 || status === 502 || !err?.response) {
      return `${baseMsg} Ensure the FastAPI backend server is running and reachable.`;
    }
    if (status === 401 && mode === "login") {
      setShowBootstrapShortcut(true);
      return `${baseMsg} Verify your platform email and password, or initialize a Platform Super Admin first if this is a fresh database.`;
    }
    return baseMsg;
  };

  const finalizeAndNavigate = async () => {
    try {
      const me = await platformService.getMe();
      savePlatformSession(
        {
          employee: me.employee,
          user: me.employee,
          role: me.employee?.role,
          dashboard: me.dashboard,
          sidebar_modules: me.sidebar_modules,
          permissions: me.permissions,
        },
        rememberMe
      );
    } catch {
      // Session already has token + basic user; route guard will hydrate
    }
    navigate("/platform/dashboard", { replace: true });
  };

  const handleMfaResponse = async (
    mfaTok: string,
    setupRequired: boolean,
    needsPassChange: boolean,
    usedPassword: string
  ) => {
    setMfaToken(mfaTok);
    setMustChangePassword(needsPassChange);
    setCurrentPassword(usedPassword);

    if (setupRequired) {
      const start = await platformService.startMfaEnrollment(mfaTok, false);
      setEnrollData(start);
      setStep("mfa_enroll");
      setInfo(start.message || "Scan the QR code in your authenticator app.");
    } else {
      setStep("mfa_verify");
      setInfo("Enter the 6-digit code from your authenticator app.");
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setShowBootstrapShortcut(false);
    setShowLoginShortcut(false);
    setInfo(null);
    setLoading(true);
    try {
      const res = await platformService.login({
        email: email.trim(),
        password,
      });
      await handleMfaResponse(
        res.mfa_token,
        Boolean(res.mfa_setup_required),
        Boolean(res.must_change_password ?? res.user?.must_change_password),
        password
      );
    } catch (err) {
      setError(formatAuthError(err, "login"));
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setShowBootstrapShortcut(false);
    setShowLoginShortcut(false);
    setInfo(null);
    const pwErr = validateStrongPassword(password, [email.trim(), fullName.trim()]);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!bootstrapToken.trim()) {
      setError(
        "Bootstrap token is required (must match PLATFORM_BOOTSTRAP_TOKEN configured in backend/.env)."
      );
      return;
    }
    setLoading(true);
    try {
      const res = await platformService.bootstrapSuperAdmin(
        {
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          confirm_password: confirmPassword,
        },
        bootstrapToken.trim()
      );
      try {
        await handleMfaResponse(
          res.mfa_token,
          Boolean(res.mfa_setup_required ?? true),
          false,
          password
        );
        if (res.message) {
          setInfo(`${res.message} Scan the QR code in your authenticator app.`);
        }
      } catch (mfaErr) {
        setTab("login");
        setPassword("");
        setConfirmPassword("");
        setBootstrapToken("");
        setInfo(
          res.message ||
            "Platform Super Admin initialized. Sign in on Staff Sign In to complete MFA setup."
        );
        setError(
          extractApiErrorMessage(mfaErr, "Unable to load MFA enrollment QR right now.")
        );
      }
    } catch (err) {
      setError(formatAuthError(err, "bootstrap"));
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!totpCode.trim()) {
      setError("Enter your verification or recovery code.");
      return;
    }
    setLoading(true);
    try {
      const res =
        step === "mfa_enroll"
          ? await platformService.verifyMfaEnrollment(
              mfaToken,
              totpCode.trim()
            )
          : await platformService.verifyMfa(mfaToken, totpCode.trim());

      savePlatformSession(
        {
          access_token: res.access_token,
          refresh_token: res.refresh_token,
          user: res.user,
          employee: res.user,
          role: res.role,
          permissions: res.permissions,
          tenant: res.tenant,
        },
        rememberMe
      );

      const needsChange =
        mustChangePassword || Boolean(res.user?.must_change_password);
      setMustChangePassword(needsChange);

      if (res.recovery_codes && res.recovery_codes.length > 0) {
        setRecoveryCodes(res.recovery_codes);
        setStep("recovery_codes");
      } else if (needsChange) {
        setStep("change_password");
        setInfo("You must change your temporary password before continuing.");
      } else {
        await finalizeAndNavigate();
      }
    } catch (err) {
      setError(extractApiErrorMessage(err, "MFA verification failed."));
    } finally {
      setLoading(false);
    }
  };

  const handleChangeFirstPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const pwErr = validateStrongPassword(newPassword, [email.trim(), fullName.trim()]);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await platformService.changeFirstPassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmNewPassword,
      });
      savePlatformSession(
        {
          access_token: res.access_token,
          employee: res.employee,
          user: res.employee,
          role: res.employee?.role,
          dashboard: res.dashboard,
          sidebar_modules: res.sidebar_modules,
          permissions: res.permissions,
        },
        rememberMe
      );
      navigate("/platform/dashboard", { replace: true });
    } catch (err) {
      setError(extractApiErrorMessage(err, "Password update failed."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="platform-auth-screen">
      <div className="platform-auth-card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "var(--plat-accent-soft)",
                color: "var(--plat-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ZapIcon size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                SCuilONE Platform Portal
              </h2>
              <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                Super Admin & SaaS Operations Console
              </div>
            </div>
          </div>

          <button
            type="button"
            className="platform-btn sm"
            onClick={toggleTheme}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>

        {error && (
          <div className="platform-alert error" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
            <span style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <AlertTriangleIcon size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{error}</span>
            </span>
            {showBootstrapShortcut && step === "credentials" && tab === "login" && (
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => {
                  setTab("bootstrap");
                  setError(null);
                  setShowBootstrapShortcut(false);
                  setShowLoginShortcut(false);
                }}
              >
                Open Bootstrap Super Admin
              </button>
            )}
            {showLoginShortcut && step === "credentials" && tab === "bootstrap" && (
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => {
                  setTab("login");
                  setError(null);
                  setShowBootstrapShortcut(false);
                  setShowLoginShortcut(false);
                }}
              >
                Go to Staff Sign In
              </button>
            )}
          </div>
        )}

        {info && (
          <div className="platform-alert info">
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircleIcon size={16} />
              <span>{info}</span>
            </span>
          </div>
        )}

        {step === "credentials" && (
          <>
            <div className="platform-tabs" style={{ paddingBottom: 8 }}>
              <button
                type="button"
                className={`platform-tab ${tab === "login" ? "active" : ""}`}
                onClick={() => {
                  setTab("login");
                  setError(null);
                  setShowBootstrapShortcut(false);
                  setShowLoginShortcut(false);
                }}
              >
                Staff Sign In
              </button>
              <button
                type="button"
                className={`platform-tab ${tab === "bootstrap" ? "active" : ""}`}
                onClick={() => {
                  setTab("bootstrap");
                  setError(null);
                  setShowBootstrapShortcut(false);
                  setShowLoginShortcut(false);
                }}
              >
                Bootstrap Super Admin
              </button>
            </div>

            {tab === "login" ? (
              <form
                onSubmit={handleLoginSubmit}
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div className="platform-field">
                  <label>Platform Work Email</label>
                  <input
                    className="platform-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="superadmin@scuilone.com"
                  />
                </div>
                <div className="platform-field">
                  <label>Password</label>
                  <PasswordInputWithToggle
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter platform password"
                  />
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    color: "var(--plat-muted)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Keep platform session across browser restarts
                </label>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={loading}
                >
                  <LockIcon size={16} />
                  <span>{loading ? "Signing in..." : "Continue to MFA"}</span>
                </button>
              </form>
            ) : (
              <form
                onSubmit={handleBootstrapSubmit}
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div style={{ fontSize: 12.5, color: "var(--plat-muted)" }}>
                  One-time initialization of the initial Platform Super Admin
                  account (password minimum 15 characters).
                </div>
                <div className="platform-field">
                  <label>Full Name</label>
                  <input
                    className="platform-input"
                    type="text"
                    required
                    minLength={2}
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Platform Owner Name"
                  />
                </div>
                <div className="platform-field">
                  <label>Email</label>
                  <input
                    className="platform-input"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@scuilone.com"
                  />
                </div>
                <div className="platform-field">
                  <label>Password (min 15 chars)</label>
                  <PasswordInputWithToggle
                    required
                    minLength={15}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Upper, lower, number & special char"
                  />
                </div>
                <div className="platform-field">
                  <label>Confirm Password</label>
                  <PasswordInputWithToggle
                    toggleLabel="confirm password"
                    required
                    minLength={15}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Bootstrap Token (X-Platform-Bootstrap-Token)</label>
                  <PasswordInputWithToggle
                    toggleLabel="bootstrap token"
                    required
                    autoComplete="off"
                    value={bootstrapToken}
                    onChange={(e) => setBootstrapToken(e.target.value)}
                    placeholder="Must match PLATFORM_BOOTSTRAP_TOKEN in backend/.env"
                  />
                  <span style={{ fontSize: 11.5, color: "var(--plat-muted)" }}>
                    Required on the backend: configure <code>PLATFORM_BOOTSTRAP_TOKEN</code> in{" "}
                    <code>backend/.env</code> and restart the backend server before bootstrapping.
                  </span>
                </div>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={loading}
                >
                  <ShieldCheckIcon size={16} />
                  <span>
                    {loading ? "Bootstrapping..." : "Create Platform Super Admin"}
                  </span>
                </button>
              </form>
            )}
          </>
        )}

        {(step === "mfa_enroll" || step === "mfa_verify") && (
          <form
            onSubmit={handleMfaSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {step === "mfa_enroll"
                ? "Set Up Multi-Factor Authentication"
                : "Two-Factor Verification"}
            </div>

            {step === "mfa_enroll" && enrollData && (
              <>
                {enrollData.otpauth_url && (
                  <div className="platform-qr-box">
                    <QRCodeSVG value={enrollData.otpauth_url} size={172} />
                  </div>
                )}
                <div className="platform-field">
                  <label>Manual Authenticator Secret</label>
                  <input
                    className="platform-input"
                    readOnly
                    value={enrollData.secret || ""}
                    style={{ fontFamily: "monospace" }}
                  />
                </div>
                {enrollData.dev_code && (
                  <div className="platform-alert info">
                    <span>Dev Mode TOTP Code: <strong>{enrollData.dev_code}</strong></span>
                  </div>
                )}
              </>
            )}

            <div className="platform-field">
              <label>6-Digit TOTP Code (or Recovery Code)</label>
              <input
                className="platform-input"
                type="text"
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
                autoFocus
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="platform-btn"
                onClick={() => {
                  setStep("credentials");
                  setTotpCode("");
                  setError(null);
                }}
              >
                Back
              </button>
              <button
                type="submit"
                className="platform-btn primary"
                style={{ flex: 1 }}
                disabled={loading}
              >
                <ShieldCheckIcon size={16} />
                <span>{loading ? "Verifying..." : "Verify & Continue"}</span>
              </button>
            </div>
          </form>
        )}

        {step === "recovery_codes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Save Your Backup Recovery Codes
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--plat-muted)" }}>
              Store these one-time recovery codes safely before continuing.
            </p>
            <div className="platform-recovery-codes">
              {recoveryCodes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <button
              type="button"
              className="platform-btn primary"
              onClick={async () => {
                if (mustChangePassword) {
                  setStep("change_password");
                } else {
                  await finalizeAndNavigate();
                }
              }}
            >
              {mustChangePassword
                ? "Continue to Change Temporary Password"
                : "Enter Platform Console"}
            </button>
          </div>
        )}

        {step === "change_password" && (
          <form
            onSubmit={handleChangeFirstPassword}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Change Temporary Password Required
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--plat-muted)" }}>
              Choose a new permanent password (minimum 15 characters, different
              from your temporary password).
            </p>
            <div className="platform-field">
              <label>Current Temporary Password</label>
              <PasswordInputWithToggle
                toggleLabel="current temporary password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="platform-field">
              <label>New Password (min 15 chars)</label>
              <PasswordInputWithToggle
                toggleLabel="new password"
                required
                minLength={15}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="platform-field">
              <label>Confirm New Password</label>
              <PasswordInputWithToggle
                toggleLabel="confirm new password"
                required
                minLength={15}
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="platform-btn"
                onClick={() => {
                  clearPlatformSession();
                  setStep("credentials");
                }}
              >
                Sign Out
              </button>
              <button
                type="submit"
                className="platform-btn primary"
                style={{ flex: 1 }}
                disabled={loading}
              >
                <KeyRoundIcon size={16} />
                <span>{loading ? "Updating..." : "Update & Open Dashboard"}</span>
              </button>
            </div>
          </form>
        )}

        <div
          style={{
            borderTop: "1px solid var(--plat-border)",
            paddingTop: 12,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "var(--plat-muted)",
          }}
        >
          <Link
            to="/login"
            style={{ color: "var(--plat-accent)", textDecoration: "none" }}
          >
            Tenant CRM Sign In →
          </Link>
          <span>MFA Enforced</span>
        </div>
      </div>
    </div>
  );
}
