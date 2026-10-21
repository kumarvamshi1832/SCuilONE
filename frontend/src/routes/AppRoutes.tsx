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

import RealEstateDashboard from "../pages/dashboard/RealEstateDashboard";
import EducationConsultingDashboard from "../pages/dashboard/EducationConsultingDashboard";
import SoftwareCompanyDashboard from "../pages/dashboard/SoftwareCompanyDashboard";
import TrainingInstituteDashboard from "../pages/dashboard/TrainingInstituteDashboard";
import DigitalMarketingAgencyDashboard from "../pages/dashboard/DigitalMarketingAgencyDashboard";
import InsuranceAgencyDashboard from "../pages/dashboard/InsuranceAgencyDashboard";
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
import FormBuilder from "../pages/form-builder/FormBuilder";
import Pipelines from "../pages/pipelines/Pipelines";

/* Dedicated Activities page */
import Activities from "../pages/activities/Activities";

/* Keep these pages as placeholders */
import {
  Reports,
  Settings,
  Projects,
  TimeTracking,
  Invoices,
  Proposals,
  Contracts,
  SupportTickets,
  Courses,
  Batches,
  Students,
  Trainers,
  DemoClasses,
  Applications,
  Universities,
  Programs,
  Counselors,
  Consultations,
  FollowUps,
  Campaigns,
  Services,
  Policies,
  Quotes,
  Claims,
  Renewals,
  Payments,
} from "../pages/dashboard/Placeholders";

import Roles from "../pages/roles/Roles";
import Permissions from "../pages/permissions/Permissions";
import { normalizeIndustry } from "../utils/industryUtils";

function DashboardResolver() {
  const { industry } = useParams();
  const normalized = normalizeIndustry(industry);

  switch (normalized) {
    case "real-estate":
      return <RealEstateDashboard />;

    case "education-consulting":
      return <EducationConsultingDashboard />;

    case "training-institute":
      return <TrainingInstituteDashboard />;

    case "digital-marketing-agency":
      return <DigitalMarketingAgencyDashboard />;

    case "software-company":
      return <SoftwareCompanyDashboard />;

    case "insurance-agency":
      return <InsuranceAgencyDashboard />;

    default:
      return <RealEstateDashboard />;
  }
}

function RootRedirect() {
  const token = sessionStorage.getItem("access_token");
  const tenantStr = sessionStorage.getItem("tenant");
  const userStr = sessionStorage.getItem("user");

  if (token) {
    try {
      const user = userStr ? JSON.parse(userStr) : null;
      const role = String(user?.role || "").toUpperCase();

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

      if (tenantStr) {
        const tenant = JSON.parse(tenantStr);
        if (tenant && tenant.industry) {
          const slug = normalizeIndustry(tenant.industry);
          return <Navigate to={`/${slug}/dashboard`} replace />;
        }
      }
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
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/verify-reset-otp" element={<VerifyResetOTP />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="/complete-profile" element={<CompleteProfile />} />

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
                <Activities />
              </DashboardLayout>
            }
          />

          <Route
            path="/:industry/my-tasks"
            element={
              <DashboardLayout>
                <Activities />
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
            path="/tasks"
            element={
              <DashboardLayout>
                <Activities />
              </DashboardLayout>
            }
          />

          <Route
            path="/activities"
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

          {/* Software Company Industry Routes */}
          <Route
            path="/:industry/clients"
            element={
              <DashboardLayout>
                <Accounts />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/projects"
            element={
              <DashboardLayout>
                <Projects />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/team-members"
            element={
              <DashboardLayout>
                <Users />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/team"
            element={
              <DashboardLayout>
                <Users />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/time-tracking"
            element={
              <DashboardLayout>
                <TimeTracking />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/invoices"
            element={
              <DashboardLayout>
                <Invoices />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/proposals"
            element={
              <DashboardLayout>
                <Proposals />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/contracts"
            element={
              <DashboardLayout>
                <Contracts />
              </DashboardLayout>
            }
          />
          <Route
            path="/:industry/support-tickets"
            element={
              <DashboardLayout>
                <SupportTickets />
              </DashboardLayout>
            }
          />

          {/* Industry Specific Subroutes */}
          <Route path="/:industry/courses" element={<DashboardLayout><Courses /></DashboardLayout>} />
          <Route path="/:industry/batches" element={<DashboardLayout><Batches /></DashboardLayout>} />
          <Route path="/:industry/students" element={<DashboardLayout><Students /></DashboardLayout>} />
          <Route path="/:industry/trainers" element={<DashboardLayout><Trainers /></DashboardLayout>} />
          <Route path="/:industry/demo-classes" element={<DashboardLayout><DemoClasses /></DashboardLayout>} />
          <Route path="/:industry/applications" element={<DashboardLayout><Applications /></DashboardLayout>} />
          <Route path="/:industry/universities" element={<DashboardLayout><Universities /></DashboardLayout>} />
          <Route path="/:industry/programs" element={<DashboardLayout><Programs /></DashboardLayout>} />
          <Route path="/:industry/counselors" element={<DashboardLayout><Counselors /></DashboardLayout>} />
          <Route path="/:industry/consultations" element={<DashboardLayout><Consultations /></DashboardLayout>} />
          <Route path="/:industry/follow-ups" element={<DashboardLayout><FollowUps /></DashboardLayout>} />
          <Route path="/:industry/campaigns" element={<DashboardLayout><Campaigns /></DashboardLayout>} />
          <Route path="/:industry/services" element={<DashboardLayout><Services /></DashboardLayout>} />
          <Route path="/:industry/policies" element={<DashboardLayout><Policies /></DashboardLayout>} />
          <Route path="/:industry/quotes" element={<DashboardLayout><Quotes /></DashboardLayout>} />
          <Route path="/:industry/claims" element={<DashboardLayout><Claims /></DashboardLayout>} />
          <Route path="/:industry/renewals" element={<DashboardLayout><Renewals /></DashboardLayout>} />
          <Route path="/:industry/payments" element={<DashboardLayout><Payments /></DashboardLayout>} />
          <Route path="/:industry/agents" element={<DashboardLayout><Users /></DashboardLayout>} />
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