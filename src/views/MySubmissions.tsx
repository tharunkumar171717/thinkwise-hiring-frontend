import { useState, useEffect } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { fmtDate, fmtTs } from "../utils/dateUtils";
import { APP_STATUSES } from "../utils/statusUtils";
import { analyticsApi } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import Icon from "../components/Icon";
import Pager from "../components/Pager";
import "../styles/pages.css";
import "../styles/dashboard.css";

function dash(v: any) { return v == null || v === "" ? "-" : v; }

function npColor(notice?: string | null): string {
    if (!notice) return "var(--twd-soft)";
    const l = notice.toLowerCase();
    if (l.includes("immediate") || l.includes("serving") || l === "0") return "var(--twd-green)";
    const n = parseInt(l);
    if (!isNaN(n)) { if (n <= 15) return "var(--twd-green)"; if (n <= 60) return "var(--twd-amber)"; return "var(--twd-red-text)"; }
    return "var(--twd-soft)";
}

function SubmissionModal({ sub, onClose }: { sub: any; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const Field = ({ label, value }: { label: string; value?: any }) => (
        <div>
            <div className="twd-field-label" style={{ marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45 }}>
                {value ?? <span style={{ color: "var(--twd-faint)", fontWeight: 400 }}>-</span>}
            </div>
        </div>
    );

    return (
        <div
            className="twd-vars twd-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={sub.candidate_name || "Submission details"}
            onClick={onClose}
        >
            <div className="twd-modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
                <div className="twd-modal-head">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 className="twd-modal-title" style={{ marginTop: 0 }}>{sub.candidate_name || "-"}</h2>
                        <div style={{ fontSize: 12.5, color: "var(--twd-soft)", marginTop: 6, display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                            <StatusBadge status={sub.offer_status || sub.dynamic_status || sub.status} />
                            <span style={{ color: "var(--twd-faint)" }}>· {fmtTs(sub.sent_at)}</span>
                            {sub.requirement_name && <span style={{ color: "var(--twd-faint)" }}>· {sub.requirement_name}</span>}
                            {sub.company_name && <span style={{ color: "var(--twd-faint)" }}>· {sub.company_name}</span>}
                        </div>
                    </div>
                    <button type="button" className="twd-close" onClick={onClose} aria-label="Close" title="Close (Esc)">
                        <Icon name="x" size={15} />
                    </button>
                </div>

                <div className="twd-modal-body">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.9rem 1.5rem" }}>
                        <Field label="Current Role" value={sub.current_role} />
                        <Field label="Current Company" value={sub.current_company} />
                        <Field label="Current CTC" value={sub.current_ctc != null ? `${sub.current_ctc} LPA` : undefined} />
                        <Field label="Expected CTC" value={sub.expected_ctc != null ? `${sub.expected_ctc} LPA` : undefined} />
                        <Field label="Notice Period" value={sub.notice_period ? <span style={{ color: npColor(sub.notice_period) }}>{sub.notice_period}</span> : undefined} />
                        <Field label="Total Experience" value={sub.total_experience} />
                    </div>
                    {sub.relevant_experience && (
                        <div>
                            <div className="twd-field-label">Relevant Experience</div>
                            <div className="twd-note-box">{sub.relevant_experience}</div>
                        </div>
                    )}
                    {sub.reason_for_change && (
                        <div>
                            <div className="twd-field-label">Reason for Change</div>
                            <div className="twd-note-box">{sub.reason_for_change}</div>
                        </div>
                    )}
                    {sub.recruiter_comments && (
                        <div>
                            <div className="twd-field-label">Recruiter Comments</div>
                            <div className="twd-note-box">{sub.recruiter_comments}</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function MySubmissions() {
    useDocumentTitle("My Submissions");
    const [subs, setSubs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [selected, setSelected] = useState<any>(null);
    const [statusFilter, setStatusFilter] = useState("");
    const [clientFilter, setClientFilter] = useState("");
    const [appliedFilters, setAppliedFilters] = useState({ status: "", client: "" });
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 10;

    const load = (filters: { status: string; client: string }, skip: number, append: boolean) => {
        setLoading(true);
        setError(null);
        analyticsApi.getSubmissions({ status: filters.status || undefined, client: filters.client || undefined, my_only: true, skip, limit: 50 })
            .then((res: any[]) => {
                const items = res || [];
                if (append) setSubs(p => [...p, ...items]);
                else setSubs(items);
                setHasMore(items.length === 50);
            })
            .catch((e: any) => setError(e?.detail || "Failed to load submissions"))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load({ status: "", client: "" }, 0, false); }, []);

    const apply = () => {
        const f = { status: statusFilter, client: clientFilter };
        setAppliedFilters(f);
        setSubs([]);
        setPage(1);
        load(f, 0, false);
    };

    const loadMore = () => load(appliedFilters, subs.length, true);

    const pageCount = Math.max(1, Math.ceil(subs.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const pageItems = subs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const CELL: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 0 };

    return (
        <div className="twd-scope twd-scope--fixed">
            {selected && <SubmissionModal sub={selected} onClose={() => setSelected(null)} />}

            <div className="twd-head twd-head--tight twd-rise">
                <div>
                    <h1 className="twd-title">My Submissions</h1>
                </div>
                <div className="twd-head-actions">
                    <span className="twd-count-note">
                        {subs.length} submission{subs.length !== 1 ? "s" : ""}{hasMore ? "+" : ""}
                    </span>
                </div>
            </div>

            <div className="twd-toolbar">
                <input
                    type="text"
                    className="twd-input"
                    placeholder="Client name…"
                    aria-label="Filter by client name"
                    value={clientFilter}
                    onChange={e => setClientFilter(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && apply()}
                    style={{ flex: "0 1 260px" }}
                />
                <select
                    className="twd-select"
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                >
                    {APP_STATUSES.map(s => <option key={s} value={s}>{s ? s.replace(/_/g, " ") : "All statuses"}</option>)}
                </select>
                <button className="twd-btn twd-btn-primary twd-btn-sm" onClick={apply} disabled={loading}>
                    {loading ? "Loading…" : "Apply"}
                </button>
                {(appliedFilters.status || appliedFilters.client) && (
                    <button className="twd-btn twd-btn-ghost twd-btn-sm" onClick={() => {
                        setStatusFilter(""); setClientFilter("");
                        setAppliedFilters({ status: "", client: "" });
                        setSubs([]); setPage(1); load({ status: "", client: "" }, 0, false);
                    }}>Clear</button>
                )}
            </div>

            {error && <div style={{ padding: "2rem", color: "var(--twd-red-text)", textAlign: "center", fontSize: 13 }}>{error}</div>}

            {subs.length === 0 && !loading ? (
                <div className="twd-empty">
                    <Icon name="send" size={40} />
                    <div>No submissions found.</div>
                </div>
            ) : (
                <>
                    <Pager page={safePage} pageCount={pageCount} onChange={setPage} />
                    <div className="twd-table-wrap twd-fill twd-rise" style={{ animationDelay: "0.05s" }}>
                        <div className="twd-table-scroll">
                            <table className="twd-table" style={{ tableLayout: "fixed", minWidth: 900, width: "100%" }}>
                                <colgroup>
                                    <col style={{ width: "90px" }} />
                                    <col style={{ width: "110px" }} />
                                    <col style={{ width: "150px" }} />
                                    <col style={{ width: "130px" }} />
                                    <col style={{ width: "140px" }} />
                                    <col style={{ width: "70px" }} />
                                    <col style={{ width: "70px" }} />
                                    <col style={{ width: "90px" }} />
                                    <col style={{ width: "90px" }} />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Client</th>
                                        <th>Requirement</th>
                                        <th>Candidate</th>
                                        <th>Role</th>
                                        <th>CTC</th>
                                        <th>Exp CTC</th>
                                        <th>Notice</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading && subs.length === 0
                                        ? Array.from({ length: 6 }).map((_, i) => (
                                            <tr key={i}>
                                                {Array.from({ length: 9 }).map((_, j) => (
                                                    <td key={j}><div style={{ height: 14, background: "var(--twd-line2)", borderRadius: 4, width: j === 0 ? "80%" : "60%" }} /></td>
                                                ))}
                                            </tr>
                                        ))
                                        : pageItems.map((s: any) => (
                                            <tr
                                                key={s.application_id}
                                                className="twd-row-link"
                                                onClick={() => setSelected(s)}
                                                title="Click to view details"
                                            >
                                                <td className="twd-cell-muted" style={CELL}>{fmtDate(s.sent_at)}</td>
                                                <td style={{ ...CELL, fontSize: 13, fontWeight: 600 }}>{dash(s.company_name)}</td>
                                                <td className="twd-cell-soft" style={{ ...CELL, fontSize: 12.5 }}>{dash(s.requirement_name)}</td>
                                                <td style={{ ...CELL, fontSize: 13, fontWeight: 600 }}>{dash(s.candidate_name)}</td>
                                                <td className="twd-cell-soft" style={{ ...CELL, fontSize: 12.5 }}>{dash(s.current_role)}</td>
                                                <td className="twd-cell-soft" style={{ ...CELL, fontSize: 12.5 }}>{dash(s.current_ctc)}</td>
                                                <td className="twd-cell-soft" style={{ ...CELL, fontSize: 12.5 }}>{dash(s.expected_ctc)}</td>
                                                <td style={{ ...CELL, fontSize: 12.5, color: npColor(s.notice_period), fontWeight: 500 }}>{dash(s.notice_period)}</td>
                                                <td><StatusBadge status={s.offer_status || s.dynamic_status || s.status} /></td>
                                            </tr>
                                        ))
                                    }
                                </tbody>
                            </table>
                        </div>
                        {hasMore && (
                            <div style={{ padding: "0.65rem 1rem", borderTop: "1px solid var(--twd-line2)", display: "flex", justifyContent: "center" }}>
                                <button className="twd-btn twd-btn-ghost twd-btn-sm" onClick={loadMore} disabled={loading}>
                                    {loading ? "Loading…" : "Load more"}
                                </button>
                            </div>
                        )}
                        <div style={{ padding: "0.55rem 1rem", borderTop: "1px solid var(--twd-line2)", fontSize: 12, color: "var(--twd-faint)" }}>
                            {subs.length} submission{subs.length !== 1 ? "s" : ""}{hasMore ? "+" : ""}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
