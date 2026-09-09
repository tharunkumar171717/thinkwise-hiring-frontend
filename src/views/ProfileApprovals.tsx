import { useCallback, useEffect, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { Link } from "../lib/router";
import { api } from "../services/api";
import { fmtTs } from "../utils/dateUtils";

interface ProfileAccessRequest {
    id: string;
    requirement_id: string;
    candidate_id: string;
    requirement_name: string | null;
    candidate_name: string | null;
    owner_id: string;
    owner_name: string | null;
    requester_id: string;
    requester_name: string | null;
    message: string | null;
    status: "pending" | "approved" | "rejected" | "cancelled";
    // Not a decision: a record that a standing approval was used on another
    // requirement. The owner already approved this requester for this candidate.
    auto_granted?: boolean;
    created_at: string;
    decided_at: string | null;
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
    pending: { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" },
    approved: { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" },
    rejected: { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" },
    // Withdrawn by the requester before a decision.
    cancelled: { background: "var(--twd-line2)", color: "var(--twd-soft)", border: "1px solid var(--twd-line)" },
};

export default function ProfileApprovals() {
    useDocumentTitle("Profile Approvals");
    const [box, setBox] = useState<"incoming" | "outgoing">("incoming");
    const [rows, setRows] = useState<ProfileAccessRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [acting, setActing] = useState<Set<string>>(new Set());

    const fetchRows = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.get(`/profile-access-requests?box=${box}`);
            setRows(data || []);
        } catch (e: any) {
            setError(e?.detail || e?.message || "Failed to load requests");
        } finally {
            setLoading(false);
        }
    }, [box]);

    useEffect(() => { void fetchRows(); }, [fetchRows]);

    const decide = async (id: string, mode: "approve" | "reject") => {
        setActing(prev => new Set(prev).add(id));
        setError(null);
        try {
            await api.post(`/profile-access-requests/${id}/${mode}`, {});
            await fetchRows();
        } catch (e: any) {
            setError(e?.detail || e?.message || `Could not ${mode}`);
        } finally {
            setActing(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const Tab = ({ k, label }: { k: typeof box; label: string }) => (
        <button
            onClick={() => setBox(k)}
            className="twd-btn twd-btn-ghost twd-btn-sm"
            style={{
                background: box === k ? "var(--twd-red)" : "transparent",
                color: box === k ? "#fff" : "var(--twd-soft)",
                fontWeight: box === k ? 600 : 400,
                borderRadius: 999, padding: "4px 14px",
            }}
        >{label}</button>
    );

    return (
        <div className="twd-scope">
            <div className="twd-head twd-head--tight twd-rise" style={{ position: "relative", zIndex: 10, marginBottom: 12 }}>
                <div>
                    <h1 className="twd-title"><span className="twd-title--accent">Profile</span> Approvals</h1>
                    <p className="twd-sub">
                        {box === "incoming"
                            ? "Requests to submit or edit profiles you own."
                            : "Profiles you asked another recruiter to release to you."}
                    </p>
                </div>
                <div className="twd-head-actions">
                    <Tab k="incoming" label="Requests to me" />
                    <Tab k="outgoing" label="My requests" />
                </div>
            </div>

            {error && <div style={{ fontSize: 13, color: "var(--twd-red-text)" }}>{error}</div>}

            <div className="twd-table-wrap">
                <table className="twd-table" style={{ tableLayout: "fixed", width: "100%" }}>
                    <colgroup>
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "26%" }} />
                        <col style={{ width: "18%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "20%" }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th>Candidate</th>
                            <th>Requirement</th>
                            <th>{box === "incoming" ? "Requested by" : "Owner"}</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={5} style={{ padding: "1rem", fontSize: 13, color: "var(--twd-faint)" }}>Loading…</td></tr>
                        )}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={5} style={{ padding: "1rem", fontSize: 13, color: "var(--twd-faint)" }}>Nothing here yet.</td></tr>
                        )}
                        {!loading && rows.map(r => {
                            const busy = acting.has(r.id);
                            return (
                                <tr key={r.id}>
                                    <td style={{ fontWeight: 600 }}>{r.candidate_name || "-"}</td>
                                    <td>
                                        {r.requirement_id ? (
                                            <Link to={`/requirements/${r.requirement_id}`} style={{ color: "var(--twd-red)" }}>
                                                {r.requirement_name || "Requirement"}
                                            </Link>
                                        ) : (r.requirement_name || "-")}
                                    </td>
                                    <td>{box === "incoming" ? (r.requester_name || "-") : (r.owner_name || "-")}</td>
                                    <td>
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 3, ...STATUS_STYLE[r.status] }}>
                                            {r.status}
                                        </span>
                                        {r.auto_granted && (
                                            <span
                                                title="You had already approved this recruiter for this candidate, so they used them here without asking again."
                                                style={{ fontSize: 10, fontWeight: 600, marginLeft: 6, padding: "2px 6px", borderRadius: 3, background: "var(--twd-line2)", color: "var(--twd-soft)" }}
                                            >
                                                standing
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        {box === "incoming" && r.status === "pending" ? (
                                            <div style={{ display: "flex", gap: "0.4rem" }}>
                                                <button className="twd-btn twd-btn-primary twd-btn-sm" disabled={busy} onClick={() => decide(r.id, "approve")}>
                                                    {busy ? "…" : "Approve"}
                                                </button>
                                                <button
                                                    className="twd-btn twd-btn-ghost twd-btn-sm"
                                                    disabled={busy}
                                                    style={{ color: "var(--twd-red)", border: "1px solid var(--twd-red)" }}
                                                    onClick={() => decide(r.id, "reject")}
                                                >Reject</button>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: 12, color: "var(--twd-faint)" }}>
                                                {r.decided_at ? fmtTs(r.decided_at) : fmtTs(r.created_at)}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
