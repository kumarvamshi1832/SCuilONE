import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { forgotPassword } from "../../services/authService";
import { useTheme } from "../../context/ThemeContext";
import "./ForgotPassword.css";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      await forgotPassword({ email: email.trim().toLowerCase() });

      sessionStorage.setItem("reset_email", email.trim().toLowerCase());


      setTimeout(() => navigate("/verify-reset-otp"), 1500);
    } catch (err) {
      const apiError = err as { message?: string };
      setError(
        apiError.message || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`forgot-page-wrapper ${theme}`}>
      <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === "light" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
        )}
      </button>

      <div className="forgot-card">
        <div className="forgot-logo-container">
          <div className="forgot-logo-badge">S</div>
          <h1 className="forgot-logo-text">SCuilONE</h1>
        </div>

        <h2 className="forgot-heading">Forgot your password?</h2>
        <p className="forgot-subtext">
          Enter your email and we'll send you a reset code.
        </p>

        {error && <div className="forgot-error-box">{error}</div>}
        {success && <div className="forgot-success-box">{success}</div>}

        <form onSubmit={handleSubmit}>
          <label className="forgot-label" htmlFor="forgot-email">
            Email Address
          </label>
          <input
            id="forgot-email"
            type="email"
            placeholder="Enter Your Email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            className="forgot-input"
          />

          <button type="submit" disabled={loading} className="forgot-btn">
            {loading ? "Sending…" : "Send Reset Code"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate("/login")}
          className="forgot-link-btn"
        >
          ← Back to Login
        </button>
      </div>
    </div>
  );
}
