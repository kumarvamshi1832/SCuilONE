import { FormEvent, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../../services/authService";
import { useTheme } from "../../context/ThemeContext";
import { normalizeIndustry } from "../../utils/industryUtils";
import backdropDark from "../../assets/login-full-backdrop.jpg";
import backdropLight from "../../assets/login-full-backdrop-light.jpg";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  // Email field initializes empty per requirements
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem("scuilone_remember_me") === "true";
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (rememberMe && email) {
      localStorage.setItem("scuilone_remember_email", email);
      localStorage.setItem("scuilone_remember_me", "true");
    } else if (!rememberMe) {
      localStorage.removeItem("scuilone_remember_email");
      localStorage.removeItem("scuilone_remember_me");
    }
  }, [rememberMe, email]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    try {
      setLoading(true);
      const response = await loginUser({
        email: email.trim().toLowerCase(),
        password,
      });

      if (response.requires_mfa || response.mfa_required) {
        const mfaToken = response.mfa_token || response.temp_token || "";
        const isSetupRequired = Boolean(
          response.mfa_setup_required ||
          response.next_step === "mfa_enrollment"
        );

        sessionStorage.setItem("mfa_email", email.trim().toLowerCase());
        if (mfaToken) {
          sessionStorage.setItem("mfa_token", mfaToken);
          sessionStorage.setItem("mfa_temp_token", mfaToken);
        }
        sessionStorage.setItem("otp_flow", "mfa");

        if (isSetupRequired) {
          sessionStorage.setItem("mfa_setup_required", "true");
          navigate("/mfa-setup");
        } else {
          sessionStorage.removeItem("mfa_setup_required");
          navigate("/mfa");
        }
      } else {
        // Clear previous session data to ensure account switching is clean
        sessionStorage.clear();

        if (response.access_token) {
          sessionStorage.setItem("access_token", response.access_token);
        }
        if (response.refresh_token) {
          sessionStorage.setItem("refresh_token", response.refresh_token);
        }
        if (response.tenant) {
          sessionStorage.setItem("tenant", JSON.stringify(response.tenant));
        }

        const userObj = {
          ...(response.user || {}),
          role: response.role,
          permissions: response.permissions || [],
        };
        sessionStorage.setItem("user", JSON.stringify(userObj));

        const userRole = (response.role || "").toUpperCase();
        if (userRole === "MANAGER" || userRole.includes("MANAGER")) {
          navigate("/manager/dashboard");
        } else if (
          userRole === "SALES_USER" ||
          userRole === "SALES USER" ||
          userRole.includes("SALES")
        ) {
          navigate("/sales/dashboard");
        } else if (
          userRole === "OPERATIONS_USER" ||
          userRole === "OPERATIONS USER" ||
          userRole.includes("OPERATIONS")
        ) {
          navigate("/operations/dashboard");
        } else if (
          userRole === "SUPPORT_USER" ||
          userRole === "SUPPORT USER" ||
          userRole.includes("SUPPORT")
        ) {
          navigate("/support/dashboard");
        } else if (
          userRole === "READ_ONLY" ||
          userRole === "AUDITOR" ||
          userRole === "READ ONLY" ||
          userRole === "READ-ONLY" ||
          userRole === "READ-ONLY / AUDITOR" ||
          userRole === "READ ONLY / AUDITOR" ||
          userRole === "READ_ONLY / AUDITOR" ||
          userRole.includes("AUDITOR")
        ) {
          navigate("/auditor/dashboard");
        } else {
          const industrySlug = normalizeIndustry(response.tenant?.industry);
          navigate(`/${industrySlug}/dashboard`);
        }
      }
    } catch (err) {
      const apiError = err as { message?: string; status?: number };
      if (apiError.status === 401) {
        setError("Invalid email or password. Please check your credentials and try again.");
      } else if (apiError.status === 403) {
        setError(apiError.message || "Your account is inactive. Contact your administrator.");
      } else if (apiError.status && apiError.status >= 500) {
        setError("Server error. Please try again later.");
      } else if (
        apiError.status === 0 ||
        (apiError.message &&
          (apiError.message.includes("Unable to reach") ||
            apiError.message.includes("Network Error")))
      ) {
        setError("Unable to reach the server. Please check your internet connection.");
      } else {
        setError(apiError.message || "Invalid email or password. Please check your credentials and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const currentBackdrop = theme === "dark" ? backdropDark : backdropLight;

  return (
    <div className={`login-page-root ${theme}`}>
      {/* Background Image Viewport */}
      <div
        className="login-viewport-container"
        style={{ backgroundImage: `url(${currentBackdrop})` }}
      >
        {/* Soft Ambient Overlay to guarantee optimal readability */}
        <div className="login-ambient-scrim" aria-hidden="true" />

        {/* TOP HEADER BAR */}
        <header className="login-top-navbar">
          {/* Left Brand Identity */}
          <div className="brand-badge-container">
            <div className="brand-logo-squircle" aria-hidden="true">
              <span className="brand-logo-glyph">S</span>
            </div>
            <div className="brand-text-block">
              <span className="brand-heading-primary">SCuilONE</span>
              <span className="brand-sub-label">CRM</span>
            </div>
          </div>

          {/* Right Theme Switcher Pill */}
          <div className="navbar-theme-action">
            <button
              type="button"
              className="theme-toggle-pill"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              <span className={`toggle-icon sun-icon ${theme === "light" ? "active" : ""}`}>
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
              </span>
              <span className={`toggle-icon moon-icon ${theme === "dark" ? "active" : ""}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </span>
            </button>
          </div>
        </header>

        {/* MAIN TWO-PANEL CONTENT CONTAINER */}
        <main className="login-content-split">
          {/* LEFT BRANDING HERO SECTION */}
          <section className="left-branding-hero">
            <div className="hero-typography-group">
              <h1 className="hero-main-heading">
                <span className="heading-line-one">One Platform.</span>
                <span className="heading-line-two">Every Industry.</span>
              </h1>
              <p className="hero-description-paragraph">
                Connect teams, manage relationships<br />
                and grow your business with SCuilONE CRM.
              </p>
            </div>

            {/* 2x2 Feature Grid */}
            <div className="features-grid-2x2" aria-label="Platform Highlights">
              {/* Feature 1 */}
              <div className="feature-grid-item">
                <div className="feature-icon-badge badge-color-blue" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div className="feature-text-block">
                  <h2 className="feature-item-title">Multi-Industry Platform</h2>
                  <p className="feature-item-desc">Adaptable for any business type</p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="feature-grid-item">
                <div className="feature-icon-badge badge-color-purple" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
                <div className="feature-text-block">
                  <h2 className="feature-item-title">Unified CRM Solution</h2>
                  <p className="feature-item-desc">Manage leads, customers and sales</p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="feature-grid-item">
                <div className="feature-icon-badge badge-color-teal" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <div className="feature-text-block">
                  <h2 className="feature-item-title">Secure & Scalable</h2>
                  <p className="feature-item-desc">Enterprise-grade security and performance</p>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="feature-grid-item">
                <div className="feature-icon-badge badge-color-amber" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div className="feature-text-block">
                  <h2 className="feature-item-title">Drive Business Growth</h2>
                  <p className="feature-item-desc">Turn relationships into revenue</p>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT INTERACTIVE LOGIN CARD SECTION */}
          <section className="right-interactive-card-area">
            <div className="login-card-glassmorphism">
              {/* Card Header */}
              <div className="login-card-header">
                <span className="card-welcome-tag">WELCOME BACK</span>
                <h2 className="card-title-main">
                  <span className="title-prefix">Login to </span>
                  <span className="title-brand-name">SCuilONE </span>
                  <span className="title-crm-accent">CRM</span>
                </h2>
                <p className="card-subtitle-desc">
                  Continue to your account and manage your business.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="login-interactive-form" noValidate>
                <div className="form-fields-wrapper">
                  {/* Email Field */}
                  <div className="form-group-item">
                    <label htmlFor="login-email-input" className="input-field-label">
                      Email
                    </label>
                    <div className="input-box-container">
                      <span className="input-leading-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="20" height="16" x="2" y="4" rx="2" />
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                      </span>
                      <input
                        id="login-email-input"
                        type="email"
                        className="styled-input-control"
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setError("");
                        }}
                        disabled={loading}
                        autoComplete="username"
                        required
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="form-group-item">
                    <label htmlFor="login-password-input" className="input-field-label">
                      Password
                    </label>
                    <div className="input-box-container">
                      <span className="input-leading-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                      <input
                        id="login-password-input"
                        type={showPassword ? "text" : "password"}
                        className="styled-input-control with-trailing-action"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError("");
                        }}
                        disabled={loading}
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        className="input-trailing-reveal-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                            <line x1="2" x2="22" y1="2" y2="22" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Remember Me and Forgot Password */}
                  <div className="login-options-row">
                    <label className="checkbox-label-wrapper">
                      <input
                        type="checkbox"
                        id="remember-me-toggle"
                        className="native-checkbox-hidden"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        disabled={loading}
                      />
                      <span className="custom-checkbox-box" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                      <span className="checkbox-text-label">Remember me</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => navigate("/forgot-password")}
                      className="forgot-password-link"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  {/* Persistent Error Alert */}
                  {error && (
                    <div className="auth-alert-message" role="alert" aria-live="assertive">
                      <div className="alert-content-left">
                        <svg className="alert-warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span className="alert-text">{error}</span>
                      </div>
                      <button
                        type="button"
                        className="alert-close-btn"
                        onClick={() => setError("")}
                        aria-label="Dismiss error"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Login CTA Button */}
                  <button
                    type="submit"
                    className="login-submit-button"
                    disabled={loading}
                    aria-busy={loading}
                  >
                    {loading ? (
                      <span className="button-spinner-state">
                        <svg className="spinner-animation" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
                        </svg>
                        <span>Logging In...</span>
                      </span>
                    ) : (
                      <span className="button-normal-state">
                        <span>Login</span>
                        <span className="button-arrow" aria-hidden="true">→</span>
                      </span>
                    )}
                  </button>
                </div>
              </form>

              {/* OR Divider */}
              <div className="auth-divider-line">
                <span className="divider-hr" />
                <span className="divider-text-tag">OR</span>
                <span className="divider-hr" />
              </div>

              {/* Create Account Link Row */}
              <div className="register-prompt-container">
                <span className="register-prompt-text">Don't have an account?</span>
                <button
                  type="button"
                  className="register-action-btn"
                  onClick={() => navigate("/register")}
                >
                  Create Account
                </button>
              </div>

              {/* Security Badges Row */}
              <div className="security-badges-footer" aria-label="Security and Trust Features">
                <div className="security-badge-col">
                  <div className="badge-icon-circle badge-cyan-accent" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                  <div className="badge-text-group">
                    <span className="badge-text-heading">Secure Login</span>
                    <span className="badge-text-sub">Your data is protected</span>
                  </div>
                </div>

                <div className="security-badge-col">
                  <div className="badge-icon-circle badge-blue-accent" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div className="badge-text-group">
                    <span className="badge-text-heading">Role Based Access</span>
                    <span className="badge-text-sub">Access as per your role</span>
                  </div>
                </div>

                <div className="security-badge-col">
                  <div className="badge-icon-circle badge-sky-accent" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                    </svg>
                  </div>
                  <div className="badge-text-group">
                    <span className="badge-text-heading">Cloud Ready</span>
                    <span className="badge-text-sub">Access from anywhere</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}