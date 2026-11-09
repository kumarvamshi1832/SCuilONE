import React, { useState, useEffect, useRef, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  MailIcon,
  LockIcon,
  BuildingIcon,
  HomeIcon,
  ArrowRightIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  LayersIcon,
  FileSignatureIcon,
  CreditCardIcon,
  HeadphonesIcon,
  ShieldCheckIcon,
  ZapIcon,
  UsersIcon,
  LifeBuoyIcon,
  SunIcon,
  MoonIcon,
} from "../../components/common/SupportPortalIcons";
import {
  portalLogin,
  getPortalTenantId,
  extractRateLimitInfo,
} from "../../services/customerPortalAuthService";
import type { PortalWorkspace } from "../../types/customerPortal";
import { getIndustryDisplayName } from "../../utils/industryUtils";
import { useTheme } from "../../context/ThemeContext";
import "./CustomerPortalLogin.css";

export default function CustomerPortalLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  // Prefill tenant ID if stored previously from activation or login
  const [tenantId] = useState(() => {
    return (
      (location.state as any)?.tenant_id ||
      getPortalTenantId() ||
      ""
    );
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const isSubmittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  // Success message passed from activate page — managed in state so it can be cleared on submit or error
  const [successBanner, setSuccessBanner] = useState<string | null>(
    () => (location.state as any)?.message || null
  );

  // Multiple workspaces selection if returned by backend
  const [workspacesList, setWorkspacesList] = useState<PortalWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  const selectedWorkspace = useMemo(
    () => workspacesList.find((w) => w.tenant_id === selectedWorkspaceId) || null,
    [workspacesList, selectedWorkspaceId]
  );

  // Classify workspace by industry and company metadata dynamically
  const getWorkspaceMeta = (ws: PortalWorkspace) => {
    const rawInd = ws.industry || "";
    const ind = rawInd.toLowerCase();
    const tName = (ws.tenant_name || "").toLowerCase();
    const aName = (ws.account_name || "").toLowerCase();

    const isRealEstate =
      ind.includes("real estate") ||
      ind.includes("real_estate") ||
      ind.includes("real-estate") ||
      ind.includes("realty") ||
      tName.includes("real estate") ||
      tName.includes("realty") ||
      tName.includes("property") ||
      tName.includes("properties") ||
      tName.includes("estates") ||
      aName.includes("realty") ||
      aName.includes("property");

    const isSoftware =
      ind.includes("software") ||
      ind.includes("it consulting") ||
      ind.includes("it_consulting") ||
      ind.includes("tech") ||
      tName.includes("software") ||
      tName.includes("tech") ||
      tName.includes("digital") ||
      tName.includes("dev") ||
      tName.includes("solutions") ||
      aName.includes("software") ||
      aName.includes("tech");

    let industryLabel = getIndustryDisplayName(rawInd);
    if (!industryLabel) {
      if (isRealEstate) industryLabel = "Real Estate";
      else if (isSoftware) industryLabel = "Software Company";
      else industryLabel = "Company Workspace";
    }

    if (isRealEstate) {
      return {
        type: "real-estate" as const,
        label: industryLabel,
        icon: <HomeIcon size={22} />,
      };
    }

    if (isSoftware) {
      return {
        type: "software" as const,
        label: industryLabel,
        icon: <BuildingIcon size={22} />,
      };
    }

    return {
      type: "business" as const,
      label: industryLabel,
      icon: <BuildingIcon size={22} />,
    };
  };

  // Discard router history message after initial read to prevent replay on reload
  useEffect(() => {
    if (location.state && (location.state as any)?.message) {
      window.history.replaceState({}, document.title);
    }
  }, []);

  // Countdown timer for rate limiting (HTTP 429 Retry-After)
  useEffect(() => {
    if (retryCountdown === null || retryCountdown <= 0) return;
    const timer = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev === null || prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCountdown]);

  const handleSubmit = async (
    e?: React.FormEvent,
    targetTenantId?: string
  ) => {
    if (e) e.preventDefault();
    if (isSubmittingRef.current || loading) return; // Prevent duplicate submissions / double-clicks
    if (retryCountdown && retryCountdown > 0) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError("Please fill in Email and Password.");
      return;
    }

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    const selectedTenant = targetTenantId || tenantId.trim();
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (selectedTenant && !UUID_REGEX.test(selectedTenant)) {
      setError("Tenant ID must be a valid UUID (e.g. 12345678-1234-1234-1234-123456789abc) or left blank.");
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);
    setSuccessBanner(null);

    const payload: any = {
      email: trimmedEmail,
      password,
    };
    if (selectedTenant) {
      payload.tenant_id = selectedTenant;
    }

    try {
      const result: any = await portalLogin(payload, rememberMe);

      if (result && result.requires_tenant_selection && Array.isArray(result.workspaces)) {
        setWorkspacesList(result.workspaces);
        if (result.workspaces.length > 0) {
          setSelectedWorkspaceId(result.workspaces[0].tenant_id);
        }
        return;
      }

      const from = (location.state as any)?.from?.pathname || "/portal/dashboard";
      navigate(from, { replace: true });
    } catch (err: any) {
      // Safe development logging without exposing passwords or tokens
      console.error("Portal login failed:", {
        status: err?.response?.status,
        statusText: err?.response?.statusText,
        data: err?.response?.data,
        url: err?.config?.url,
      });

      const rateLimit = extractRateLimitInfo(err);
      if (rateLimit.isRateLimited) {
        if (rateLimit.retryAfterSeconds && rateLimit.retryAfterSeconds > 0) {
          setRetryCountdown(rateLimit.retryAfterSeconds);
          setError(
            `${rateLimit.message} Please try again in ${rateLimit.retryAfterSeconds} seconds.`
          );
        } else {
          setError(
            rateLimit.message || "Too many attempts. Please try again later."
          );
        }
      } else if (!err?.response) {
        setError(
          "Unable to connect to the authentication server. Please check your network connection and verify the backend is running."
        );
      } else {
        const status = err.response.status;
        const responseData = err.response.data;
        const detail = responseData?.detail || responseData?.message || responseData?.error;

        if (status === 400) {
          setError(
            typeof detail === "string" && detail.trim().length > 0
              ? detail
              : "Invalid request. Please verify your credentials and try again."
          );
        } else if (status === 401) {
          setError(
            typeof detail === "string"
              ? detail
              : "Invalid email or password. Please verify your credentials."
          );
        } else if (status === 403) {
          setError(
            typeof detail === "string"
              ? detail
              : "Access denied. Your portal account may be suspended or unverified. Please contact your organization administrator."
          );
        } else if (status === 422) {
          if (Array.isArray(detail)) {
            setError(detail.map((d: any) => d.msg || d.detail).join(", "));
          } else if (typeof detail === "string") {
            setError(detail);
          } else {
            setError("Invalid login request format. Please verify your inputs.");
          }
        } else if (status === 500) {
          if (
            typeof detail === "string" &&
            detail.trim().length > 0 &&
            !detail.includes("Traceback") &&
            !detail.includes("File \"") &&
            !detail.includes("psycopg2") &&
            !detail.includes("sqlalchemy") &&
            detail !== "Internal Server Error"
          ) {
            setError(`Server error (500): ${detail}`);
          } else {
            setError(
              "Server error (500). An internal error occurred while processing your request. Please try again later or contact your administrator."
            );
          }
        } else {
          setError(
            typeof detail === "string"
              ? detail
              : err.message || "Login failed. Please verify your credentials."
          );
        }
      }
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const isWorkspaceSelectionMode = workspacesList.length > 0;

  return (
    <div className={`cp-auth-wrapper cp-login-split-page ${theme}`}>
      {/* Top-Right Theme Toggle Button */}
      <div className="cp-login-theme-toggle-wrap">
        <button
          type="button"
          className="cp-login-theme-toggle-btn"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === "dark" ? (
            <SunIcon size={19} className="cp-theme-toggle-icon" />
          ) : (
            <MoonIcon size={19} className="cp-theme-toggle-icon" />
          )}
        </button>
      </div>

      {/* Background Ambient Lighting & Digital Horizon / Technology Mesh */}
      <div className="cp-login-bg-ambient" aria-hidden="true">
        <div className="cp-ambient-glow-left" />
        <div className="cp-ambient-glow-center" />
        <div className="cp-ambient-glow-right" />
        <svg
          className="cp-digital-mesh-svg"
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="cpWaveGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00C2FF" stopOpacity="0.85" />
              <stop offset="45%" stopColor="#0072FF" stopOpacity="0.65" />
              <stop offset="85%" stopColor="#0EA5E9" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="cpWaveGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#0055FF" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#00B4D8" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="cpWaveFill" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#0072FF" stopOpacity="0.14" />
              <stop offset="50%" stopColor="#0284C7" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#040D21" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="cpGlobeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0099FF" stopOpacity="0.15" />
              <stop offset="50%" stopColor="#0066FF" stopOpacity="0.05" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
            <filter id="cpWaveGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Top-Right Digital Sphere & Grid Coordinates (Abstract Digital Globe) */}
          <circle cx="1320" cy="260" r="340" fill="url(#cpGlobeGlow)" />
          <g className="cp-globe-grid" opacity="0.16" stroke="#00C2FF" strokeWidth="0.8" strokeDasharray="3 5">
            <circle cx="1320" cy="260" r="300" />
            <circle cx="1320" cy="260" r="240" />
            <circle cx="1320" cy="260" r="180" />
            <ellipse cx="1320" cy="260" rx="300" ry="130" />
            <ellipse cx="1320" cy="260" rx="300" ry="65" />
            <ellipse cx="1320" cy="260" rx="130" ry="300" />
            <ellipse cx="1320" cy="260" rx="65" ry="300" />
          </g>

          {/* Glowing Scattered Data Points on Sphere */}
          <g className="cp-globe-dots" fill="#00E5FF" opacity="0.40">
            <circle cx="1180" cy="180" r="2.2" />
            <circle cx="1220" cy="140" r="1.8" />
            <circle cx="1260" cy="210" r="2.4" />
            <circle cx="1300" cy="150" r="1.8" />
            <circle cx="1340" cy="200" r="2.2" />
            <circle cx="1390" cy="170" r="2.4" />
            <circle cx="1420" cy="230" r="1.8" />
          </g>

          {/* Fluid Luminous Blue Waves across Lower Viewport */}
          <path
            d="M -100 850 C 200 760, 480 880, 850 780 C 1120 700, 1340 760, 1600 710 L 1600 950 L -100 950 Z"
            fill="url(#cpWaveFill)"
          />
          <path
            d="M -100 860 C 250 780, 500 860, 880 770 C 1180 700, 1380 750, 1600 700"
            stroke="url(#cpWaveGrad1)"
            strokeWidth="3"
            filter="url(#cpWaveGlow)"
          />
          <path
            d="M -100 885 C 280 810, 550 890, 920 800 C 1220 730, 1400 780, 1600 730"
            stroke="url(#cpWaveGrad2)"
            strokeWidth="2"
            opacity="0.85"
          />
          <path
            d="M -100 830 C 220 750, 460 840, 820 750 C 1100 680, 1320 730, 1600 680"
            stroke="#00E5FF"
            strokeWidth="1.2"
            opacity="0.65"
          />
        </svg>
      </div>

      <div className="cp-login-split-container">
        {/* LEFT SECTION – BRANDING AND VISUAL EXPERIENCE */}
        <section className="cp-login-brand-panel">
          <div className="cp-login-brand-inner">
            {/* SCuilONE Logo + Separator Pipe + Customer Portal Pill */}
            <div className="cp-brand-badge-row">
              <div className="cp-brand-logo-box" aria-hidden="true">
                <LifeBuoyIcon size={25} />
              </div>
              <span className="cp-brand-title">SCuilONE</span>
              <span className="cp-brand-pipe">|</span>
              <span className="cp-brand-portal-pill">Customer Portal</span>
            </div>

            {/* Headline */}
            <h1 className="cp-brand-headline">
              Everything Your Business
              <br />
              Needs, <span className="cp-brand-gradient-cyan">In One Portal</span>
            </h1>

            {/* Description */}
            <p className="cp-brand-description">
              Collaborate, track, and manage your business operations with SCuilONE &mdash; your unified customer workspace.
            </p>

            {/* 4 Feature Cards (Projects, Contracts, Invoices, Support) */}
            <div className="cp-feature-cards-grid">
              <div className="cp-feature-tile">
                <div className="cp-feature-icon-wrap cp-icon-blue">
                  <LayersIcon size={24} />
                </div>
                <div className="cp-feature-text-wrap">
                  <span className="cp-feature-title">Projects</span>
                  <span className="cp-feature-sub">Plan, track, and deliver with confidence</span>
                </div>
              </div>

              <div className="cp-feature-tile">
                <div className="cp-feature-icon-wrap cp-icon-emerald">
                  <FileSignatureIcon size={24} />
                </div>
                <div className="cp-feature-text-wrap">
                  <span className="cp-feature-title">Contracts</span>
                  <span className="cp-feature-sub">Create, manage, and track agreements</span>
                </div>
              </div>

              <div className="cp-feature-tile">
                <div className="cp-feature-icon-wrap cp-icon-amber">
                  <CreditCardIcon size={24} />
                </div>
                <div className="cp-feature-text-wrap">
                  <span className="cp-feature-title">Invoices</span>
                  <span className="cp-feature-sub">View, download, and track payments</span>
                </div>
              </div>

              <div className="cp-feature-tile">
                <div className="cp-feature-icon-wrap cp-icon-purple">
                  <HeadphonesIcon size={24} />
                </div>
                <div className="cp-feature-text-wrap">
                  <span className="cp-feature-title">Support</span>
                  <span className="cp-feature-sub">Raise tickets and get quick assistance</span>
                </div>
              </div>
            </div>

            {/* Trust and Key Capabilities Row */}
            <div className="cp-brand-trust-section">
              <div className="cp-trust-row">
                <ShieldCheckIcon size={18} className="cp-trust-shield-icon" />
                <span>Trusted by businesses across industries</span>
              </div>
              <div className="cp-benefits-row">
                <div className="cp-benefit-item">
                  <ZapIcon size={16} className="cp-benefit-icon" />
                  <span>Secure Access</span>
                </div>
                <span className="cp-benefit-sep" aria-hidden="true">|</span>
                <div className="cp-benefit-item">
                  <UsersIcon size={16} className="cp-benefit-icon" />
                  <span>Real-time Updates</span>
                </div>
                <span className="cp-benefit-sep" aria-hidden="true">|</span>
                <div className="cp-benefit-item">
                  <LayersIcon size={16} className="cp-benefit-icon" />
                  <span>Unified Workspace</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT SECTION – FLOATING LOGIN CARD */}
        <section className="cp-login-form-panel">
          <div className={`cp-auth-card ${isWorkspaceSelectionMode ? "workspace-mode" : ""}`}>
            {isWorkspaceSelectionMode ? (
              <div className="cp-auth-header">
                <div className="cp-auth-logo cp-auth-logo-workspaces">
                  <LayersIcon size={28} />
                </div>
                <h1 className="cp-auth-title">Choose Your Workspace</h1>
                <p className="cp-auth-subtitle">
                  Your account is connected to multiple companies. Select the workspace you want to continue with.
                </p>
              </div>
            ) : (
              <div className="cp-auth-header">
                <div className="cp-auth-logo" aria-hidden="true">
                  <LifeBuoyIcon size={28} />
                </div>
                <h1 className="cp-auth-title">Client Portal Login</h1>
                <p className="cp-auth-subtitle">
                  Sign in to access your customer workspace
                </p>
              </div>
            )}

            {!error && successBanner && (
              <div className="cp-auth-alert success" role="status">
                <CheckCircleIcon size={18} />
                <span>{successBanner}</span>
              </div>
            )}

            {error && (
              <div className="cp-auth-alert error" role="alert">
                <AlertCircleIcon size={18} />
                <span>{error}</span>
              </div>
            )}

            {isWorkspaceSelectionMode ? (
              <div className="cp-workspace-selection-container">
                <div className="cp-workspace-rows-list" role="radiogroup" aria-label="Available company workspaces">
                  {workspacesList.map((ws) => {
                    const meta = getWorkspaceMeta(ws);
                    const isSelected = selectedWorkspaceId === ws.tenant_id;
                    return (
                      <div
                        key={ws.tenant_id}
                        className={`cp-workspace-row ${isSelected ? "selected" : ""}`}
                        onClick={() => setSelectedWorkspaceId(ws.tenant_id)}
                        onDoubleClick={() => handleSubmit(undefined, ws.tenant_id)}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedWorkspaceId(ws.tenant_id);
                          }
                        }}
                      >
                        <div className={`cp-ws-row-icon-badge ${meta.type}`}>
                          {meta.icon}
                        </div>

                        <div className="cp-ws-row-info">
                          <div className="cp-ws-row-name" title={ws.tenant_name}>
                            {ws.tenant_name}
                          </div>
                          <div className="cp-ws-row-details">
                            <span className="cp-ws-row-industry">{meta.label}</span>
                            <span className="cp-ws-row-sep" aria-hidden="true">·</span>
                            <span className="cp-ws-row-account" title={`Authorized Account: ${ws.account_name}`}>
                              {ws.account_name}
                            </span>
                          </div>
                        </div>

                        <div className="cp-ws-row-selection">
                          <span className={`cp-ws-row-badge ${isSelected ? "selected" : ""}`}>
                            {isSelected ? (
                              <>
                                <CheckIcon size={12} />
                                <span>Selected</span>
                              </>
                            ) : (
                              <span>Select</span>
                            )}
                          </span>
                          <div className={`cp-ws-radio-indicator ${isSelected ? "checked" : ""}`} aria-hidden="true">
                            {isSelected && <CheckIcon size={12} />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="cp-workspace-actions">
                  <button
                    type="button"
                    className="cp-auth-btn-primary"
                    disabled={!selectedWorkspaceId || loading || isSubmittingRef.current}
                    onClick={() => selectedWorkspaceId && handleSubmit(undefined, selectedWorkspaceId)}
                  >
                    <span>
                      {loading
                        ? "Connecting to Workspace..."
                        : selectedWorkspace
                          ? `Continue with ${selectedWorkspace.tenant_name}`
                          : "Select a Workspace to Continue"}
                    </span>
                    <ArrowRightIcon size={16} />
                  </button>

                  <button
                    type="button"
                    className="cp-ws-btn-back"
                    disabled={loading}
                    onClick={() => {
                      setWorkspacesList([]);
                      setSelectedWorkspaceId(null);
                      setError(null);
                    }}
                  >
                    &larr; Sign in with a different account
                  </button>
                </div>
              </div>
            ) : (
              <form
                className="cp-auth-form"
                onSubmit={(e) => {
                  if (loading || isSubmittingRef.current) {
                    e.preventDefault();
                    return;
                  }
                  handleSubmit(e);
                }}
              >
                {/* <div className="cp-auth-field">
              <label>
                <span>Tenant ID (Organization ID)</span>
                <span className="cp-field-optional">Optional</span>
              </label>
              <div className="cp-auth-input-wrapper">
                <BuildingIcon size={16} className="cp-auth-icon" />
                <input
                  type="text"
                  placeholder="Enter tenant ID"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  autoComplete="organization"
                />
              </div>
            </div> */}

                <div className="cp-auth-field">
                  <label>
                    <span>Email Address</span>
                  </label>
                  <div className="cp-auth-input-wrapper">
                    <MailIcon size={16} className="cp-auth-icon" />
                    <input
                      type="email"
                      required
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="cp-auth-field">
                  <label>
                    <span>Password</span>
                  </label>
                  <div className="cp-auth-input-wrapper">
                    <LockIcon size={16} className="cp-auth-icon" />
                    <input
                      type={showPassword ? "text" : "password"}
                      className="with-toggle"
                      required
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="cp-auth-password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? "Hide password" : "Show password"}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                    </button>
                  </div>
                </div>

                <div className="cp-auth-options-row">
                  <label className="cp-auth-remember-label">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>Remember me</span>
                  </label>
                  <div className="cp-auth-options-links">
                    <Link to="/portal/forgot-password" className="cp-auth-link">
                      Forgot password?
                    </Link>
                    <span className="cp-auth-link-sep">•</span>
                    {/* <Link to="/portal/activate" className="cp-auth-link">
                      Activate account?
                    </Link> */}
                  </div>
                </div>

                <button
                  type="submit"
                  className="cp-auth-btn-primary"
                  disabled={loading || isSubmittingRef.current || Boolean(retryCountdown && retryCountdown > 0)}
                >
                  <span>
                    {loading
                      ? "Signing In..."
                      : retryCountdown && retryCountdown > 0
                        ? `Too many attempts (retry in ${retryCountdown}s)`
                        : "Sign In to Portal"}
                  </span>
                  {!loading && !retryCountdown && (
                    <ArrowRightIcon size={16} className="cp-auth-btn-arrow" />
                  )}
                </button>
              </form>
            )}

            <div className="cp-auth-footer">
              <div className="cp-auth-footer-row">
                <span className="cp-auth-footer-muted">Have an invitation code?</span>{" "}
                {/* <Link to="/portal/activate" className="cp-auth-link">
                  Activate Invitation
                </Link> */}
              </div>
              <div className="cp-auth-footer-row">
                <span className="cp-auth-footer-muted">SCuilONE Employee?</span>{" "}
                <Link to="/login" className="cp-auth-link">
                  Staff CRM Login &rarr;
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
