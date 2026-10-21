import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  startMFAEnrollment,
  verifyMFAEnrollment,
} from "../../services/authService";
import type { MFAEnrollmentStartResponse } from "../../types/auth";

export default function MFASetup() {
  const navigate = useNavigate();

  const [mfaToken, setMfaToken] = useState("");
  const [email, setEmail] = useState("");
  const [setup, setSetup] = useState<MFAEnrollmentStartResponse | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [role, setRole] = useState("");
  const [industry, setIndustry] = useState("");

  useEffect(() => {
    const token = sessionStorage.getItem("mfa_token");
    const savedEmail = sessionStorage.getItem("mfa_email");

    if (!token || !savedEmail) {
      navigate("/login", { replace: true });
      return;
    }

    setMfaToken(token);
    setEmail(savedEmail);

    let cancelled = false;

    const loadSetup = async () => {
      try {
        const result = await startMFAEnrollment({ mfa_token: token });

        if (!cancelled) {
          setSetup(result);
        }
      } catch (err) {
        if (!cancelled) {
          const apiError = err as { message?: string };
          setError(
            apiError.message || "Unable to start MFA setup. Please try again."
          );
        }
      }
    };

    void loadSetup();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!/^\d{6}$/.test(code)) {
      setError("Enter the six-digit code from your authenticator app.");
      return;
    }

    setLoading(true);

    try {
      const response = await verifyMFAEnrollment({
        mfa_token: mfaToken,
        code,
      });

      if (!response.access_token) {
        throw new Error("The server did not return an access token.");
      }

      sessionStorage.setItem("access_token", response.access_token);

      if (response.refresh_token) {
        sessionStorage.setItem("refresh_token", response.refresh_token);
      } else {
        sessionStorage.removeItem("refresh_token");
      }

      if (response.user) {
        sessionStorage.setItem(
          "user",
          JSON.stringify({
            ...response.user,
            role: response.role,
            permissions: response.permissions || [],
          })
        );
      }

      if (response.tenant) {
        sessionStorage.setItem("tenant", JSON.stringify(response.tenant));
      }

      sessionStorage.removeItem("mfa_token");
      sessionStorage.removeItem("mfa_email");
      sessionStorage.removeItem("mfa_setup_required");
      sessionStorage.removeItem("otp_flow");

      setRecoveryCodes(response.recovery_codes || []);
      setRecoveryMessage(
        response.recovery_codes_message ||
          "Save these recovery codes securely. Each code can be used only once."
      );
      setOnboardingRequired(Boolean(response.onboarding_required));
      setRole(response.role || "");
      setIndustry(response.tenant?.industry || "");
    } catch (err) {
      const apiError = err as { message?: string };
      setError(apiError.message || "MFA setup verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (onboardingRequired) {
      navigate("/complete-profile", { replace: true });
      return;
    }

    const normalizedRole = role.toUpperCase();

    if (normalizedRole.includes("MANAGER")) {
      navigate("/manager/dashboard", { replace: true });
    } else if (normalizedRole.includes("SALES")) {
      navigate("/sales/dashboard", { replace: true });
    } else if (normalizedRole.includes("OPERATIONS")) {
      navigate("/operations/dashboard", { replace: true });
    } else if (normalizedRole.includes("SUPPORT")) {
      navigate("/support/dashboard", { replace: true });
    } else if (
      normalizedRole.includes("AUDITOR") ||
      normalizedRole.includes("READ_ONLY") ||
      normalizedRole.includes("READ ONLY")
    ) {
      navigate("/auditor/dashboard", { replace: true });
    } else {
      const industrySlug = industry
        ? industry.toLowerCase().trim().replace(/\s+/g, "-")
        : "real-estate";

      navigate(`/${industrySlug}/dashboard`, { replace: true });
    }
  };

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    } catch {
      setError("Copy failed. Please select and copy the recovery codes manually.");
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={logoBadgeStyle}>S</div>
        <h1 style={titleStyle}>SCuilONE</h1>

        {!recoveryCodes.length ? (
          <>
            <h2 style={headingStyle}>Set Up Two-Factor Authentication</h2>
            <p style={descriptionStyle}>
              Scan this QR code with Google Authenticator or Microsoft
              Authenticator, then enter the six-digit code shown in the app.
            </p>

            <div style={emailStyle}>{email}</div>

            {error && <div style={errorStyle}>{error}</div>}

            {!setup && !error && (
              <p style={descriptionStyle}>Preparing your secure setup...</p>
            )}

            {setup && (
              <>
                <div style={qrBoxStyle}>
                  <QRCodeSVG value={setup.otpauth_url} size={210} />
                </div>

                <p style={descriptionStyle}>
                  Can't scan the QR code? Enter this setup key manually in your
                  authenticator app.
                </p>

                <div style={secretStyle}>{setup.secret}</div>

                <form onSubmit={handleVerify}>
                  <label htmlFor="mfa-setup-code" style={labelStyle}>
                    Authenticator code
                  </label>

                  <input
                    id="mfa-setup-code"
                    value={code}
                    onChange={(event) => {
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                      setError("");
                    }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    style={inputStyle}
                    required
                  />

                  <button
                    type="submit"
                    disabled={loading || code.length !== 6}
                    style={buttonStyle}
                  >
                    {loading ? "Verifying..." : "Verify and Enable MFA"}
                  </button>
                </form>
              </>
            )}
          </>
        ) : (
          <>
            <h2 style={headingStyle}>MFA Enabled Successfully</h2>
            <p style={descriptionStyle}>
              Store these recovery codes somewhere safe. Each code can be used
              only once if you lose access to your authenticator.
            </p>

            <div style={recoveryMessageStyle}>{recoveryMessage}</div>

            <div style={recoveryCodesStyle}>
              {recoveryCodes.map((recoveryCode) => (
                <div key={recoveryCode}>{recoveryCode}</div>
              ))}
            </div>

            <button
              type="button"
              onClick={copyRecoveryCodes}
              style={secondaryButtonStyle}
            >
              Copy Recovery Codes
            </button>

            {error && <div style={errorStyle}>{error}</div>}

            <button type="button" onClick={handleContinue} style={buttonStyle}>
              Continue to SCuilONE
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 24,
  background: "linear-gradient(135deg, #f0f4ff, #e8ecf8, #f4f7fb)",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 460,
  padding: 32,
  borderRadius: 16,
  background: "#fff",
  boxShadow: "0 20px 50px rgba(0,0,0,0.12)",
  boxSizing: "border-box",
  textAlign: "center",
};

const logoBadgeStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  margin: "0 auto 10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 12,
  background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
  color: "#fff",
  fontSize: 21,
  fontWeight: 700,
};

const titleStyle: React.CSSProperties = {
  margin: "0 0 24px",
  color: "#111827",
  fontSize: 22,
};

const headingStyle: React.CSSProperties = {
  margin: "0 0 10px",
  color: "#111827",
  fontSize: 21,
};

const descriptionStyle: React.CSSProperties = {
  color: "#667085",
  fontSize: 14,
  lineHeight: 1.6,
};

const emailStyle: React.CSSProperties = {
  display: "inline-block",
  margin: "8px 0 20px",
  padding: "7px 14px",
  borderRadius: 20,
  background: "#f0f4ff",
  color: "#1d4ed8",
  fontSize: 13,
};

const qrBoxStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  margin: "20px 0",
  padding: 18,
  background: "#fff",
};

const secretStyle: React.CSSProperties = {
  padding: 12,
  margin: "12px 0 20px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  color: "#111827",
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 1,
  overflowWrap: "anywhere",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 7,
  color: "#344054",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: 14,
  marginBottom: 16,
  border: "1px solid #d0d5dd",
  borderRadius: 8,
  textAlign: "center",
  fontSize: 23,
  letterSpacing: 8,
  color: "#111827",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: 13,
  border: 0,
  borderRadius: 8,
  background: "linear-gradient(135deg, #1d4ed8, #2563eb)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  marginTop: 10,
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  marginBottom: 10,
  background: "#eef2ff",
  color: "#1d4ed8",
};

const errorStyle: React.CSSProperties = {
  padding: 12,
  margin: "12px 0",
  border: "1px solid #fecaca",
  borderRadius: 8,
  background: "#fef2f2",
  color: "#b91c1c",
  fontSize: 13,
  textAlign: "left",
};

const recoveryMessageStyle: React.CSSProperties = {
  padding: 12,
  margin: "16px 0",
  borderRadius: 8,
  background: "#f0fdf4",
  color: "#166534",
  fontSize: 13,
};

const recoveryCodesStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  padding: 14,
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#f8fafc",
  color: "#111827",
  fontFamily: "monospace",
  fontSize: 13,
};