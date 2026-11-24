import { useEffect, useState, type ReactNode } from "react";
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
import ProtectedRoute, { useVerifiedAuth } from "../components/layout/ProtectedRoute";
import DashboardLayout from "../components/layout/DashboardLayout";
import MFASetup from "../pages/auth/MFASetup";
import RealEstateDashboard from "../pages/dashboard/RealEstateDashboard";
import EducationConsultingDashboard from "../pages/dashboard/EducationConsultingDashboard";
import SoftwareCompanyDashboard from "../pages/dashboard/SoftwareCompanyDashboard";
import TrainingInstituteDashboard from "../pages/dashboard/TrainingInstituteDashboard";
import DigitalMarketingAgencyDashboard from "../pages/dashboard/DigitalMarketingAgencyDashboard";
import InsuranceAgencyDashboard from "../pages/dashboard/InsuranceAgencyDashboard";
import IndustryDashboard from "../pages/dashboard/IndustryDashboard";
import { tryNormalizeIndustry } from "../utils/industryUtils";
import {
  getSynchronouslyValidCachedSession,
  verifyExistingSession,
} from "../services/authSession";
import { getPlatformAccessToken } from "../services/platformApiClient";
import AuthErrorState from "../components/common/AuthErrorState";
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
  Help,
} from "../pages/dashboard/Placeholders";
import IndustrySettings from "../pages/settings/IndustrySettings";
import Reports from "../pages/dashboard/Reports";
import Trash from "../pages/trash/Trash";
import CustomerBookingRequests from "../pages/booking-workflow/CustomerBookingRequests";
import Rentals from "../pages/rentals/Rentals";
import RentalAgreementDetail from "../pages/rentals/RentalAgreementDetail";
import CustomerPortalRentals from "../pages/portal/CustomerPortalRentals";
import CustomerPortalRentalDetail from "../pages/portal/CustomerPortalRentalDetail";
import CustomerBookingRequestDetail from "../pages/booking-workflow/CustomerBookingRequestDetail";
import InsightShortcuts from "../components/dashboard/InsightShortcuts";
import SalesForecast from "../pages/forecast/SalesForecast";
import LeadScoring from "../pages/lead-scoring/LeadScoring";
import CustomerChat from "../pages/customer-chat/CustomerChat";
import EmailLogs from "../pages/emails/EmailLogs";
import CustomFields from "../pages/custom-fields/CustomFields";
import { getIndustryConfig } from "../config/industryConfig";
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
import CustomerPortalForgotPassword from "../pages/portal/CustomerPortalForgotPassword";
import CustomerPortalResetPassword from "../pages/portal/CustomerPortalResetPassword";
import CustomerPortalActivate from "../pages/portal/CustomerPortalActivate";
import CustomerPortalDashboard from "../pages/portal/CustomerPortalDashboard";
import CustomerPortalEstimates from "../pages/portal/CustomerPortalEstimates";
import CustomerPortalContracts from "../pages/portal/CustomerPortalContracts";
import CustomerPortalProjects from "../pages/portal/CustomerPortalProjects";
import CustomerPortalInvoices from "../pages/portal/CustomerPortalInvoices";
import CustomerPortalDocuments from "../pages/portal/CustomerPortalDocuments";
import CustomerPortalTickets from "../pages/portal/CustomerPortalTickets";
import CustomerPortalTicketDetails from "../pages/portal/CustomerPortalTicketDetails";
import CustomerPortalRealEstate from "../pages/portal/CustomerPortalRealEstate";
import CustomerPortalProfile from "../pages/portal/CustomerPortalProfile";
import CustomerPortalNotificationsPage from "../pages/portal/CustomerPortalNotificationsPage";
import CustomerPortalBuyerRequirements from "../pages/portal/CustomerPortalBuyerRequirements";
import CustomerPortalBuyerRequirementDetail from "../pages/portal/CustomerPortalBuyerRequirementDetail";
import CustomerPortalShortlist from "../pages/portal/CustomerPortalShortlist";
import CustomerPortalBookingJourney from "../pages/portal/CustomerPortalBookingJourney";
import CustomerPortalBookingRequests from "../pages/portal/CustomerPortalBookingRequests";
import CustomerPortalBookingRequestDetail from "../pages/portal/CustomerPortalBookingRequestDetail";
import CustomerPortalChat from "../pages/portal/CustomerPortalChat";
import SubscriptionBilling from "../pages/billing/SubscriptionBilling";
import UnsubscribeReminder from "../pages/billing/UnsubscribeReminder";
import PlatformProtectedRoute from "../components/platform/PlatformProtectedRoute";
import PlatformLayout from "../components/platform/PlatformLayout";
import PlatformLogin from "../pages/platform/PlatformLogin";
import PlatformDashboardPage from "../pages/platform/PlatformDashboardPage";
import PlatformDashboardRoute from "../pages/platform/PlatformDashboardRoute";
import PlatformTenantsPage from "../pages/platform/PlatformTenantsPage";
import PlatformEmployeesTeamsPage from "../pages/platform/PlatformEmployeesTeamsPage";
import PlatformRolesPermissionsPage from "../pages/platform/PlatformRolesPermissionsPage";
import PlatformSupportKbPage from "../pages/platform/PlatformSupportKbPage";
import PlatformBillingSubsPage from "../pages/platform/PlatformBillingSubsPage";
import PlatformSalesFinancePage from "../pages/platform/PlatformSalesFinancePage";
import PlatformTechSecurityAuditPage from "../pages/platform/PlatformTechSecurityAuditPage";
import PlatformAnalyticsSettingsPage from "../pages/platform/PlatformAnalyticsSettingsPage";
import PlatformProfilePage from "../pages/platform/PlatformProfilePage";

