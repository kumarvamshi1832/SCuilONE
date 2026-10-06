import { useState, useEffect } from "react";
import { getRoles as getRolesList, getUsers } from "../../services/userService";
// import { deleteRole } from "../../services/roleService";
// import { User } from "../../types/user";
import RoleModal from "../../components/roles/RoleModal";
import "../users/Users.css"; // Reuse existing styles
import "./Roles.css";

interface RoleUI {
  name: string;
  users: number;
}

export default function Roles() {
  const [roles, setRoles] = useState<RoleUI[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'view'>('view');

  const fetchRolesData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [roleNames, usersList] = await Promise.all([
        getRolesList(),
        getUsers()
      ]);
      
      const roleCounts = usersList.reduce((acc, user) => {
        const role = user.role || "User";
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Fetch actual role details from roleService to get accurate permission counts if possible
      // or fallback to usersList mapping
      let finalRoles: RoleUI[] = [];
      try {
        const { getRoles: getRolesDetails } = await import("../../services/roleService");
        const roleDetails = await getRolesDetails();
        finalRoles = roleDetails.map(r => ({
          name: r.name,
          users: r.users_count !== undefined ? r.users_count : (roleCounts[r.name] || 0),
        }));
      } catch (e) {
        finalRoles = roleNames.map(rName => ({
          name: rName,
          users: roleCounts[rName] || 0,
        }));
      }
      
      setRoles(finalRoles);
    } catch (err: any) {
      setError(err.message || "Unable to load roles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRolesData();
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleView = (role: RoleUI) => {
    setSelectedRole(role.name);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const filteredRoles = roles.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="users-page roles-page">
      {notification && (
        <div className={`notification-toast ${notification.type}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
             {notification.type === 'success' ? (
                <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></>
             ) : (
                <><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></>
             )}
          </svg>
          {notification.message}
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>Roles</h1>
          <p className="text-muted">Manage tenant roles and permissions.</p>
        </div>
        <div className="header-actions">
          <div className="search-users-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input 
              type="text" 
              placeholder="Search Roles..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="users-table-container">
        {loading ? (
          <div className="loading-state">Loading roles...</div>
        ) : error ? (
          <div className="error-state" style={{ padding: '40px', textAlign: 'center', color: '#e74c3c' }}>
            <p>{error}</p>
            <button className="btn-secondary" onClick={fetchRolesData} style={{ marginTop: '16px' }}>Retry</button>
          </div>
        ) : (
          <table className="full-width-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Users</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoles.map((role, idx) => (
                <tr key={idx}>
                  <td><span className="role-badge font-medium">{role.name}</span></td>
                  <td>{role.users}</td>
                  <td className="text-right actions-col">
                    <button className="btn-icon" onClick={() => handleView(role)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRoles.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-4 text-muted">
                    No roles found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      
      {isModalOpen && (
        <RoleModal
          roleName={selectedRole}
          mode={modalMode}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchRolesData();
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
    </div>
  );
}
