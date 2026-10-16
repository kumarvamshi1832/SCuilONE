import { useState, useEffect } from "react";
import { getPermissions, PermissionDetail } from "../../services/permissionService";
import "../users/Users.css";

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

export default function Permissions() {
  const [, setPermissions] = useState<PermissionDetail[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchPermissionsData = async () => {
    setLoading(true);
    setError(null);
    try {
      let perms: PermissionDetail[];
      try {
        perms = await getPermissions();
      } catch {
        // Fallback since backend is missing
        perms = FALLBACK_PERMISSIONS;
      }
      setPermissions(perms);
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
        <div className="header-actions">
          <div className="search-users-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input 
              type="text" 
              placeholder="Search Permissions..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>
      
      {error && !loading && (
        <div className="notification-toast error" style={{ position: 'relative', top: 0, right: 0, marginBottom: '20px', width: '100%' }}>
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
           {error}
        </div>
      )}


    </div>
  );
}
