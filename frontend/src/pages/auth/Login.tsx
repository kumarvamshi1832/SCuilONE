
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
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
        email: normalizedEmail,
        password,
      });

      if (response.mfa_required) {
        if (!response.mfa_token) {
          throw new Error(
            "The server did not return the required MFA verification token."
          );
        }

        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("refresh_token");
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("tenant");

        sessionStorage.setItem("mfa_email", normalizedEmail);
        sessionStorage.setItem("mfa_token", response.mfa_token);
        sessionStorage.setItem("otp_flow", "mfa");

        if (response.mfa_setup_required) {
          navigate("/mfa-setup", { replace: true });
        } else {
          navigate("/mfa", { replace: true });
        }

        return;
      }

      throw new Error(
        "Unexpected login response. MFA verification was not requested."
      );
    } catch (err: unknown) {
      const apiError = err as {
        message?: string;
        response?: {
          data?: {
            detail?: string;
            message?: string;
          };
        };
      };

      const errorMessage =
        apiError.response?.data?.detail ||
        apiError.response?.data?.message ||
        apiError.message ||
        "Invalid email or password.";

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const image = theme === "dark" ? darkImage : lightImage;

  return (
    <div className={`login-page-wrapper ${theme}`}>
      <button
        type="button"
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label="Toggle theme"
      >
        {theme === "light" ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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

      <div className="login-container">
        <div
          className="login-left-panel"
          style={{ backgroundImage: `url(${image})` }}
        />

        <div className="login-right-panel">
          <div className="login-form-inner">
            <div className="login-head">
              <h2>
                Login to <span className="text-blue">SCuilONE</span> CRM
              </h2>
              <p>Welcome back! Please enter your details to continue.</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-form-grid">
                <div className="form-input-group">
                  <label htmlFor="email">Email</label>

                  <div className="input-box">
                    <svg
                      className="input-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect
                        width="20"
                        height="16"
                        x="2"
                        y="4"
                        rx="2"
                      />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>

                    <input
                      id="email"
                      type="email"
                      placeholder="Enter your email address"
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

                <div className="form-input-group">
                  <label htmlFor="password">Password</label>

                  <div className="input-box">
                    <svg
                      className="input-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect
                        width="18"
                        height="11"
                        x="3"
                        y="11"
                        rx="2"
                        ry="2"
                      />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>

                    <input
                      id="password"
                      className="has-eye"
                      type={showPassword ? "text" : "password"}
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
                      className="eye-btn"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                          <line x1="2" x2="22" y1="2" y2="22" />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="forgot-pwd-row">
                  <label className="remember-me">
                    <input type="checkbox" />
                    Remember me
                  </label>

                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="login-forgot-password"
                    disabled={loading}
                  >
                    Forgot Password?
                  </button>
                </div>

                {error && (
                  <div className="alert-box error" role="alert">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="login-btn"
                  disabled={loading}
                >
                  {loading ? "Logging In..." : "Login →"}
                </button>
              </div>
            </form>

            <div className="login-divider">
              <span>OR</span>
            </div>

            <div className="signup-link">
              <span>Don't have an account?</span>
              <button
                type="button"
                onClick={() => navigate("/register")}
                disabled={loading}
              >
                Create Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
