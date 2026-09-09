import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "../lib/router";
import { api } from "../services/api";
import PasswordInput from "../components/PasswordInput";
import ThemeToggle from "../components/ThemeToggle";
import logo from "../assets/thinkwise_logo_transparent.png";
import "../styles/landing.css";

export default function ResetPassword() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token") ?? "";
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleReset = async (e: { preventDefault(): void }) => {
        e.preventDefault();
        setError("");
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        if (password !== confirm) {
            setError("Passwords do not match");
            return;
        }
        setLoading(true);
        try {
            await api.post("/auth/reset-password", { token, password });
            navigate("/?login=1", { state: { message: "Password updated. Please sign in." } });
        } catch (err: any) {
            setError(err.detail || "Failed to reset password. The link may have expired.");
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="tw-scope tw-auth">
                <div aria-hidden="true" className="tw-hero-glow" />
                <div aria-hidden="true" className="tw-hero-grid" />
                <div className="tw-auth-main">
                    <div className="tw-auth-card">
                        <h2>Invalid link</h2>
                        <p className="tw-auth-sub">
                            This reset link is missing a token. Ask your admin to generate a new one.
                        </p>
                        <div className="tw-auth-alt">
                            <Link to="/?login=1">Back to sign in</Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="tw-scope tw-auth">
            <div aria-hidden="true" className="tw-hero-glow" />
            <div aria-hidden="true" className="tw-hero-grid" />

            <div className="tw-auth-bar">
                <Link to="/" className="tw-logo">
                    <img src={logo.src} alt="Thinkwise" />
                </Link>
                <ThemeToggle />
            </div>

            <div className="tw-auth-main">
                <div className="tw-auth-card">
                    <h2>Set new password</h2>
                    <p className="tw-auth-sub">Choose a strong password for your account.</p>

                    {error && <div className="tw-auth-error">{error}</div>}

                    <form className="tw-auth-form" onSubmit={handleReset}>
                        <PasswordInput
                            id="password"
                            label="New password"
                            value={password}
                            onChange={setPassword}
                            placeholder="Min. 8 characters"
                            showStrength
                            required
                            autoComplete="new-password"
                        />
                        <PasswordInput
                            id="confirm"
                            label="Confirm password"
                            value={confirm}
                            onChange={setConfirm}
                            placeholder="Repeat password"
                            required
                            autoComplete="new-password"
                        />
                        <button type="submit" className="tw-btn tw-btn-primary tw-btn-block" disabled={loading}>
                            {loading ? "Updating…" : "Update password"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
