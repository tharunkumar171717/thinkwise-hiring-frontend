import { useCallback, useEffect, useMemo, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { Link } from "../lib/router";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Icon from "../components/Icon";
import { fmtTs } from "../utils/dateUtils";
import "../styles/dashboard.css";

interface AssignmentRequest {
    id: string;
    requirement_id: string;
    requirement_name: string;
    recruiter_id: string;
    recruiter_name: string | null;
    status: "pending" | "approved" | "rejected";
    message: string | null;
    decision_note: string | null;
    decided_by: string | null;
    decided_at: string | null;
    created_at: string;
}

const PAGE_SIZE = 10;

function pageBtnStyle(disabled: boolean): React.CSSProperties {
    return {
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: 8, border: "1px solid var(--twd-line2)",
        background: disabled ? "var(--twd-surface2)" : "var(--twd-surface)", cursor: disabled ? "default" : "pointer",
        color: disabled ? "var(--twd-faint)" : "var(--twd-red-text)",
        fontSize: 16, lineHeight: 1, opacity: disabled ? 0.5 : 1, userSelect: "none",
    };
}

function Pagination({ page, total, onPage, top, actions }: { page: number; total: number; onPage: (p: number) => void; top?: boolean; actions?: React.ReactNode }) {
    if (total <= PAGE_SIZE) return null;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const clamped = Math.min(page, totalPages);
    const rangeStart = total === 0 ? 0 : (clamped - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(clamped * PAGE_SIZE, total);
    const border = top ? { borderBottom: "1px solid var(--twd-line2)" } : { borderTop: "1px solid var(--twd-line2)" };
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.65rem 1rem", ...border, gap: 12, flexWrap: "wrap", background: "var(--twd-surface2)" }}>
            <span style={{ fontSize: 12, color: "var(--twd-faint)", whiteSpace: "nowrap" }}>Showing {rangeStart}–{rangeEnd} of {total}</span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                {actions}
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <button style={pageBtnStyle(clamped <= 1)} onClick={() => clamped > 1 && onPage(1)} title="First page">«</button>
                    <button style={pageBtnStyle(clamped <= 1)} onClick={() => clamped > 1 && onPage(clamped - 1)} title="Previous page">‹</button>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--twd-soft)", minWidth: 52, textAlign: "center", whiteSpace: "nowrap" }}>{clamped} / {totalPages}</span>
                    <button style={pageBtnStyle(clamped >= totalPages)} onClick={() => clamped < totalPages && onPage(clamped + 1)} title="Next page">›</button>
                    <button style={pageBtnStyle(clamped >= totalPages)} onClick={() => clamped < totalPages && onPage(totalPages)} title="Last page">»</button>
                </div>
            </div>
        </div>
    );
}

