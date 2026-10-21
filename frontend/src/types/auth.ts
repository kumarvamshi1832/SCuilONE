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
  mfa_token: string;
  code: string;
}

export interface MFAEnrollmentStartRequest {
  mfa_token: string;
}

export interface MFAEnrollmentVerifyRequest {
  mfa_token: string;
  code: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface VerifyResetOTPRequest {
  email: string;
  otp: string;
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

export interface VerifyResetOTPResponse {
  message: string;
  reset_token: string;
}

export interface MFAEnrollmentStartResponse {
  message: string;
  secret: string;
  otpauth_url: string;
  issuer: string;
  account: string;
}

export interface TokenResponse {
  access_token?: string;
  refresh_token?: string | null;
  refresh_token_expires_at?: string | null;
  token_type: string;
  expires_in?: number;

  user?: User & {
    status?: string;
    must_change_password?: boolean;
    profile_completed?: boolean;
  };

  tenant?: {
    id: string;
    name: string;
    industry?: string;
  };

  role?: string;
  permissions?: string[];

  requires_mfa?: boolean;
  mfa_required?: boolean;
  mfa_setup_required?: boolean;
  mfa_token?: string;

  next_step?: "mfa_enrollment" | "mfa_verification";

  onboarding_required?: boolean;
  message: string;
}

export interface MFAEnrollmentVerifyResponse extends TokenResponse {
  recovery_codes: string[];
  recovery_codes_message: string;
}

export interface MessageResponse {
  success: boolean;
  message: string;
  data?: unknown;
}
