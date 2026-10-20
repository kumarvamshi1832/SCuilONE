import { User } from "../../types/user";
import { Link, useParams } from "react-router-dom";
import { formatDateTime } from "../../utils/dateFormatter";
import { normalizeIndustry } from "../../utils/industryUtils";
import ProfileAvatar from "../common/ProfileAvatar";

interface RecentUsersProps {
  users: User[];
}

export default function RecentUsers({ users }: RecentUsersProps) {
  const { industry } = useParams();
  
  const getBasePath = () => {
    if (industry) return `/${normalizeIndustry(industry)}`;
    const tenantStr = sessionStorage.getItem("tenant");
    if (tenantStr) {
      try {
        const t = JSON.parse(tenantStr);
        if (t?.industry) return `/${normalizeIndustry(t.industry)}`;
      } catch(e) {}
    }
    return "/real-estate";
  };

  return (
    <div className="dashboard-section-card">
      <div className="section-header">
        <h3>Recent Users</h3>
        <Link to={`${getBasePath()}/users`} className="view-all-link">View All</Link>
      </div>
      <div className="table-responsive">
        <table className="recent-users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined On</th>
            </tr>
          </thead>
          <tbody>
            {users.slice(0, 4).map((user) => (
              <tr key={user.id}>
                <td>
                  <div className="user-cell">
                    <ProfileAvatar
                      photoUrl={user.photo_url}
                      name={user.full_name}
                      size={32}
                      className="avatar-small"
                    />
                    <span className="font-medium">{user.full_name}</span>
                  </div>
                </td>
                <td className="text-muted">{user.email}</td>
                <td><span className="role-badge">{user.role}</span></td>
                <td>
                  <span className={`status-badge ${user.status?.toLowerCase() === 'active' ? 'active' : 'inactive'}`}>
                    {user.status || 'Inactive'}
                  </span>
                </td>
                <td className="text-muted">
                  {user.created_at ? formatDateTime(user.created_at) : 'N/A'}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-4 text-muted">No users found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
