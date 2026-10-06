import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { getTenantDetails } from "../../services/dashboardService";
import { TenantDetails } from "../../types/dashboard";
import "./DashboardLayout.css";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
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
  
  const [tenant, setTenant] = useState<TenantDetails | null>(null);
  const [user, setUser] = useState<{name: string, role: string} | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    // Load tenant details
    getTenantDetails().then(setTenant);
    
    // Load user from session storage
    const storedUser = sessionStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser({
          name: parsed.first_name || parsed.full_name || parsed.name || "User", 
          role: parsed.role || "Tenant Admin"
        });
      } catch (e) {
        setUser({ name: "User", role: "Tenant Admin" });
      }
    } else {
      setUser({ name: "User", role: "Tenant Admin" }); 
    }
  }, []);

  const handleLogout = () => {
    sessionStorage.clear();
    navigate("/login");
  };

  const role = (user?.role || "").toUpperCase();
  const isManager = role.includes("MANAGER");
  const isSales = role === "SALES_USER" || role === "SALES USER" || role.includes("SALES");
  const isOps = role === "OPERATIONS_USER" || role === "OPERATIONS USER" || role.includes("OPERATIONS");
  const isSupport = role === "SUPPORT_USER" || role === "SUPPORT USER" || role.includes("SUPPORT");
  const isAuditor = role === "READ_ONLY" || role === "AUDITOR" || role === "READ ONLY" || role === "READ-ONLY" || role === "READ-ONLY / AUDITOR" || role === "READ ONLY / AUDITOR" || role === "READ_ONLY / AUDITOR" || role.includes("AUDITOR");
  const isTenantAdmin = !isManager && !isSales && !isOps && !isSupport && !isAuditor;

  const hasPermission = (perm: string) => {
    const userStr = sessionStorage.getItem("user");
    if (!userStr) return false;
    try {
      const u = JSON.parse(userStr);
      let perms: any[] = [];
      if (Array.isArray(u.permissions)) perms = u.permissions;
      else if (u.role && Array.isArray(u.role.permissions)) perms = u.role.permissions;
      else if (Array.isArray(u.role_permissions)) perms = u.role_permissions;
      
      return perms.some(p => {
          if (typeof p === 'string') return p.toLowerCase() === perm.toLowerCase();
          if (p && typeof p === 'object' && p.name) return p.name.toLowerCase() === perm.toLowerCase();
          return false;
      });
    } catch (e) {}
    return false;
  };

  const getNavItems = () => {
    if (isManager) {
      return [
        { label: "Dashboard", path: "/manager/dashboard", icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
        { label: "Leads", path: `${basePath}/leads`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
        { label: "Contacts", path: `${basePath}/contacts`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
        { label: "Accounts", path: `${basePath}/accounts`, icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
        { label: "Deals", path: `${basePath}/deals`, icon: "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
        { label: "Activities", path: `${basePath}/activities`, icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
        { label: "Reports", path: `${basePath}/reports`, icon: "M18 20V10 M12 20V4 M6 20v-4" },
      ];
    }
    
    if (isSales) {
      const salesNav = [
        { label: "Dashboard", path: "/sales/dashboard", icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }
      ];
      if (hasPermission("lead.view")) {
        salesNav.push({ label: "Leads", path: `${basePath}/leads`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" });
      }
      if (hasPermission("contact.view")) {
        salesNav.push({ label: "Contacts", path: `${basePath}/contacts`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" });
      }
      if (hasPermission("account.view")) {
        salesNav.push({ label: "Accounts", path: `${basePath}/accounts`, icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" });
      }
      if (hasPermission("deal.view")) {
        salesNav.push({ label: "Deals", path: `${basePath}/deals`, icon: "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" });
      }
      if (hasPermission("task.view")) {
        salesNav.push({ label: "Tasks", path: `${basePath}/tasks`, icon: "M22 12h-4l-3 9L9 3l-3 9H2" });
      }
      return salesNav;
    }

    if (isOps) {
      const opsNav = [
        { label: "Dashboard", path: "/operations/dashboard", icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }
      ];
      if (hasPermission("lead.view")) {
        opsNav.push({ label: "Leads", path: `${basePath}/leads`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" });
      }
      if (hasPermission("contact.view")) {
        opsNav.push({ label: "Contacts", path: `${basePath}/contacts`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" });
      }
      if (hasPermission("account.view")) {
        opsNav.push({ label: "Accounts", path: `${basePath}/accounts`, icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" });
      }
      if (hasPermission("deal.view")) {
        opsNav.push({ label: "Deals", path: `${basePath}/deals`, icon: "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" });
      }
      if (hasPermission("task.view")) {
        opsNav.push({ label: "Tasks", path: `${basePath}/tasks`, icon: "M22 12h-4l-3 9L9 3l-3 9H2" });
      }
      return opsNav;
    }

    if (isSupport) {
      const supportNav = [
        { label: "Dashboard", path: "/support/dashboard", icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }
      ];
      if (hasPermission("lead.view")) {
        supportNav.push({ label: "Leads", path: `${basePath}/leads`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" });
      }
      if (hasPermission("contact.view")) {
        supportNav.push({ label: "Contacts", path: `${basePath}/contacts`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" });
      }
      if (hasPermission("account.view")) {
        supportNav.push({ label: "Accounts", path: `${basePath}/accounts`, icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" });
      }
      if (hasPermission("deal.view")) {
        supportNav.push({ label: "Deals", path: `${basePath}/deals`, icon: "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" });
      }
      if (hasPermission("task.view")) {
        supportNav.push({ label: "Tasks", path: `${basePath}/tasks`, icon: "M22 12h-4l-3 9L9 3l-3 9H2" });
      }
      if (hasPermission("activity.view")) {
        supportNav.push({ label: "Activities", path: `${basePath}/activities`, icon: "M22 12h-4l-3 9L9 3l-3 9H2" });
      }
      if (hasPermission("property.view")) {
        supportNav.push({ label: "Properties", path: `${basePath}/properties`, icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" });
      }
      if (hasPermission("user.view")) {
        supportNav.push({ label: "Users", path: `${basePath}/users`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" });
      }
      if (hasPermission("role.view")) {
        supportNav.push({ label: "Roles", path: `${basePath}/roles`, icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" });
      }
      if (hasPermission("permission.view")) {
        supportNav.push({ label: "Permissions", path: `${basePath}/permissions`, icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" });
      }
      if (hasPermission("report.view")) {
        supportNav.push({ label: "Reports", path: `${basePath}/reports`, icon: "M18 20V10 M12 20V4 M6 20v-4" });
      }
      if (hasPermission("settings")) {
        supportNav.push({ label: "Settings", path: `${basePath}/settings`, icon: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" });
      }
      return supportNav;
    }

    if (isAuditor) {
      const auditorNav = [
        { label: "Dashboard", path: "/auditor/dashboard", icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }
      ];
      if (hasPermission("lead.view")) {
        auditorNav.push({ label: "Leads", path: `${basePath}/leads`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" });
      }
      if (hasPermission("contact.view")) {
        auditorNav.push({ label: "Contacts", path: `${basePath}/contacts`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" });
      }
      if (hasPermission("account.view")) {
        auditorNav.push({ label: "Accounts", path: `${basePath}/accounts`, icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" });
      }
      if (hasPermission("deal.view")) {
        auditorNav.push({ label: "Deals", path: `${basePath}/deals`, icon: "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" });
      }
      if (hasPermission("task.view")) {
        auditorNav.push({ label: "Tasks", path: `${basePath}/tasks`, icon: "M22 12h-4l-3 9L9 3l-3 9H2" });
      }
      if (hasPermission("activity.view")) {
        auditorNav.push({ label: "Activities", path: `${basePath}/activities`, icon: "M22 12h-4l-3 9L9 3l-3 9H2" });
      }
      if (hasPermission("property.view")) {
        auditorNav.push({ label: "Properties", path: `${basePath}/properties`, icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" });
      }
      if (hasPermission("user.view")) {
        auditorNav.push({ label: "Users", path: `${basePath}/users`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" });
      }
      if (hasPermission("role.view")) {
        auditorNav.push({ label: "Roles", path: `${basePath}/roles`, icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" });
      }
      if (hasPermission("permission.view")) {
        auditorNav.push({ label: "Permissions", path: `${basePath}/permissions`, icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" });
      }
      if (hasPermission("report.view")) {
        auditorNav.push({ label: "Reports", path: `${basePath}/reports`, icon: "M18 20V10 M12 20V4 M6 20v-4" });
      }
      if (hasPermission("settings")) {
        auditorNav.push({ label: "Settings", path: `${basePath}/settings`, icon: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" });
      }
      return auditorNav;
    }

    // Tenant Admin
    return [
      { label: "Dashboard", path: `${basePath}/dashboard`, icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
      { label: "Leads", path: `${basePath}/leads`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
      { label: "Contacts", path: `${basePath}/contacts`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
      { label: "Accounts", path: `${basePath}/accounts`, icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
      { label: "Deals", path: `${basePath}/deals`, icon: "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
      { label: "Activities", path: `${basePath}/activities`, icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
      { label: "Reports", path: `${basePath}/reports`, icon: "M18 20V10 M12 20V4 M6 20v-4" },
      { label: "Users", path: `${basePath}/users`, icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
      { label: "Roles", path: `${basePath}/roles`, icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
      { label: "Permissions", path: `${basePath}/permissions`, icon: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" },
      { label: "Settings", path: `${basePath}/settings`, icon: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" }
    ];
  };

  const navItems = getNavItems();

  return (
    <div className={`dashboard-wrapper ${theme}`}>
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="sidebar-overlay" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`dashboard-sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <h2><span className="text-blue">SCuilONE</span> CRM</h2>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              to={item.path} 
              className={`nav-item ${location.pathname.startsWith(item.path) ? "active" : ""}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/help" className="nav-item">
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            Help
          </Link>
          <button className="nav-item logout-btn" onClick={handleLogout}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-main">
        {/* Top Header */}
        <header className="dashboard-header">
          <div className="header-left">
            <button 
              className="mobile-menu-btn" 
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open Menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div className="tenant-selector">
              <span>{tenant ? tenant.name : "Loading..."}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <div className="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input type="text" placeholder="Search..." />
            </div>
          </div>

          <div className="header-right">
            <button 
              className="theme-toggle" 
              onClick={toggleTheme} 
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              )}
            </button>
            <button className="notification-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
            </button>
            <div className="user-profile">
              <div className="avatar">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <div className="user-info">
                <span className="user-name">{user?.name}</span>
                <span className="user-role">{user?.role}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="dashboard-content">
          {children}
        </div>
      </main>
    </div>
  );
}
