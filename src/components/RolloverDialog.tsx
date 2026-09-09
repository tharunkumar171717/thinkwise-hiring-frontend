import { useEffect, useMemo, useState } from "react";
import { api, requirementActivityApi } from "../services/api";
import Icon from "./Icon";

interface Recruiter { id: string; name: string; email: string; role: string }

interface RolloverDialogProps {
    open: boolean;
    onClose: () => void;
    requirementId: string;
    requirementName?: string | null;
    currentAssigned: string[];
    onRolledOver: (newAssignedIds: string[]) => void;
}

/** Roll a requirement over to a different recruiter (reassign in place + flag).
 * Picks the new recruiter(s), captures a reason, and posts to /rollover. */
export default function RolloverDialog({
    open, onClose, requirementId, requirementName, currentAssigned, onRolledOver,
}: RolloverDialogProps) {
    const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [reason, setReason] = useState("");
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setSelected(new Set());
        setReason("");
        setQuery("");
        setError(null);
        setLoading(true);
        api.get("/users/recruiters")
            .then((rows: Recruiter[]) => setRecruiters(rows || []))
            .catch((e: any) => setError(e?.detail || e?.message || "Failed to load recruiters"))
            .finally(() => setLoading(false));
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return recruiters;
        return recruiters.filter(r => (r.name || "").toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q));
    }, [recruiters, query]);

    const toggle = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const handleSave = async () => {
        if (selected.size === 0) { setError("Pick at least one recruiter to roll over to."); return; }
        setSaving(true);
        setError(null);
        try {
            const res = await requirementActivityApi.rollover(requirementId, {
                new_recruiter_ids: Array.from(selected),
                reason: reason.trim() || undefined,
            });
            onRolledOver(res?.assigned_recruiters || Array.from(selected));
            onClose();
        } catch (e: any) {
            setError(e?.detail || e?.message || "Rollover failed");
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 520, width: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
                <div className="modal-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Roll Over Requirement</span>
                    <button className="btn btn-ghost btn-sm" onClick={onClose} title="Close" style={{ padding: "2px 8px" }}><Icon name="x" size={14} /></button>
                </div>
                <p className="text-sm text-muted" style={{ margin: "0.25rem 0 0.75rem" }}>
                    Reassign <strong>{requirementName || "this requirement"}</strong> to a different recruiter. It stays the same requirement (SLA continues) and the change is recorded in the history.
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "0.4rem 0.6rem", background: "var(--bg-secondary)", marginBottom: "0.5rem" }}>
                    <Icon name="search" size={14} style={{ color: "var(--text-secondary)" }} />
                    <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search recruiters" style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--text-primary)" }} />
                </div>

                <div style={{ flex: 1, overflow: "auto", border: "1px solid var(--border-subtle)", borderRadius: 6, minHeight: 120 }}>
                    {loading && <div style={{ padding: "1rem", fontSize: 13, color: "var(--text-secondary)" }}>Loading recruiters…</div>}
                    {!loading && filtered.length === 0 && <div style={{ padding: "1rem", fontSize: 13, color: "var(--text-secondary)" }}>No recruiters match.</div>}
                    {filtered.map(r => {
                        const isSelected = selected.has(r.id);
                        const isCurrent = currentAssigned.includes(r.id);
                        return (
                            <button key={r.id} onClick={() => toggle(r.id)} style={{
                                width: "100%", display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.85rem",
                                border: "none", background: "transparent", textAlign: "left", cursor: "pointer", borderBottom: "1px solid var(--border-subtle)",
                            }}>
                                <div style={{
                                    width: 18, height: 18, borderRadius: 4,
                                    border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border-subtle)"}`,
                                    background: isSelected ? "var(--accent)" : "transparent",
                                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                }}>{isSelected && <Icon name="check" size={12} style={{ color: "#fff" }} />}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                                        {r.name}{isCurrent && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>· current</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{r.email}{r.role === "ADMIN" && " · Admin"}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="form-group" style={{ marginTop: "0.75rem" }}>
                    <label>Reason <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span></label>
                    <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being rolled over?" rows={3}
                        style={{ padding: "0.6rem 0.85rem", background: "var(--bg-input)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13, resize: "vertical", width: "100%", fontFamily: "var(--font-family)" }} />
                </div>

                {error && <div className="form-error" style={{ marginTop: "0.5rem" }}>{error}</div>}

                <div className="modal-actions" style={{ marginTop: "0.75rem" }}>
                    <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || selected.size === 0}>
                        {saving ? "Rolling over…" : "Roll Over"}
                    </button>
                </div>
            </div>
        </div>
    );
}
