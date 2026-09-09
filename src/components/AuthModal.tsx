"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate } from "../lib/router";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "./PasswordInput";

export type AuthMode = "login" | "signup";

interface Props {
    mode: AuthMode;
    onClose: () => void;
    onSwitchMode: (mode: AuthMode) => void;
}

export default function AuthModal({ mode, onClose, onSwitchMode }: Props) {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    /* close on Escape + lock page scroll while open */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [onClose]);

    const switchMode = (next: AuthMode) => {
        setError("");
        setPassword("");
        setConfirm("");
        onSwitchMode(next);
    };

    const handleLogin = async (e: { preventDefault(): void }) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const res = await api.post("/auth/login", { email: email.trim().toLowerCase(), password });
            await login(res.access_token, res.refresh_token);
            navigate("/dashboard");
        } catch (err: any) {
            setError(err.detail || "Invalid email or password.");
        } finally {
            setLoading(false);
        }
    };

    const handleSignup = async (e: { preventDefault(): void }) => {
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
            const res = await api.post("/auth/signup", {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                password,
            });
            await login(res.access_token, res.refresh_token);
            navigate("/dashboard");
        } catch (err: any) {
            setError(err.detail || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="tw-auth tw-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={mode === "login" ? "Sign in" : "Create account"}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="tw-auth-card tw-modal-card">
                <button type="button" className="tw-modal-close" aria-label="Close" onClick={onClose}>
                    ×
                </button>

                {mode === "login" ? (
                    <>
                        <h2>Welcome back</h2>
                        <p className="tw-auth-sub">Sign in to your Thinkwise workspace.</p>

                        {error && <div className="tw-auth-error">{error}</div>}

                        <form className="tw-auth-form" onSubmit={handleLogin}>
                            <div className="form-group">
                                <label htmlFor="login-email">Work email</label>
                                <input
                                    id="login-email"
                                    type="email"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>

                            <PasswordInput
                                id="login-password"
                                label="Password"
                                value={password}
                                onChange={setPassword}
                                required
                                autoComplete="current-password"
                            />
                            <Link to="/forgot-password" className="tw-forgot-link">Forgot password?</Link>

                            <button type="submit" className="tw-btn tw-btn-primary tw-btn-block" disabled={loading}>
                                {loading ? "Signing in…" : "Sign in"}
                            </button>
                        </form>

                        <div className="tw-auth-alt">
                            Don't have an account?{" "}
                            <button type="button" className="tw-modal-link" onClick={() => switchMode("signup")}>
                                Sign up
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h2>Create your account</h2>
                        <p className="tw-auth-sub">Your email must be approved by an admin first.</p>

                        {error && <div className="tw-auth-error">{error}</div>}

                        <form className="tw-auth-form" onSubmit={handleSignup}>
                            <div className="form-group">
                                <label htmlFor="signup-name">Full name</label>
                                <input
                                    id="signup-name"
                                    type="text"
                                    placeholder="Jane Doe"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="signup-email">Work email</label>
                                <input
                                    id="signup-email"
                                    type="email"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>

                            <PasswordInput
                                id="signup-password"
                                label="Password"
                                value={password}
                                onChange={setPassword}
                                placeholder="Min. 8 characters"
                                showStrength
                                required
                                autoComplete="new-password"
                            />

                            <PasswordInput
                                id="signup-confirm"
                                label="Confirm password"
                                value={confirm}
                                onChange={setConfirm}
                                placeholder="Repeat password"
                                required
                                autoComplete="new-password"
                            />

                            <button type="submit" className="tw-btn tw-btn-primary tw-btn-block" disabled={loading}>
                                {loading ? "Creating account…" : "Create account"}
                            </button>
                        </form>

                        <div className="tw-auth-alt">
                            Already have an account?{" "}
                            <button type="button" className="tw-modal-link" onClick={() => switchMode("login")}>
                                Sign in
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
