import { useState } from "react";
import { Link } from "../lib/router";
import { api } from "../services/api";
import ThemeToggle from "../components/ThemeToggle";
import logo from "../assets/thinkwise_logo_transparent.png";
import "../styles/landing.css";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: { preventDefault(): void }) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
            setSent(true);
        } catch (err: any) {
            setError(err.detail || "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

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
                    {!sent ? (
                        <>
                            <h2>Forgot password?</h2>
                            <p className="tw-auth-sub">
                                Enter your email and your admin will share a reset link with you.
                            </p>

                            {error && <div className="tw-auth-error">{error}</div>}

                            <form className="tw-auth-form" onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label htmlFor="email">Work email</label>
                                    <input
                                        id="email"
                                        type="email"
                                        placeholder="you@company.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                <button type="submit" className="tw-btn tw-btn-primary tw-btn-block" disabled={loading}>
                                    {loading ? "Submitting…" : "Request reset"}
                                </button>
                            </form>

                            <div className="tw-auth-alt">
                                <Link to="/?login=1">Back to sign in</Link>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="tw-auth-done">
                                <div className="tw-auth-done-icon">✓</div>
                                <h3>Request received</h3>
                                <p>
                                    Your admin has been notified. They will generate a reset link and
                                    share it with you directly.
                                </p>
                            </div>
                            <div className="tw-auth-alt">
                                <Link to="/?login=1">Back to sign in</Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
