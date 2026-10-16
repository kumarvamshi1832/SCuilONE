/* ─── Request Types ─── */

export interface CheckEmailRequest {
  email: string;
}

export interface RegisterRequest {
  company_name: string;
  company_email: string;
  phone: string;
  industry: string;
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
}

export interface VerifyOTPRequest {
  email: string;
  otp: string;
}

export interface ResendOTPRequest {
  email: string;
  type?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface VerifyMFARequest {
  email: string;
  otp_code: string;
  temp_token: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface VerifyResetOTPRequest {
  email: string;
  otp: string;
}

export interface VerifyResetOTPResponse {
  message: string;
  reset_token: string;
}

export interface ResetPasswordRequest {
  email: string;
  reset_token: string;
  new_password: string;
  confirm_password: string;
}

/* ─── Response Types ─── */

export interface User {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  designation?: string;
  department?: string;
  employee_id?: string;
  location?: string;
}

export interface CheckEmailResponse {
  email: string;
  exists: boolean;
  is_active: boolean;
  message: string;
}

export interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  user?: User;
  tenant?: {
    id: string;
    name: string;
    industry?: string;
  };
  role?: string;
  permissions?: string[];
  requires_mfa: boolean;
  temp_token?: string;
  message: string;
}

export interface MessageResponse {
  success: boolean;
  message: string;
  data?: unknown;
}