export default function AssignmentRequests() {
    useDocumentTitle("Assignment Requests");
    const { isAdmin, user } = useAuth();
    const [requests, setRequests] = useState<AssignmentRequest[]>([]);
    const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "all">("all");
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [acting, setActing] = useState<Set<string>>(new Set());
    const [noteFor, setNoteFor] = useState<{ id: string; mode: "approve" | "reject" } | null>(null);
    const [noteText, setNoteText] = useState("");

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (tab !== "all") params.set("status", tab);
            const rows = await api.get(`/assignment-requests${params.toString() ? `?${params.toString()}` : ""}`);
            setRequests(rows || []);
        } catch (e: any) {
            setError(e?.detail || e?.message || "Failed to load requests");
        } finally {
            setLoading(false);
        }
    }, [tab]);

    useEffect(() => { void fetchRequests(); }, [fetchRequests]);

    const decide = async (id: string, mode: "approve" | "reject", note?: string) => {
        setActing(prev => new Set(prev).add(id));
        setError(null);
        try {
            await api.post(`/assignment-requests/${id}/${mode}`, { note: note?.trim() || undefined });
            await fetchRequests();
        } catch (e: any) {
            setError(e?.detail || e?.message || `Could not ${mode}`);
        } finally {
            setActing(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            setNoteFor(null);
            setNoteText("");
        }
    };

    const filtered = useMemo(() => requests, [requests]);
    const totalPages = Math.ceil(filtered.length / 10);
    const paginated = useMemo(() => filtered.slice((page - 1) * 10, page * 10), [filtered, page]);

    useEffect(() => {
        setPage(1);
    }, [tab]);

    const STATUS_PILL: Record<AssignmentRequest["status"], string> = {
        approved: "twd-pill--green",
        rejected: "twd-pill--red",
        pending: "twd-pill--amber",
    };

    return (
        <div className="twd-scope">
            <div className="twd-head twd-head--tight twd-rise">
                <div>
                    <h1 className="twd-title"><span className="twd-title--accent">Assignment</span> Requests</h1>
                    <p className="twd-sub">
                        {isAdmin ? "Approve or reject recruiter requests to be assigned to requirements." : "Your assignment requests and their decisions."}
                    </p>
                </div>
                <div className="twd-head-actions">
                    <div className="twd-tabs" role="tablist" aria-label="Request status">
                        {([["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]] as const).map(([k, label]) => (
                            <button
                                key={k}
                                role="tab"
                                aria-selected={tab === k}
                                className="twd-tab"
                                data-active={tab === k}
                                onClick={() => setTab(k)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {error && (
                <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "var(--twd-red-bg)", border: "1px solid color-mix(in srgb, var(--twd-red) 35%, transparent)", color: "var(--twd-red-text)", fontSize: 13 }}>
                    {error}
                </div>
            )}

            <div className="twd-table-wrap twd-rise" style={{ animationDelay: "0.05s" }}>
                {!loading && <Pagination page={page} total={filtered.length} onPage={setPage} top />}
                <div className="twd-table-scroll">
                    <table className="twd-table" style={{ tableLayout: "fixed", width: "100%", minWidth: 760 }}>
                        <colgroup>
                            {isAdmin && <col style={{ width: "18%" }} />}
                            <col style={{ width: "26%" }} />
                            <col style={{ width: "28%" }} />
                            <col style={{ width: "12%" }} />
                            <col style={{ width: "16%" }} />
                            <col style={{ width: isAdmin ? "15%" : "15%" }} />
                        </colgroup>
                        <thead>
                            <tr>
                                {isAdmin && <th>Recruiter</th>}
                                <th>Requirement</th>
                                <th>Message / Decision</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={isAdmin ? 6 : 5} className="twd-cell-muted" style={{ padding: "1rem" }}>Loading…</td>
                                </tr>
                            )}
                            {!loading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={isAdmin ? 6 : 5}>
                                        <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--twd-faint)", fontSize: 13.5 }}>
                                            <Icon name="info" size={20} style={{ marginBottom: 6, opacity: 0.5 }} />
                                            <div>No {tab !== "all" ? tab : ""} assignment requests.</div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loading && paginated.map(r => {
                                const isPending = r.status === "pending";
                                const isMine = r.recruiter_id === user?.id;
                                return (
                                    <tr key={r.id}>
                                        {isAdmin && (
                                            <td style={{ wordBreak: "break-word" }}>
                                                <div style={{ fontWeight: 600 }}>{r.recruiter_name || r.recruiter_id}</div>
                                            </td>
                                        )}
                                        <td>
                                            <Link to={`/requirements/${r.requirement_id}`} style={{ color: "var(--twd-ink)", fontWeight: 600 }}>
                                                {r.requirement_name || r.requirement_id}
                                            </Link>
                                        </td>
                                        <td className="twd-cell-soft" style={{ fontSize: 13 }}>
                                            {r.message && <div>{r.message}</div>}
                                            {r.decision_note && <div style={{ fontStyle: "italic", marginTop: 2, color: "var(--twd-faint)" }}>{r.decision_note}</div>}
                                            {!r.message && !r.decision_note && <span style={{ color: "var(--twd-faint)" }}>-</span>}
                                        </td>
                                        <td>
                                            <span className={`twd-pill ${STATUS_PILL[r.status]}`} style={{ textTransform: "capitalize" }}>{r.status}</span>
                                        </td>
                                        <td className="twd-cell-muted">
                                            {fmtTs(r.created_at)}
                                        </td>
                                        <td>
                                            {isAdmin && isPending && (
                                                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                                                    <button
                                                        className="twd-icon-btn twd-icon-btn--primary"
                                                        style={{ width: 30, minHeight: 30 }}
                                                        onClick={() => decide(r.id, "approve")}
                                                        disabled={acting.has(r.id)}
                                                        title="Approve"
                                                        aria-label="Approve"
                                                    ><Icon name="check" size={13} /></button>
                                                    <button
                                                        className="twd-icon-btn twd-icon-btn--danger"
                                                        style={{ width: 30, minHeight: 30 }}
                                                        onClick={() => { setNoteFor({ id: r.id, mode: "reject" }); setNoteText(""); }}
                                                        disabled={acting.has(r.id)}
                                                        title="Reject"
                                                        aria-label="Reject"
                                                    ><Icon name="x" size={13} /></button>
                                                </div>
                                            )}
                                            {!isAdmin && isMine && isPending && (
                                                <span style={{ fontSize: 12.5, color: "var(--twd-faint)" }}>Awaiting</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {noteFor && (
                <div
                    className="twd-vars twd-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label={noteFor.mode === "reject" ? "Reject request" : "Approve request"}
                    onClick={() => setNoteFor(null)}
                >
                    <div className="twd-modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
                        <div className="twd-modal-head">
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h2 className="twd-modal-title" style={{ marginTop: 0 }}>
                                    {noteFor.mode === "reject" ? "Reject request" : "Approve request"}
                                </h2>
                            </div>
                            <button type="button" className="twd-close" onClick={() => setNoteFor(null)} aria-label="Close">
                                <Icon name="x" size={15} />
                            </button>
                        </div>
                        <div className="twd-modal-body">
                            <div>
                                <label className="twd-field-label">Note (optional)</label>
                                <textarea
                                    value={noteText}
                                    onChange={e => setNoteText(e.target.value)}
                                    rows={3}
                                    placeholder={noteFor.mode === "reject" ? "Why this can't be approved..." : "Optional note..."}
                                    className="twd-input"
                                    style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                                />
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                                <button className="twd-btn twd-btn-ghost" onClick={() => setNoteFor(null)}>Cancel</button>
                                <button
                                    className="twd-btn twd-btn-primary"
                                    onClick={() => decide(noteFor.id, noteFor.mode, noteText)}
                                    disabled={acting.has(noteFor.id)}
                                >{noteFor.mode === "reject" ? "Reject" : "Approve"}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
