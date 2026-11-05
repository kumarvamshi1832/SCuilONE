import React, { useState, useMemo, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  LifeBuoyIcon,
  KeyRoundIcon,
  LockIcon,
  ArrowRightIcon,
  AlertCircleIcon,
  CheckIcon,
  XIcon,
  EyeIcon,
  EyeOffIcon,
} from "../../components/common/SupportPortalIcons";
import {
  portalResetPassword,
  extractRateLimitInfo,
} from "../../services/customerPortalAuthService";
import "./CustomerPortalLogin.css";

export default function CustomerPortalResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const urlToken = searchParams.get("token") || "";
  const urlTenantId = searchParams.get("tenant_id") || "";

  const [token, setToken] = useState(() => urlToken);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
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

  // Backend enterprise password policy (min 15 characters, uppercase, lowercase, number, special character)
  const passwordChecks = useMemo(() => {
    return {
      minLength: password.length >= 15,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasDigit: /[0-9]/.test(password),
      hasSpecial: /[^A-Za-z0-9]/.test(password),
      matchesConfirm: password.length > 0 && password === confirmPassword,
    };
  }, [password, confirmPassword]);

  const isFormValid =
    token.trim().length > 0 &&
    passwordChecks.minLength &&
    passwordChecks.hasUpper &&
    passwordChecks.hasLower &&
    passwordChecks.hasDigit &&
    passwordChecks.hasSpecial &&
    passwordChecks.matchesConfirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (retryCountdown && retryCountdown > 0) return;
    if (loading) return;

    if (!token.trim()) {
      setError("Reset token is missing. Please use the link provided in your password reset email.");
      return;
    }

    if (!passwordChecks.minLength) {
      setError("Password must be at least 15 characters long as required by enterprise security policy.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await portalResetPassword({
        token: token.trim(),
        new_password: password,
      });

      if (urlTenantId) {
        sessionStorage.setItem("scuilone_portal_tenant_id", urlTenantId);
        localStorage.setItem("scuilone_portal_tenant_id", urlTenantId);
      }

      navigate("/portal/login", {
        replace: true,
        state: {
          tenant_id: urlTenantId,
          message:
            response.message ||
            "Password has been reset successfully. Please sign in with your new password.",
        },
      });
    } catch (err: any) {
      console.error("Portal password reset failed:", err?.response?.data?.detail || err?.message || "Unknown error");
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
            "Password reset failed. The reset link may be invalid or expired (valid for 1 hour)."
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
          <h1 className="cp-auth-title">Create New Password</h1>
          <p className="cp-auth-subtitle">
            Enter your new secure password to restore access to your Customer Portal account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="cp-auth-form" noValidate>
          {error && (
            <div className="cp-auth-error" role="alert">
              <AlertCircleIcon size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* If token was not in URL, allow manual paste */}
          {!urlToken && (
            <div className="cp-auth-field">
              <label>Password Reset Token</label>
              <div className="cp-auth-input-wrapper">
                <KeyRoundIcon size={16} className="cp-auth-icon" />
                <input
                  type="text"
                  required
                  placeholder="Paste your reset token here"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="cp-auth-field">
            <label>New Password</label>
            <div className="cp-auth-input-wrapper">
              <LockIcon size={16} className="cp-auth-icon" />
              <input
                type={showPassword ? "text" : "password"}
                className="with-toggle"
                required
                placeholder="Minimum 15 characters"
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

          <div className="cp-auth-field">
            <label>Confirm New Password</label>
            <div className="cp-auth-input-wrapper">
              <LockIcon size={16} className="cp-auth-icon" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                className="with-toggle"
                required
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                className="cp-auth-password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                title={showConfirmPassword ? "Hide password" : "Show password"}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </div>

          {/* Password Requirements Panel */}
          <div className="cp-password-requirements">
            <div className="cp-requirements-title">Password Requirements</div>
            <div className="cp-requirements-grid">
              <div className={`cp-req-item ${passwordChecks.minLength ? "met" : ""}`}>
                {passwordChecks.minLength ? <CheckIcon size={12} /> : <XIcon size={12} />}
                <span>At least 15 characters</span>
              </div>
              <div className={`cp-req-item ${passwordChecks.hasUpper ? "met" : ""}`}>
                {passwordChecks.hasUpper ? <CheckIcon size={12} /> : <XIcon size={12} />}
                <span>Uppercase letter (A-Z)</span>
              </div>
              <div className={`cp-req-item ${passwordChecks.hasLower ? "met" : ""}`}>
                {passwordChecks.hasLower ? <CheckIcon size={12} /> : <XIcon size={12} />}
                <span>Lowercase letter (a-z)</span>
              </div>
              <div className={`cp-req-item ${passwordChecks.hasDigit ? "met" : ""}`}>
                {passwordChecks.hasDigit ? <CheckIcon size={12} /> : <XIcon size={12} />}
                <span>Number (0-9)</span>
              </div>
              <div className={`cp-req-item ${passwordChecks.hasSpecial ? "met" : ""}`}>
                {passwordChecks.hasSpecial ? <CheckIcon size={12} /> : <XIcon size={12} />}
                <span>Special symbol (!@#$%^&*)</span>
              </div>
              <div className={`cp-req-item ${passwordChecks.matchesConfirm ? "met" : ""}`}>
                {passwordChecks.matchesConfirm ? <CheckIcon size={12} /> : <XIcon size={12} />}
                <span>Passwords match</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="cp-auth-btn-primary"
            disabled={loading || !isFormValid || Boolean(retryCountdown && retryCountdown > 0)}
          >
            <span>
              {loading
                ? "Resetting Password..."
                : retryCountdown && retryCountdown > 0
                ? `Too many attempts (retry in ${retryCountdown}s)`
                : "Set New Password & Sign In"}
            </span>
            <ArrowRightIcon size={16} />
          </button>
        </form>

        <div className="cp-auth-footer">
          <div>
            Remembered your password?{" "}
            <Link to="/portal/login" className="cp-auth-link">
              Sign In to Portal
            </Link>
          </div>
          <div>
            Didn't receive a reset email?{" "}
            <Link to="/portal/forgot-password" className="cp-auth-link">
              Request Again
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

