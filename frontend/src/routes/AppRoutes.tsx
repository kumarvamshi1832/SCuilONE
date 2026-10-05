import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import MFA from "../pages/auth/MFA";
import ForgotPassword from "../pages/auth/ForgotPassword";
import VerifyResetOTP from "../pages/auth/VerifyResetOTP";
import ResetPassword from "../pages/auth/ResetPassword";

import ProtectedRoute from "../components/layout/ProtectedRoute";
import DashboardLayout from "../components/layout/DashboardLayout";
import RealEstateDashboard from "../pages/dashboard/RealEstateDashboard";
import ManagerDashboard from "../pages/dashboard/ManagerDashboard";
import SalesDashboard from "../pages/dashboard/SalesDashboard";
import OperationsDashboard from "../pages/dashboard/OperationsDashboard";
import SupportDashboard from "../pages/dashboard/SupportDashboard";
import AuditorDashboard from "../pages/dashboard/AuditorDashboard";
import Users from "../pages/users/Users";
import Leads from "../pages/leads/Leads";
import {
    Contacts, Accounts, Deals, Tasks, Activities, Reports, Settings
} from "../pages/dashboard/Placeholders";
import Roles from "../pages/roles/Roles";
import Permissions from "../pages/permissions/Permissions";

import { useParams } from "react-router-dom";

// Resolver for Data-Driven Industry Dashboard
function DashboardResolver() {
    const { industry } = useParams();
    
    // We can add other industries here as we build them.
    switch(industry) {
        case 'real-estate':
            return <RealEstateDashboard />;
        default:
            return <RealEstateDashboard />; // fallback to Real Estate
    }
}

function RootRedirect() {
    const token = sessionStorage.getItem("access_token");
    const tenantStr = sessionStorage.getItem("tenant");
    const userStr = sessionStorage.getItem("user");
    
    if (token && tenantStr) {
        try {
            const user = userStr ? JSON.parse(userStr) : null;
            const role = (user?.role || "").toUpperCase();
            if (role === "MANAGER" || role.includes("MANAGER")) {
                return <Navigate to="/manager/dashboard" replace />;
            }
            if (role === "SALES_USER" || role === "SALES USER" || role.includes("SALES")) return <Navigate to="/sales/dashboard" replace />;
            if (role === "OPERATIONS_USER" || role === "OPERATIONS USER" || role.includes("OPERATIONS")) return <Navigate to="/operations/dashboard" replace />;
            if (role === "SUPPORT_USER" || role === "SUPPORT USER" || role.includes("SUPPORT")) return <Navigate to="/support/dashboard" replace />;
            if (role === "READ_ONLY" || role === "AUDITOR" || role === "READ ONLY" || role === "READ-ONLY" || role === "READ-ONLY / AUDITOR" || role === "READ ONLY / AUDITOR" || role === "READ_ONLY / AUDITOR" || role.includes("AUDITOR")) return <Navigate to="/auditor/dashboard" replace />;

            const tenant = JSON.parse(tenantStr);
            if (tenant.industry) {
                const slug = tenant.industry.toLowerCase().replace(/\s+/g, '-');
                return <Navigate to={`/${slug}/dashboard`} replace />;
            }
        } catch(e) {}
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

                {/* Protected Routes */}
                <Route element={<ProtectedRoute />}>
                    <Route path="/manager/dashboard" element={<DashboardLayout><ManagerDashboard /></DashboardLayout>} />
                    <Route path="/sales/dashboard" element={<DashboardLayout><SalesDashboard /></DashboardLayout>} />
                    <Route path="/operations/dashboard" element={<DashboardLayout><OperationsDashboard /></DashboardLayout>} />
                    <Route path="/support/dashboard" element={<DashboardLayout><SupportDashboard /></DashboardLayout>} />
                    <Route path="/auditor/dashboard" element={<DashboardLayout><AuditorDashboard /></DashboardLayout>} />
                    <Route path="/:industry/dashboard" element={<DashboardLayout><DashboardResolver /></DashboardLayout>} />
                    <Route path="/:industry/users" element={<DashboardLayout><Users /></DashboardLayout>} />
                    <Route path="/:industry/leads" element={<DashboardLayout><Leads /></DashboardLayout>} />
                    <Route path="/:industry/contacts" element={<DashboardLayout><Contacts /></DashboardLayout>} />
                    <Route path="/:industry/accounts" element={<DashboardLayout><Accounts /></DashboardLayout>} />
                    <Route path="/:industry/deals" element={<DashboardLayout><Deals /></DashboardLayout>} />
                    <Route path="/:industry/tasks" element={<DashboardLayout><Tasks /></DashboardLayout>} />
                    <Route path="/:industry/activities" element={<DashboardLayout><Activities /></DashboardLayout>} />
                    <Route path="/:industry/reports" element={<DashboardLayout><Reports /></DashboardLayout>} />
                    <Route path="/:industry/roles" element={<DashboardLayout><Roles /></DashboardLayout>} />
                    <Route path="/:industry/permissions" element={<DashboardLayout><Permissions /></DashboardLayout>} />
                    <Route path="/:industry/settings" element={<DashboardLayout><Settings /></DashboardLayout>} />
                </Route>

                <Route path="/empty" element={<div />} />

                {/* Default Route */}
                <Route path="/" element={<RootRedirect />} />

                {/* Unknown Routes */}
                <Route path="*" element={<RootRedirect />} />
            </Routes>
        </BrowserRouter>
    );
}