import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  verifyOTP,
  verifyMFA,
} from "../../services/authService";
import { normalizeIndustry } from "../../utils/industryUtils";
import { useTheme } from "../../context/ThemeContext";
import MFASetup from "./MFASetup";
import "./MFA.css";

type OtpFlow = "email" | "mfa";

export default function MFA() {
  const navigate = useNavigate();
  const { theme } = useTheme();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [flow, setFlow] = useState<OtpFlow>("email");
  const [tempToken, setTempToken] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const otpFlow = sessionStorage.getItem("otp_flow") as OtpFlow | null;

    if (otpFlow === "mfa") {
      const isSetupRequired =
        sessionStorage.getItem("mfa_setup_required") === "true";

      if (isSetupRequired) {
        navigate("/mfa-setup", { replace: true });
        return;
      }

      const mfaEmail = sessionStorage.getItem("mfa_email");
      const mfaTempToken =
        sessionStorage.getItem("mfa_temp_token") ||
        sessionStorage.getItem("mfa_token");

      if (!mfaEmail || !mfaTempToken) {
        navigate("/login");
        return;
      }

      setFlow("mfa");
      setEmail(mfaEmail);
      setTempToken(mfaTempToken);
    } else {
      const verificationEmail = sessionStorage.getItem("verification_email");

      if (!verificationEmail) {
        navigate("/register");
        return;
      }

      setFlow("email");
      setEmail(verificationEmail);
    }
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
      if (flow === "mfa") {
        const response = await verifyMFA({
          email,
          otp_code: otp,
          temp_token: tempToken,
        });

        sessionStorage.removeItem("mfa_email");
        sessionStorage.removeItem("mfa_temp_token");
        sessionStorage.removeItem("otp_flow");

        if (response.access_token) {
          sessionStorage.setItem("access_token", response.access_token);
        }
        if (response.refresh_token) {
          sessionStorage.setItem("refresh_token", response.refresh_token);
        }
        if (response.tenant) {
          sessionStorage.setItem("tenant", JSON.stringify(response.tenant));
        }
        if (response.user) {
          const userObj = {
            ...(response.user || {}),
            role: response.role,
            permissions: response.permissions || []
          };
          sessionStorage.setItem("user", JSON.stringify(userObj));
        }

        const userRole = (response.role || "").toUpperCase();
        let targetRoute = "/";
        if (userRole === "MANAGER" || userRole.includes("MANAGER")) {
          targetRoute = "/manager/dashboard";
        } else if (userRole === "SALES_USER" || userRole === "SALES USER" || userRole.includes("SALES")) {
          targetRoute = "/sales/dashboard";
        } else if (userRole === "OPERATIONS_USER" || userRole === "OPERATIONS USER" || userRole.includes("OPERATIONS")) {
          targetRoute = "/operations/dashboard";
        } else if (userRole === "SUPPORT_USER" || userRole === "SUPPORT USER" || userRole.includes("SUPPORT")) {
          targetRoute = "/support/dashboard";
        } else if (userRole === "READ_ONLY" || userRole === "AUDITOR" || userRole === "READ ONLY" || userRole === "READ-ONLY" || userRole === "READ-ONLY / AUDITOR" || userRole === "READ ONLY / AUDITOR" || userRole === "READ_ONLY / AUDITOR" || userRole.includes("AUDITOR")) {
          targetRoute = "/auditor/dashboard";
        } else if (response.tenant?.industry) {
          targetRoute = `/${normalizeIndustry(response.tenant.industry)}/dashboard`;
        }

        setMessage("MFA verified successfully!");
        setTimeout(() => navigate(targetRoute), 800);
      } else {
        await verifyOTP({
          email,
          otp,
        });

        sessionStorage.removeItem("verification_email");
        sessionStorage.removeItem("otp_flow");

        setMessage("Email verified successfully!");
        setTimeout(() => navigate("/login"), 800);
      }
    } catch (err) {
      const apiError = err as { message?: string };
      setError(apiError.message || "Invalid verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    setError("");
    setMessage("Resend is not available. Please go back and register again to receive a new code.");
  };

  const title = flow === "mfa" ? "Two-Factor Authentication" : "Verify your email";
  const description =
    flow === "mfa"
      ? "Enter the 6-digit code to complete login."
      : "Enter the 6-digit code sent to your email.";

  if (
    sessionStorage.getItem("otp_flow") === "mfa" &&
    sessionStorage.getItem("mfa_setup_required") === "true"
  ) {
    return <MFASetup />;
  }

  return (
    <div className={`mfa-page-root ${theme}`}>
      <div className="mfa-card">
        <div className="mfa-logo-container">
          <div className="mfa-logo-badge" aria-hidden="true">S</div>
          <h1 className="mfa-logo-text">SCuilONE</h1>
        </div>

        <h2 className="mfa-heading">{title}</h2>
        <p className="mfa-subtext">{description}</p>

        <div className="mfa-email-badge" title={email}>{email}</div>

        {error && <div className="mfa-error-box" role="alert">{error}</div>}
        {message && <div className="mfa-success-box" role="status">{message}</div>}

        <form onSubmit={handleSubmit}>
          <label className="mfa-label" htmlFor="otp-input">
            Verification Code
          </label>
          <input
            id="otp-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => {
              setOtp(e.target.value.replace(/\D/g, ""));
              setError("");
            }}
            className="mfa-otp-input"
            required
            aria-required="true"
          />

          <button type="submit" disabled={loading} className="mfa-verify-btn" aria-busy={loading}>
            {loading ? "Verifying…" : "Verify Code"}
          </button>
        </form>

        <div className="mfa-resend-row">
          <span className="mfa-resend-text">
            Didn't receive the code?
          </span>
          <button
            type="button"
            onClick={handleResend}
            className="mfa-link-btn"
          >
            Resend code
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate(flow === "mfa" ? "/login" : "/register")}
          className="mfa-back-btn"
        >
          ← Go back
        </button>
      </div>
    </div>
  );
}