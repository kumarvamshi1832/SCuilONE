import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";

import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import MFA from "../pages/auth/MFA";
import ForgotPassword from "../pages/auth/ForgotPassword";
import VerifyResetOTP from "../pages/auth/VerifyResetOTP";
import ResetPassword from "../pages/auth/ResetPassword";
import CompleteProfile from "../pages/auth/CompleteProfile";
import AcceptInvitation from "../pages/auth/AcceptInvitation";
import Workflows from "../pages/workflows/Workflows";
import ProtectedRoute from "../components/layout/ProtectedRoute";
import DashboardLayout from "../components/layout/DashboardLayout";
import MFASetup from "../pages/auth/MFASetup";
import RealEstateDashboard from "../pages/dashboard/RealEstateDashboard";
import EducationConsultingDashboard from "../pages/dashboard/EducationConsultingDashboard";
import SoftwareCompanyDashboard from "../pages/dashboard/SoftwareCompanyDashboard";
import TrainingInstituteDashboard from "../pages/dashboard/TrainingInstituteDashboard";
import DigitalMarketingAgencyDashboard from "../pages/dashboard/DigitalMarketingAgencyDashboard";
import InsuranceAgencyDashboard from "../pages/dashboard/InsuranceAgencyDashboard";
import IndustryDashboard from "../pages/dashboard/IndustryDashboard";
import { normalizeIndustry } from "../utils/industryUtils";
import ManagerDashboard from "../pages/dashboard/ManagerDashboard";
import SalesDashboard from "../pages/dashboard/SalesDashboard";
import OperationsDashboard from "../pages/dashboard/OperationsDashboard";
import SupportDashboard from "../pages/dashboard/SupportDashboard";
import AuditorDashboard from "../pages/dashboard/AuditorDashboard";

import Users from "../pages/users/Users";
import Leads from "../pages/leads/Leads";
import Contacts from "../pages/contacts/Contacts";
import Accounts from "../pages/accounts/Accounts";
import Deals from "../pages/deals/Deals";
import MyProfile from "../pages/profile/MyProfile";
import CompanyProfile from "../pages/company/CompanyProfile";
import FormBuilder from "../pages/form-builder/FormBuilder";
import Pipelines from "../pages/pipelines/Pipelines";

/* Dedicated Activities page */
import Activities from "../pages/activities/Activities";

/* Dedicated Tasks page */
import Tasks from "../pages/tasks/Tasks";

/* Keep these pages as placeholders */
import {
  Settings,
  Help,
} from "../pages/dashboard/Placeholders";
import Reports from "../pages/dashboard/Reports";
import Roles from "../pages/roles/Roles";
import Permissions from "../pages/permissions/Permissions";
import Projects from "../pages/projects/Projects";
import Buildings from "../pages/buildings/Buildings";
import Properties from "../pages/properties/Properties";
import BuyerRequirements from "../pages/buyer-requirements/BuyerRequirements";
import SiteVisits from "../pages/site-visits/SiteVisits";
import Bookings from "../pages/bookings/Bookings";
import Payments from "../pages/payments/Payments";
import AuditLogs from "../pages/audit-logs/AuditLogs";
import Documents from "../pages/documents/Documents";
import SoftwareRequirements from "../pages/software/SoftwareRequirements";
import SoftwareEstimates from "../pages/software/SoftwareEstimates";
import SoftwareContracts from "../pages/software/SoftwareContracts";
import SoftwareProjects from "../pages/software/SoftwareProjects";
import SoftwareSprints from "../pages/software/SoftwareSprints";
import SoftwareTimeTracking from "../pages/software/SoftwareTimeTracking";
import SoftwareDeliveryReports from "../pages/software/SoftwareDeliveryReports";
import SoftwareInvoices from "../pages/software/SoftwareInvoices";

