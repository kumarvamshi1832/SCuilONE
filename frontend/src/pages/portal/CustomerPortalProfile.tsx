import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldIcon,
  LogOutIcon,
  RefreshIcon,
  AlertCircleIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalProfile,
  portalLogout,
  getPortalCustomer,
} from "../../services/customerPortalAuthService";
import type { PortalProfileResponse } from "../../types/customerPortal";
import "./CustomerPortalProfile.css";

export default function CustomerPortalProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PortalProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const localCustomer = getPortalCustomer();

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPortalProfile();
      setProfile(data);
    } catch (err: any) {
      console.error("Failed to load profile:", err);
      setError(err?.response?.data?.detail || "Unable to fetch account profile details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleLogout = async () => {
    await portalLogout();
    navigate("/portal/login", { replace: true });
  };

  const contactName =
    profile?.contact?.full_name || localCustomer?.email?.split("@")[0] || "Customer";
  const accountName = profile?.account?.name || "Client Portal";
  const initials = contactName.slice(0, 2).toUpperCase();

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748b" }}>
        <RefreshIcon size={28} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <div>Loading your profile...</div>
      </div>
    );
  }

  return (
    <div className="cp-profile-page">
      <div className="cp-profile-card">
        {error && (
          <div className="support-alert error" style={{ marginBottom: 20 }}>
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Profile Header */}
        <div className="cp-profile-header">
          <div className="cp-profile-avatar-lg">{initials}</div>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 4px 0" }}>
              {contactName}
            </h1>
            <div style={{ color: "#64748b", fontSize: "0.875rem" }}>
              {accountName} &bull; Verified Client Portal Member
            </div>
          </div>
        </div>

        {/* Profile Details */}
        <div className="cp-profile-info-grid">
          <div className="cp-profile-field">
            <span className="cp-profile-field-label">Full Name</span>
            <span className="cp-profile-field-val">{contactName}</span>
          </div>

          <div className="cp-profile-field">
            <span className="cp-profile-field-label">Account Email</span>
            <span className="cp-profile-field-val">
              {profile?.email || localCustomer?.email || "—"}
            </span>
          </div>

          <div className="cp-profile-field">
            <span className="cp-profile-field-label">Company / Account</span>
            <span className="cp-profile-field-val">{accountName}</span>
          </div>

          <div className="cp-profile-field">
            <span className="cp-profile-field-label">Contact Reference ID</span>
            <span className="cp-profile-field-val" style={{ fontSize: "0.8125rem", fontFamily: "monospace" }}>
              {profile?.contact?.id || localCustomer?.contact_id || "—"}
            </span>
          </div>

          <div className="cp-profile-field">
            <span className="cp-profile-field-label">Portal User ID</span>
            <span className="cp-profile-field-val" style={{ fontSize: "0.8125rem", fontFamily: "monospace" }}>
              {profile?.id || localCustomer?.id || "—"}
            </span>
          </div>

          <div className="cp-profile-field">
            <span className="cp-profile-field-label">Tenant ID</span>
            <span className="cp-profile-field-val" style={{ fontSize: "0.8125rem", fontFamily: "monospace" }}>
              {localCustomer?.tenant_id || "—"}
            </span>
          </div>
        </div>

        {/* Security & Access Section */}
        <div
          style={{
            marginTop: 32,
            padding: 20,
            borderRadius: 12,
            background: "rgba(37, 99, 235, 0.05)",
            border: "1px solid rgba(37, 99, 235, 0.15)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontWeight: 700, color: "#1d4ed8" }}>
            <ShieldIcon size={18} />
            <span>Enterprise Security & Data Isolation</span>
          </div>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "#475569", lineHeight: 1.5 }}>
            Your portal session is cryptographically isolated from internal CRM administrative systems.
            You only have access to records and support tickets belonging to <strong>{accountName}</strong>.
          </p>
        </div>

        {/* Logout Button */}
        <div style={{ marginTop: 28, display: "flex", justifyContent: "flex-end" }}>
          <button
            className="btn-secondary"
            style={{ color: "#dc2626", borderColor: "#fca5a5" }}
            onClick={handleLogout}
          >
            <LogOutIcon size={16} />
            <span>Sign Out of Portal</span>
          </button>
        </div>
      </div>
    </div>
  );
}

