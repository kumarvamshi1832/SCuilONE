import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LifeBuoyIcon,
  LayoutDashboardIcon,
  TicketIcon,
  UserIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
} from "../common/SupportPortalIcons";
import {
  getPortalProfile,
  portalLogout,
  getPortalCustomer,
} from "../../services/customerPortalAuthService";
import type { PortalProfileResponse } from "../../types/customerPortal";
import "./CustomerPortalLayout.css";

export default function CustomerPortalLayout() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PortalProfileResponse | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("portal_theme") === "dark";
  });

  const localCustomer = getPortalCustomer();

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await getPortalProfile();
        setProfile(data);
      } catch (err) {
        console.warn("Failed to load portal profile:", err);
      }
    }
    loadProfile();
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("portal_theme", next ? "dark" : "light");
      return next;
    });
  };

  const handleLogout = async () => {
    await portalLogout();
    navigate("/portal/login", { replace: true });
  };

  const contactName =
    profile?.contact?.full_name || localCustomer?.email?.split("@")[0] || "Customer";
  const accountName = profile?.account?.name || "Client Portal";
  const initials = contactName.slice(0, 2).toUpperCase();

  return (
    <div className={`cp-layout ${isDarkMode ? "dark" : ""}`}>
      {/* Top Navbar */}
      <header className="cp-navbar">
        <Link to="/portal/dashboard" className="cp-navbar-brand">
          <div className="cp-brand-icon">
            <LifeBuoyIcon size={20} />
          </div>
          <div>
            <div className="cp-brand-text">SCuilONE</div>
          </div>
          <span className="cp-brand-tag">Client Portal</span>
        </Link>

        {/* Navigation Links */}
        <nav className="cp-nav-links">
          <NavLink
            to="/portal/dashboard"
            className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}
          >
            <LayoutDashboardIcon size={16} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink
            to="/portal/tickets"
            className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}
          >
            <TicketIcon size={16} />
            <span>Tickets</span>
          </NavLink>
          <NavLink
            to="/portal/profile"
            className={({ isActive }) => `cp-nav-link ${isActive ? "active" : ""}`}
          >
            <UserIcon size={16} />
            <span>Profile</span>
          </NavLink>
        </nav>

        {/* Right Section: Theme Toggle, User Profile, Logout */}
        <div className="cp-nav-right">
          <button
            className="cp-logout-btn"
            onClick={toggleDarkMode}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>

          <div className="cp-user-badge">
            <div className="cp-avatar">{initials}</div>
            <div className="cp-user-info">
              <span className="cp-user-name">{contactName}</span>
              <span className="cp-user-account">{accountName}</span>
            </div>
          </div>

          <button
            className="cp-logout-btn"
            onClick={handleLogout}
            title="Sign out of Client Portal"
          >
            <LogOutIcon size={18} />
          </button>
        </div>
      </header>

      {/* Main Page Body */}
      <main className="cp-main-content">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="cp-footer">
        <div>
          &copy; {new Date().getFullYear()} SCuilONE Enterprise CRM. Secure Client Portal.
        </div>
      </footer>
    </div>
  );
}

