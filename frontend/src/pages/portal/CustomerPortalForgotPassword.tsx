import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  LifeBuoyIcon,
  MailIcon,
  BuildingIcon,
  ArrowRightIcon,
  AlertCircleIcon,
  CheckCircleIcon,
} from "../../components/common/SupportPortalIcons";
import {
  portalForgotPassword,
  getPortalTenantId,
  extractRateLimitInfo,
} from "../../services/customerPortalAuthService";
import "./CustomerPortalLogin.css";

export default function CustomerPortalForgotPassword() {
  const [email, setEmail] = useState("");
  const [tenantId, setTenantId] = useState(() => getPortalTenantId() || "");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  // Countdown timer for rate limiting (SlowAPI HTTP 429)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (retryCountdown && retryCountdown > 0) return;
    if (loading || submitted) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await portalForgotPassword({
        email: trimmedEmail,
        tenant_id: tenantId.trim() ? tenantId.trim() : undefined,
      });

      setSubmitted(true);
      setSuccessMessage(
        res.message ||
          "If an active portal account exists for this email, a password reset link has been sent."
      );
    } catch (err: any) {
      console.error("Portal forgot password error:", err);
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
      } else {
        setError(
          err?.response?.data?.detail ||
            err?.message ||
            "Unable to process your request at this time. Please try again later."
        );
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
          <h1 className="cp-auth-title">Reset Portal Password</h1>
          <p className="cp-auth-subtitle">
            Enter your account email address and we'll send a secure password reset link.
          </p>
        </div>

        {successMessage ? (
          <div
            style={{
              padding: "16px",
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "10px",
              color: "#34d399",
              fontSize: "0.9rem",
              lineHeight: 1.5,
              marginBottom: "20px",
            }}
            role="status"
          >
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <CheckCircleIcon size={20} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>Check your email</strong>
                <p style={{ margin: "6px 0 0 0", color: "#a7f3d0", fontSize: "0.85rem" }}>
                  {successMessage}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="cp-auth-form" noValidate>
            {error && (
              <div className="cp-auth-error" role="alert">
                <AlertCircleIcon size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="cp-auth-field">
              <label>Portal Email Address</label>
              <div className="cp-auth-input-wrapper">
                <MailIcon size={16} className="cp-auth-icon" />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  disabled={loading || submitted}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="cp-auth-field">
              <label>
                Tenant Workspace ID <span style={{ opacity: 0.6 }}>(Optional)</span>
              </label>
              <div className="cp-auth-input-wrapper">
                <BuildingIcon size={16} className="cp-auth-icon" />
                <input
                  type="text"
                  placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
                  value={tenantId}
                  disabled={loading || submitted}
                  onChange={(e) => setTenantId(e.target.value)}
                />
              </div>
              <small style={{ color: "#94a3b8", fontSize: "0.75rem", marginTop: "4px" }}>
                Optional if your email is registered in a single company workspace.
              </small>
            </div>

            <button
              type="submit"
              className="cp-auth-btn-primary"
              disabled={loading || submitted || Boolean(retryCountdown && retryCountdown > 0)}
              style={{ marginTop: "12px" }}
            >
              <span>
                {loading
                  ? "Sending link..."
                  : retryCountdown && retryCountdown > 0
                  ? `Too many attempts (retry in ${retryCountdown}s)`
                  : "Send Password Reset Link"}
              </span>
              <ArrowRightIcon size={16} />
            </button>
          </form>
        )}

        <div className="cp-auth-footer">
          <div>
            Remembered your password?{" "}
            <Link to="/portal/login" className="cp-auth-link">
              Return to Login
            </Link>
          </div>
          <div>
            Need to activate a new account?{" "}
            <Link to="/portal/activate" className="cp-auth-link">
              Activate Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

