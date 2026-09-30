import { useState, useEffect } from "react";
import { User, Role } from "../../types/user";
import { getRoles, updateUserRole } from "../../services/userService";

interface EditUserModalProps {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditUserModal({ user, onClose, onSuccess }: EditUserModalProps) {
  const [role, setRole] = useState<Role>(user.role as Role);
  const [status, setStatus] = useState<string>(user.status);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRoles().then(setAvailableRoles);
  }, []);

  const handleUpdate = async () => {
    setLoading(true);
    setError(null);
    try {
      await updateUserRole(user.id, role, status);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Failed to update user", err);
      const message = err?.response?.data?.detail || err?.message || "Failed to update user";
      setError(typeof message === "string" ? message : "Failed to update user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Edit User</h2>
          <button className="btn-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div className="modal-body">
          {error && (
            <div className="alert-box error" style={{ padding: '8px 12px', marginBottom: '16px', borderRadius: '6px', background: '#fcebea', color: '#cc0000', fontSize: '14px' }}>
              {error}
            </div>
          )}
          <div className="form-group">
            <label>Full Name</label>
            <input type="text" value={user.full_name} disabled />
          </div>
          
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={user.email} disabled />
          </div>
          
          <div className="form-group">
            <label>Role & Permissions</label>
            <select value={role} onChange={(e) => setRole(e.target.value as any)}>
              {availableRoles.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <span className="info-text">
              Changing the role will update the user's permissions based on the selected role.
            </span>
          </div>

          <div className="form-group">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleUpdate} disabled={loading}>
            {loading ? "Updating..." : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}
