
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  getMyProfile,
  updateMyProfile,
  uploadMyProfilePhoto,
  type UserProfile,
} from "../../services/profileService";
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

      setProfile((previous) =>
        previous
          ? { ...previous, photo_url: result.photo_url }
          : previous
      );

      setSuccess("Profile photo updated successfully.");
    } catch {
      setError("Photo upload failed. Please try again.");
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

  const initials =
    profile.full_name
      ?.trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  return (
    <div className="my-profile-page">
      <div className="profile-page-heading">
        <div>
          <span className="profile-eyebrow">ACCOUNT SETTINGS</span>
          <h1>My Profile</h1>
          <p>View and manage your personal information.</p>
        </div>

        {!editing && (
          <button
            type="button"
            className="profile-primary-button"
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

      <section className="profile-card">
        <div className="profile-identity">
          <div className="profile-photo-wrapper">
            {profile.photo_url ? (
              <img
                src={profile.photo_url}
                alt="Your profile"
                className="profile-photo"
              />
            ) : (
              <div className="profile-photo profile-photo-fallback">
                {initials}
              </div>
            )}

            <button
              type="button"
              className="profile-photo-edit"
              title="Change profile photo"
              aria-label="Change profile photo"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "…" : "✎"}
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
            <h2>{profile.full_name}</h2>
            <p>{profile.email}</p>
            <div className="profile-badges">
              <span className="profile-role-badge">
                {profile.role || "User"}
              </span>
              <span
                className={`profile-status-badge ${
                  profile.status?.toLowerCase() === "active"
                    ? "is-active"
                    : ""
                }`}
              >
                {profile.status || "Unknown"}
              </span>
            </div>
            <small>
              {uploading
                ? "Uploading photo..."
                : "Click the pencil to change your photo"}
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