/* Customer Support & Customer Portal Modules */
import SupportTickets from "../pages/support/SupportTickets";
import CustomerPortalUsers from "../pages/customer-portal/CustomerPortalUsers";
import CustomerPortalProtectedRoute from "../components/portal/CustomerPortalProtectedRoute";
import CustomerPortalLayout from "../components/portal/CustomerPortalLayout";
import CustomerPortalLogin from "../pages/portal/CustomerPortalLogin";
import CustomerPortalActivate from "../pages/portal/CustomerPortalActivate";
import CustomerPortalDashboard from "../pages/portal/CustomerPortalDashboard";
import CustomerPortalTickets from "../pages/portal/CustomerPortalTickets";
import CustomerPortalTicketDetails from "../pages/portal/CustomerPortalTicketDetails";
import CustomerPortalProfile from "../pages/portal/CustomerPortalProfile";

function DashboardResolver() {
  const { industry } = useParams();
  const normalized = normalizeIndustry(industry);

  switch (normalized) {
    case "software-company":
      return <SoftwareCompanyDashboard />;
    case "education-consulting":
      return <EducationConsultingDashboard />;
    case "training-institute":
      return <TrainingInstituteDashboard />;
    case "digital-marketing-agency":
      return <DigitalMarketingAgencyDashboard />;
    case "insurance-agency":
      return <InsuranceAgencyDashboard />;
    case "real-estate":
      return <RealEstateDashboard />;
    default:
      return <IndustryDashboard />;
  }
}

function ModuleRedirect({ target }: { target: string }) {
  const token = sessionStorage.getItem("access_token");
  if (!token) return <Navigate to="/login" replace />;

  const tenantStr = sessionStorage.getItem("tenant");
  let slug = "real-estate";
  if (tenantStr) {
    try {
      const tenant = JSON.parse(tenantStr);
      if (tenant?.industry) slug = normalizeIndustry(tenant.industry);
    } catch {}
  }

  let finalTarget = target;
  if (slug === "software-company") {
    if (target === "projects") finalTarget = "software-projects";
    if (target === "buyer-requirements" || target === "requirements") finalTarget = "software-requirements";
    if (target === "estimates") finalTarget = "software-estimates";
    if (target === "contracts") finalTarget = "software-contracts";
    if (target === "sprints") finalTarget = "software-sprints";
    if (target === "time-tracking") finalTarget = "software-time-tracking";
    if (target === "delivery-reports") finalTarget = "software-delivery-reports";
    if (target === "invoices") finalTarget = "software-invoices";
  } else if (slug === "real-estate") {
    if (target === "requirements" || target === "software-requirements") finalTarget = "buyer-requirements";
    if (target === "software-projects") finalTarget = "projects";
  }
  return <Navigate to={`/${slug}/${finalTarget}`} replace />;
}

function ProjectsResolver() {
  const { industry } = useParams();
  const normalized = normalizeIndustry(industry);
  if (normalized === "software-company") {
    return <Navigate to={`/software-company/software-projects`} replace />;
  }
  return (
    <DashboardLayout>
      <Projects />
    </DashboardLayout>
  );
}

function RequirementsResolver() {
  const { industry } = useParams();
  const normalized = normalizeIndustry(industry);
  if (normalized === "software-company") {
    return <Navigate to={`/software-company/software-requirements`} replace />;
  }
  return (
    <DashboardLayout>
      <BuyerRequirements />
    </DashboardLayout>
  );
}

function EstimatesResolver() {
  const { industry } = useParams();
  const normalized = normalizeIndustry(industry);
  if (normalized === "software-company") {
    return <Navigate to={`/${industry}/software-estimates`} replace />;
  }
  return (
    <DashboardLayout>
      <SoftwareEstimates />
    </DashboardLayout>
  );
}

function ContractsResolver() {
  const { industry } = useParams();
  const normalized = normalizeIndustry(industry);
  if (normalized === "software-company") {
    return <Navigate to={`/${industry}/software-contracts`} replace />;
  }
  return (
    <DashboardLayout>
      <SoftwareContracts />
    </DashboardLayout>
  );
}

