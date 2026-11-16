import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { unsubscribeFromReminders } from "../../services/subscriptionService";
import { useTheme } from "../../context/ThemeContext";
import "./SubscriptionBilling.css";

export default function UnsubscribeReminder() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || token.length < 6) {
      setError("Invalid or missing unsubscribe token.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    unsubscribeFromReminders(token)
      .then((res) => {
        if (!cancelled) {
          setMessage(res.message);
          setCompanyName(res.company_name);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.response?.data?.detail || "Unable to process unsubscribe request.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div
      className={theme}
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: theme === "dark" ? "#0f172a" : "#f4f7f6",
        color: theme === "dark" ? "#f1f5f9" : "#172033",
      }}
    >
      <div
        className="sub-card"
        style={{
          maxWidth: "480px",
          width: "100%",
          background: theme === "dark" ? "#1e293b" : "#ffffff",
          borderColor: theme === "dark" ? "#334155" : "#e2e8f0",
        }}
      >
        <h2 className="sub-card-title">Subscription Email Preferences</h2>
        {loading ? (
          <p className="sub-subtitle">Processing your unsubscribe request...</p>
        ) : error ? (
          <div className="sub-alert error">{error}</div>
        ) : (
          <div className="sub-alert success">
            {message}
            {companyName ? ` (${companyName})` : ""}
          </div>
        )}
        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
          <button type="button" className="sub-btn sub-btn-primary" onClick={() => navigate("/login")}>
            Go to SCuilONE Login
          </button>
        </div>
      </div>
    </div>
  );
}
