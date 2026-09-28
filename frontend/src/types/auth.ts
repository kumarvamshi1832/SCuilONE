/* ─── Request Types ─── */

export interface CheckEmailRequest {
  email: string;
}

export interface RegisterRequest {
  company_id: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  designation?: string;
  department?: string;
  employee_id?: string;
  location?: string;
}

export interface VerifyOTPRequest {
  email: string;
  otp_code: string;
  type?: string;
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

export interface ResetPasswordRequest {
  email: string;
  otp_code: string;
  new_password: string;
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
  requires_mfa: boolean;
  temp_token?: string;
  message: string;
}

export interface MessageResponse {
  success: boolean;
  message: string;
  data?: unknown;
}