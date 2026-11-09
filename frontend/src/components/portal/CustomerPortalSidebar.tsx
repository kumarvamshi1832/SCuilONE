import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboardIcon,
  CalculatorIcon,
  FileSignatureIcon,
  FolderKanbanIcon,
  ReceiptIcon,
  FileTextIcon,
  TicketIcon,
  UserIcon,
  BuildingIcon,
  ClockIcon,
  ChevronLeftIcon,
  XIcon,
} from "../common/SupportPortalIcons";

export interface NavItemConfig {
  name: string;
  path: string;
  icon: React.ReactNode;
}

interface CustomerPortalSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  isRealEstate?: boolean;
}

export const CustomerPortalSidebar: React.FC<CustomerPortalSidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  isRealEstate = false,
}) => {
  const location = useLocation();

  // Navigation items strictly according to authorized workspace industry
  const navItems: NavItemConfig[] = isRealEstate
    ? [
        {
          name: "Dashboard",
          path: "/portal/dashboard",
          icon: <LayoutDashboardIcon size={19} />,
        },
        {
          name: "Properties",
          path: "/portal/properties",
          icon: <BuildingIcon size={19} />,
        },
        {
          name: "Bookings",
          path: "/portal/bookings",
          icon: <ReceiptIcon size={19} />,
        },
        {
          name: "Site Visits",
          path: "/portal/site-visits",
          icon: <ClockIcon size={19} />,
        },
        {
          name: "Documents",
          path: "/portal/documents",
          icon: <FileTextIcon size={19} />,
        },
        {
          name: "Tickets",
          path: "/portal/tickets",
          icon: <TicketIcon size={19} />,
        },
        {
          name: "Profile",
          path: "/portal/profile",
          icon: <UserIcon size={19} />,
        },
      ]
    : [
        {
          name: "Dashboard",
          path: "/portal/dashboard",
          icon: <LayoutDashboardIcon size={19} />,
        },
        {
          name: "Estimates",
          path: "/portal/estimates",
          icon: <CalculatorIcon size={19} />,
        },
        {
          name: "Contracts",
          path: "/portal/contracts",
          icon: <FileSignatureIcon size={19} />,
        },
        {
          name: "Projects",
          path: "/portal/projects",
          icon: <FolderKanbanIcon size={19} />,
        },
        {
          name: "Invoices",
          path: "/portal/invoices",
          icon: <ReceiptIcon size={19} />,
        },
        {
          name: "Documents",
          path: "/portal/documents",
          icon: <FileTextIcon size={19} />,
        },
        {
          name: "Tickets",
          path: "/portal/tickets",
          icon: <TicketIcon size={19} />,
        },
        {
          name: "Profile",
          path: "/portal/profile",
          icon: <UserIcon size={19} />,
        },
      ];

  // Helper to determine active state accurately including aliases & subpaths
  const isItemActive = (path: string): boolean => {
    const currentPath = location.pathname;
    if (path === "/portal/dashboard") {
      return (
        currentPath === "/portal" ||
        currentPath === "/portal/" ||
        currentPath === "/portal/dashboard" ||
        currentPath === "/customer-portal" ||
        currentPath === "/customer-portal/dashboard" ||
        currentPath === "/customer_portal" ||
        currentPath === "/customer_portal/dashboard"
      );
    }
    if (path === "/portal/properties") {
      return (
        currentPath.includes("/properties") ||
        (currentPath.includes("/real-estate") && location.search.includes("tab=properties"))
      );
    }
    if (path === "/portal/bookings") {
      return (
        currentPath.includes("/bookings") ||
        (currentPath.includes("/real-estate") && (location.search.includes("tab=bookings") || !location.search.includes("tab=")))
      );
    }
    if (path === "/portal/site-visits") {
      return (
        currentPath.includes("/site-visits") ||
        (currentPath.includes("/real-estate") && location.search.includes("tab=visits"))
      );
    }
    return (
      currentPath === path ||
      currentPath.startsWith(`${path}/`) ||
      currentPath.replace(/^\/(customer-portal|customer_portal)/, "/portal").startsWith(path)
    );
  };

  const handleLinkClick = () => {
    if (isMobileOpen) {
      onCloseMobile();
    }
  };

  return (
    <aside
      className={`cp-sidebar ${isCollapsed ? "collapsed" : "expanded"} ${
        isMobileOpen ? "mobile-open" : ""
      }`}
      aria-label="Customer Portal Navigation"
    >
      {/* Mobile Drawer Header */}
      <div className="cp-sidebar-mobile-header">
        <span className="cp-sidebar-mobile-title">Menu</span>
        <button
          type="button"
          className="cp-sidebar-close-btn"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          title="Close navigation"
        >
          <XIcon size={18} />
        </button>
      </div>

      {/* Desktop Toggle Control */}
      <div className="cp-sidebar-header">
        {!isCollapsed && <span className="cp-sidebar-heading">Navigation</span>}
        <button
          type="button"
          className="cp-sidebar-toggle-btn"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeftIcon
            size={16}
            className={`cp-sidebar-toggle-arrow ${isCollapsed ? "rotated" : ""}`}
          />
        </button>
      </div>

      {/* Navigation List */}
      <nav className="cp-sidebar-nav" aria-label="Portal main navigation">
        <ul className="cp-sidebar-list">
          {navItems.map((item) => {
            const active = isItemActive(item.path);
            return (
              <li key={item.path} className="cp-sidebar-item-wrapper">
                <NavLink
                  to={item.path}
                  onClick={handleLinkClick}
                  className={`cp-sidebar-item ${active ? "active" : ""}`}
                  title={isCollapsed ? item.name : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="cp-sidebar-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="cp-sidebar-label">{item.name}</span>
                  {/* Floating tooltip displayed only in collapsed mode on desktop hover */}
                  {isCollapsed && (
                    <span className="cp-sidebar-tooltip" role="tooltip">
                      {item.name}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
};

export default CustomerPortalSidebar;

