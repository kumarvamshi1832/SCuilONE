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
} from "../types/auth";

/* ─── Axios Client ─── */

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
});

// Auto-logout on 401 Unauthorized for authenticated session requests
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const requestUrl = error.config?.url || "";
      const isAuthEndpoint =
        requestUrl.includes("/api/v1/auth/login") ||
        requestUrl.includes("/api/v1/auth/register") ||
        requestUrl.includes("/api/v1/auth/check-email") ||
        requestUrl.includes("/api/v1/auth/verify-otp") ||
        requestUrl.includes("/api/v1/auth/resend-otp") ||
        requestUrl.includes("/api/v1/auth/verify-mfa") ||
        requestUrl.includes("/api/v1/auth/forgot-password") ||
        requestUrl.includes("/api/v1/auth/verify-reset-otp") ||
        requestUrl.includes("/api/v1/auth/reset-password");

      const isLoginPage = window.location.pathname === "/login";

      // Only perform auto-logout redirect if this was NOT an authentication attempt
      // and the user is not currently on the login page
      if (!isAuthEndpoint && !isLoginPage) {
        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("tenant");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

/* ─── Endpoints ─── */

const AUTH_ENDPOINTS = {
  CHECK_EMAIL: "/api/v1/auth/check-email",
  REGISTER: "/api/v1/auth/register",
  VERIFY_OTP: "/api/v1/auth/verify-otp",
  RESEND_OTP: "/api/v1/auth/resend-otp",
  LOGIN: "/api/v1/auth/login",
  VERIFY_MFA: "/api/v1/auth/verify-mfa",
  FORGOT_PASSWORD: "/api/v1/auth/forgot-password",
  VERIFY_RESET_OTP: "/api/v1/auth/verify-reset-otp",
  RESET_PASSWORD: "/api/v1/auth/reset-password",
  ME: "/api/v1/auth/me",
} as const;

/* ─── Error Handler ─── */

function handleApiError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const data = error.response.data as Record<string, unknown> | undefined;
      const status = error.response.status;

      let message = "Something went wrong. Please try again.";

      if (data) {
        if (typeof data.message === "string") {
          message = data.message;
        } else if (typeof data.detail === "string") {
          message = data.detail;
        } else if (Array.isArray(data.detail)) {
          const first = data.detail[0] as { msg?: string } | undefined;
          message = first?.msg ?? message;
        }
      }

      if (status === 401) {
        message = message || "Invalid email or password. Please check your credentials and try again.";
      } else if (status === 403) {
        message = message || "Access denied. Contact your administrator.";
      } else if (status === 404) {
        message = message || "Resource not found.";
      } else if (status >= 500) {
        message = "Server error. Please try again later.";
      }

      throw { message, status, detail: data };
    }

    if (error.request) {
      throw {
        message:
          "Unable to reach the server. Please check your internet connection.",
        status: 0,
      };
    }
  }

  throw {
    message:
      error instanceof Error
        ? error.message
        : "An unexpected error occurred. Please try again.",
    status: -1,
  };
}

/* ─── Service Functions ─── */

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