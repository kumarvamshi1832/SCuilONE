
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  getMyProfile,
  updateMyProfile,
  uploadMyProfilePhoto,
  type UserProfile,
} from "../../services/profileService";
import ProfileAvatar from "../../components/common/ProfileAvatar";
import "./MyProfile.css";

export default function MyProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    job_title: "",
  });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [photoCacheBust, setPhotoCacheBust] = useState<number | string>(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadProfile() {
    try {
      setLoading(true);
      setError("");

      const data = await getMyProfile();

      setProfile(data);
      setForm({
        full_name: data.full_name || "",
        phone: data.phone || "",
        job_title: data.job_title || "",
      });

      try {
        const stored = sessionStorage.getItem("user");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (data.photo_url !== undefined) {
            parsed.photo_url = data.photo_url;
          }
          if (data.full_name) {
            parsed.full_name = data.full_name;
            parsed.name = data.full_name;
          }
          sessionStorage.setItem("user", JSON.stringify(parsed));
        }
      } catch {
        // Ignore session parse error
      }
    } catch {
      setError("Unable to load your profile. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  function handleChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const updated = await updateMyProfile({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        job_title: form.job_title.trim(),
      });

      setProfile((previous) =>
        previous
          ? {
              ...previous,
              ...updated,
              full_name: updated.full_name || form.full_name.trim(),
              phone: updated.phone ?? form.phone.trim(),
              job_title: updated.job_title ?? form.job_title.trim(),
            }
          : updated
      );

      // Keep header profile chip and session synchronized
      const updatedFullName = updated.full_name || form.full_name.trim();
      window.dispatchEvent(
        new CustomEvent("user-profile-updated", {
          detail: {
            full_name: updatedFullName,
            role: profile?.role,
            photo_url: profile?.photo_url,
          },
        })
      );

      try {
        const stored = sessionStorage.getItem("user");
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.full_name = updatedFullName;
          parsed.name = updatedFullName;
          sessionStorage.setItem("user", JSON.stringify(parsed));
        }
      } catch {
        // Ignore session parse errors
      }

      setEditing(false);
      setSuccess("Your profile has been updated successfully.");
      await loadProfile();
    } catch {
      setError("Unable to save your profile. Please check your details and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    setError("");
    setSuccess("");

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Your photo must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }

    try {
      setUploading(true);

      const result = await uploadMyProfilePhoto(file);
      const newPhotoUrl = result.photo_url;
      const bust = Date.now();
      setPhotoCacheBust(bust);

      setProfile((previous) =>
        previous
          ? { ...previous, photo_url: newPhotoUrl }
          : previous
      );

      // Keep header profile chip synchronized immediately
      window.dispatchEvent(
        new CustomEvent("user-profile-updated", {
          detail: {
            full_name: profile?.full_name,
            role: profile?.role,
            photo_url: newPhotoUrl,
            cacheBust: bust,
          },
        })
      );

      try {
        const stored = sessionStorage.getItem("user");
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.photo_url = newPhotoUrl;
          sessionStorage.setItem("user", JSON.stringify(parsed));
        }
      } catch {
        // Ignore session parse errors
      }

      setSuccess("Profile photo updated successfully.");
    } catch (err: unknown) {
      let message = "Photo upload failed. Please try again.";
      if (err && typeof err === "object") {
        const anyErr = err as {
          response?: { data?: { detail?: string; message?: string } };
          message?: string;
        };
        message =
          anyErr.response?.data?.detail ||
          anyErr.response?.data?.message ||
          anyErr.message ||
          message;
      }
      setError(message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  if (loading) {
    return (
      <div className="my-profile-page">
        <div className="profile-message">Loading your profile...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="my-profile-page">
        <div className="profile-message">
          <p>{error || "Profile not available."}</p>
          <button type="button" onClick={() => void loadProfile()}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="my-profile-page">
      <div className="profile-page-heading">
        <div className="profile-heading-text">
          <span className="profile-eyebrow">ACCOUNT SETTINGS</span>
          <h1>My Profile</h1>
          <p>View and manage your personal information.</p>
        </div>

        {!editing && (
          <button
            type="button"
            className="profile-primary-button profile-edit-btn"
            onClick={() => {
              setForm({
                full_name: profile.full_name || "",
                phone: profile.phone || "",
                job_title: profile.job_title || "",
              });
              setEditing(true);
              setError("");
              setSuccess("");
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: 6 }}
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit Profile
          </button>
        )}
      </div>

      {error && (
        <div className="profile-alert profile-alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="profile-alert profile-alert-success" role="status">
          {success}
        </div>
      )}

      <section className="profile-card profile-summary-card">
        <div className="profile-identity">
          <div className="profile-photo-wrapper">
            <ProfileAvatar
              photoUrl={profile.photo_url}
              name={profile.full_name}
              size={108}
              className="profile-page-avatar"
              cacheBust={photoCacheBust}
            />

            <button
              type="button"
              className="profile-photo-edit"
              title="Change profile photo"
              aria-label="Change profile photo"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <span className="profile-photo-spinner" aria-hidden="true" />
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={handlePhotoChange}
            />
          </div>

          <div className="profile-identity-details">
            <h2>{profile.full_name || "User"}</h2>
            <p className="profile-email">{profile.email}</p>
            <div className="profile-badges">
              <span className="profile-role-badge">
                {profile.role || "Tenant Admin"}
              </span>
              <span
                className={`profile-status-badge ${
                  profile.status?.toLowerCase() === "active"
                    ? "is-active"
                    : ""
                }`}
              >
                <span className="profile-status-dot" />
                {profile.status || "Active"}
              </span>
            </div>
            <small className="profile-photo-hint">
              {uploading
                ? "Uploading photo..."
                : "Click the camera button on your avatar to upload a new profile photo (JPEG, PNG, WebP up to 5MB)"}
            </small>
          </div>
        </div>
      </section>

      <form className="profile-card profile-details-card" onSubmit={handleSave}>
        <div className="profile-section-heading">
          <div>
            <h2>Personal Information</h2>
            <p>Manage the information associated with your account.</p>
          </div>

          {editing && (
            <span className="profile-editing-label">Editing enabled</span>
          )}
        </div>

        <div className="profile-fields-grid">
          <div className="profile-field">
            <label htmlFor="full_name">Full Name</label>
            <input
              id="full_name"
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              disabled={!editing || saving}
              required
              maxLength={150}
            />
          </div>

          <div className="profile-field">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              value={profile.email}
              disabled
              readOnly
            />
            <small>Email cannot be changed here.</small>
          </div>

          <div className="profile-field">
            <label htmlFor="phone">Phone Number</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              disabled={!editing || saving}
              maxLength={30}
              placeholder="Enter phone number"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="job_title">Job Title</label>
            <input
              id="job_title"
              name="job_title"
              value={form.job_title}
              onChange={handleChange}
              disabled={!editing || saving}
              maxLength={100}
              placeholder="Enter job title"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="role">Role</label>
            <input
              id="role"
              value={profile.role || "Not assigned"}
              disabled
              readOnly
            />
          </div>

          <div className="profile-field">
            <label htmlFor="status">Account Status</label>
            <input
              id="status"
              value={profile.status || "Unknown"}
              disabled
              readOnly
            />
          </div>

          <div className="profile-field">
            <label htmlFor="created_at">Member Since</label>
            <input
              id="created_at"
              value={
                profile.created_at
                  ? new Date(profile.created_at).toLocaleDateString()
                  : "Not available"
              }
              disabled
              readOnly
            />
          </div>
        </div>

        {editing && (
          <div className="profile-form-actions">
            <button
              type="button"
              className="profile-secondary-button"
              disabled={saving}
              onClick={() => {
                setForm({
                  full_name: profile.full_name || "",
                  phone: profile.phone || "",
                  job_title: profile.job_title || "",
                });
                setEditing(false);
                setError("");
                setSuccess("");
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="profile-primary-button"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}