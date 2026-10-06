import { useState, useEffect } from "react";
import { getPermissions } from "../../services/permissionService";
import "../users/Users.css";

export default function Permissions() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissionsData = async () => {
    setLoading(true);
    setError(null);

    try {
      await getPermissions();
    } catch (err: any) {
      setError(err.message || "Unable to load permissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissionsData();
  }, []);

  return (
    <div className="users-page">
      <div className="page-header">
        <div>
          <h1>Permissions</h1>
          <p className="text-muted">View all available system permissions.</p>
        </div>
      </div>

      {error && !loading && (
        <div
          className="notification-toast error"
          style={{
            position: "relative",
            top: 0,
            right: 0,
            marginBottom: "20px",
            width: "100%",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}
