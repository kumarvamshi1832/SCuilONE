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
import Users from "../pages/users/Users";
import {
    Leads, Contacts, Deals, Activities, Reports, Roles, Permissions, Settings
} from "../pages/dashboard/Placeholders";

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
                    <Route path="/dashboard" element={<DashboardLayout><RealEstateDashboard /></DashboardLayout>} />
                    <Route path="/users" element={<DashboardLayout><Users /></DashboardLayout>} />
                    <Route path="/leads" element={<DashboardLayout><Leads /></DashboardLayout>} />
                    <Route path="/contacts" element={<DashboardLayout><Contacts /></DashboardLayout>} />
                    <Route path="/deals" element={<DashboardLayout><Deals /></DashboardLayout>} />
                    <Route path="/activities" element={<DashboardLayout><Activities /></DashboardLayout>} />
                    <Route path="/reports" element={<DashboardLayout><Reports /></DashboardLayout>} />
                    <Route path="/roles" element={<DashboardLayout><Roles /></DashboardLayout>} />
                    <Route path="/permissions" element={<DashboardLayout><Permissions /></DashboardLayout>} />
                    <Route path="/settings" element={<DashboardLayout><Settings /></DashboardLayout>} />
                </Route>

                <Route path="/empty" element={<div />} />

                {/* Default Route */}
                <Route path="/" element={<Navigate to="/login" replace />} />

                {/* Unknown Routes */}
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </BrowserRouter>
    );
}