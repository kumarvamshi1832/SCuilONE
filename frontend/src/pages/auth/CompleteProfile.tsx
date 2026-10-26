import { useState, useEffect, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { completeUserProfile } from "../../services/authService";
import "./CompleteProfile.css";

export default function CompleteProfile() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const token = sessionStorage.getItem("onboarding_token");

  const [fullName, setFullName] = useState(() => {
    return sessionStorage.getItem("onboarding_full_name") || "";
  });
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(
        "Your onboarding session has expired or is invalid. Please accept your invitation again."
      );
    }
  }, [token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("Your onboarding session has expired. Please accept your invitation again.");
      return;
    }

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError("Full Name must contain at least 2 characters.");
      return;
    }

    if (!phone.trim() || phone.trim().length < 7) {
      setError("Please enter a valid phone number (at least 7 digits).");
      return;
    }

    if (!jobTitle.trim() || jobTitle.trim().length < 2) {
      setError("Job Title must contain at least 2 characters.");
      return;
    }

    try {
      setLoading(true);

      await completeUserProfile(
        {
          full_name: fullName.trim(),
          phone: phone.trim(),
          job_title: jobTitle.trim(),
        },
        token
      );

      // Clean up temporary onboarding storage
      sessionStorage.removeItem("onboarding_token");
      sessionStorage.removeItem("onboarding_full_name");
      sessionStorage.removeItem("onboarding_email");
      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("tenant");

      // Redirect to login with success message
      navigate("/login", {
        replace: true,
        state: {
          message:
            "Account activated successfully! You can now log in with your new password.",
        },
      });
    } catch (err: any) {
      console.error("Complete profile failed", err);
      const msg =
        err?.message ||
        "Unable to complete your profile. Please check your information and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`complete-profile-wrapper ${theme}`}>
      {/* Theme Toggle Button */}
      <button
        className="complete-profile-theme-toggle"
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

      <div className="complete-profile-card">
        {/* Brand header */}
        <div className="complete-profile-brand-row">
          <div className="complete-profile-logo-badge" aria-hidden="true">S</div>
          <div>
            <h1 className="complete-profile-brand-title">SCuilONE</h1>
          </div>
          <span className="complete-profile-brand-tag">CRM</span>
        </div>

        <h2 className="complete-profile-title">Complete Your Profile</h2>
        <p className="complete-profile-subtext">
          Welcome aboard! Enter your information to finish setting up your account.
        </p>

        {error && (
          <div className="complete-profile-alert error" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {!token ? (
          <div>
            <p style={{ fontSize: "14px", color: "var(--auth-text-muted)", margin: "0 0 20px" }}>
              Please click the setup link in your invitation email to begin.
            </p>
            <Link
              to="/login"
              className="complete-profile-btn"
              style={{ textDecoration: "none" }}
            >
              Go to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="complete-profile-form-group">
              <label className="complete-profile-label" htmlFor="profile-full-name">
                Full Name
              </label>
              <input
                id="profile-full-name"
                type="text"
                className="complete-profile-input"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setError(null);
                }}
                placeholder="Enter your full name"
                minLength={2}
                maxLength={150}
                autoComplete="name"
                disabled={loading}
                required
              />
            </div>

            <div className="complete-profile-form-group">
              <label className="complete-profile-label" htmlFor="profile-phone">
                Phone Number
              </label>
              <input
                id="profile-phone"
                type="tel"
                className="complete-profile-input"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. +1 (555) 000-0000"
                minLength={7}
                maxLength={20}
                autoComplete="tel"
                disabled={loading}
                required
              />
            </div>

            <div className="complete-profile-form-group">
              <label className="complete-profile-label" htmlFor="profile-job-title">
                Job Title
              </label>
              <input
                id="profile-job-title"
                type="text"
                className="complete-profile-input"
                value={jobTitle}
                onChange={(e) => {
                  setJobTitle(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. Senior Account Executive"
                minLength={2}
                maxLength={100}
                autoComplete="organization-title"
                disabled={loading}
                required
              />
            </div>

            <button
              type="submit"
              className="complete-profile-btn"
              disabled={loading || !token}
            >
              {loading ? (
                <>
                  <svg className="complete-profile-spinner" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
                  </svg>
                  <span>Saving Profile & Activating...</span>
                </>
              ) : (
                <span>Activate Account & Log In →</span>
              )}
            </button>

            <div className="complete-profile-step-note">
              Step 2 of 2 · Account Setup
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
