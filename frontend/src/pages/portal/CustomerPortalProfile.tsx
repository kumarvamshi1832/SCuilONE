import React, { useState, useEffect, useMemo, useRef } from "react";
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
  CameraIcon,
  UploadIcon,
  TrashIcon,
  CheckIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalProfile,
  updatePortalProfile,
  portalChangePassword,
  portalLogout,
  getPortalCustomer,
  extractRateLimitInfo,
} from "../../services/customerPortalAuthService";
import {
  getPortalAvatar,
  savePortalAvatar,
  removePortalAvatar,
  validateAvatarFile,
  fileToDataUrl,
  PORTAL_AVATAR_EVENT,
} from "../../services/customerPortalAvatarService";
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

  // Profile Avatar state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

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

  // Resolved user identifier for avatar storage
  const userKey =
    profile?.id ||
    localCustomer?.id ||
    profile?.contact?.id ||
    localCustomer?.email;

  useEffect(() => {
    setAvatarUrl(getPortalAvatar(userKey));
  }, [userKey]);

  useEffect(() => {
    const handleAvatarUpdated = (event: Event) => {
      const customEvt = event as CustomEvent<{
        userIdentifier?: string;
        avatarUrl?: string | null;
      }>;
      setAvatarUrl(customEvt.detail?.avatarUrl ?? null);
    };
    window.addEventListener(PORTAL_AVATAR_EVENT, handleAvatarUpdated);
    return () => {
      window.removeEventListener(PORTAL_AVATAR_EVENT, handleAvatarUpdated);
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateAvatarFile(file);
    if (!validation.valid) {
      setAvatarError(validation.error || "Invalid file format or size.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setAvatarError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      setPreviewAvatar(dataUrl);
    } catch (err: any) {
      setAvatarError(err?.message || "Failed to process the selected photo.");
    }
  };

  const handleSaveAvatar = () => {
    if (!previewAvatar) return;
    try {
      savePortalAvatar(userKey, previewAvatar);
      setAvatarUrl(previewAvatar);
      setPreviewAvatar(null);
      setAvatarError(null);
      setSuccessMessage("Profile photo updated successfully.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setAvatarError(err?.message || "Failed to save profile photo.");
    }
  };

  const handleCancelPreview = () => {
    setPreviewAvatar(null);
    setAvatarError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveAvatar = () => {
    try {
      removePortalAvatar(userKey);
      setAvatarUrl(null);
      setPreviewAvatar(null);
      setAvatarError(null);
      setSuccessMessage("Profile photo removed.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setAvatarError(err?.message || "Failed to remove profile photo.");
    }
  };

  const displayedAvatar = previewAvatar || avatarUrl;

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
        {/* Hidden File Input for Avatar Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />

        {error && (
          <div className="support-alert error" style={{ marginBottom: 20 }}>
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
        )}

        {avatarError && (
          <div className="support-alert error" style={{ marginBottom: 20 }}>
            <AlertCircleIcon size={18} />
            <span>{avatarError}</span>
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
          <div className="cp-profile-avatar-wrapper">
            <div
              className={`cp-profile-avatar-lg ${previewAvatar ? "is-preview" : ""}`}
            >
              {displayedAvatar ? (
                <img
                  src={displayedAvatar}
                  alt={contactName}
                  className="cp-profile-avatar-img"
                />
              ) : (
                <span>{initials}</span>
              )}
              <button
                type="button"
                className="cp-avatar-edit-badge"
                onClick={() => fileInputRef.current?.click()}
                title={displayedAvatar ? "Change profile photo" : "Upload profile photo"}
                aria-label="Upload profile photo"
              >
                <CameraIcon size={13} />
              </button>
            </div>
            {previewAvatar && (
              <span className="cp-avatar-preview-tag">Preview</span>
            )}
          </div>

          <div className="cp-profile-header-info">
            <h1 className="cp-profile-name">
              {contactName}
            </h1>
            <div className="cp-profile-sub">
              {profile?.contact?.job_title ? `${profile.contact.job_title} • ` : ""}
              {accountName} &bull; Verified Client Portal Member
            </div>

            {/* Profile Avatar Actions */}
            <div className="cp-avatar-actions">
              {previewAvatar ? (
                <div className="cp-avatar-preview-actions">
                  <button
                    type="button"
                    className="cp-avatar-btn cp-avatar-btn-save"
                    onClick={handleSaveAvatar}
                  >
                    <CheckIcon size={14} />
                    <span>Save Photo</span>
                  </button>
                  <button
                    type="button"
                    className="cp-avatar-btn cp-avatar-btn-cancel"
                    onClick={handleCancelPreview}
                  >
                    <XIcon size={14} />
                    <span>Cancel</span>
                  </button>
                </div>
              ) : (
                <div className="cp-avatar-default-actions">
                  <button
                    type="button"
                    className="cp-avatar-btn cp-avatar-btn-upload"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <UploadIcon size={14} />
                    <span>{avatarUrl ? "Change Photo" : "Upload Photo"}</span>
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      className="cp-avatar-btn cp-avatar-btn-remove"
                      onClick={handleRemoveAvatar}
                      title="Remove current profile photo"
                    >
                      <TrashIcon size={14} />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              )}
              <span className="cp-avatar-hint">
                JPG, JPEG, PNG, WEBP &bull; Max 5MB
              </span>
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
            {/* Photo Edit Callout in Form */}
            <div className="cp-profile-photo-panel">
              <div className="cp-profile-photo-panel-left">
                <div className="cp-profile-avatar-wrapper">
                  <div
                    className={`cp-profile-avatar-lg ${previewAvatar ? "is-preview" : ""}`}
                    style={{ width: 56, height: 56, fontSize: "1.25rem" }}
                  >
                    {displayedAvatar ? (
                      <img
                        src={displayedAvatar}
                        alt={contactName}
                        className="cp-profile-avatar-img"
                      />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="cp-profile-photo-panel-title">
                    Profile Photo
                  </div>
                  <div className="cp-profile-photo-panel-desc">
                    {previewAvatar
                      ? "Previewing new image. Click 'Save Photo' above to apply."
                      : avatarUrl
                      ? "Your custom profile image is currently active."
                      : "No image uploaded. Initials avatar is active."}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className="cp-avatar-btn cp-avatar-btn-upload"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon size={14} />
                  <span>{avatarUrl ? "Change Image" : "Upload Image"}</span>
                </button>
                {avatarUrl && !previewAvatar && (
                  <button
                    type="button"
                    className="cp-avatar-btn cp-avatar-btn-remove"
                    onClick={handleRemoveAvatar}
                  >
                    <TrashIcon size={14} />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>
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
        <div className="cp-profile-section-divider">
          <h2 className="cp-profile-section-title">
            <LockIcon size={18} />
            <span>Change Portal Password</span>
          </h2>
          <p className="cp-profile-section-desc">
            Update your login password. Changing your password will revoke all active portal sessions and require logging in again.
          </p>

          {passwordError && (
            <div className="support-alert error" style={{ marginBottom: 16 }}>
              <AlertCircleIcon size={16} />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="cp-profile-password-form">
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6 }}>
                Current Password *
              </label>
              <div className="cp-password-field-wrapper">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="cp-input"
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  className="cp-password-toggle-btn"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                >
                  {showCurrentPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6 }}>
                New Password (minimum 15 characters) *
              </label>
              <div className="cp-password-field-wrapper">
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="cp-input"
                  placeholder="Enter new strong password"
                />
                <button
                  type="button"
                  className="cp-password-toggle-btn"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6 }}>
                Confirm New Password *
              </label>
              <div className="cp-password-field-wrapper">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="cp-input"
                  placeholder="Re-enter new password"
                />
                <button
                  type="button"
                  className="cp-password-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
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
        <div className="cp-profile-security-box">
          <div className="cp-profile-security-header">
            <ShieldIcon size={18} />
            <span>Enterprise Security & Data Isolation</span>
          </div>
          <p className="cp-profile-security-text">
            Your portal session is cryptographically isolated from internal CRM administrative systems.
            You only have access to records and support tickets belonging to <strong>{accountName}</strong>.
          </p>
        </div>

        {/* Logout Button */}
        <div className="cp-profile-logout-wrap">
          <button
            type="button"
            className="cp-profile-logout-btn"
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
