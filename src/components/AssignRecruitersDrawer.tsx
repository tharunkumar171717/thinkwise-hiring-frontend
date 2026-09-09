import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import Icon from "./Icon";
import "../styles/dashboard.css";

interface Recruiter {
    id: string;
    name: string;
    email: string;
    role: string;
    is_active?: boolean;
}

interface AssignRecruitersDrawerProps {
    open: boolean;
    onClose: () => void;
    jdId: string;
    requirementName?: string | null;
    initialAssigned: string[];
    onSaved: (newAssignedIds: string[]) => void;
}

export default function AssignRecruitersDrawer({
    open, onClose, jdId, requirementName, initialAssigned, onSaved,
}: AssignRecruitersDrawerProps) {
    const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set(initialAssigned));
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        setError(null);
        api.get("/users/recruiters")
            .then((rows: Recruiter[]) => setRecruiters(rows || []))
            .catch((e: any) => setError(e?.detail || e?.message || "Failed to load recruiters"))
            .finally(() => setLoading(false));
    }, [open]);

    useEffect(() => {
        if (open) setSelected(new Set(initialAssigned));
    }, [open, initialAssigned]);

    // Lock the page scroll while the drawer is open (restored on close).
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return recruiters;
        return recruiters.filter(r =>
            (r.name || "").toLowerCase().includes(q) ||
            (r.email || "").toLowerCase().includes(q)
        );
    }, [recruiters, query]);

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const recruiter_ids = Array.from(selected);
            const result = await api.post(`/requirements/${jdId}/assign`, { recruiter_ids });
            onSaved(result?.assigned_recruiters || recruiter_ids);
            onClose();
        } catch (e: any) {
            setError(e?.detail || e?.message || "Save failed");
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    const initialsOf = (name: string) =>
        (name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";

    return (
        <div className="twd-vars" style={{ display: "contents" }}>
        <div
            onClick={onClose}
            style={{ position: "fixed", inset: 0, zIndex: 1099, background: "rgba(28, 18, 16, 0.32)", backdropFilter: "blur(2px)" }}
        />
        <aside
            role="dialog"
            aria-modal="true"
            aria-label="Assign recruiters"
            className="twd-vars"
            style={{
                position: "fixed", top: 0, right: 0, bottom: 0,
                width: "min(92vw, 460px)",
                background: "var(--twd-paper)",
                borderLeft: "1px solid var(--twd-line)",
                boxShadow: "-14px 0 40px rgba(28, 18, 16, 0.16)",
                zIndex: 1100,
                display: "flex", flexDirection: "column",
                color: "var(--twd-ink)",
            }}
        >
            <header style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--twd-line)", display: "flex", alignItems: "flex-start", gap: "0.75rem", background: "var(--twd-surface)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, lineHeight: 1.15, letterSpacing: "-0.01em" }}>
                        Assign <span style={{ color: "var(--twd-red-text)", fontStyle: "italic" }}>recruiters</span>
                    </div>
                    {requirementName && (
                        <div style={{ fontSize: 12.5, color: "var(--twd-faint)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {requirementName}
                        </div>
                    )}
                </div>
                <button type="button" className="twd-close" onClick={onClose} title="Close" aria-label="Close">
                    <Icon name="x" size={15} />
                </button>
            </header>

            <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid var(--twd-line)" }}>
                <div style={{ position: "relative" }}>
                    <Icon name="search" size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--twd-faint)", pointerEvents: "none" }} />
                    <input
                        type="text"
                        className="twd-input"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search by name or email"
                        style={{ width: "100%", paddingLeft: 34 }}
                    />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                    <span className={`twd-pill ${selected.size > 0 ? "twd-pill--red" : "twd-pill--neutral"}`}>
                        {selected.size} selected
                    </span>
                    {!loading && (
                        <span style={{ fontSize: 12, color: "var(--twd-faint)" }}>
                            {filtered.length} recruiter{filtered.length === 1 ? "" : "s"}
                        </span>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, overflow: "auto", overscrollBehavior: "contain", padding: "10px 12px" }}>
                {loading && <div style={{ padding: "1rem 0.5rem", fontSize: 13, color: "var(--twd-faint)" }}>Loading recruiters...</div>}
                {error && (
                    <div style={{ margin: "6px 4px", padding: "10px 12px", borderRadius: 10, background: "var(--twd-red-bg)", border: "1px solid color-mix(in srgb, var(--twd-red) 35%, transparent)", color: "var(--twd-red-text)", fontSize: 13 }}>
                        {error}
                    </div>
                )}
                {!loading && filtered.length === 0 && !error && (
                    <div style={{ padding: "2rem 0.5rem", fontSize: 13, color: "var(--twd-faint)", textAlign: "center" }}>No recruiters match.</div>
                )}
                {filtered.map(r => {
                    const isSelected = selected.has(r.id);
                    return (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() => toggle(r.id)}
                            aria-pressed={isSelected}
                            style={{
                                width: "100%", display: "flex", alignItems: "center", gap: "0.75rem",
                                padding: "10px 12px", marginBottom: 6,
                                border: "1px solid var(--twd-line2)",
                                borderRadius: 12,
                                background: "var(--twd-surface)",
                                textAlign: "left", cursor: "pointer",
                                transition: "background 0.15s ease, border-color 0.15s ease",
                            }}
                        >
                            <div style={{
                                width: 18, height: 18, borderRadius: 5,
                                border: `1.5px solid ${isSelected ? "var(--twd-red)" : "var(--twd-line)"}`,
                                background: isSelected ? "var(--twd-red)" : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                transition: "background 0.15s ease, border-color 0.15s ease",
                            }}>
                                {isSelected && <Icon name="check" size={12} style={{ color: "#fff" }} />}
                            </div>
                            <span className="twd-avatar" aria-hidden="true" style={{ width: 32, height: 32, fontSize: 11.5, flexShrink: 0 }}>
                                {initialsOf(r.name || r.email || "?")}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--twd-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                                <div style={{ fontSize: 11.5, color: "var(--twd-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}</div>
                            </div>
                            {r.role === "ADMIN" && <span className="twd-pill twd-pill--neutral" style={{ flexShrink: 0 }}>Admin</span>}
                        </button>
                    );
                })}
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--twd-line)", background: "var(--twd-surface)", display: "flex", gap: "0.5rem", justifyContent: "flex-end", alignItems: "center" }}>
                {error && <div style={{ fontSize: 12, color: "var(--twd-red-text)", marginRight: "auto" }}>{error}</div>}
                <button className="twd-btn twd-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
                <button className="twd-btn twd-btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Assignments"}
                </button>
            </div>
        </aside>
        </div>
    );
}
