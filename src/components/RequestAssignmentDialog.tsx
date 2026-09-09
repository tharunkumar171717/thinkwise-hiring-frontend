import { useState } from "react";
import { api } from "../services/api";
import Icon from "./Icon";

interface RequestAssignmentDialogProps {
    open: boolean;
    onClose: () => void;
    jdId: string;
    requirementName?: string | null;
    onSubmitted: () => void;
}

export default function RequestAssignmentDialog({
    open, onClose, jdId, requirementName, onSubmitted,
}: RequestAssignmentDialogProps) {
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!open) return null;

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await api.post(`/requirements/${jdId}/assignment-requests`, {
                message: message.trim() || undefined,
            });
            onSubmitted();
            setMessage("");
            onClose();
        } catch (e: any) {
            setError(e?.detail || e?.message || "Failed to send request");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: "var(--bg-primary)", borderRadius: 8,
                    width: "min(420px, 92vw)", padding: "1.25rem 1.25rem 1rem",
                    border: "1px solid var(--border-subtle)",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
                    <Icon name="send" size={16} />
                    <div style={{ fontWeight: 600, fontSize: 15 }}>Request Assignment</div>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: "0.85rem" }}>
                    Ask an admin to assign you to <strong style={{ color: "var(--text-primary)" }}>{requirementName || "this requirement"}</strong>.
                </div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.3rem", display: "block" }}>
                    Message (optional)
                </label>
                <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={3}
                    placeholder="Why you'd like to work on this requirement..."
                    style={{
                        width: "100%", padding: "0.5rem 0.65rem", fontSize: 13,
                        border: "1px solid var(--border-subtle)", borderRadius: 4,
                        background: "var(--bg-input, var(--bg-secondary))", color: "var(--text-primary)",
                        fontFamily: "inherit", resize: "vertical",
                    }}
                />
                {error && <div style={{ fontSize: 12, color: "#dc2626", marginTop: "0.5rem" }}>{error}</div>}
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                    <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? "Sending..." : "Send Request"}
                    </button>
                </div>
            </div>
        </div>
    );
}
