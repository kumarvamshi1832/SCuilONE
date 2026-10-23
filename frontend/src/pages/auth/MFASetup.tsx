import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  startMFAEnrollment,
  verifyMFAEnrollment,
} from "../../services/authService";
import { useTheme } from "../../context/ThemeContext";
import type { MFAEnrollmentStartResponse } from "../../types/auth";
import "./MFASetup.css";

export default function MFASetup() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [mfaToken, setMfaToken] = useState("");
  const [email, setEmail] = useState("");
  const [setup, setSetup] = useState<MFAEnrollmentStartResponse | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleRegenerateKey = async () => {
    if (!mfaToken) return;
    setResetting(true);
    setError("");
    setCode("");
    try {
      const result = await startMFAEnrollment({
        mfa_token: mfaToken,
        reset: true,
      });
      setSetup(result);
    } catch (err) {
      const apiError = err as { message?: string };
      setError(
        apiError.message || "Failed to regenerate QR code. Please try again."
      );
    } finally {
      setResetting(false);
    }
  };

  const copySecretKey = async () => {
    if (!setup?.secret) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      setError("Unable to copy to clipboard automatically.");
    }
  };

  useEffect(() => {
    const token =
      sessionStorage.getItem("mfa_token") ||
      sessionStorage.getItem("mfa_temp_token");
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
      sessionStorage.removeItem("mfa_temp_token");
      sessionStorage.removeItem("mfa_email");
      sessionStorage.removeItem("mfa_setup_required");
      sessionStorage.removeItem("otp_flow");

      if (response.recovery_codes) {
        sessionStorage.setItem("recovery_codes", JSON.stringify(response.recovery_codes));
      }

      if (response.onboarding_required) {
        navigate("/complete-profile", { replace: true });
        return;
      }

      const normalizedRole = (response.role || "").toUpperCase();
      const industry = response.tenant?.industry || "";

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
    } catch (err) {
      const apiError = err as { message?: string };
      setError(apiError.message || "MFA setup verification failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`mfa-setup-page ${theme}`}>
      {/* Sleek Theme Toggle */}
      <button
        type="button"
        className="mfa-theme-toggle"
        onClick={toggleTheme}
        aria-label="Toggle theme"
      >
        {theme === "light" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
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
        )}
      </button>

      <div className="mfa-setup-card">
        {/* Brand Header */}
        <div className="mfa-brand-header">
          <div className="mfa-logo-badge">S</div>
          <h1 className="mfa-brand-name">SCuilONE</h1>
        </div>

        <h2 className="mfa-title">Set Up Two-Factor Authentication</h2>
        <p className="mfa-desc">
          Scan this QR code with Google Authenticator or Microsoft Authenticator, then enter the 6-digit code shown in the app.
        </p>

        <div className="mfa-email-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          {email}
        </div>

        {error && <div className="mfa-error-alert">{error}</div>}

        {!setup && !error && (
          <p className="mfa-desc">Preparing your secure setup...</p>
        )}

        {setup && (
          <>
            {/* Centered, high-contrast QR Container */}
            <div className="mfa-qr-container">
              <QRCodeSVG
                value={setup.otpauth_url}
                size={168}
                level="M"
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>

            <p className="mfa-manual-label">
              Can't scan the QR code? Enter this setup key manually:
            </p>

            {/* Monospace setup key, with copy button */}
            <div className="mfa-secret-row">
              <div className="mfa-secret-box" title="Click to copy setup key" onClick={copySecretKey}>
                {setup.secret}
              </div>
              <button
                type="button"
                className="mfa-copy-key-btn"
                onClick={copySecretKey}
                title="Copy setup key"
              >
                {copiedKey ? "Copied!" : "Copy"}
              </button>
            </div>

            {setup.dev_code && (
              <div className="mfa-dev-helper">
                <span className="mfa-dev-badge">Dev Mode</span>
                <button
                  type="button"
                  className="mfa-dev-fill-btn"
                  onClick={() => setCode(setup.dev_code || "123456")}
                  title="Click to fill current code"
                >
                  Fill code: <strong>{setup.dev_code}</strong> (or 123456)
                </button>
              </div>
            )}

            {/* Form matching exact width */}
            <form onSubmit={handleVerify} className="mfa-form">
              <label htmlFor="mfa-setup-code" className="mfa-input-label">
                Authenticator Code
              </label>

              <input
                id="mfa-setup-code"
                className="mfa-otp-input"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                required
              />

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="mfa-submit-btn"
              >
                {loading ? "Verifying..." : "Verify and Enable MFA →"}
              </button>
            </form>

            <div className="mfa-troubleshoot-row">
              <span>Having trouble?</span>
              <button
                type="button"
                className="mfa-regenerate-btn"
                onClick={handleRegenerateKey}
                disabled={resetting || loading}
              >
                {resetting ? "Regenerating..." : "Regenerate QR Code"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}