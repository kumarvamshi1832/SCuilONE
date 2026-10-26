import { useState, useEffect, useMemo, FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import {
  getInvitationDetails,
  setInvitationPassword,
  InvitationDetailsResponse,
} from "../../services/authService";
import "./AcceptInvitation.css";

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const token = searchParams.get("token") || "";

  // State
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [invitationData, setInvitationData] = useState<InvitationDetailsResponse | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setTokenError(
        "Invitation token is missing. Please open the secure setup link sent to your email address."
      );
      setLoadingDetails(false);
      return;
    }

    let isMounted = true;
    setLoadingDetails(true);
    setTokenError(null);

    getInvitationDetails(token)
      .then((data) => {
        if (!isMounted) return;
        setInvitationData(data);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        console.error("Token verification failed", err);
        const msg =
          err?.message ||
          "This invitation link is invalid or has expired. Please ask your administrator to send a new invitation.";
        setTokenError(msg);
      })
      .finally(() => {
        if (isMounted) {
          setLoadingDetails(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Validation rules matching backend password policy
  const rules = useMemo(() => {
    return {
      minLength: password.length >= 15,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;/]/.test(password),
      passwordsMatch: Boolean(password && confirmPassword && password === confirmPassword),
    };
  }, [password, confirmPassword]);

  const allRulesSatisfied =
    rules.minLength &&
    rules.hasUpper &&
    rules.hasLower &&
    rules.hasNumber &&
    rules.hasSpecial &&
    rules.passwordsMatch;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!token) {
      setFormError("Invitation token is missing.");
      return;
    }

    if (!allRulesSatisfied) {
      if (!rules.minLength) {
        setFormError("Password must be at least 15 characters long.");
      } else if (!rules.hasUpper || !rules.hasLower || !rules.hasNumber || !rules.hasSpecial) {
        setFormError("Password must include uppercase, lowercase, numbers, and special characters.");
      } else if (!rules.passwordsMatch) {
        setFormError("Passwords do not match. Please verify both fields.");
      }
      return;
    }

    try {
      setSubmitting(true);

      const response = await setInvitationPassword({
        invitation_token: token,
        password,
        confirm_password: confirmPassword,
      });

      if (!response.access_token) {
        throw new Error("Unable to obtain onboarding session. Please try again.");
      }

      // Clear any previous stale session data
      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("tenant");

      // Save onboarding token and pre-fill details for profile step
      sessionStorage.setItem("onboarding_token", response.access_token);
      if (response.full_name || invitationData?.full_name) {
        sessionStorage.setItem(
          "onboarding_full_name",
          response.full_name || invitationData?.full_name || ""
        );
      }
      if (response.email || invitationData?.email) {
        sessionStorage.setItem(
          "onboarding_email",
          response.email || invitationData?.email || ""
        );
      }

      // Seamlessly transition to Complete Profile
      navigate("/complete-profile", { replace: true });
    } catch (err: any) {
      console.error("Failed to set password", err);
      const msg =
        err?.message ||
        "Failed to set password. Your invitation link may be invalid or expired.";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`auth-setup-wrapper ${theme}`}>
      {/* Theme Toggle Button */}
      <button
        className="auth-theme-toggle"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        type="button"
      >
        {theme === "light" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
      </button>

      <div className="auth-setup-card">
        {/* SCuilONE Branding */}
        <div className="auth-brand-row">
          <div className="auth-logo-badge" aria-hidden="true">S</div>
          <div>
            <h1 className="auth-brand-title">SCuilONE</h1>
          </div>
          <span className="auth-brand-tag">CRM</span>
        </div>

        {/* LOADING STATE */}
        {loadingDetails && (
          <div style={{ textAlign: "center", padding: "40px 10px" }}>
            <svg
              className="auth-spinner"
              viewBox="0 0 24 24"
              fill="none"
              style={{ width: "32px", height: "32px", color: "var(--auth-color-primary)", margin: "0 auto 16px" }}
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
            </svg>
            <p style={{ margin: 0, color: "var(--auth-text-muted)", fontSize: "14px" }}>
              Verifying your invitation link...
            </p>
          </div>
        )}

        {/* ERROR STATE: Missing, Invalid, or Expired Token */}
        {!loadingDetails && tokenError && (
          <div>
            <div
              className="auth-alert-box error"
              style={{ padding: "16px", marginBottom: "20px" }}
              role="alert"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <strong style={{ display: "block", marginBottom: "4px", fontSize: "15px" }}>
                  Invitation Link Unavailable
                </strong>
                <span>{tokenError}</span>
              </div>
            </div>

            <p style={{ fontSize: "14px", color: "var(--auth-text-muted)", lineHeight: 1.5, margin: "0 0 20px" }}>
              If you have already set up your password, you can sign in directly to your CRM account.
            </p>

            <Link to="/login" className="auth-submit-btn" style={{ textDecoration: "none" }}>
              Go to Login
            </Link>
          </div>
        )}

        {/* VALID STATE: Set Password Form */}
        {!loadingDetails && !tokenError && (
          <>
            <h2 className="auth-card-title">
              {invitationData?.full_name
                ? `Welcome, ${invitationData.full_name}`
                : "Welcome to SCuilONE"}
            </h2>
            <p className="auth-card-subtext">
              Set up your secure password to activate your account.
            </p>

            {/* Invited Account Details (preserves role & email) */}
            <div className="auth-account-pill">
              <span className="auth-account-label">Invited Account</span>
              <div className="auth-account-details">
                <span className="auth-account-email">{invitationData?.email}</span>
                {invitationData?.role && (
                  <span className="auth-account-role">{invitationData.role}</span>
                )}
              </div>
            </div>

            {formError && (
              <div className="auth-alert-box error" role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* New Password */}
              <div className="auth-form-group">
                <label className="auth-form-label" htmlFor="set-new-password">
                  New Password
                </label>
                <div className="auth-input-container">
                  <input
                    id="set-new-password"
                    type={showPassword ? "text" : "password"}
                    className="auth-input"
                    placeholder="Enter your new password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFormError(null);
                    }}
                    disabled={submitting}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="auth-input-reveal-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="auth-form-group">
                <label className="auth-form-label" htmlFor="set-confirm-password">
                  Confirm Password
                </label>
                <div className="auth-input-container">
                  <input
                    id="set-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    className="auth-input"
                    placeholder="Confirm your new password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setFormError(null);
                    }}
                    disabled={submitting}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="auth-input-reveal-btn"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Password Requirements Checklist */}
              <div className="auth-req-box">
                <div className="auth-req-title">Password Requirements:</div>
                <ul className="auth-req-list">
                  <li className={`auth-req-item ${rules.minLength ? "met" : ""}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      {rules.minLength ? (
                        <polyline points="20 6 9 17 4 12" />
                      ) : (
                        <circle cx="12" cy="12" r="4" fill="currentColor" />
                      )}
                    </svg>
                    <span>At least 15 characters</span>
                  </li>
                  <li className={`auth-req-item ${rules.hasUpper ? "met" : ""}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      {rules.hasUpper ? (
                        <polyline points="20 6 9 17 4 12" />
                      ) : (
                        <circle cx="12" cy="12" r="4" fill="currentColor" />
                      )}
                    </svg>
                    <span>One uppercase letter</span>
                  </li>
                  <li className={`auth-req-item ${rules.hasLower ? "met" : ""}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      {rules.hasLower ? (
                        <polyline points="20 6 9 17 4 12" />
                      ) : (
                        <circle cx="12" cy="12" r="4" fill="currentColor" />
                      )}
                    </svg>
                    <span>One lowercase letter</span>
                  </li>
                  <li className={`auth-req-item ${rules.hasNumber ? "met" : ""}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      {rules.hasNumber ? (
                        <polyline points="20 6 9 17 4 12" />
                      ) : (
                        <circle cx="12" cy="12" r="4" fill="currentColor" />
                      )}
                    </svg>
                    <span>At least one number</span>
                  </li>
                  <li className={`auth-req-item ${rules.hasSpecial ? "met" : ""}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      {rules.hasSpecial ? (
                        <polyline points="20 6 9 17 4 12" />
                      ) : (
                        <circle cx="12" cy="12" r="4" fill="currentColor" />
                      )}
                    </svg>
                    <span>One special character</span>
                  </li>
                  <li className={`auth-req-item ${rules.passwordsMatch ? "met" : ""}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      {rules.passwordsMatch ? (
                        <polyline points="20 6 9 17 4 12" />
                      ) : (
                        <circle cx="12" cy="12" r="4" fill="currentColor" />
                      )}
                    </svg>
                    <span>Passwords match</span>
                  </li>
                </ul>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="auth-submit-btn"
                disabled={submitting || !allRulesSatisfied}
              >
                {submitting ? (
                  <>
                    <svg className="auth-spinner" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
                    </svg>
                    <span>Setting Password...</span>
                  </>
                ) : (
                  <span>Set Password & Continue →</span>
                )}
              </button>

              <div className="auth-step-footer">
                Step 1 of 2 · Account Setup
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
