import { useState, useEffect } from "react";
import { createRole, updateRole, getRoleById, getRolePermissions } from "../../services/roleService";
import { getUsers } from "../../services/userService";
import { User } from "../../types/user";
import { getPermissions, PermissionDetail } from "../../services/permissionService";
import "./RoleModal.css";

interface RoleModalProps {
  roleName: string | null;
  mode: 'create' | 'edit' | 'view';
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

// Fallback permissions in case API is missing, to allow the UI to function
const FALLBACK_PERMISSIONS: PermissionDetail[] = [
  { id: "1", name: "leads.view", module: "Leads", action: "View", description: "View leads" },
  { id: "2", name: "leads.create", module: "Leads", action: "Create", description: "Create leads" },
  { id: "3", name: "leads.update", module: "Leads", action: "Update", description: "Update leads" },
  { id: "4", name: "leads.delete", module: "Leads", action: "Delete", description: "Delete leads" },
  { id: "5", name: "contacts.view", module: "Contacts", action: "View", description: "View contacts" },
  { id: "6", name: "contacts.create", module: "Contacts", action: "Create", description: "Create contacts" },
  { id: "7", name: "deals.view", module: "Deals", action: "View", description: "View deals" },
  { id: "8", name: "deals.create", module: "Deals", action: "Create", description: "Create deals" },
  { id: "9", name: "reports.view", module: "Reports", action: "View", description: "View reports" },
];

export default function RoleModal({ roleName, mode, onClose, onSuccess, onError }: RoleModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  
  const [, setAvailablePermissions] = useState<PermissionDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  
  const [roleUsers, setRoleUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [usersCount, setUsersCount] = useState<number | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        setLoadingMsg("Loading permissions...");
        let perms: PermissionDetail[];
        try {
           perms = await getPermissions();
        } catch {
           // Fallback if backend API is missing
           perms = FALLBACK_PERMISSIONS;
        }
        setAvailablePermissions(perms);
        
        if (mode !== 'create' && roleName) {
           setName(roleName);
           setLoadingMsg("Loading role details...");
           
           if (mode === 'view') {
             try {
               const allUsers = await getUsers();
               const filtered = allUsers.filter(u => u.role === roleName);
               setRoleUsers(filtered);
             } catch {
               setRoleUsers([]);
             }
           }
           
           try {
             const roleData = await getRoleById(roleName); // likely 404
             setDescription(roleData.description || "");
             setUsersCount(roleData.users_count !== undefined ? roleData.users_count : null);
             const rolePerms = await getRolePermissions(roleName);
             setSelectedPermissions(new Set(rolePerms));
           } catch {
             // Backend endpoints missing, leave form blank
             setDescription("");
           }
        }
      } catch (err: any) {
         onError("Error loading data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [roleName, mode, onError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'view') {
      onClose();
      return;
    }
    
    setLoading(true);
    try {
      const data = {
        name,
        description,
        permission_ids: Array.from(selectedPermissions)
      };
      
      if (mode === 'create') {
        await createRole(data);
      } else if (mode === 'edit' && roleName) {
        await updateRole(roleName, data);
      }
      onSuccess();
    } catch (err: any) {
      onError(err.message || "Operation failed. Backend endpoint may be missing.");
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content role-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'create' ? 'Create Role' : mode === 'edit' ? 'Edit Role' : 'Role Details'}</h2>
          <button className="btn-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        {loading && <div className="modal-loading">{loadingMsg || "Loading..."}</div>}
        
        {!loading && mode === 'view' ? (
          <div className="modal-body role-view-mode">
             {selectedUser ? (
                <div className="user-details-view" style={{ textAlign: 'left' }}>
                  <button type="button" className="btn-secondary" onClick={() => setSelectedUser(null)} style={{marginBottom: '1rem'}}>
                    &larr; Back to Role
                  </button>
                  <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '1rem' }}>User Details</h3>
                  <div style={{ marginBottom: '0.5rem' }}><strong>Name:</strong> {selectedUser.full_name}</div>
                  <div style={{ marginBottom: '0.5rem' }}><strong>Email:</strong> {selectedUser.email}</div>
                  <div style={{ marginBottom: '0.5rem' }}><strong>Role:</strong> {selectedUser.role}</div>
                  <div style={{ marginBottom: '0.5rem' }}><strong>Status:</strong> {selectedUser.status}</div>
                </div>
             ) : (
                <div className="role-details-view" style={{ textAlign: 'left' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0' }}>{name}</h3>
                  {description && <p className="text-muted" style={{ margin: '0 0 1.5rem 0' }}>{description}</p>}
                  
                  <div className="stats-box" style={{ margin: '1rem 0', fontSize: '1.1rem' }}>
                    <strong>Total Users:</strong> {usersCount !== null ? usersCount : roleUsers.length}
                  </div>
                  

                  <div className="users-section" style={{marginTop: '1.5rem'}}>
                    <h4 style={{ borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>Users with this role</h4>
                    {roleUsers.length > 0 ? (
                      <ol className="role-users-list" style={{ paddingLeft: '1.5rem', margin: '0.5rem 0' }}>
                        {roleUsers.map(u => (
                          <li key={u.id} style={{ padding: '0.25rem 0' }}>
                            <button className="btn-link" onClick={() => setSelectedUser(u)} style={{background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', padding: 0, fontSize: '1rem', textDecoration: 'underline'}}>
                              {u.full_name}
                            </button>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-muted" style={{ marginTop: '0.5rem' }}>No users assigned to this role.</p>
                    )}
                  </div>
                </div>
             )}
             
            <div className="modal-footer" style={{ marginTop: '2rem' }}>
              <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : !loading && (
          <form onSubmit={handleSubmit} className="modal-body">
            <div className="form-group">
              <label>Role Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                disabled={mode === 'view' || mode === 'edit'} 
                required 
              />
            </div>
            
            <div className="form-group">
              <label>Description</label>
              <input 
                type="text" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                disabled={mode === 'view'} 
              />
            </div>
            

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose}>
                {mode === 'view' ? 'Close' : 'Cancel'}
              </button>
              {mode !== 'view' && (
                <button type="submit" className="btn-primary">
                  {mode === 'create' ? 'Create Role' : 'Save Changes'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
