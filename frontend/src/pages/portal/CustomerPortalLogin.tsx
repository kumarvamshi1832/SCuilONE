import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  LifeBuoyIcon,
  MailIcon,
  LockIcon,
  BuildingIcon,
  ArrowRightIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeOffIcon,
} from "../../components/common/SupportPortalIcons";
import {
  portalLogin,
  getPortalTenantId,
  extractRateLimitInfo,
} from "../../services/customerPortalAuthService";
import "./CustomerPortalLogin.css";

export default function CustomerPortalLogin() {
  const navigate = useNavigate();
  const location = useLocation();

  // Prefill tenant ID if stored previously from activation or login
  const [tenantId, setTenantId] = useState(() => {
    return (
      (location.state as any)?.tenant_id ||
      getPortalTenantId() ||
      ""
    );
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  // Success message passed from activate page — managed in state so it can be cleared on submit or error
  const [successBanner, setSuccessBanner] = useState<string | null>(
    () => (location.state as any)?.message || null
  );

  // Multiple workspaces selection if returned by backend
  const [workspacesList, setWorkspacesList] = useState<
    Array<{
      tenant_id: string;
      tenant_name: string;
      account_id: string;
      account_name: string;
    }>
  >([]);

  // Countdown timer for rate limiting (HTTP 429 Retry-After)
  useEffect(() => {
    if (retryCountdown === null || retryCountdown <= 0) return;
    const timer = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev === null || prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCountdown]);

  const handleSubmit = async (
    e?: React.FormEvent,
    targetTenantId?: string
  ) => {
    if (e) e.preventDefault();
    if (loading) return; // Prevent duplicate submissions / double-clicks
    if (retryCountdown && retryCountdown > 0) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError("Please fill in Email and Password.");
      return;
    }

    const selectedTenant = targetTenantId || tenantId.trim();

    setLoading(true);
    setError(null);
    setSuccessBanner(null);

    const payload: any = {
      email: trimmedEmail,
      password,
    };
    if (selectedTenant) {
      payload.tenant_id = selectedTenant;
    }

    try {
      const result: any = await portalLogin(payload, rememberMe);

      if (result && result.requires_tenant_selection && Array.isArray(result.workspaces)) {
        setWorkspacesList(result.workspaces);
        return;
      }

      const from = (location.state as any)?.from?.pathname || "/portal/dashboard";
      navigate(from, { replace: true });
    } catch (err: any) {
      // Safe development logging without exposing passwords or tokens
      console.error("Portal login failed:", {
        status: err?.response?.status,
        statusText: err?.response?.statusText,
        data: err?.response?.data,
        url: err?.config?.url,
      });

      const rateLimit = extractRateLimitInfo(err);
      if (rateLimit.isRateLimited) {
        if (rateLimit.retryAfterSeconds && rateLimit.retryAfterSeconds > 0) {
          setRetryCountdown(rateLimit.retryAfterSeconds);
          setError(
            `${rateLimit.message} Please try again in ${rateLimit.retryAfterSeconds} seconds.`
          );
        } else {
          setError(
            rateLimit.message || "Too many attempts. Please try again later."
          );
        }
      } else if (!err?.response) {
        setError(
          "Unable to connect to the authentication server. Please check your network connection and verify the backend is running."
        );
      } else {
        const status = err.response.status;
        const responseData = err.response.data;
        const detail = responseData?.detail || responseData?.message || responseData?.error;

        if (status === 401) {
          setError(
            typeof detail === "string"
              ? detail
              : "Invalid email or password. Please verify your credentials."
          );
        } else if (status === 403) {
          setError(
            typeof detail === "string"
              ? detail
              : "Access denied. Your portal account may be suspended or unverified. Please contact your organization administrator."
          );
        } else if (status === 422) {
          if (Array.isArray(detail)) {
            setError(detail.map((d: any) => d.msg || d.detail).join(", "));
          } else if (typeof detail === "string") {
            setError(detail);
          } else {
            setError("Invalid login request format. Please verify your inputs.");
          }
        } else if (status === 500) {
          if (
            typeof detail === "string" &&
            detail.trim().length > 0 &&
            !detail.includes("Traceback") &&
            !detail.includes("File \"") &&
            !detail.includes("psycopg2") &&
            !detail.includes("sqlalchemy")
          ) {
            setError(`Server error (500): ${detail}`);
          } else {
            setError(
              "Server error (500). An internal error occurred while processing your request. Please try again later or contact your administrator."
            );
          }
        } else {
          setError(
            typeof detail === "string"
              ? detail
              : err.message || "Login failed. Please verify your credentials."
          );
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cp-auth-wrapper">
      <div className="cp-auth-card">
        <div className="cp-auth-header">
          <div className="cp-auth-logo">
            <LifeBuoyIcon size={28} />
          </div>
          <h1 className="cp-auth-title">Client Portal Login</h1>
          <p className="cp-auth-subtitle">
            Sign in to track your support tickets, view project updates, and collaborate
          </p>
        </div>

        {!error && successBanner && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "8px",
              color: "#34d399",
              fontSize: "0.875rem",
              marginBottom: 18,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckCircleIcon size={18} />
            <span>{successBanner}</span>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "8px",
              color: "#f87171",
              fontSize: "0.875rem",
              marginBottom: 18,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        {workspacesList.length > 0 ? (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: "0.875rem", color: "#cbd5e1", marginBottom: 12 }}>
              Your email is linked to multiple company workspaces. Please select one:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {workspacesList.map((ws) => (
                <button
                  key={ws.tenant_id}
                  type="button"
                  className="btn-secondary"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "left",
                    color: "#f8fafc",
                  }}
                  onClick={() => handleSubmit(undefined, ws.tenant_id)}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{ws.tenant_name}</div>
                    <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>{ws.account_name}</div>
                  </div>
                  <ArrowRightIcon size={16} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form className="cp-auth-form" onSubmit={(e) => handleSubmit(e)}>
            <div className="cp-auth-field">
              <label>Tenant ID (Organization ID) <span style={{ opacity: 0.6, fontWeight: 400 }}>(Optional)</span></label>
              <div className="cp-auth-input-wrapper">
                <BuildingIcon size={16} className="cp-auth-icon" />
                <input
                  type="text"
                  placeholder="Optional if single company workspace"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                />
              </div>
            </div>

          <div className="cp-auth-field">
            <label>Work Email Address</label>
            <div className="cp-auth-input-wrapper">
              <MailIcon size={16} className="cp-auth-icon" />
              <input
                type="email"
                required
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="cp-auth-field">
            <label>Password</label>
            <div className="cp-auth-input-wrapper">
              <LockIcon size={16} className="cp-auth-icon" />
              <input
                type={showPassword ? "text" : "password"}
                className="with-toggle"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="cp-auth-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide password" : "Show password"}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.8125rem",
            }}
          >
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span style={{ color: "#cbd5e1" }}>Remember me</span>
            </label>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <Link to="/portal/forgot-password" className="cp-auth-link">
                Forgot password?
              </Link>
              <span style={{ color: "#475569" }}>•</span>
              <Link to="/portal/activate" className="cp-auth-link">
                Activate account?
              </Link>
            </div>
          </div>

          <button
            type="submit"
            className="cp-auth-btn-primary"
            disabled={loading || Boolean(retryCountdown && retryCountdown > 0)}
          >
            <span>
              {loading
                ? "Authenticating..."
                : retryCountdown && retryCountdown > 0
                ? `Too many attempts (retry in ${retryCountdown}s)`
                : "Sign In to Portal"}
            </span>
            <ArrowRightIcon size={16} />
          </button>
        </form>
        )}

        <div className="cp-auth-footer">
          <div>
            Have an invitation code?{" "}
            <Link to="/portal/activate" className="cp-auth-link">
              Activate Invitation
            </Link>
          </div>
          <div>
            SCuilONE Employee?{" "}
            <Link to="/login" className="cp-auth-link">
              Staff CRM Login &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
