import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  LifeBuoyIcon,
  MailIcon,
  LockIcon,
  BuildingIcon,
  ArrowRightIcon,
  AlertCircleIcon,
  CheckCircleIcon,
} from "../../components/common/SupportPortalIcons";
import {
  portalLogin,
  getPortalTenantId,
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
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Success message passed from activate page
  const successMessage = (location.state as any)?.message;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId.trim() || !email.trim() || !password) {
      setError("Please fill in Tenant ID, Email, and Password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await portalLogin(
        {
          tenant_id: tenantId.trim(),
          email: email.trim().toLowerCase(),
          password,
        },
        rememberMe
      );

      const from = (location.state as any)?.from?.pathname || "/portal/dashboard";
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error("Portal login failed:", err);
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Invalid email or password. Please verify your credentials."
      );
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

        {successMessage && (
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
            <span>{successMessage}</span>
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

        <form className="cp-auth-form" onSubmit={handleSubmit}>
          <div className="cp-auth-field">
            <label>Tenant ID (Organization ID)</label>
            <div className="cp-auth-input-wrapper">
              <BuildingIcon size={16} className="cp-auth-icon" />
              <input
                type="text"
                required
                placeholder="e.g. 11111111-1111-1111-1111-111111111111"
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
                type="password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
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
            <Link to="/portal/activate" className="cp-auth-link">
              Activate account?
            </Link>
          </div>

          <button type="submit" className="cp-auth-btn-primary" disabled={loading}>
            <span>{loading ? "Authenticating..." : "Sign In to Portal"}</span>
            <ArrowRightIcon size={16} />
          </button>
        </form>

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

