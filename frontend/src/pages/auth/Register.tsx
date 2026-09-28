import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser } from "../../services/authService";

import type { RegisterRequest } from "../../types/auth";
import { useTheme } from "../../context/ThemeContext";
import darkImage from "../../assets/registration-dark.png";
import lightImage from "../../assets/registration-light.png";
import "./Register.css";

const industries = [
    "Real Estate",
    "Education Consulting",
    "Training Institute",
    "Digital Marketing Agency",
    "Software Company",
    "Insurance Agency",
    "Automobile Dealer",
    "Interior Designer",
    "Travel Company",
    "B2B Sales",
];

export default function Register() {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const [formData, setFormData] = useState({
        company_name: "",
        company_email: "",
        phone: "",
        industry: "",
        full_name: "",
        email: "",
        password: "",
        confirm_password: "",
    });

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
        setError("");
    };


    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setMessage("");

        const email = formData.email.trim().toLowerCase();
        const companyEmail = formData.company_email.trim().toLowerCase();

        if (formData.password !== formData.confirm_password) {
            setError("Passwords do not match.");
            return;
        }
        if (formData.password.length < 6) {
            setError("Password must contain at least 6 characters.");
            return;
        }
        if (!formData.industry) {
            setError("Please select an industry.");
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError("Please enter a valid email address.");
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) {
            setError("Please enter a valid company email address.");
            return;
        }

        setLoading(true);

        try {
            const payload: RegisterRequest = {
                company_id: "PENDING_SETUP",
                name: formData.full_name.trim(),
                email: email,
                phone: formData.phone.trim(),
                password: formData.password,
            };

            const response = await registerUser(payload);

            setMessage(response.message || "Registration successful. Please verify your email.");
            sessionStorage.setItem("verification_email", email);
            sessionStorage.setItem("otp_flow", "email");

            setTimeout(() => navigate("/mfa"), 1200);
        } catch (err) {
            const apiError = err as { message?: string };
            setError(apiError.message || "Registration failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const image = theme === "dark" ? darkImage : lightImage;

    return (
        <div className={`register-layout ${theme}`}>
            {/* LEFT PANEL */}
            <div
              className="register-left"
              style={{
                backgroundImage: `url(${image})`,
              }}
            >
            </div>

            {/* RIGHT PANEL */}
            <div className="register-right">
                {/* Theme Toggle */}
                <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
                    {theme === "light" ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                    )}
                </button>

                <div className="form-card">
                    <div className="mobile-brand">
                        <div className="logo-box small">S</div>
                        <h2>SCuilONE</h2>
                    </div>

                    <div className="form-head">
                        <h1>Create your account</h1>
                        <p>Join your SCuilONE CRM workspace</p>
                    </div>

                    <form onSubmit={handleSubmit} className="reg-form">

                        {/* COMPANY DETAILS */}
                        <div className="form-section">
                            <h3 className="section-title">COMPANY DETAILS</h3>

                            <div className="form-grid">
                                <div className="input-group">
                                    <label htmlFor="company_name">Company Name</label>
                                    <div className="input-box">
                                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v8" /><path d="M20 22v-8a2 2 0 0 0-2-2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></svg>
                                        <input id="company_name" name="company_name" type="text" placeholder="Enter company name" value={formData.company_name} onChange={handleChange} required disabled={loading} />
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label htmlFor="industry">Industry</label>
                                    <div className="input-box">
                                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                                        <select id="industry" name="industry" value={formData.industry} onChange={handleChange} required disabled={loading}>
                                            <option value="" disabled>Select Industry</option>
                                            {industries.map((ind) => (
                                                <option key={ind} value={ind}>{ind}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label htmlFor="company_email">Company Email</label>
                                    <div className="input-box">
                                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                                        <input id="company_email" name="company_email" type="email" placeholder="Enter company email" value={formData.company_email} onChange={handleChange} required disabled={loading} />
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label htmlFor="phone">Phone Number</label>
                                    <div className="input-box">
                                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                                        <input id="phone" name="phone" type="tel" placeholder="Enter phone number" value={formData.phone} onChange={handleChange} required disabled={loading} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* OWNER DETAILS */}
                        <div className="form-section">
                            <h3 className="section-title">OWNER DETAILS</h3>

                            <div className="form-grid">
                                <div className="input-group">
                                    <label htmlFor="full_name">Full Name</label>
                                    <div className="input-box">
                                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                        <input id="full_name" name="full_name" type="text" placeholder="Enter full name" value={formData.full_name} onChange={handleChange} required disabled={loading} />
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label htmlFor="email">Email</label>
                                    <div className="input-box">
                                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                                        <input id="email" name="email" type="email" placeholder="Enter email" value={formData.email} onChange={handleChange} required disabled={loading} />
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label htmlFor="password">Password</label>
                                    <div className="input-box">
                                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                        <input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="Enter password" value={formData.password} onChange={handleChange} required disabled={loading} />
                                        <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                                            {showPassword ? (
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                                            ) : (
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label htmlFor="confirm_password">Confirm Password</label>
                                    <div className="input-box">
                                        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                        <input id="confirm_password" name="confirm_password" type={showConfirmPassword ? "text" : "password"} placeholder="Confirm password" value={formData.confirm_password} onChange={handleChange} required disabled={loading} />
                                        <button type="button" className="eye-btn" onClick={() => setShowConfirmPassword(!showConfirmPassword)} tabIndex={-1}>
                                            {showConfirmPassword ? (
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                                            ) : (
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {error && <div className="alert-box error">{error}</div>}
                        {message && <div className="alert-box success">{message}</div>}

                        <div className="form-actions">
                            <button type="submit" className="primary-btn" disabled={loading}>
                                {loading ? "Creating Account..." : "Create Account \u2192"}
                            </button>

                            <div className="signin-link">
                                <span>Already have an account?</span>
                                <button type="button" onClick={() => navigate("/login")}>Sign In</button>
                            </div>
                        </div>

                    </form>
                </div>
            </div>
        </div>
    );
}