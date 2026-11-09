import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldIcon,
  LogOutIcon,
  RefreshIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  LockIcon,
  UserIcon,
  EyeIcon,
  EyeOffIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalProfile,
  updatePortalProfile,
  portalChangePassword,
  portalLogout,
  getPortalCustomer,
  extractRateLimitInfo,
} from "../../services/customerPortalAuthService";
import type { PortalProfileResponse } from "../../types/customerPortal";
import "./CustomerPortalProfile.css";

export default function CustomerPortalProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PortalProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Profile Form state
  const [isEditing, setIsEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [address, setAddress] = useState("");

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordRetryCountdown, setPasswordRetryCountdown] = useState<number | null>(null);

  // Countdown timer for password change rate limit (SlowAPI HTTP 429)
  useEffect(() => {
    if (passwordRetryCountdown === null || passwordRetryCountdown <= 0) return;
    const timer = setInterval(() => {
      setPasswordRetryCountdown((prev) => {
        if (prev === null || prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [passwordRetryCountdown]);

  const localCustomer = getPortalCustomer();

  const loadProfile = async (force: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPortalProfile(force);
      setProfile(data);
      setFullName(data.contact?.full_name || "");
      setPhone(data.contact?.phone || "");
      setJobTitle(data.contact?.job_title || "");
      setAddress(data.contact?.address || "");
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

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Full name cannot be blank.");
      return;
    }
    setSavingProfile(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await updatePortalProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        job_title: jobTitle.trim() || null,
        address: address.trim() || null,
      });
      setSuccessMessage(res.message || "Profile updated successfully.");
      setIsEditing(false);
      await loadProfile(true);
    } catch (err: any) {
      console.error("Update profile error:", err);
      setError(err?.response?.data?.detail || "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const passwordChecks = useMemo(() => {
    return {
      minLength: newPassword.length >= 15,
      hasUpper: /[A-Z]/.test(newPassword),
      hasLower: /[a-z]/.test(newPassword),
      hasDigit: /[0-9]/.test(newPassword),
      hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
      differentFromCurrent: currentPassword.length > 0 && newPassword.length > 0 && newPassword !== currentPassword,
      matchesConfirm: newPassword.length > 0 && newPassword === confirmPassword,
    };
  }, [currentPassword, newPassword, confirmPassword]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordRetryCountdown && passwordRetryCountdown > 0) return;
    if (!currentPassword) {
      setPasswordError("Current password is required.");
      return;
    }
    if (!passwordChecks.minLength) {
      setPasswordError("New password must be at least 15 characters long.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("New password must be different from your current password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setChangingPassword(true);
    setPasswordError(null);
    try {
      const res = await portalChangePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      // Backend revokes active sessions after password change, redirect to login
      navigate("/portal/login", {
        replace: true,
        state: {
          message:
            res.message ||
            "Password changed successfully. Please sign in again with your new password.",
        },
      });
    } catch (err: any) {
      console.error("Change password error:", err);
      const rateLimit = extractRateLimitInfo(err);
      if (rateLimit.isRateLimited) {
        if (rateLimit.retryAfterSeconds && rateLimit.retryAfterSeconds > 0) {
          setPasswordRetryCountdown(rateLimit.retryAfterSeconds);
          setPasswordError(
            `${rateLimit.message} Please try again in ${rateLimit.retryAfterSeconds} seconds.`
          );
        } else {
          setPasswordError(
            rateLimit.message || "Too many attempts. Please try again later."
          );
        }
      } else {
        setPasswordError(
          err?.response?.data?.detail ||
            err?.message ||
            "Failed to change password. Please verify your current password."
        );
      }
    } finally {
      setChangingPassword(false);
    }
  };

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

        {successMessage && (
          <div className="support-alert success" style={{ marginBottom: 20 }}>
            <CheckCircleIcon size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Profile Header */}
        <div className="cp-profile-header">
          <div className="cp-profile-avatar-lg">{initials}</div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 4px 0" }}>
              {contactName}
            </h1>
            <div style={{ color: "#64748b", fontSize: "0.875rem" }}>
              {profile?.contact?.job_title ? `${profile.contact.job_title} • ` : ""}
              {accountName} &bull; Verified Client Portal Member
            </div>
          </div>
          <div>
            {!isEditing ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setIsEditing(true)}
              >
                <UserIcon size={16} />
                <span>Edit Profile</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsEditing(false)}
              >
                <span>Cancel</span>
              </button>
            )}
          </div>
        </div>

        {/* Edit Form or View Grid */}
        {isEditing ? (
          <form onSubmit={handleProfileSubmit} style={{ marginTop: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              <div className="cp-form-group">
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6 }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="cp-input"
                  placeholder="Your full name"
                />
              </div>

              <div className="cp-form-group">
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6 }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="cp-input"
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              <div className="cp-form-group">
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6 }}>
                  Job Title
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="cp-input"
                  placeholder="e.g. Lead Project Manager"
                />
              </div>

              <div className="cp-form-group" style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6 }}>
                  Address / Office Location
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="cp-input"
                  placeholder="Company branch or office address"
                />
              </div>
            </div>

            <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
              <button type="submit" className="btn-primary" disabled={savingProfile}>
                <span>{savingProfile ? "Saving..." : "Save Profile Details"}</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={savingProfile}
                onClick={() => setIsEditing(false)}
              >
                <span>Cancel</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="cp-profile-info-grid" style={{ marginTop: 24 }}>
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
              <span className="cp-profile-field-label">Phone</span>
              <span className="cp-profile-field-val">
                {profile?.contact?.phone || "—"}
              </span>
            </div>

            <div className="cp-profile-field">
              <span className="cp-profile-field-label">Job Title</span>
              <span className="cp-profile-field-val">
                {profile?.contact?.job_title || "—"}
              </span>
            </div>

            <div className="cp-profile-field">
              <span className="cp-profile-field-label">Company / Account</span>
              <span className="cp-profile-field-val">{accountName}</span>
            </div>

            <div className="cp-profile-field">
              <span className="cp-profile-field-label">Address</span>
              <span className="cp-profile-field-val">
                {profile?.contact?.address || "—"}
              </span>
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
                {profile?.tenant?.id || localCustomer?.tenant_id || "—"}
              </span>
            </div>
          </div>
        )}

        {/* Change Password Section */}
        <div style={{ marginTop: 40, borderTop: "1px solid #e2e8f0", paddingTop: 28 }}>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 8px 0", display: "flex", alignItems: "center", gap: 8 }}>
            <LockIcon size={18} />
            <span>Change Portal Password</span>
          </h2>
          <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "#64748b" }}>
            Update your login password. Changing your password will revoke all active portal sessions and require logging in again.
          </p>

          {passwordError && (
            <div className="support-alert error" style={{ marginBottom: 16 }}>
              <AlertCircleIcon size={16} />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} style={{ maxWidth: 480 }}>
            <div className="cp-form-group" style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6 }}>
                Current Password *
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="cp-input"
                  placeholder="Enter current password"
                  style={{ width: "100%", paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
                >
                  {showCurrentPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            <div className="cp-form-group" style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6 }}>
                New Password (minimum 15 characters) *
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="cp-input"
                  placeholder="Enter new strong password"
                  style={{ width: "100%", paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
                >
                  {showNewPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            <div className="cp-form-group" style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6 }}>
                Confirm New Password *
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="cp-input"
                  placeholder="Re-enter new password"
                  style={{ width: "100%", paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
                >
                  {showConfirmPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={
                changingPassword ||
                !currentPassword ||
                !newPassword ||
                newPassword !== confirmPassword ||
                Boolean(passwordRetryCountdown && passwordRetryCountdown > 0)
              }
            >
              <span>
                {changingPassword
                  ? "Updating Password..."
                  : passwordRetryCountdown && passwordRetryCountdown > 0
                  ? `Too many attempts (retry in ${passwordRetryCountdown}s)`
                  : "Update Password & Re-login"}
              </span>
            </button>
          </form>
        </div>

        {/* Security & Access Section */}
        <div
          style={{
            marginTop: 36,
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
