import { useState, useEffect } from "react";
import { Role } from "../../types/user";
import { getRoles, createUser } from "../../services/userService";

interface AddUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddUserModal({ onClose, onSuccess }: AddUserModalProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("Sales User");
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createUser({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Failed to create user", err);
      const message = err?.response?.data?.detail || err?.message || "Failed to create user";
      setError(typeof message === "string" ? message : "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Add New User</h2>
          <button className="btn-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div
              className="alert-box error"
              style={{
                padding: "8px 12px",
                marginBottom: "16px",
                borderRadius: "6px",
                background: "#fcebea",
                color: "#cc0000",
                fontSize: "14px",
              }}
            >
              {error}
            </div>
          )}

          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              placeholder="e.g. Rahul Sharma"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setError(null);
              }}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              placeholder="e.g. rahul@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Temporary Password</label>
            <input
              type="password"
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Role & Permissions</label>
            <select
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
      </div>
    </div>
  );
}
