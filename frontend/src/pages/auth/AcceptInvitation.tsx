import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import "./AcceptInvitation.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("Invitation token is missing. Please use your invitation email.");
      return;
    }

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const response = await axios.post(
        `${API_URL}/api/v1/auth/accept-invitation`,
        {
          invitation_token: token,
          password,
          confirm_password: confirmPassword,
        }
      );

      if (!response.data.access_token) {
        throw new Error("The server did not return an onboarding token.");
      }

      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("tenant");

      sessionStorage.setItem(
        "onboarding_token",
        response.data.access_token
      );

      navigate("/complete-profile", { replace: true });
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          err.message ||
          "Unable to accept invitation. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="accept-invitation-page">
      <form className="accept-invitation-card" onSubmit={handleSubmit}>
        <h1>Welcome to SCuilONE</h1>
        <p>Create your password to continue setting up your account.</p>

        {!token && (
          <div className="invitation-error">
            Invitation token is missing. Please open the link from your email.
          </div>
        )}

        {error && <div className="invitation-error">{error}</div>}

        <label htmlFor="password">New Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter new password"
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
        />

        <label htmlFor="confirmPassword">Confirm Password</label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirm new password"
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
        />

        <button type="submit" disabled={loading || !token}>
          {loading ? "Setting Password..." : "Accept Invitation"}
        </button>
      </form>
    </div>
  );
}
