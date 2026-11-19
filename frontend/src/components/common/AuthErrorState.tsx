import React from "react";
import { useNavigate } from "react-router-dom";
import { signOutAndRedirect } from "../../services/authSession";

interface AuthErrorStateProps {
  title?: string;
  message: string;
  loginPath?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  showSignOut?: boolean;
}

export const AuthErrorState: React.FC<AuthErrorStateProps> = ({
  title = "Access Denied",
  message,
  loginPath = "/login",
  primaryActionLabel,
  onPrimaryAction,
  showSignOut = true,
}) => {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOutAndRedirect();
    navigate(loginPath, { replace: true });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background:
          "linear-gradient(135deg, #0b1120 0%, #111a2e 50%, #0b1120 100%)",
        color: "#f8fafc",
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        role="alert"
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "rgba(15, 23, 42, 0.92)",
          border: "1px solid rgba(239, 68, 68, 0.35)",
          borderRadius: "16px",
          padding: "32px",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.45)",
        }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            background: "rgba(239, 68, 68, 0.14)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "18px",
            color: "#f87171",
            fontSize: "20px",
            fontWeight: 700,
          }}
        >
          !
        </div>

        <h1
          style={{
            margin: "0 0 10px 0",
            fontSize: "20px",
            fontWeight: 600,
            color: "#ffffff",
          }}
        >
          {title}
        </h1>

        <p
          style={{
            margin: "0 0 24px 0",
            fontSize: "14px",
            lineHeight: 1.6,
            color: "#cbd5e1",
          }}
        >
          {message}
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          {onPrimaryAction && primaryActionLabel && (
            <button
              type="button"
              onClick={onPrimaryAction}
              style={{
                padding: "10px 18px",
                borderRadius: "10px",
                border: "none",
                background: "#3b82f6",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {primaryActionLabel}
            </button>
          )}

          {showSignOut && (
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                padding: "10px 18px",
                borderRadius: "10px",
                border: "1px solid rgba(148, 163, 184, 0.35)",
                background: onPrimaryAction
                  ? "rgba(30, 41, 59, 0.8)"
                  : "#ef4444",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Sign Out & Return to Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthErrorState;

