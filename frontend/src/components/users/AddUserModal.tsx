import { useState, useEffect } from "react";
import { Role } from "../../types/user";
import { getRoles, createUser, resendUserInvitation } from "../../services/userService";

interface AddUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddUserModal({ onClose, onSuccess }: AddUserModalProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Sales User");
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);

  useEffect(() => {
    getRoles().then((roles) => {
      setAvailableRoles(roles);
      if (roles.length > 0 && roles[0] && !roles.includes(role)) {
        setRole(roles[0]);
      }
    });
  }, []);

  const handleCreate = async () => {
    if (!fullName.trim()) {
      setError("Full Name is required.");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const res = await createUser({
        full_name: fullName.trim(),
        email: normalizedEmail,
        role,
      });

      if (res && res.invitation_sent === false) {
        setError(
          res.message ||
          "User was created, but the invitation email could not be sent. Please check your email configuration or use Resend Invitation."
        );
        setCreatedUserId(res.user?.id || null);
        onSuccess();
      } else {
        // Truthful reporting: backend confirmed email was sent
        setInvitedEmail(normalizedEmail);
        onSuccess();
      }
    } catch (err: any) {
      console.error("Failed to invite user", err);
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to invite user. Please try again.";
      setError(typeof message === "string" ? message : "Failed to invite user");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!createdUserId) return;
    setResending(true);
    setError(null);
    try {
      const res = await resendUserInvitation(createdUserId);
      if (res.invitation_sent) {
        setInvitedEmail(email.trim().toLowerCase());
        onSuccess();
      } else {
        setError(res.message || "Failed to deliver invitation email. Please check SMTP settings.");
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Failed to resend invitation email.";
      setError(typeof msg === "string" ? msg : "Failed to resend invitation email.");
    } finally {
      setResending(false);
    }
  };

  const handleResetForAnother = () => {
    setFullName("");
    setEmail("");
    setError(null);
    setCreatedUserId(null);
    setInvitedEmail(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{invitedEmail ? "Invitation Sent" : "Add New User"}</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {invitedEmail ? (
          <>
            <div className="modal-body" style={{ textAlign: "center", padding: "32px 24px" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "rgba(16, 185, 129, 0.12)",
                  color: "#10b981",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: "28px", height: "28px" }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: "1.2rem", fontWeight: 600 }}>
                Invitation sent successfully.
              </h3>
              <p style={{ margin: "0 0 16px", color: "var(--text-muted, #64748b)", fontSize: "0.95rem", lineHeight: 1.5 }}>
                An invitation email with a secure password setup link has been sent to:
              </p>
              <div
                style={{
                  display: "inline-block",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: "rgba(37, 99, 235, 0.08)",
                  color: "#2563eb",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  marginBottom: "12px",
                  wordBreak: "break-all",
                }}
              >
                {invitedEmail}
              </div>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted, #888)" }}>
                The user can now use the link in their email to set their password and complete their profile.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={handleResetForAnother}>
                Invite Another User
              </button>
              <button className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body">
              {error && (
                <div
                  className="alert-box error"
                  style={{
                    padding: "12px 14px",
                    marginBottom: "16px",
                    borderRadius: "6px",
                    background: "#fcebea",
                    color: "#cc0000",
                    fontSize: "14px",
                    lineHeight: 1.4,
                  }}
                >
                  <div style={{ marginBottom: createdUserId ? "10px" : "0" }}>
                    {error}
                  </div>
                  {createdUserId && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleResend}
                      disabled={resending}
                      style={{
                        padding: "6px 14px",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {resending ? "Sending..." : "Resend Invitation"}
                    </button>
                  )}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="user-full-name">Full Name</label>
                <input
                  id="user-full-name"
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="user-email-address">Email Address</label>
                <input
                  id="user-email-address"
                  type="email"
                  placeholder="e.g. rahul@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="user-role-select">Role & Permissions</label>
                <select
                  id="user-role-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  disabled={loading}
                >
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <span className="info-text">
                  The user will inherit permissions according to the selected role.
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleCreate} disabled={loading}>
                {loading ? "Creating..." : "Create User"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