function SprintsResolver() {
  const { industry } = useParams();
  const normalized = normalizeIndustry(industry);
  if (normalized === "software-company") {
    return <Navigate to={`/${industry}/software-sprints`} replace />;
  }
  return (
    <DashboardLayout>
      <SoftwareSprints />
    </DashboardLayout>
  );
}

function RootRedirect() {
  const token = sessionStorage.getItem("access_token");
  const tenantStr = sessionStorage.getItem("tenant");
  const userStr = sessionStorage.getItem("user");

  if (token && tenantStr) {
    try {
      const user = userStr ? JSON.parse(userStr) : null;
      const rawRole =
        typeof user?.role === "string"
          ? user.role
          : user?.role?.name || user?.role_name || "";
      const role = String(rawRole).trim().toUpperCase();

      if (role === "MANAGER" || role.includes("MANAGER")) {
        return <Navigate to="/manager/dashboard" replace />;
      }
      if (
        role === "SALES_USER" ||
        role === "SALES USER" ||
        role.includes("SALES")
      ) {
        return <Navigate to="/sales/dashboard" replace />;
      }
      if (
        role === "OPERATIONS_USER" ||
        role === "OPERATIONS USER" ||
        role.includes("OPERATIONS")
      ) {
        return <Navigate to="/operations/dashboard" replace />;
      }
      if (
        role === "SUPPORT_USER" ||
        role === "SUPPORT USER" ||
        role.includes("SUPPORT")
      ) {
        return <Navigate to="/support/dashboard" replace />;
      }
      if (
        role === "READ_ONLY" ||
        role === "AUDITOR" ||
        role === "READ ONLY" ||
        role === "READ-ONLY" ||
        role === "READ-ONLY / AUDITOR" ||
        role === "READ ONLY / AUDITOR" ||
        role === "READ_ONLY / AUDITOR" ||
        role.includes("AUDITOR")
      ) {
        return <Navigate to="/auditor/dashboard" replace />;
      }

      const tenant = JSON.parse(tenantStr);
      const slug = tenant?.industry ? normalizeIndustry(tenant.industry) : "real-estate";
      return <Navigate to={`/${slug}/dashboard`} replace />;
    } catch (error) {
      console.error("Failed to redirect authenticated user:", error);
    }
  }

  return <Navigate to="/login" replace />;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Authentication Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/mfa" element={<MFA />} />
        <Route path="/mfa-setup" element={<MFASetup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/verify-reset-otp" element={<VerifyResetOTP />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="/set-password" element={<AcceptInvitation />} />
        <Route path="/complete-profile" element={<CompleteProfile />} />

        {/* Customer Portal Public Auth Routes */}
        <Route path="/portal/login" element={<CustomerPortalLogin />} />
        <Route path="/portal/activate" element={<CustomerPortalActivate />} />

        {/* Customer Portal Authenticated Routes (Isolated from internal CRM) */}
        <Route path="/portal" element={<CustomerPortalProtectedRoute />}>
          <Route element={<CustomerPortalLayout />}>
            <Route index element={<Navigate to="/portal/dashboard" replace />} />
            <Route path="dashboard" element={<CustomerPortalDashboard />} />
            <Route path="tickets" element={<CustomerPortalTickets />} />
            <Route path="tickets/:ticketId" element={<CustomerPortalTicketDetails />} />
            <Route path="profile" element={<CustomerPortalProfile />} />
          </Route>
        </Route>

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route
            path="/manager/dashboard"
            element={
              <DashboardLayout>
                <ManagerDashboard />
              </DashboardLayout>
            }
          />
          <Route
            path="/sales/dashboard"
            element={
              <DashboardLayout>
                <SalesDashboard />
              </DashboardLayout>
            }
          />
          <Route
            path="/operations/dashboard"
            element={
              <DashboardLayout>
                <OperationsDashboard />
              </DashboardLayout>
            }
          />
          <Route
            path="/support/dashboard"
            element={
              <DashboardLayout>
                <SupportDashboard />
              </DashboardLayout>
            }
          />
          <Route
            path="/auditor/dashboard"
            element={
              <DashboardLayout>
                <AuditorDashboard />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/dashboard"
            element={
              <DashboardLayout>
                <DashboardResolver />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/users"
            element={
              <DashboardLayout>
                <Users />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/leads"
            element={
              <DashboardLayout>
                <Leads />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/contacts"
            element={
              <DashboardLayout>
                <Contacts />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/accounts"
            element={
              <DashboardLayout>
                <Accounts />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/deals"
            element={
              <DashboardLayout>
                <Deals />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/tasks"
            element={
              <DashboardLayout>
                <Tasks />
              </DashboardLayout>
            }
          />

          {/* Dedicated Activities Page */}
          <Route
            path="/:industry/activities"
            element={
              <DashboardLayout>
                <Activities />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/reports"
            element={
              <DashboardLayout>
                <Reports />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/roles"
            element={
              <DashboardLayout>
                <Roles />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/permissions"
            element={
              <DashboardLayout>
                <Permissions />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/settings"
            element={
              <DashboardLayout>
                <Settings />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/profile"
            element={
              <DashboardLayout>
                <MyProfile />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/pipelines"
            element={
              <DashboardLayout>
                <Pipelines />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/workflows"
            element={
              <DashboardLayout>
                <Workflows />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/form-builder"
            element={
              <DashboardLayout>
                <FormBuilder />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/projects"
            element={<ProjectsResolver />}
          />

          <Route
            path="/:industry/buildings"
            element={
              <DashboardLayout>
                <Buildings />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/properties"
            element={
              <DashboardLayout>
                <Properties />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/buyer-requirements"
            element={<RequirementsResolver />}
          />

          <Route
            path="/:industry/requirements"
            element={<RequirementsResolver />}
          />

          <Route
            path="/:industry/estimates"
            element={<EstimatesResolver />}
          />

          <Route
            path="/:industry/contracts"
            element={<ContractsResolver />}
          />

          <Route
            path="/:industry/sprints"
            element={<SprintsResolver />}
          />

          <Route
            path="/:industry/site-visits"
            element={
              <DashboardLayout>
                <SiteVisits />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/bookings"
            element={
              <DashboardLayout>
                <Bookings />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/payments"
            element={
              <DashboardLayout>
                <Payments />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/audit-logs"
            element={
              <DashboardLayout>
                <AuditLogs />
              </DashboardLayout>
            }
          />

          <Route
            path="/documents"
            element={
              <DashboardLayout>
                <Documents />
              </DashboardLayout>
            }
          />

          {/* Software Company Industry Routes */}
          <Route
            path="/:industry/software-requirements"
            element={
              <DashboardLayout>
                <SoftwareRequirements />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/software-estimates"
            element={
              <DashboardLayout>
                <SoftwareEstimates />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/software-contracts"
            element={
              <DashboardLayout>
                <SoftwareContracts />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/software-projects"
            element={
              <DashboardLayout>
                <SoftwareProjects />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/software-sprints"
            element={
              <DashboardLayout>
                <SoftwareSprints />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/software-time-tracking"
            element={
              <DashboardLayout>
                <SoftwareTimeTracking />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/software-delivery-reports"
            element={
              <DashboardLayout>
                <SoftwareDeliveryReports />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/software-invoices"
            element={
              <DashboardLayout>
                <SoftwareInvoices />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/documents"
            element={
              <DashboardLayout>
                <Documents />
              </DashboardLayout>
            }
          />

          {/* Customer Support & Customer Portal CRM Admin Routes */}
          <Route
            path="/:industry/support-tickets"
            element={
              <DashboardLayout>
                <SupportTickets />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/customer-portal/users"
            element={
              <DashboardLayout>
                <CustomerPortalUsers />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/customer-portal-users"
            element={
              <DashboardLayout>
                <CustomerPortalUsers />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/company"
            element={
              <DashboardLayout>
                <CompanyProfile />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/mystore"
            element={
              <DashboardLayout>
                <CompanyProfile />
              </DashboardLayout>
            }
          />

          <Route
            path="/help"
            element={
              <DashboardLayout>
                <Help />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/help"
            element={
              <DashboardLayout>
                <Help />
              </DashboardLayout>
            }
          />

          {/* Naked Module Routes (auto-redirect to active industry slug) */}
          <Route path="/leads" element={<ModuleRedirect target="leads" />} />
          <Route path="/contacts" element={<ModuleRedirect target="contacts" />} />
          <Route path="/accounts" element={<ModuleRedirect target="accounts" />} />
          <Route path="/deals" element={<ModuleRedirect target="deals" />} />
          <Route path="/projects" element={<ModuleRedirect target="projects" />} />
          <Route path="/buildings" element={<ModuleRedirect target="buildings" />} />
          <Route path="/properties" element={<ModuleRedirect target="properties" />} />
          <Route path="/buyer-requirements" element={<ModuleRedirect target="buyer-requirements" />} />
          <Route path="/requirements" element={<ModuleRedirect target="requirements" />} />
          <Route path="/estimates" element={<ModuleRedirect target="estimates" />} />
          <Route path="/contracts" element={<ModuleRedirect target="contracts" />} />
          <Route path="/sprints" element={<ModuleRedirect target="sprints" />} />
          <Route path="/software-requirements" element={<ModuleRedirect target="software-requirements" />} />
          <Route path="/software-estimates" element={<ModuleRedirect target="software-estimates" />} />
          <Route path="/software-contracts" element={<ModuleRedirect target="software-contracts" />} />
          <Route path="/software-projects" element={<ModuleRedirect target="software-projects" />} />
          <Route path="/software-sprints" element={<ModuleRedirect target="software-sprints" />} />
          <Route path="/software-time-tracking" element={<ModuleRedirect target="software-time-tracking" />} />
          <Route path="/software-delivery-reports" element={<ModuleRedirect target="software-delivery-reports" />} />
          <Route path="/software-invoices" element={<ModuleRedirect target="software-invoices" />} />
          <Route path="/support-tickets" element={<ModuleRedirect target="support-tickets" />} />
          <Route path="/customer-portal/users" element={<ModuleRedirect target="customer-portal/users" />} />
          <Route path="/customer-portal-users" element={<ModuleRedirect target="customer-portal-users" />} />
          <Route path="/time-tracking" element={<ModuleRedirect target="time-tracking" />} />
          <Route path="/delivery-reports" element={<ModuleRedirect target="delivery-reports" />} />
          <Route path="/invoices" element={<ModuleRedirect target="invoices" />} />
          <Route path="/site-visits" element={<ModuleRedirect target="site-visits" />} />
          <Route path="/bookings" element={<ModuleRedirect target="bookings" />} />
          <Route path="/payments" element={<ModuleRedirect target="payments" />} />
          <Route path="/activities" element={<ModuleRedirect target="activities" />} />
          <Route path="/tasks" element={<ModuleRedirect target="tasks" />} />
          <Route path="/reports" element={<ModuleRedirect target="reports" />} />
          <Route path="/pipelines" element={<ModuleRedirect target="pipelines" />} />
          <Route path="/workflows" element={<ModuleRedirect target="workflows" />} />
          <Route path="/form-builder" element={<ModuleRedirect target="form-builder" />} />
          <Route path="/users" element={<ModuleRedirect target="users" />} />
          <Route path="/roles" element={<ModuleRedirect target="roles" />} />
          <Route path="/permissions" element={<ModuleRedirect target="permissions" />} />
          <Route path="/settings" element={<ModuleRedirect target="settings" />} />
          <Route path="/audit-logs" element={<ModuleRedirect target="audit-logs" />} />
          <Route path="/profile" element={<ModuleRedirect target="profile" />} />
          <Route path="/company" element={<ModuleRedirect target="company" />} />
          <Route path="/mystore" element={<ModuleRedirect target="mystore" />} />
        </Route>

        {/* Empty Route */}
        <Route path="/empty" element={<div />} />

        {/* Default Route */}
        <Route path="/" element={<RootRedirect />} />

        {/* Unknown Routes */}
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
