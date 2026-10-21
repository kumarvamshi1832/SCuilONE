import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser } from "../../services/authService";
import type { RegisterRequest } from "../../types/auth";
import { useTheme } from "../../context/ThemeContext";

import backdropDark from "../../assets/login-full-backdrop.jpg";
import backdropLight from "../../assets/login-full-backdrop-light.jpg";

import "./Register.css";

const industries = [
  "Real Estate",
  "Education Consulting",
  "Training Institute",
  "Digital Marketing Agency",
  "Software Company",
  "Insurance Agency",
  "Automobile Dealer",
  "Interior Designer",
  "Travel Company",
  "B2B Sales",
];

export default function Register() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [formData, setFormData] = useState({
    company_name: "",
    company_email: "",
    phone: "",
    industry: "",
    full_name: "",
    email: "",
    password: "",
    confirm_password: "",
  });

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const email = formData.email.trim().toLowerCase();
    const companyEmail = formData.company_email.trim().toLowerCase();

    if (formData.password !== formData.confirm_password) {
      setError("Passwords do not match.");
      return;
    }
    if (formData.password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }
    if (!formData.industry) {
      setError("Please select an industry.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) {
      setError("Please enter a valid company email address.");
      return;
    }

    setLoading(true);

    try {
      const payload: RegisterRequest = {
        company_name: formData.company_name.trim(),
        company_email: companyEmail,
        phone: formData.phone.trim(),
        industry: formData.industry,
        full_name: formData.full_name.trim(),
        email: email,
        password: formData.password,
        confirm_password: formData.confirm_password,
      };

      const response = await registerUser(payload);

      setMessage(
        response.message || "Registration successful. Please verify your email."
      );
      sessionStorage.setItem("verification_email", email);
      sessionStorage.setItem("otp_flow", "email");

      setTimeout(() => navigate("/mfa"), 1200);
    } catch (err) {
      const apiError = err as { message?: string };
      setError(apiError.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const currentBackdrop = theme === "dark" ? backdropDark : backdropLight;

  return (
    <div className={`register-page-root ${theme}`}>
      {/* Background Image Viewport */}
      <div
        className="register-viewport-container"
        style={{ backgroundImage: `url(${currentBackdrop})` }}
      >
        {/* Ambient Scrim Overlay */}
        <div className="register-ambient-scrim" aria-hidden="true" />

        {/* TOP NAVBAR (Identical to Login) */}
        <header className="register-top-navbar">
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

          {/* Center Tagline Navigation */}
          <div className="navbar-center-tagline" aria-label="Company Core Pillars">
            <span>PEOPLE</span>
            <span className="nav-tagline-separator">|</span>
            <span>PROCESS</span>
            <span className="nav-tagline-separator">|</span>
            <span>GROWTH</span>
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

        {/* MAIN TWO-PANEL CONTENT SPLIT */}
        <main className="register-content-split">
          {/* LEFT BRANDING HERO SECTION (Identical to Login) */}
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

          {/* RIGHT TRANSPARENT GLASS REGISTRATION CARD */}
          <section className="right-interactive-card-area register-card-wrapper">
            <div className="register-card-glassmorphism">
              {/* Card Header */}
              <div className="register-card-header">
                <span className="card-welcome-tag">GET STARTED</span>
                <h2 className="card-title-main">
                  <span className="title-prefix">Create your </span>
                  <span className="title-crm-accent">account</span>
                </h2>
                <p className="card-subtitle-desc">
                  Join your SCuilONE CRM workspace
                </p>
              </div>

              {/* Registration Form */}
              <form onSubmit={handleSubmit} className="register-interactive-form" noValidate>
                {/* COMPANY DETAILS SECTION */}
                <div className="form-category-block">
                  <span className="category-section-title">COMPANY DETAILS</span>
                  <div className="form-fields-2col">
                    {/* Company Name */}
                    <div className="form-group-item">
                      <label htmlFor="company_name" className="input-field-label">
                        Company Name
                      </label>
                      <div className="input-box-container">
                        <span className="input-leading-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                            <path d="M6 12H4a2 2 0 0 0-2 2v8" />
                            <path d="M20 22v-8a2 2 0 0 0-2-2h-2" />
                            <path d="M10 6h4" />
                            <path d="M10 10h4" />
                            <path d="M10 14h4" />
                            <path d="M10 18h4" />
                          </svg>
                        </span>
                        <input
                          id="company_name"
                          name="company_name"
                          type="text"
                          className="styled-input-control"
                          placeholder="Enter company name"
                          value={formData.company_name}
                          onChange={handleChange}
                          disabled={loading}
                          required
                        />
                      </div>
                    </div>

                    {/* Industry Dropdown */}
                    <div className="form-group-item">
                      <label htmlFor="industry" className="input-field-label">
                        Industry
                      </label>
                      <div className="input-box-container select-box-container">
                        <span className="input-leading-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                          </svg>
                        </span>
                        <select
                          id="industry"
                          name="industry"
                          className="styled-select-control"
                          value={formData.industry}
                          onChange={handleChange}
                          disabled={loading}
                          required
                        >
                          <option value="" disabled>Select Industry</option>
                          {industries.map((ind) => (
                            <option key={ind} value={ind}>{ind}</option>
                          ))}
                        </select>
                        <span className="select-trailing-arrow" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    {/* Company Email */}
                    <div className="form-group-item">
                      <label htmlFor="company_email" className="input-field-label">
                        Company Email
                      </label>
                      <div className="input-box-container">
                        <span className="input-leading-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="20" height="16" x="2" y="4" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                          </svg>
                        </span>
                        <input
                          id="company_email"
                          name="company_email"
                          type="email"
                          className="styled-input-control"
                          placeholder="Enter company email"
                          value={formData.company_email}
                          onChange={handleChange}
                          disabled={loading}
                          required
                        />
                      </div>
                    </div>

                    {/* Phone Number */}
                    <div className="form-group-item">
                      <label htmlFor="phone" className="input-field-label">
                        Phone Number
                      </label>
                      <div className="input-box-container">
                        <span className="input-leading-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </span>
                        <input
                          id="phone"
                          name="phone"
                          type="tel"
                          className="styled-input-control"
                          placeholder="Enter phone number"
                          value={formData.phone}
                          onChange={handleChange}
                          disabled={loading}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* OWNER DETAILS SECTION */}
                <div className="form-category-block">
                  <span className="category-section-title">OWNER DETAILS</span>
                  <div className="form-fields-2col">
                    {/* Full Name */}
                    <div className="form-group-item">
                      <label htmlFor="full_name" className="input-field-label">
                        Full Name
                      </label>
                      <div className="input-box-container">
                        <span className="input-leading-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </span>
                        <input
                          id="full_name"
                          name="full_name"
                          type="text"
                          className="styled-input-control"
                          placeholder="Enter full name"
                          value={formData.full_name}
                          onChange={handleChange}
                          disabled={loading}
                          required
                        />
                      </div>
                    </div>

                    {/* Email */}
                    <div className="form-group-item">
                      <label htmlFor="email" className="input-field-label">
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
                          id="email"
                          name="email"
                          type="email"
                          className="styled-input-control"
                          placeholder="Enter email"
                          value={formData.email}
                          onChange={handleChange}
                          disabled={loading}
                          required
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div className="form-group-item">
                      <label htmlFor="password" className="input-field-label">
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
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          className="styled-input-control with-trailing-action"
                          placeholder="Enter password"
                          value={formData.password}
                          onChange={handleChange}
                          disabled={loading}
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

                    {/* Confirm Password */}
                    <div className="form-group-item">
                      <label htmlFor="confirm_password" className="input-field-label">
                        Confirm Password
                      </label>
                      <div className="input-box-container">
                        <span className="input-leading-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </span>
                        <input
                          id="confirm_password"
                          name="confirm_password"
                          type={showConfirmPassword ? "text" : "password"}
                          className="styled-input-control with-trailing-action"
                          placeholder="Confirm password"
                          value={formData.confirm_password}
                          onChange={handleChange}
                          disabled={loading}
                          required
                        />
                        <button
                          type="button"
                          className="input-trailing-reveal-btn"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        >
                          {showConfirmPassword ? (
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
                  </div>
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

                {/* Success Alert */}
                {message && (
                  <div className="auth-alert-success" role="status">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span>{message}</span>
                  </div>
                )}

                {/* Submit CTA Button */}
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
                      <span>Creating Account...</span>
                    </span>
                  ) : (
                    <span className="button-normal-state">
                      <span>Create Account</span>
                      <span className="button-arrow" aria-hidden="true">→</span>
                    </span>
                  )}
                </button>
              </form>

              {/* Already Have an Account Row (Matching Login Style) */}
              <div className="register-prompt-container register-signin-prompt">
                <span className="register-prompt-text">Already have an account?</span>
                <button
                  type="button"
                  className="register-action-btn"
                  onClick={() => navigate("/login")}
                >
                  Sign In
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}