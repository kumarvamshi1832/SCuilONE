import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../../services/authService";
import { useTheme } from "../../context/ThemeContext";
import darkImage from "../../assets/login-dark.png";
import lightImage from "../../assets/login-light.png";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);

    try {
      const response = await loginUser({
        email: email.trim().toLowerCase(),
        password,
      });

      if (response.requires_mfa) {
        sessionStorage.setItem("mfa_email", email.trim().toLowerCase());
        if (response.temp_token) {
          sessionStorage.setItem("mfa_temp_token", response.temp_token);
        }
        sessionStorage.setItem("otp_flow", "mfa");
        navigate("/mfa");
      } else {
        if (response.access_token) {
          sessionStorage.setItem("access_token", response.access_token);
        }
        if (response.refresh_token) {
          sessionStorage.setItem("refresh_token", response.refresh_token);
        }
        if (response.user) {
          sessionStorage.setItem("user", JSON.stringify(response.user));
        }
        navigate("/dashboard");
      }
    } catch (err) {
      const apiError = err as { message?: string };
      setError(apiError.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  const image = theme === "dark" ? darkImage : lightImage;

  return (
    <div className={`login-page-wrapper ${theme}`}>
      <div className="login-container">
        
        {/* LEFT PANEL */}
        <div 
          className="login-left-panel"
          style={{ backgroundImage: `url(${image})` }}
        >
        </div>

        {/* RIGHT PANEL */}
        <div className="login-right-panel">
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "light" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
            )}
          </button>

          <div className="login-form-inner">
            <div className="login-head">
              <h2>Welcome <span className="text-blue">Back</span></h2>
              <p>Sign in to your SCuilONE account</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-form-grid">
                <div className="form-input-group">
                  <label htmlFor="email">Email</label>
                <div className="input-box">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  <input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div className="form-input-group">
                <label htmlFor="password">Password</label>
                <div className="input-box">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <input
                    id="password"
                    className="has-eye"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    disabled={loading}
                    required
                  />
                  <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>
              
              <div className="forgot-pwd-row">
                <button type="button" onClick={() => navigate("/forgot-password")} className="login-forgot-password">
                  Forgot Password?
                </button>
              </div>

              {error && <div className="alert-box error">{error}</div>}

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? "Signing In..." : "Sign In \u2192"}
              </button>
            </form>

            <div className="signup-link">
              <span>Don't have an account?</span>
              <button type="button" onClick={() => navigate("/register")}>Create Account</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}