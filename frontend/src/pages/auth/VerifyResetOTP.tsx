import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { verifyResetOTP } from "../../services/authService";
import { useTheme } from "../../context/ThemeContext";
import "./ForgotPassword.css";

export default function VerifyResetOTP() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const resetEmail = sessionStorage.getItem("reset_email");

    if (!resetEmail) {
      navigate("/forgot-password");
      return;
    }

    setEmail(resetEmail);
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!otp.trim()) {
      setError("Please enter the verification code.");
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      setError("Code must be exactly 6 digits.");
      return;
    }

    setLoading(true);

    try {
      const response = await verifyResetOTP({ email, otp });

      // Store the reset token for the reset-password step
      sessionStorage.setItem("reset_token", response.reset_token);
      sessionStorage.setItem("reset_email_for_reset", email);

      // Clean up the intermediate state
      sessionStorage.removeItem("reset_email");

      setMessage("Code verified successfully!");
      setTimeout(() => navigate("/reset-password"), 800);
    } catch (err) {
      const apiError = err as { message?: string };
      setError(apiError.message || "Invalid or expired verification code.");
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

        <h2 className="forgot-heading">Verify reset code</h2>
        <p className="forgot-subtext">
          Enter the 6-digit code sent to your email.
        </p>

        <div className="forgot-email-badge">{email}</div>

        {error && <div className="forgot-error-box">{error}</div>}
        {message && <div className="forgot-success-box">{message}</div>}

        <form onSubmit={handleSubmit}>
          <label className="forgot-label" htmlFor="reset-otp-input">
            Verification Code
          </label>
          <input
            id="reset-otp-input"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => {
              setOtp(e.target.value.replace(/\D/g, ""));
              setError("");
            }}
            className="forgot-input forgot-otp-input"
          />

          <button type="submit" disabled={loading} className="forgot-btn">
            {loading ? "Verifying…" : "Verify Code"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate("/forgot-password")}
          className="forgot-link-btn"
        >
          ← Go back
        </button>
      </div>
    </div>
  );
}
