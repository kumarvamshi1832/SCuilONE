import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  verifyOTP,
  verifyMFA,
} from "../../services/authService";

type OtpFlow = "email" | "mfa";

export default function MFA() {
  const navigate = useNavigate();

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
      const mfaEmail = sessionStorage.getItem("mfa_email");
      const mfaTempToken = sessionStorage.getItem("mfa_temp_token");

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
        if (response.user) {
          sessionStorage.setItem("user", JSON.stringify(response.user));
        }

        setMessage("MFA verified successfully!");
        setTimeout(() => navigate("/dashboard"), 800);
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

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={logoContainerStyle}>
          <div style={logoBadgeStyle}>S</div>
          <h1 style={logoTextStyle}>SCuilONE</h1>
        </div>

        <h2 style={headingStyle}>{title}</h2>
        <p style={subtextStyle}>{description}</p>

        <div style={emailBadgeStyle}>{email}</div>

        {error && <div style={errorBoxStyle}>{error}</div>}
        {message && <div style={successBoxStyle}>{message}</div>}

        <form onSubmit={handleSubmit}>
          <label style={labelStyle} htmlFor="otp-input">
            Verification Code
          </label>
          <input
            id="otp-input"
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
            style={otpInputStyle}
          />

          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? "Verifying…" : "Verify Code"}
          </button>
        </form>

        <div style={resendContainerStyle}>
          <span style={{ color: "#667085", fontSize: "13px" }}>
            Didn't receive the code?
          </span>
          <button
            type="button"
            onClick={handleResend}
            style={linkBtnStyle}
          >
            Resend code
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate(flow === "mfa" ? "/login" : "/register")}
          style={{ ...linkBtnStyle, display: "block", margin: "16px auto 0" }}
        >
          ← Go back
        </button>
      </div>
    </div>
  );
}

/* ─── Styles ─── */

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "24px",
  boxSizing: "border-box",
  background: "linear-gradient(135deg, #f0f4ff 0%, #e8ecf8 50%, #f4f7fb 100%)",
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "420px",
  background: "#ffffff",
  padding: "36px 32px",
  borderRadius: "16px",
  boxShadow:
    "0 4px 6px -1px rgba(0,0,0,0.05), 0 20px 50px -12px rgba(0,0,0,0.12)",
  textAlign: "center",
  boxSizing: "border-box",
};

const logoContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  marginBottom: "24px",
};

const logoBadgeStyle: React.CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "10px",
  background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: "18px",
};

const logoTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "22px",
  fontWeight: 700,
  color: "#111827",
};

const headingStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: "22px",
  fontWeight: 700,
  color: "#111827",
};

const subtextStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: "14px",
  color: "#667085",
};

const emailBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 16px",
  marginBottom: "20px",
  background: "#f0f4ff",
  color: "#1d4ed8",
  borderRadius: "20px",
  fontSize: "13px",
  fontWeight: 500,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "5px",
  fontSize: "13px",
  fontWeight: 500,
  color: "#344054",
  textAlign: "left",
};

const otpInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  marginBottom: "16px",
  boxSizing: "border-box",
  textAlign: "center",
  fontSize: "24px",
  letterSpacing: "10px",
  fontWeight: 600,
  border: "1px solid #d0d5dd",
  borderRadius: "8px",
  outline: "none",
  color: "#111827",
  transition: "border-color 0.15s",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  border: "none",
  borderRadius: "8px",
  background: "linear-gradient(135deg, #1d4ed8, #2563eb)",
  color: "#ffffff",
  cursor: "pointer",
  fontSize: "15px",
  fontWeight: 600,
  transition: "opacity 0.15s",
};

const resendContainerStyle: React.CSSProperties = {
  marginTop: "18px",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "6px",
};

const linkBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#1d4ed8",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "13px",
  padding: 0,
};

const errorBoxStyle: React.CSSProperties = {
  padding: "12px 14px",
  marginBottom: "16px",
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: "8px",
  border: "1px solid #fecaca",
  fontSize: "13px",
  textAlign: "left",
};

const successBoxStyle: React.CSSProperties = {
  padding: "12px 14px",
  marginBottom: "16px",
  background: "#f0fdf4",
  color: "#15803d",
  borderRadius: "8px",
  border: "1px solid #bbf7d0",
  fontSize: "13px",
  textAlign: "left",
};