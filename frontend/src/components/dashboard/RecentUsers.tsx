import { User } from "../../types/user";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatDateTime } from "../../utils/dateFormatter";
import { normalizeIndustry } from "../../utils/industryUtils";
import ProfileAvatar from "../common/ProfileAvatar";

interface RecentUsersProps {
  users: User[];
}

export default function RecentUsers({ users }: RecentUsersProps) {
  const navigate = useNavigate();
  const { industry } = useParams();

  const getBasePath = () => {
    if (industry) return `/${normalizeIndustry(industry)}`;
    const tenantStr = sessionStorage.getItem("tenant");
    if (tenantStr) {
      try {
        const t = JSON.parse(tenantStr);
        if (t?.industry) return `/${normalizeIndustry(t.industry)}`;
      } catch (e) {}
    }
    return "/real-estate";
  };

  const basePath = getBasePath();

  return (
    <div className="dashboard-section-card recent-users-card">
      <div className="section-header">
        <h3 className="section-title">Recent Users</h3>
        <Link to={`${basePath}/users`} className="view-all-link">
          View All
        </Link>
      </div>

      <div className="table-responsive">
        <table className="recent-users-table">
          <thead>
            <tr>
              <th className="th-user-name">Name</th>
              <th className="th-user-email">Email</th>
              <th className="th-user-role">Role</th>
              <th className="th-user-status">Status</th>
              <th className="th-user-date">Joined On</th>
              <th className="th-user-action" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {users.slice(0, 5).map((user) => (
              <tr key={user.id} className="recent-user-row">
                <td className="td-user-name">
                  <div className="user-cell">
                    <ProfileAvatar
                      photoUrl={user.photo_url}
                      name={user.full_name || user.email || "User"}
                      size={32}
                      className="avatar-small"
                    />
                    <span className="user-full-name" title={user.full_name}>
                      {user.full_name || "User"}
                    </span>
                  </div>
                </td>
                <td className="td-user-email text-muted" title={user.email}>
                  {user.email || "—"}
                </td>
                <td className="td-user-role">
                  <span className="role-badge">{user.role || "User"}</span>
                </td>
                <td className="td-user-status">
                  <span
                    className={`status-badge ${
                      (user.status || "").toLowerCase() === "active"
                        ? "active"
                        : "inactive"
                    }`}
                  >
                    {user.status || "Inactive"}
                  </span>
                </td>
                <td className="td-user-date text-muted">
                  {user.created_at ? formatDateTime(user.created_at) : "—"}
                </td>
                <td className="td-user-action">
                  <button
                    type="button"
                    className="btn-user-action-dots"
                    title={`Actions for ${user.full_name || "User"}`}
                    aria-label={`Actions for ${user.full_name || "User"}`}
                    onClick={() => navigate(`${basePath}/users`)}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty-cell text-center py-4 text-muted">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
