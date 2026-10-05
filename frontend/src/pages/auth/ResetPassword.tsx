import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { resetPassword } from "../../services/authService";
import { useTheme } from "../../context/ThemeContext";
import "./ForgotPassword.css";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedEmail = sessionStorage.getItem("reset_email_for_reset");
    const storedToken = sessionStorage.getItem("reset_token");

    if (!storedEmail || !storedToken) {
      navigate("/forgot-password");
      return;
    }

    setEmail(storedEmail);
    setResetToken(storedToken);
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!newPassword) {
      setError("New password is required.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await resetPassword({
        email,
        reset_token: resetToken,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      // Clean up
      sessionStorage.removeItem("reset_token");
      sessionStorage.removeItem("reset_email_for_reset");

      setMessage("Password reset successfully. Redirecting to login…");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      const apiError = err as { message?: string };
      setError(apiError.message || "Failed to reset password. Please try again.");
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

        <h2 className="forgot-heading">Reset your password</h2>
        <p className="forgot-subtext">
          Enter your new password below.
        </p>

        {error && <div className="forgot-error-box">{error}</div>}
        {message && <div className="forgot-success-box">{message}</div>}

        <form onSubmit={handleSubmit}>
          <label className="forgot-label" htmlFor="new-password">
            New Password
          </label>
          <input
            id="new-password"
            type="password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setError("");
            }}
            className="forgot-input"
          />

          <label className="forgot-label" htmlFor="confirm-password">
            Confirm Password
          </label>
          <input
            id="confirm-password"
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError("");
            }}
            className="forgot-input"
          />

          <button type="submit" disabled={loading} className="forgot-btn">
            {loading ? "Resetting…" : "Reset Password"}
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