function DashboardResolver() {
  const { industry } = useParams();
  const normalized = tryNormalizeIndustry(industry);

  if (!normalized) {
    return (
      <AuthErrorState
        title="Unsupported Industry"
        message={`The workspace industry "${industry || ""}" is not recognized. Please sign in again or contact support.`}
      />
    );
  }

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

/**
 * Opens a module page only for industries whose configuration (config/industryConfig.ts) enables it;
 * otherwise the user is sent back to their dashboard. Authorization itself stays with the backend.
 */
function IndustryModuleGate({ module, children }: { module: string; children: ReactNode }) {
  const { industry } = useParams();
  const normalized = tryNormalizeIndustry(industry);
  if (!normalized) {
    return <Navigate to="/empty" replace />;
  }
  if (!getIndustryConfig(normalized).modules.includes(module)) {
    return <Navigate to={`/${normalized}/dashboard`} replace />;
  }
  return <>{children}</>;
}

function ModuleRedirect({ target }: { target: string }) {
  const verifiedAuth = useVerifiedAuth();
  if (!verifiedAuth) {
    return <Navigate to="/login" replace />;
  }
  if (verifiedAuth.kind === "platform") {
    return <Navigate to={verifiedAuth.destination} replace />;
  }

  const slug = verifiedAuth.industrySlug;
  if (!slug) {
    return <Navigate to={verifiedAuth.destination} replace />;
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
  const normalized = tryNormalizeIndustry(industry);
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
  const normalized = tryNormalizeIndustry(industry);
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
  const normalized = tryNormalizeIndustry(industry);
  if (normalized === "software-company") {
    return <Navigate to={`/software-company/software-estimates`} replace />;
  }
  return (
    <DashboardLayout>
      <SoftwareEstimates />
    </DashboardLayout>
  );
}

function ContractsResolver() {
  const { industry } = useParams();
  const normalized = tryNormalizeIndustry(industry);
  if (normalized === "software-company") {
    return <Navigate to={`/software-company/software-contracts`} replace />;
  }
  return (
    <DashboardLayout>
      <SoftwareContracts />
    </DashboardLayout>
  );
}

function SprintsResolver() {
  const { industry } = useParams();
  const normalized = tryNormalizeIndustry(industry);
  if (normalized === "software-company") {
    return <Navigate to={`/software-company/software-sprints`} replace />;
  }
  return (
    <DashboardLayout>
      <SoftwareSprints />
    </DashboardLayout>
  );
}

function RootRedirect() {
  const hasToken = Boolean(
    sessionStorage.getItem("access_token") ||
      localStorage.getItem("access_token") ||
      getPlatformAccessToken()
  );

  const initialCached = hasToken ? getSynchronouslyValidCachedSession() : null;
  const [status, setStatus] = useState<
    "loading" | "redirect" | "unauthenticated" | "error"
  >(() => {
    if (!hasToken) return "unauthenticated";
    if (initialCached) return "redirect";
    return "loading";
  });
  const [destination, setDestination] = useState<string>(
    initialCached?.destination ?? "/login"
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!hasToken) {
      setStatus("unauthenticated");
      return;
    }

    let active = true;
    const resolve = async () => {
      const result = await verifyExistingSession();
      if (!active) return;

      if (result.status === "authenticated") {
        setDestination(result.session.destination);
        setStatus("redirect");
      } else if (result.status === "unauthenticated") {
        setStatus("unauthenticated");
      } else {
        setErrorMessage(result.message);
        setStatus("error");
      }
    };

    void resolve();
    return () => {
      active = false;
    };
  }, [hasToken]);

  if (status === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1120",
          color: "#f8fafc",
          fontSize: "14px",
        }}
      >
        Redirecting to your workspace...
      </div>
    );
  }

  if (status === "error") {
    return (
      <AuthErrorState
        title="Access Denied"
        message={errorMessage}
        loginPath="/login"
      />
    );
  }

  if (status === "redirect") {
    return <Navigate to={destination} replace />;
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
        <Route path="/unsubscribe" element={<UnsubscribeReminder />} />

        {/* Customer Portal Public Auth Routes */}
        <Route path="/portal/login" element={<CustomerPortalLogin />} />
        <Route path="/customer_portal/login" element={<CustomerPortalLogin />} />
        <Route path="/customer-portal/login" element={<CustomerPortalLogin />} />

        <Route path="/portal/forgot-password" element={<CustomerPortalForgotPassword />} />
        <Route path="/customer_portal/forgot-password" element={<CustomerPortalForgotPassword />} />
        <Route path="/customer-portal/forgot-password" element={<CustomerPortalForgotPassword />} />

        <Route path="/portal/reset-password" element={<CustomerPortalResetPassword />} />
        <Route path="/customer_portal/reset-password" element={<CustomerPortalResetPassword />} />
        <Route path="/customer-portal/reset-password" element={<CustomerPortalResetPassword />} />

        <Route path="/portal/activate" element={<CustomerPortalActivate />} />
        <Route path="/customer_portal/activate" element={<CustomerPortalActivate />} />
        <Route path="/customer-portal/activate" element={<CustomerPortalActivate />} />

        {/* Customer Portal Authenticated Routes (Isolated from internal CRM) */}
        <Route path="/portal" element={<CustomerPortalProtectedRoute />}>
          <Route element={<CustomerPortalLayout />}>
            <Route index element={<Navigate to="/portal/dashboard" replace />} />
            <Route path="dashboard" element={<CustomerPortalDashboard />} />
            <Route path="estimates" element={<CustomerPortalEstimates />} />
            <Route path="contracts" element={<CustomerPortalContracts />} />
            <Route path="projects" element={<CustomerPortalProjects />} />
            <Route path="invoices" element={<CustomerPortalInvoices />} />
            <Route path="documents" element={<CustomerPortalDocuments />} />
            <Route path="tickets" element={<CustomerPortalTickets />} />
            <Route path="tickets/:ticketId" element={<CustomerPortalTicketDetails />} />
            <Route path="properties" element={<CustomerPortalRealEstate initialTab="properties" />} />
            <Route path="bookings" element={<CustomerPortalRealEstate initialTab="bookings" />} />
            <Route path="site-visits" element={<CustomerPortalRealEstate initialTab="visits" />} />
            <Route path="real-estate" element={<CustomerPortalRealEstate />} />
            <Route path="rentals" element={<CustomerPortalRentals />} />
            <Route path="rentals/:agreementId" element={<CustomerPortalRentalDetail />} />
            <Route path="profile" element={<CustomerPortalProfile />} />
            <Route path="notifications" element={<CustomerPortalNotificationsPage />} />
            <Route path="buyer-requirements" element={<CustomerPortalBuyerRequirements />} />
            <Route path="buyer-requirements/:requirementId" element={<CustomerPortalBuyerRequirementDetail />} />
            <Route path="shortlist" element={<CustomerPortalShortlist />} />
            <Route path="booking-journey" element={<CustomerPortalBookingJourney />} />
            <Route path="booking-requests" element={<CustomerPortalBookingRequests />} />
            <Route path="booking-requests/:requestId" element={<CustomerPortalBookingRequestDetail />} />
            <Route path="chat" element={<CustomerPortalChat />} />
          </Route>
        </Route>

        {/* Customer Portal Route Aliases */}
        <Route path="/customer-portal" element={<CustomerPortalProtectedRoute />}>
          <Route element={<CustomerPortalLayout />}>
            <Route index element={<Navigate to="/portal/dashboard" replace />} />
            <Route path="dashboard" element={<CustomerPortalDashboard />} />
            <Route path="estimates" element={<CustomerPortalEstimates />} />
            <Route path="contracts" element={<CustomerPortalContracts />} />
            <Route path="projects" element={<CustomerPortalProjects />} />
            <Route path="invoices" element={<CustomerPortalInvoices />} />
            <Route path="documents" element={<CustomerPortalDocuments />} />
            <Route path="tickets" element={<CustomerPortalTickets />} />
            <Route path="tickets/:ticketId" element={<CustomerPortalTicketDetails />} />
            <Route path="properties" element={<CustomerPortalRealEstate initialTab="properties" />} />
            <Route path="bookings" element={<CustomerPortalRealEstate initialTab="bookings" />} />
            <Route path="site-visits" element={<CustomerPortalRealEstate initialTab="visits" />} />
            <Route path="real-estate" element={<CustomerPortalRealEstate />} />
            <Route path="rentals" element={<CustomerPortalRentals />} />
            <Route path="rentals/:agreementId" element={<CustomerPortalRentalDetail />} />
            <Route path="profile" element={<CustomerPortalProfile />} />
            <Route path="notifications" element={<CustomerPortalNotificationsPage />} />
            <Route path="buyer-requirements" element={<CustomerPortalBuyerRequirements />} />
            <Route path="buyer-requirements/:requirementId" element={<CustomerPortalBuyerRequirementDetail />} />
            <Route path="shortlist" element={<CustomerPortalShortlist />} />
            <Route path="booking-journey" element={<CustomerPortalBookingJourney />} />
            <Route path="booking-requests" element={<CustomerPortalBookingRequests />} />
            <Route path="booking-requests/:requestId" element={<CustomerPortalBookingRequestDetail />} />
            <Route path="chat" element={<CustomerPortalChat />} />
          </Route>
        </Route>
        <Route path="/customer_portal" element={<CustomerPortalProtectedRoute />}>
          <Route element={<CustomerPortalLayout />}>
            <Route index element={<Navigate to="/portal/dashboard" replace />} />
            <Route path="dashboard" element={<CustomerPortalDashboard />} />
            <Route path="estimates" element={<CustomerPortalEstimates />} />
            <Route path="contracts" element={<CustomerPortalContracts />} />
            <Route path="projects" element={<CustomerPortalProjects />} />
            <Route path="invoices" element={<CustomerPortalInvoices />} />
            <Route path="documents" element={<CustomerPortalDocuments />} />
            <Route path="tickets" element={<CustomerPortalTickets />} />
            <Route path="tickets/:ticketId" element={<CustomerPortalTicketDetails />} />
            <Route path="properties" element={<CustomerPortalRealEstate initialTab="properties" />} />
            <Route path="bookings" element={<CustomerPortalRealEstate initialTab="bookings" />} />
            <Route path="site-visits" element={<CustomerPortalRealEstate initialTab="visits" />} />
            <Route path="real-estate" element={<CustomerPortalRealEstate />} />
            <Route path="rentals" element={<CustomerPortalRentals />} />
            <Route path="rentals/:agreementId" element={<CustomerPortalRentalDetail />} />
            <Route path="profile" element={<CustomerPortalProfile />} />
            <Route path="notifications" element={<CustomerPortalNotificationsPage />} />
            <Route path="buyer-requirements" element={<CustomerPortalBuyerRequirements />} />
            <Route path="buyer-requirements/:requirementId" element={<CustomerPortalBuyerRequirementDetail />} />
            <Route path="shortlist" element={<CustomerPortalShortlist />} />
            <Route path="booking-journey" element={<CustomerPortalBookingJourney />} />
            <Route path="booking-requests" element={<CustomerPortalBookingRequests />} />
            <Route path="booking-requests/:requestId" element={<CustomerPortalBookingRequestDetail />} />
            <Route path="chat" element={<CustomerPortalChat />} />
          </Route>
        </Route>

        {/* Platform Staff Public & Protected Portal (Isolated from Tenant CRM) */}
        <Route path="/platform/login" element={<PlatformLogin />} />
        <Route element={<PlatformProtectedRoute />}>
          <Route
            path="/platform/change-password"
            element={<PlatformLogin initialStep="change_password" />}
          />
        </Route>
        <Route path="/platform" element={<PlatformProtectedRoute />}>
          <Route element={<PlatformLayout />}>
            <Route index element={<Navigate to="/platform/dashboard" replace />} />
            <Route path="dashboard" element={<PlatformDashboardRoute />} />
            <Route
              path="dashboards/:scope/:roleKey/:industryKey?"
              element={<PlatformDashboardPage />}
            />
            <Route path="tenants" element={<PlatformTenantsPage />} />
            <Route path="employees" element={<PlatformEmployeesTeamsPage />} />
            <Route path="roles" element={<PlatformRolesPermissionsPage />} />
            <Route path="support" element={<PlatformSupportKbPage />} />
            <Route path="billing" element={<PlatformBillingSubsPage />} />
            <Route path="finance" element={<PlatformSalesFinancePage />} />
            <Route path="operations" element={<PlatformTechSecurityAuditPage />} />
            <Route path="audit" element={<Navigate to="/platform/operations?tab=audit" replace />} />
            <Route path="audit-trail" element={<Navigate to="/platform/operations?tab=audit" replace />} />
            <Route path="audit-logs" element={<Navigate to="/platform/operations?tab=audit" replace />} />
            <Route path="analytics" element={<PlatformAnalyticsSettingsPage />} />
            <Route path="profile" element={<PlatformProfilePage />} />
          </Route>
        </Route>

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route
            path="/manager/dashboard"
            element={
              <DashboardLayout>
                <ManagerDashboard />
                <InsightShortcuts />
              </DashboardLayout>
            }
          />
          <Route
            path="/sales/dashboard"
            element={
              <DashboardLayout>
                <SalesDashboard />
                <InsightShortcuts />
              </DashboardLayout>
            }
          />
          <Route
            path="/operations/dashboard"
            element={
              <DashboardLayout>
                <OperationsDashboard />
                <InsightShortcuts />
              </DashboardLayout>
            }
          />
          <Route
            path="/support/dashboard"
            element={
              <DashboardLayout>
                <SupportDashboard />
                <InsightShortcuts />
              </DashboardLayout>
            }
          />
          <Route
            path="/auditor/dashboard"
            element={
              <DashboardLayout>
                <AuditorDashboard />
                <InsightShortcuts />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/dashboard"
            element={
              <DashboardLayout>
                <DashboardResolver />
                <InsightShortcuts />
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
            path="/:industry/forecast"
            element={
              <IndustryModuleGate module="forecast">
                <DashboardLayout>
                  <SalesForecast />
                </DashboardLayout>
              </IndustryModuleGate>
            }
          />

          <Route
            path="/:industry/lead-scoring"
            element={
              <IndustryModuleGate module="lead-scoring">
                <DashboardLayout>
                  <LeadScoring />
                </DashboardLayout>
              </IndustryModuleGate>
            }
          />

          <Route
            path="/:industry/rentals"
            element={
              <IndustryModuleGate module="rentals">
                <DashboardLayout>
                  <Rentals />
                </DashboardLayout>
              </IndustryModuleGate>
            }
          />

          <Route
            path="/:industry/rentals/:agreementId"
            element={
              <IndustryModuleGate module="rentals">
                <DashboardLayout>
                  <RentalAgreementDetail />
                </DashboardLayout>
              </IndustryModuleGate>
            }
          />

          <Route
            path="/:industry/customer-booking-requests"
            element={
              <IndustryModuleGate module="customer-booking-requests">
                <DashboardLayout>
                  <CustomerBookingRequests />
                </DashboardLayout>
              </IndustryModuleGate>
            }
          />

          <Route
            path="/:industry/customer-booking-requests/:requestId"
            element={
              <IndustryModuleGate module="customer-booking-requests">
                <DashboardLayout>
                  <CustomerBookingRequestDetail />
                </DashboardLayout>
              </IndustryModuleGate>
            }
          />

          <Route
            path="/:industry/trash"
            element={
              <IndustryModuleGate module="trash">
                <DashboardLayout>
                  <Trash />
                </DashboardLayout>
              </IndustryModuleGate>
            }
          />

          <Route
            path="/:industry/customer-chat"
            element={
              <IndustryModuleGate module="customer-chat">
                <DashboardLayout>
                  <CustomerChat />
                </DashboardLayout>
              </IndustryModuleGate>
            }
          />

          <Route
            path="/:industry/emails"
            element={
              <IndustryModuleGate module="emails">
                <DashboardLayout>
                  <EmailLogs />
                </DashboardLayout>
              </IndustryModuleGate>
            }
          />

          <Route
            path="/:industry/custom-fields"
            element={
              <IndustryModuleGate module="custom-fields">
                <DashboardLayout>
                  <CustomFields />
                </DashboardLayout>
              </IndustryModuleGate>
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
              // "permissions" is no longer in any industry's module list, so this redirects to the dashboard.
              // Backend permission APIs and RBAC enforcement are unaffected.
              <IndustryModuleGate module="permissions">
                <DashboardLayout>
                  <Permissions />
                </DashboardLayout>
              </IndustryModuleGate>
            }
          />

          <Route
            path="/:industry/settings"
            element={
              <DashboardLayout>
                <IndustrySettings />
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
          <Route
            path="/:industry/subscription"
            element={
              <DashboardLayout>
                <SubscriptionBilling />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/billing"
            element={
              <DashboardLayout>
                <SubscriptionBilling />
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
          <Route path="/forecast" element={<ModuleRedirect target="forecast" />} />
          <Route path="/lead-scoring" element={<ModuleRedirect target="lead-scoring" />} />
          <Route path="/trash" element={<ModuleRedirect target="trash" />} />
          <Route path="/customer-chat" element={<ModuleRedirect target="customer-chat" />} />
          <Route path="/emails" element={<ModuleRedirect target="emails" />} />
          <Route path="/custom-fields" element={<ModuleRedirect target="custom-fields" />} />
          <Route path="/customer-booking-requests" element={<ModuleRedirect target="customer-booking-requests" />} />
          <Route path="/rentals" element={<ModuleRedirect target="rentals" />} />
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
          <Route path="/subscription" element={<ModuleRedirect target="subscription" />} />
          <Route path="/billing" element={<ModuleRedirect target="subscription" />} />
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
