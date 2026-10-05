import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./RealEstateDashboard.css";

export default function OperationsDashboard() {
  const [user, setUser] = useState<{ name: string; role: string; permissions?: any[] } | null>(null);
  const navigate = useNavigate();
  const { industry } = useParams();

  const tenantStr = sessionStorage.getItem("tenant");
  let tenantIndustry = "real-estate";
  if (tenantStr) {
    try {
      const t = JSON.parse(tenantStr);
      if (t?.industry) tenantIndustry = t.industry.toLowerCase().replace(/\s+/g, '-');
    } catch(e) {}
  }
  const currentIndustry = industry || tenantIndustry;
  const basePath = `/${currentIndustry}`;

  useEffect(() => {
    const storedUser = sessionStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        let perms: any[] = [];
        if (Array.isArray(parsed.permissions)) perms = parsed.permissions;
        else if (parsed.role && Array.isArray(parsed.role.permissions)) perms = parsed.role.permissions;
        else if (Array.isArray(parsed.role_permissions)) perms = parsed.role_permissions;
        
        setUser({
          name: parsed.first_name || parsed.full_name || parsed.name || "Operations User",
          role: parsed.role || "Operations User",
          permissions: perms
        });
      } catch (e) {
        setUser({ name: "Operations User", role: "Operations User", permissions: [] });
      }
    } else {
      setUser({ name: "Operations User", role: "Operations User", permissions: [] });
    }
  }, []);

  const hasPermission = (perm: string) => {
    if (!user) return false;
    const perms = user.permissions || [];
    return perms.some(p => {
      if (typeof p === 'string') return p.toLowerCase() === perm.toLowerCase();
      if (p && typeof p === 'object' && (p as any).name) return (p as any).name.toLowerCase() === perm.toLowerCase();
      return false;
    });
  };

  return (
    <div className="real-estate-dashboard">
      <div className="welcome-section">
        <h1>Welcome back, {user?.name}!</h1>
        <p className="text-muted">Here is your operations overview and today's activities.</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card blue">
          <div className="kpi-info">
            <h4 className="kpi-title">Leads to Review</h4>
            <div className="kpi-value">-</div>
          </div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-info">
            <h4 className="kpi-title">Total Contacts</h4>
            <div className="kpi-value">-</div>
          </div>
        </div>
        <div className="kpi-card orange">
          <div className="kpi-info">
            <h4 className="kpi-title">Total Accounts</h4>
            <div className="kpi-value">-</div>
          </div>
        </div>
        <div className="kpi-card purple">
          <div className="kpi-info">
            <h4 className="kpi-title">Open Deals</h4>
            <div className="kpi-value">-</div>
          </div>
        </div>
        <div className="kpi-card teal">
          <div className="kpi-info">
            <h4 className="kpi-title">Tasks Today</h4>
            <div className="kpi-value">-</div>
          </div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-info">
            <h4 className="kpi-title">Pending Tasks</h4>
            <div className="kpi-value">-</div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="grid-main">
          
          <div className="dashboard-section-card">
            <div className="section-header">
              <h3>Lead Overview</h3>
            </div>
            {hasPermission("lead.view") ? (
              <div className="pipeline-container" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', overflowX: 'auto' }}>
                 <div className="pipeline-stage" style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', flex: 1, minWidth: '120px', textAlign: 'center' }}>
                    <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>New</h4>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>-</div>
                 </div>
                 <div className="pipeline-stage" style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', flex: 1, minWidth: '120px', textAlign: 'center' }}>
                    <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Contacted</h4>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>-</div>
                 </div>
                 <div className="pipeline-stage" style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', flex: 1, minWidth: '120px', textAlign: 'center' }}>
                    <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Qualified</h4>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>-</div>
                 </div>
                 <div className="pipeline-stage" style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', flex: 1, minWidth: '120px', textAlign: 'center' }}>
                    <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Negotiation</h4>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>-</div>
                 </div>
                 <div className="pipeline-stage" style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', flex: 1, minWidth: '120px', textAlign: 'center' }}>
                    <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Closed</h4>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>-</div>
                 </div>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                 You do not have permission to view leads.
              </div>
            )}
          </div>

          <div className="dashboard-section-card" style={{ marginTop: '1.5rem' }}>
            <div className="section-header">
              <h3>Task Overview</h3>
            </div>
            {hasPermission("task.view") ? (
              <div className="table-responsive">
                <table className="roles-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Task Title</th>
                      <th>Related Lead</th>
                      <th>Related Contact</th>
                      <th>Related Account</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={8} className="text-center text-muted" style={{ padding: '2rem' }}>
                        No tasks scheduled for today.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                 You do not have permission to view tasks.
              </div>
            )}
          </div>

          <div className="dashboard-section-card" style={{ marginTop: '1.5rem' }}>
            <div className="section-header">
              <h3>Recent Leads</h3>
            </div>
            {hasPermission("lead.view") ? (
              <div className="table-responsive">
                <table className="roles-table">
                  <thead>
                    <tr>
                      <th>Lead Name</th>
                      <th>Contact</th>
                      <th>Account</th>
                      <th>Stage</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={7} className="text-center text-muted" style={{ padding: '2rem' }}>
                        No recent leads.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                 You do not have permission to view leads.
              </div>
            )}
          </div>
          
          <div className="dashboard-section-card" style={{ marginTop: '1.5rem' }}>
            <div className="section-header">
              <h3>Recent Contacts</h3>
            </div>
            {hasPermission("contact.view") ? (
              <div className="table-responsive">
                <table className="roles-table">
                  <thead>
                    <tr>
                      <th>Contact Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Account</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={7} className="text-center text-muted" style={{ padding: '2rem' }}>
                        No recent contacts.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                 You do not have permission to view contacts.
              </div>
            )}
          </div>
          
          <div className="dashboard-section-card" style={{ marginTop: '1.5rem' }}>
            <div className="section-header">
              <h3>Recent Accounts</h3>
            </div>
            {hasPermission("account.view") ? (
              <div className="table-responsive">
                <table className="roles-table">
                  <thead>
                    <tr>
                      <th>Account Name</th>
                      <th>Industry</th>
                      <th>Contact</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={6} className="text-center text-muted" style={{ padding: '2rem' }}>
                        No recent accounts.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                 You do not have permission to view accounts.
              </div>
            )}
          </div>
          
          <div className="dashboard-section-card" style={{ marginTop: '1.5rem' }}>
            <div className="section-header">
              <h3>Recent Deals</h3>
            </div>
            {hasPermission("deal.view") ? (
              <div className="table-responsive">
                <table className="roles-table">
                  <thead>
                    <tr>
                      <th>Deal Name</th>
                      <th>Account</th>
                      <th>Stage</th>
                      <th>Amount</th>
                      <th>Expected Close</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={7} className="text-center text-muted" style={{ padding: '2rem' }}>
                        No active deals.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                 You do not have permission to view deals.
              </div>
            )}
          </div>

        </div>

        <div className="grid-side">
          <div className="dashboard-section-card">
            <div className="section-header">
              <h3>Quick Actions</h3>
            </div>
            <div className="quick-actions-list" style={{ padding: '1rem' }}>
              {hasPermission("contact.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => navigate(`${basePath}/contacts`)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Add Contact
                </button>
              )}
              {hasPermission("account.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => navigate(`${basePath}/accounts`)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Create Account
                </button>
              )}
              {hasPermission("task.create") && (
                <button className="btn-quick-action" style={{ width: '100%', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => navigate(`${basePath}/tasks`)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"></path></svg>
                  Create Task
                </button>
              )}
              
              {(!hasPermission("contact.create") && !hasPermission("account.create") && !hasPermission("task.create")) && (
                 <p className="text-muted" style={{ textAlign: 'center', margin: 0 }}>No quick actions available.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
