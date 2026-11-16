import React, { useEffect, useState } from "react";
import {
  BuildingIcon,
  CheckCircleIcon,
  EditIcon,
  KeyRoundIcon,
  LockIcon,
  MailIcon,
  ShieldCheckIcon,
  UserIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getStoredPlatformUser,
  savePlatformSession,
} from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type { PlatformEmployee } from "../../types/platform";
import "./PlatformPages.css";

function getDisplayName(profile: PlatformEmployee | null): string {
  const candidate = profile?.full_name || "";
  return candidate.trim();
}

function getAvatarInitial(profile: PlatformEmployee | null): string {
  const source =
    getDisplayName(profile) || (profile?.email ? profile.email.trim() : "");
  return source ? source.charAt(0).toUpperCase() : "U";
}

function formatWorkspaceScope(profile: PlatformEmployee | null): string {
  if (!profile) return "—";
  const scope = (profile.role_scope || "").trim();
  const team = (
    profile.industry_team_name ||
    profile.industry_key ||
    profile.industry_type ||
    ""
  ).trim();

  if (scope === "platform") {
    return team ? `Platform (${team})` : "Central Platform";
  }
  if (scope === "industry_team") {
    return team ? `Industry Team · ${team}` : "Industry Team";
  }
  if (scope && team) {
    return `${scope} · ${team}`;
  }
  return scope || team || "—";
}

