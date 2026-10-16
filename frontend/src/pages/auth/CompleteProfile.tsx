import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./CompleteProfile.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function CompleteProfile() {
  const navigate = useNavigate();

  const token = sessionStorage.getItem("onboarding_token");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("Your onboarding session has expired. Please accept your invitation again.");
      return;
    }

    try {
      setLoading(true);

      await axios.post(
        `${API_URL}/api/v1/auth/complete-profile`,
        {
          full_name: fullName.trim(),
          phone: phone.trim(),
          job_title: jobTitle.trim(),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      sessionStorage.removeItem("onboarding_token");
      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("tenant");

      navigate("/login", {
        replace: true,
        state: {
          message: "Profile completed successfully. Please log in.",
        },
      });
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Unable to complete your profile. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="complete-profile-page">
      <form className="complete-profile-card" onSubmit={handleSubmit}>
        <div className="complete-profile-brand">SCuilONE</div>

        <h1>Complete Your Profile</h1>

        <p className="complete-profile-description">
          Welcome aboard! Enter your details to finish setting up your account.
        </p>

        {error && <div className="profile-error">{error}</div>}

        <label htmlFor="fullName">Full Name</label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Enter your full name"
          minLength={2}
          maxLength={150}
          autoComplete="name"
          required
        />

        <label htmlFor="phone">Phone Number</label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="Enter your phone number"
          minLength={7}
          maxLength={20}
          autoComplete="tel"
          required
        />

        <label htmlFor="jobTitle">Job Title</label>
        <input
          id="jobTitle"
          type="text"
          value={jobTitle}
          onChange={(event) => setJobTitle(event.target.value)}
          placeholder="e.g. Sales Manager"
          minLength={2}
          maxLength={100}
          autoComplete="organization-title"
          required
        />

        <button type="submit" disabled={loading || !token}>
          {loading ? "Saving Profile..." : "Complete Profile"}
        </button>

        <div className="profile-step-note">
          Step 2 of 2 · Account setup
        </div>
      </form>
    </div>
  );
}
