import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import MFA from "../pages/auth/MFA";
import ForgotPassword from "../pages/auth/ForgotPassword";
import VerifyResetOTP from "../pages/auth/VerifyResetOTP";
import ResetPassword from "../pages/auth/ResetPassword";

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

                <Route path="/empty" element={<div />} />

                {/* Default Route */}
                <Route path="/" element={<Navigate to="/login" replace />} />

                {/* Unknown Routes */}
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </BrowserRouter>
    );
}