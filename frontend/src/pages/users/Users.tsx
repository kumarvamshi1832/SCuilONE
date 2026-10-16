import { useState, useEffect } from "react";
import { User } from "../../types/user";
import { getUsers } from "../../services/userService";
import EditUserModal from "../../components/users/EditUserModal";
import AddUserModal from "../../components/users/AddUserModal";
import "./Users.css";

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Notification state
  const [notification, setNotification] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || "Unable to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  };

  const handleUserCreated = () => {
    fetchUsers();
    setNotification("User created successfully");
    setTimeout(() => setNotification(null), 3000);
  };

  const handleUserUpdated = () => {
    fetchUsers();
    setNotification("User role updated successfully");
    setTimeout(() => setNotification(null), 3000);
  };

  const filteredUsers = users.filter(u => 
    (u.full_name || "").toLowerCase().includes(search.toLowerCase()) || 
    (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="users-page">
      {notification && (
        <div className="notification-toast success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          {notification}
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p className="text-muted">Manage your company users and their roles.</p>
        </div>
        <div className="header-actions">
          <div className="search-users-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input 
              type="text" 
              placeholder="Search Users" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={() => setIsAddModalOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add User
          </button>
        </div>
      </div>

      <div className="users-table-container">
        {loading ? (
          <div className="loading-state">Loading users...</div>
        ) : error ? (
          <div className="error-state" style={{ padding: '40px', textAlign: 'center', color: '#e74c3c' }}>
            <p>{error}</p>
            <button className="btn-secondary" onClick={fetchUsers} style={{ marginTop: '16px' }}>Retry</button>
          </div>
        ) : (
          <table className="full-width-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>
                    <div className="user-cell">
                      <div className="avatar-small">{(user.full_name || "?").charAt(0).toUpperCase()}</div>
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
                  <td>
                    <button className="btn-icon" onClick={() => handleEditClick(user)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-muted">
                    No users found.<br/>
                    <small>Add your first user to get started.</small>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {isAddModalOpen && (
        <AddUserModal
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={handleUserCreated}
        />
      )}

      {isEditModalOpen && selectedUser && (
        <EditUserModal 
          user={selectedUser} 
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={handleUserUpdated}
        />
      )}
    </div>
  );
}