export default function PlatformProfilePage() {
  const [profile, setProfile] = useState<PlatformEmployee | null>(
    getStoredPlatformUser()
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [fullNameInput, setFullNameInput] = useState(
    getDisplayName(getStoredPlatformUser())
  );
  const [nameError, setNameError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadMe = async () => {
      setLoading(true);
      try {
        const me = await platformService.getMe();
        if (!active) return;
        setProfile(me.employee);
        setFullNameInput(getDisplayName(me.employee));
        // Keep session auth, routing, and sidebar RBAC state synchronized.
        savePlatformSession({
          employee: me.employee,
          user: me.employee,
          role: me.employee.role,
          dashboard: me.dashboard,
          sidebar_modules: me.sidebar_modules,
          permissions: me.permissions,
        });
        window.dispatchEvent(new Event("platform-profile-updated"));
      } catch (err) {
        if (!active) return;
        setError(extractApiErrorMessage(err, "Failed to load profile."));
      } finally {
        if (active) setLoading(false);
      }
    };

    loadMe();
    return () => {
      active = false;
    };
  }, []);

  const displayName = getDisplayName(profile) || "—";
  const avatarInitial = getAvatarInitial(profile);
  const workspaceScope = formatWorkspaceScope(profile);

  const handleStartEditName = () => {
    setFullNameInput(getDisplayName(profile));
    setNameError(null);
    setError(null);
    setSuccess(null);
    setIsEditingName(true);
  };

  const handleCancelEditName = () => {
    setFullNameInput(getDisplayName(profile));
    setNameError(null);
    setIsEditingName(false);
  };

  const validateFullName = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Full name is required.";
    }
    if (trimmed.length < 2) {
      return "Full name must be at least 2 characters.";
    }
    if (trimmed.length > 120) {
      return "Full name must be 120 characters or fewer.";
    }
    return null;
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationMessage = validateFullName(fullNameInput);
    if (validationMessage) {
      setNameError(validationMessage);
      return;
    }

    const trimmed = fullNameInput.trim();
    if (trimmed === getDisplayName(profile)) {
      setNameError(null);
      setIsEditingName(false);
      setSuccess("Your display name is already up to date.");
      return;
    }

    setSaving(true);
    setNameError(null);
    setError(null);
    setSuccess(null);

    try {
      const res = await platformService.updateProfile({
        full_name: trimmed,
      });
      const updated = {
        ...(profile || {}),
        ...res.user,
        full_name: res.user?.full_name ?? trimmed,
      } as PlatformEmployee;
      setProfile(updated);
      setFullNameInput(getDisplayName(updated));
      savePlatformSession({ employee: updated, user: updated });
      window.dispatchEvent(new Event("platform-profile-updated"));
      setIsEditingName(false);
      setSuccess("Full name updated successfully.");
    } catch (err) {
      const msg = extractApiErrorMessage(err, "Failed to update full name.");
      setNameError(msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="platform-page platform-profile-page">
      <header className="platform-page-header platform-profile-page-header">
        <div>
          <h2 className="platform-profile-page-title">
            My Profile &amp; Account Details
          </h2>
          <p className="platform-profile-page-sub">
            Review your authenticated platform identity and manage your display
            name.
          </p>
        </div>
      </header>

      {error && (
        <div className="platform-alert error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="platform-profile-alert-close"
            onClick={() => setError(null)}
            aria-label="Dismiss error notification"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {success && (
        <div className="platform-alert success" role="status">
          <span className="platform-profile-alert-msg">
            <CheckCircleIcon size={16} />
            {success}
          </span>
          <button
            type="button"
            className="platform-profile-alert-close"
            onClick={() => setSuccess(null)}
            aria-label="Dismiss success notification"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {loading && !profile ? (
        <section
          className="platform-profile-card platform-profile-summary-card"
          aria-label="Loading Profile"
        >
          <div className="platform-profile-loading">
            <div className="platform-profile-skeleton-avatar" />
            <div className="platform-profile-skeleton-lines">
              <div className="platform-profile-skeleton-line wide" />
              <div className="platform-profile-skeleton-line medium" />
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Profile Summary Header Card */}
          <section
            className="platform-profile-card platform-profile-summary-card"
            aria-label="Profile Summary"
          >
            <div className="platform-profile-summary-main">
              <div
                className="platform-profile-avatar"
                aria-hidden="true"
                title={displayName}
              >
                <span>{avatarInitial}</span>
              </div>

              <div className="platform-profile-identity">
                <div className="platform-profile-name-row">
                  <h3 className="platform-profile-display-name">
                    {displayName}
                  </h3>
                  {profile?.role && (
                    <span className="platform-profile-role-pill">
                      <ShieldCheckIcon size={13} />
                      {profile.role}
                    </span>
                  )}
                </div>

                <p className="platform-profile-email-line">
                  {profile?.email || "—"}
                </p>
              </div>
            </div>

            <div className="platform-profile-summary-meta">
              <div className="platform-profile-meta-item">
                <span className="platform-profile-meta-label">
                  <KeyRoundIcon size={13} />
                  Employee ID
                </span>
                <span className="platform-profile-meta-value mono">
                  {profile?.employee_code || "—"}
                </span>
              </div>

              <div className="platform-profile-meta-item">
                <span className="platform-profile-meta-label">
                  <BuildingIcon size={13} />
                  Workspace
                </span>
                <span className="platform-profile-meta-value">
                  {workspaceScope}
                </span>
              </div>
            </div>
          </section>

          {/* Account Information Card */}
          <section
            className="platform-profile-card platform-profile-details-card"
            aria-label="Account Information"
          >
            <div className="platform-profile-section-head">
              <div>
                <h4>Account Information</h4>
                <p>
                  Only your full name can be edited from this page. Core
                  account attributes remain read-only.
                </p>
              </div>
            </div>

            <div className="platform-profile-grid">
              {/* Full Name — Editable */}
              <div className="platform-profile-field platform-profile-field-editable">
                <div className="platform-profile-field-top">
                  <div className="platform-profile-field-head">
                    <span className="platform-profile-field-label">
                      <UserIcon size={14} />
                      Full Name
                    </span>
                    <span className="platform-profile-badge-editable">
                      Editable
                    </span>
                  </div>

                  {isEditingName ? (
                    <form
                      onSubmit={handleSaveName}
                      className="platform-profile-edit-form"
                      noValidate
                    >
                      <div className="platform-profile-edit-row">
                        <input
                          type="text"
                          className={`platform-input platform-profile-input${
                            nameError ? " is-invalid" : ""
                          }`}
                          value={fullNameInput}
                          onChange={(e) => {
                            setFullNameInput(e.target.value);
                            if (nameError) setNameError(null);
                          }}
                          placeholder="Enter your full name"
                          maxLength={120}
                          autoFocus
                          disabled={saving}
                          aria-label="Full Name"
                          aria-invalid={Boolean(nameError)}
                        />
                        <div className="platform-profile-edit-actions">
                          <button
                            type="submit"
                            className="platform-btn primary platform-profile-save-btn"
                            disabled={saving}
                          >
                            <CheckCircleIcon size={14} />
                            {saving ? "Saving..." : "Save Changes"}
                          </button>
                          <button
                            type="button"
                            className="platform-btn platform-profile-cancel-btn"
                            onClick={handleCancelEditName}
                            disabled={saving}
                          >
                            <XIcon size={14} />
                            Cancel
                          </button>
                        </div>
                      </div>
                      {nameError && (
                        <p className="platform-profile-field-error" role="alert">
                          {nameError}
                        </p>
                      )}
                    </form>
                  ) : (
                    <div className="platform-profile-value-row">
                      <div className="platform-profile-field-value">
                        {displayName}
                      </div>
                      <button
                        type="button"
                        className="platform-profile-edit-btn"
                        onClick={handleStartEditName}
                        aria-label="Edit Full Name"
                      >
                        <EditIcon size={14} />
                        Edit
                      </button>
                    </div>
                  )}
                </div>

                <p className="platform-profile-field-hint">
                  {isEditingName
                    ? "Enter 2 to 120 characters. Saves directly to your platform account."
                    : "Displayed across your platform workspace and audit activity."}
                </p>
              </div>

              {/* Employee ID — Read-only */}
              <div className="platform-profile-field">
                <div className="platform-profile-field-top">
                  <div className="platform-profile-field-head">
                    <span className="platform-profile-field-label">
                      <KeyRoundIcon size={14} />
                      Employee ID
                    </span>
                    <span className="platform-profile-badge-readonly">
                      <LockIcon size={11} />
                      Read-only
                    </span>
                  </div>
                  <div className="platform-profile-field-value mono">
                    {profile?.employee_code || "—"}
                  </div>
                </div>
                <p className="platform-profile-field-hint">
                  Assigned staff identifier for platform audit records.
                </p>
              </div>

              {/* Email Address — Read-only */}
              <div className="platform-profile-field">
                <div className="platform-profile-field-top">
                  <div className="platform-profile-field-head">
                    <span className="platform-profile-field-label">
                      <MailIcon size={14} />
                      Email Address
                    </span>
                    <span className="platform-profile-badge-readonly">
                      <LockIcon size={11} />
                      Read-only
                    </span>
                  </div>
                  <div className="platform-profile-field-value">
                    {profile?.email || "—"}
                  </div>
                </div>
                <p className="platform-profile-field-hint">
                  Registered email address cannot be changed from this page.
                </p>
              </div>

              {/* Role — Read-only */}
              <div className="platform-profile-field">
                <div className="platform-profile-field-top">
                  <div className="platform-profile-field-head">
                    <span className="platform-profile-field-label">
                      <ShieldCheckIcon size={14} />
                      Role
                    </span>
                    <span className="platform-profile-badge-readonly">
                      <LockIcon size={11} />
                      Read-only
                    </span>
                  </div>
                  <div className="platform-profile-field-value">
                    {profile?.role || "—"}
                  </div>
                </div>
                <p className="platform-profile-field-hint">
                  Platform role managed by system administration.
                </p>
              </div>

              {/* Workspace / Platform Scope — Read-only */}
              <div className="platform-profile-field platform-profile-field-wide">
                <div className="platform-profile-field-top">
                  <div className="platform-profile-field-head">
                    <span className="platform-profile-field-label">
                      <BuildingIcon size={14} />
                      Workspace / Platform Scope
                    </span>
                    <span className="platform-profile-badge-readonly">
                      <LockIcon size={11} />
                      Read-only
                    </span>
                  </div>
                  <div className="platform-profile-field-value">
                    {workspaceScope}
                  </div>
                </div>
                <p className="platform-profile-field-hint">
                  Defines your administrative platform or team workspace
                  boundary.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
