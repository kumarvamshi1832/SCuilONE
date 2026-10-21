import axios from "axios";
import type {
  CheckEmailRequest,
  CheckEmailResponse,
  RegisterRequest,
  VerifyOTPRequest,
  ResendOTPRequest,
  LoginRequest,
  VerifyMFARequest,
  ForgotPasswordRequest,
  VerifyResetOTPRequest,
  VerifyResetOTPResponse,
  ResetPasswordRequest,
  TokenResponse,
  MessageResponse,
  MFAEnrollmentStartRequest,
  MFAEnrollmentStartResponse,
  MFAEnrollmentVerifyRequest,
  MFAEnrollmentVerifyResponse,
} from "../types/auth";

/* Axios Client */

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
});

/* Attach Access Token */

apiClient.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("access_token");

    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/* Handle Unauthorized Responses */

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const requestUrl = String(error.config?.url ?? "");

    const isAuthRequest =
      requestUrl.includes("/api/v1/auth/login") ||
      requestUrl.includes("/api/v1/auth/mfa/verify") ||
      requestUrl.includes("/api/v1/auth/mfa/enroll/start") ||
      requestUrl.includes("/api/v1/auth/mfa/enroll/verify");

    if (status === 401 && !isAuthRequest) {
      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("refresh_token");
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("tenant");

      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

/* Endpoints */

const AUTH_ENDPOINTS = {
  CHECK_EMAIL: "/api/v1/auth/check-email",
  REGISTER: "/api/v1/auth/register",
  VERIFY_OTP: "/api/v1/auth/verify-otp",
  RESEND_OTP: "/api/v1/auth/resend-otp",
  LOGIN: "/api/v1/auth/login",
  VERIFY_MFA: "/api/v1/auth/mfa/verify",
  MFA_ENROLL_START: "/api/v1/auth/mfa/enroll/start",
  MFA_ENROLL_VERIFY: "/api/v1/auth/mfa/enroll/verify",
  FORGOT_PASSWORD: "/api/v1/auth/forgot-password",
  VERIFY_RESET_OTP: "/api/v1/auth/verify-reset-otp",
  RESET_PASSWORD: "/api/v1/auth/reset-password",
  ME: "/api/v1/auth/me",
} as const;

/* Error Handler */

function handleApiError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const data = error.response.data as
        | Record<string, unknown>
        | undefined;

      const status = error.response.status;
      let message = "Something went wrong. Please try again.";

      if (data) {
        if (typeof data.message === "string") {
          message = data.message;
        } else if (typeof data.detail === "string") {
          message = data.detail;
        } else if (Array.isArray(data.detail)) {
          const first = data.detail[0] as
            | { msg?: string }
            | undefined;

          message = first?.msg ?? message;
        }
      }

      if (status === 401 && !data?.detail && !data?.message) {
        message = "Invalid credentials or authentication failed.";
      }

      if (status === 403) {
        message = "Access denied.";
      }

      if (status === 404) {
        message = "Resource not found.";
      }

      if (status >= 500) {
        message = "Server error. Please try later.";
      }

      throw { message, status, detail: data };
    }

    if (error.request) {
      throw {
        message:
          "Unable to reach the server. Please check your internet connection.",
      };
    }
  }

  throw {
    message:
      error instanceof Error
        ? error.message
        : "An unexpected error occurred.",
  };
}

/* Check Email */

export async function checkEmail(
  data: CheckEmailRequest
): Promise<CheckEmailResponse> {
  try {
    const response = await apiClient.post<CheckEmailResponse>(
      AUTH_ENDPOINTS.CHECK_EMAIL,
      data
    );

    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/* Register User */

export async function registerUser(
  data: RegisterRequest
): Promise<MessageResponse> {
  try {
    const response = await apiClient.post<MessageResponse>(
      AUTH_ENDPOINTS.REGISTER,
      data
    );

    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/* Verify Registration OTP */

export async function verifyOTP(
  data: VerifyOTPRequest
): Promise<MessageResponse> {
  try {
    const response = await apiClient.post<MessageResponse>(
      AUTH_ENDPOINTS.VERIFY_OTP,
      data
    );

    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/* Resend Registration OTP */

export async function resendOTP(
  data: ResendOTPRequest
): Promise<MessageResponse> {
  try {
    const response = await apiClient.post<MessageResponse>(
      AUTH_ENDPOINTS.RESEND_OTP,
      data
    );

    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/* Login */

export async function loginUser(
  data: LoginRequest
): Promise<TokenResponse> {
  try {
    const response = await apiClient.post<TokenResponse>(
      AUTH_ENDPOINTS.LOGIN,
      data
    );

    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/* Verify MFA During Login */

export async function verifyMFA(
  data: VerifyMFARequest
): Promise<TokenResponse> {
  try {
    const response = await apiClient.post<TokenResponse>(
      AUTH_ENDPOINTS.VERIFY_MFA,
      data
    );

    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/* Start MFA Enrollment */

export async function startMFAEnrollment(
  data: MFAEnrollmentStartRequest
): Promise<MFAEnrollmentStartResponse> {
  try {
    const response = await apiClient.post<MFAEnrollmentStartResponse>(
      AUTH_ENDPOINTS.MFA_ENROLL_START,
      data
    );

    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/* Verify MFA Enrollment */

export async function verifyMFAEnrollment(
  data: MFAEnrollmentVerifyRequest
): Promise<MFAEnrollmentVerifyResponse> {
  try {
    const response = await apiClient.post<MFAEnrollmentVerifyResponse>(
      AUTH_ENDPOINTS.MFA_ENROLL_VERIFY,
      data
    );

    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/* Forgot Password */

export async function forgotPassword(
  data: ForgotPasswordRequest
): Promise<MessageResponse> {
  try {
    const response = await apiClient.post<MessageResponse>(
      AUTH_ENDPOINTS.FORGOT_PASSWORD,
      data
    );

    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/* Verify Password Reset OTP */

export async function verifyResetOTP(
  data: VerifyResetOTPRequest
): Promise<VerifyResetOTPResponse> {
  try {
    const response = await apiClient.post<VerifyResetOTPResponse>(
      AUTH_ENDPOINTS.VERIFY_RESET_OTP,
      data
    );

    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/* Reset Password */

export async function resetPassword(
  data: ResetPasswordRequest
): Promise<MessageResponse> {
  try {
    const response = await apiClient.post<MessageResponse>(
      AUTH_ENDPOINTS.RESET_PASSWORD,
      data
    );

    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

export { apiClient };
