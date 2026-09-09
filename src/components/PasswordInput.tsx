import { useState } from "react";

interface StrengthResult {
    level: number;   // 0-4
    label: string;
    color: string;
}

function getStrength(password: string): StrengthResult | null {
    if (!password) return null;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);
    const categories = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;

    if (password.length < 8) return { level: 0, label: "Too short", color: "#ef4444" };
    if (categories === 1) return { level: 1, label: "Weak", color: "#f97316" };
    if (categories === 2) return { level: 2, label: "Fair", color: "#eab308" };
    if (categories === 3) return { level: 3, label: "Good", color: "#22c55e" };
    return { level: 4, label: "Strong", color: "#16a34a" };
}

interface Props {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    showStrength?: boolean;
    required?: boolean;
    autoComplete?: string;
}

export default function PasswordInput({
    id, label, value, onChange, placeholder = "••••••••",
    showStrength = false, required = false, autoComplete,
}: Props) {
    const [visible, setVisible] = useState(false);
    const strength = showStrength ? getStrength(value) : null;

    return (
        <div className="form-group">
            <label htmlFor={id}>{label}</label>
            <div style={{ position: "relative" }}>
                <input
                    id={id}
                    type={visible ? "text" : "password"}
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    required={required}
                    autoComplete={autoComplete}
                    style={{ paddingRight: "2.5rem" }}
                />
                <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    style={{
                        position: "absolute", right: "0.75rem", top: "50%",
                        transform: "translateY(-50%)", background: "none",
                        border: "none", cursor: "pointer", padding: 0,
                        color: "var(--text-secondary)", lineHeight: 1,
                    }}
                    tabIndex={-1}
                    aria-label={visible ? "Hide password" : "Show password"}
                >
                    {visible ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    )}
                </button>
            </div>

            {showStrength && value && strength && (
                <div style={{ marginTop: "0.4rem" }}>
                    <div style={{ display: "flex", gap: "3px", marginBottom: "0.25rem" }}>
                        {[1, 2, 3, 4].map((n) => (
                            <div key={n} style={{
                                flex: 1, height: "3px", borderRadius: "2px",
                                background: n <= strength.level ? strength.color : "var(--border-subtle)",
                                transition: "background 0.2s",
                            }} />
                        ))}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: strength.color, fontWeight: 500 }}>
                        {strength.label}
                    </span>
                </div>
            )}
        </div>
    );
}
