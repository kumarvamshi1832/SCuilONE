import React, { useState, useMemo, useEffect, useRef } from "react";
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
  portalActivate,
  extractRateLimitInfo,
} from "../../services/customerPortalAuthService";
import { useTheme } from "../../context/ThemeContext";
import "./CustomerPortalLogin.css";

export default function CustomerPortalActivate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { theme } = useTheme();

  // Read both query parameters from the invitation URL
  const urlToken = searchParams.get("token") || "";
  const urlTenantId = useMemo(() => searchParams.get("tenant_id") || "", [searchParams]);

  // Token state initialized from URL param, with fallback to manual entry if opened bare
  const [token, setToken] = useState(() => urlToken);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const isSubmittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

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

  // Password Policy Checks (Backend enforces min 15 chars, uppercase, lowercase, number, special char, no sequential sequences)
  const passwordChecks = useMemo(() => {
    const normalized = password.toLowerCase().replace(/[^a-z0-9]/g, "");
    const hasSequential =
      /(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789|890|cba|fed|321|432|543|654|765|876|987)/i.test(
        normalized
      );

    return {
      minLength: password.length >= 15,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasDigit: /[0-9]/.test(password),
      hasSpecial: /[^A-Za-z0-9]/.test(password),
      noSequential: !hasSequential,
      noRepeated: !/(.)\1{3,}/i.test(password),
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
    passwordChecks.noSequential &&
    passwordChecks.noRepeated &&
    passwordChecks.matchesConfirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || loading) return;
    if (retryCountdown && retryCountdown > 0) return;
    if (!token.trim()) {
      setError("Invitation token is missing. Please use the link provided in your invitation email.");
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

    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await portalActivate({
        token: token.trim(),
        password,
      });

      // Preserve tenant_id so it can be used to prefill the login form
      const tenantToUse = response.tenant_id || urlTenantId;
      if (tenantToUse) {
        sessionStorage.setItem("scuilone_portal_tenant_id", tenantToUse);
        localStorage.setItem("scuilone_portal_tenant_id", tenantToUse);
      }

      // Friendly message: if multiple workspaces or existing identity connected, inform the customer
      const friendlyMessage =
        response.message && response.message.toLowerCase().includes("connected")
          ? response.message
          : "Your SCuilONE account is now connected to your company workspace. You can sign in and choose which workspace you want to access.";

      navigate("/portal/login", {
        replace: true,
        state: {
          tenant_id: tenantToUse,
          message: friendlyMessage,
        },
      });
    } catch (err: any) {
      // Do not log raw token or sensitive details to console
      console.error("Portal activation failed:", err?.response?.data?.detail || err?.message || "Unknown error");
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
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail;
        if (status === 422) {
          if (typeof detail === "string") {
            setError(detail);
          } else if (Array.isArray(detail)) {
            setError(detail.map((d: any) => d.msg || d.detail).join(", "));
          } else {
            setError("Password policy error: Password cannot contain your email username, personal name, or common predictable patterns.");
          }
        } else if (status === 500) {
          setError("Server error (500) during activation. Please verify your invitation link or contact support.");
        } else if (typeof detail === "string") {
          setError(detail);
        } else if (Array.isArray(detail)) {
          setError(detail.map((d: any) => d.msg || d.detail || JSON.stringify(d)).join(", "));
        } else if (err?.message) {
          setError(err.message);
        } else {
          setError("Failed to activate account. The invitation token may be invalid, expired, or already used.");
        }
      }
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className={`cp-auth-wrapper ${theme}`}>
      <div className="cp-auth-card">
        <div className="cp-auth-header">
          <div className="cp-auth-logo">
            <LifeBuoyIcon size={28} />
          </div>
          <h1 className="cp-auth-title">Activate Your Customer Portal Account</h1>
          <p className="cp-auth-subtitle">
            Enter a secure password to activate your access and proceed to the portal
          </p>
        </div>

        {error && (
          <div className="cp-auth-alert error" role="alert">
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        <form className="cp-auth-form" onSubmit={handleSubmit}>
          {/* If token was not provided in query param, allow manual entry without exposing it if provided in URL */}
          {!urlToken && (
            <div className="cp-auth-field">
              <label htmlFor="invitation-token">Invitation Token</label>
              <div className="cp-auth-input-wrapper">
                <KeyRoundIcon size={16} className="cp-auth-icon" />
                <input
                  id="invitation-token"
                  type="password"
                  required
                  placeholder="Paste your invitation token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="cp-auth-field">
            <label htmlFor="new-password">New Password</label>
            <div className="cp-auth-input-wrapper">
              <LockIcon size={16} className="cp-auth-icon" />
              <input
                id="new-password"
                type={showPassword ? "text" : "password"}
                className="with-toggle"
                required
                placeholder="Enter new password (min 15 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
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
            <label htmlFor="confirm-password">Confirm Password</label>
            <div className="cp-auth-input-wrapper">
              <LockIcon size={16} className="cp-auth-icon" />
              <input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                className="with-toggle"
                required
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
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

          {/* Real-time Password Policy Checklist */}
          <div className="password-requirements" aria-label="Password requirements">
            <div className={`req-item ${passwordChecks.minLength ? "met" : ""}`}>
              {passwordChecks.minLength ? <CheckIcon size={14} /> : <XIcon size={14} />}
              <span>Minimum 15 characters</span>
            </div>
            <div className={`req-item ${passwordChecks.hasUpper ? "met" : ""}`}>
              {passwordChecks.hasUpper ? <CheckIcon size={14} /> : <XIcon size={14} />}
              <span>Uppercase letter (A-Z)</span>
            </div>
            <div className={`req-item ${passwordChecks.hasLower ? "met" : ""}`}>
              {passwordChecks.hasLower ? <CheckIcon size={14} /> : <XIcon size={14} />}
              <span>Lowercase letter (a-z)</span>
            </div>
            <div className={`req-item ${passwordChecks.hasDigit ? "met" : ""}`}>
              {passwordChecks.hasDigit ? <CheckIcon size={14} /> : <XIcon size={14} />}
              <span>Number (0-9)</span>
            </div>
            <div className={`req-item ${passwordChecks.hasSpecial ? "met" : ""}`}>
              {passwordChecks.hasSpecial ? <CheckIcon size={14} /> : <XIcon size={14} />}
              <span>Special character (!@#$%^&*...)</span>
            </div>
            <div className={`req-item ${passwordChecks.noSequential ? "met" : ""}`}>
              {passwordChecks.noSequential ? <CheckIcon size={14} /> : <XIcon size={14} />}
              <span>No sequential patterns (abc, 123) or personal names</span>
            </div>
            <div className={`req-item ${passwordChecks.matchesConfirm ? "met" : ""}`}>
              {passwordChecks.matchesConfirm ? <CheckIcon size={14} /> : <XIcon size={14} />}
              <span>Password confirmation match</span>
            </div>
          </div>

          <button
            type="submit"
            className="cp-auth-btn-primary"
            disabled={loading || isSubmittingRef.current || !isFormValid || Boolean(retryCountdown && retryCountdown > 0)}
          >
            <span>
              {loading
                ? "Activating Account..."
                : retryCountdown && retryCountdown > 0
                ? `Too many attempts (retry in ${retryCountdown}s)`
                : "Complete Activation"}
            </span>
            <ArrowRightIcon size={16} />
          </button>
        </form>

        <div className="cp-auth-footer">
          <div>
            Already activated?{" "}
            <Link to="/portal/login" className="cp-auth-link">
              Sign In to Portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
