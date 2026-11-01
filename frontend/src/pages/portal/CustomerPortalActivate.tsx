import React, { useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  LifeBuoyIcon,
  KeyRoundIcon,
  LockIcon,
  ArrowRightIcon,
  AlertCircleIcon,
  CheckIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import { portalActivate } from "../../services/customerPortalAuthService";
import "./CustomerPortalLogin.css";

export default function CustomerPortalActivate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [token, setToken] = useState(() => searchParams.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password Policy Checks (Backend enforces min 15 chars, uppercase, lowercase, number, special char)
  const passwordChecks = useMemo(() => {
    return {
      minLength: password.length >= 15,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasDigit: /[0-9]/.test(password),
      hasSpecial: /[^A-Za-z0-9]/.test(password),
      matchesConfirm: password.length > 0 && password === confirmPassword,
    };
  }, [password, confirmPassword]);

  const isFormValid =
    token.trim().length > 0 &&
    passwordChecks.minLength &&
    passwordChecks.hasUpper &&
    passwordChecks.hasLower &&
    passwordChecks.hasDigit &&
    passwordChecks.hasSpecial &&
    passwordChecks.matchesConfirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError("Invitation token is required.");
      return;
    }

    if (!passwordChecks.minLength) {
      setError("Password must be at least 15 characters long as required by enterprise security policy.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await portalActivate({
        token: token.trim(),
        password,
      });

      navigate("/portal/login", {
        replace: true,
        state: {
          tenant_id: response.tenant_id,
          message: response.message || "Customer portal account activated! You can now sign in.",
        },
      });
    } catch (err: any) {
      console.error("Portal activation failed:", err);
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Failed to activate account. The invitation token may be invalid or expired."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cp-auth-wrapper">
      <div className="cp-auth-card" style={{ maxWidth: 480 }}>
        <div className="cp-auth-header">
          <div className="cp-auth-logo">
            <LifeBuoyIcon size={28} />
          </div>
          <h1 className="cp-auth-title">Activate Client Account</h1>
          <p className="cp-auth-subtitle">
            Enter your invitation token and set a secure password to activate your access
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "8px",
              color: "#f87171",
              fontSize: "0.875rem",
              marginBottom: 18,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        <form className="cp-auth-form" onSubmit={handleSubmit}>
          <div className="cp-auth-field">
            <label>Invitation Token</label>
            <div className="cp-auth-input-wrapper">
              <KeyRoundIcon size={16} className="cp-auth-icon" />
              <input
                type="text"
                required
                placeholder="Paste the token from your invitation email"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
          </div>

          <div className="cp-auth-field">
            <label>New Password (min 15 characters)</label>
            <div className="cp-auth-input-wrapper">
              <LockIcon size={16} className="cp-auth-icon" />
              <input
                type="password"
                required
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="cp-auth-field">
            <label>Confirm Password</label>
            <div className="cp-auth-input-wrapper">
              <LockIcon size={16} className="cp-auth-icon" />
              <input
                type="password"
                required
                placeholder="Re-type password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          {/* Real-time Password Policy Checklist */}
          <div className="password-requirements">
            <div className={`req-item ${passwordChecks.minLength ? "met" : ""}`}>
              {passwordChecks.minLength ? <CheckIcon size={14} /> : <XIcon size={14} />}
              <span>At least 15 characters long</span>
            </div>
            <div className={`req-item ${passwordChecks.hasUpper ? "met" : ""}`}>
              {passwordChecks.hasUpper ? <CheckIcon size={14} /> : <XIcon size={14} />}
              <span>At least 1 uppercase letter (A-Z)</span>
            </div>
            <div className={`req-item ${passwordChecks.hasLower ? "met" : ""}`}>
              {passwordChecks.hasLower ? <CheckIcon size={14} /> : <XIcon size={14} />}
              <span>At least 1 lowercase letter (a-z)</span>
            </div>
            <div className={`req-item ${passwordChecks.hasDigit ? "met" : ""}`}>
              {passwordChecks.hasDigit ? <CheckIcon size={14} /> : <XIcon size={14} />}
              <span>At least 1 digit (0-9)</span>
            </div>
            <div className={`req-item ${passwordChecks.hasSpecial ? "met" : ""}`}>
              {passwordChecks.hasSpecial ? <CheckIcon size={14} /> : <XIcon size={14} />}
              <span>At least 1 special character (!@#$%^&*...)</span>
            </div>
            {password && (
              <div className={`req-item ${passwordChecks.matchesConfirm ? "met" : ""}`}>
                {passwordChecks.matchesConfirm ? <CheckIcon size={14} /> : <XIcon size={14} />}
                <span>Passwords match</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="cp-auth-btn-primary"
            disabled={loading || !isFormValid}
          >
            <span>{loading ? "Activating Account..." : "Complete Activation"}</span>
            <ArrowRightIcon size={16} />
          </button>
        </form>

        <div className="cp-auth-footer">
          <div>
            Already activated?{" "}
            <Link to="/portal/login" className="cp-auth-link">
              Sign In to Portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

