import { useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useNavigate } from "../lib/router";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import Icon from "../components/Icon";
import Pager from "../components/Pager";
import { useQuery } from "@tanstack/react-query";
import "../styles/pages.css";
import "../styles/dashboard.css";
import { fmtDate } from "../utils/dateUtils";

interface Requirement {
    id: string;
    req_id: string;
    company_name: string;
    requirement_name: string;
    status: string;
    sla_status?: string | null;
    sla_breached?: boolean | null;
    sla_remaining_hours?: number | null;
    requirement_type: string | null;
    role_type: string | null;
    client_spoc_name: string | null;
    assigned_recruiters: string[];
    created_at: string;
}

const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function MyRequirements() {
    useDocumentTitle("My Requirements");
    const { user } = useAuth();
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 10;

    const { data: allReqs = [], isLoading: loadingReqs } = useQuery({
        queryKey: ["requirements"],
        queryFn: () => api.get("/requirements").then((r: any) => r || []),
    });

    const { data: submissionCounts = {} } = useQuery<Record<string, number>>({
        queryKey: ["application-counts"],
        queryFn: () => api.get("/applications/counts").then((r: any) => r || {}),
    });

    const requirements: Requirement[] = allReqs.filter((r: Requirement) =>
        r.status !== "DELETED" && r.assigned_recruiters?.includes(user?.id || "")
    );
    const loading = loadingReqs;

    const filtered = requirements.filter(r => {
        const matchesStatus = statusFilter === "ALL"
            ? r.status !== "ARCHIVED"
            : r.status === statusFilter;
        const q = search.toLowerCase();
        const matchesSearch = !q ||
            r.requirement_name.toLowerCase().includes(q) ||
            r.req_id.toLowerCase().includes(q) ||
            (r.company_name || "").toLowerCase().includes(q);
        return matchesStatus && matchesSearch;
    });

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const renderSla = (req: Requirement) => {
        const status = req.sla_status || "ON_TRACK";
        const breached = Boolean(req.sla_breached);
        if (status === "MET") return <span className="twd-pill twd-pill--green">Met</span>;
        if (breached || status === "BREACHED") return <span className="twd-pill twd-pill--red">Breached</span>;
        const label = req.sla_remaining_hours != null ? `${Math.ceil(req.sla_remaining_hours)}h left` : "On Track";
        return <span className="twd-pill twd-pill--amber">{label}</span>;
    };

    return (
        <div className="twd-scope twd-scope--fixed">
            <div className="twd-head twd-head--tight twd-rise">
                <div>
                    <h1 className="twd-title">My Requirements</h1>
                </div>
                <div className="twd-head-actions">
                    <div className="twd-stat-strip">
                        <span><b className="twd-accent">{requirements.length}</b> Assigned</span>
                        <span className="twd-stat-sep">|</span>
                        <span><b>{requirements.filter(r => r.status === "OPEN").length}</b> Open</span>
                        <span className="twd-stat-sep">|</span>
                        <span><b>{requirements.filter(r => r.status === "ON_HOLD").length}</b> On Hold</span>
                        <span className="twd-stat-sep">|</span>
                        <span><b>{requirements.filter(r => r.status === "CLOSED").length}</b> Closed</span>
                    </div>
                </div>
            </div>

            <div className="twd-toolbar">
                <input
                    type="text"
                    className="twd-input"
                    placeholder="Search by name or Req ID..."
                    aria-label="Search requirements"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
                <select
                    className="twd-select"
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                >
                    <option value="ALL">All Statuses</option>
                    <option value="OPEN">Open</option>
                    <option value="ON_HOLD">On Hold</option>
                    <option value="CLOSED">Closed</option>
                </select>
                <span className="twd-count-note">
                    {filtered.length} assigned requirement{filtered.length !== 1 ? "s" : ""}
                </span>
            </div>

            {loading ? (
                <div className="twd-loading">Loading...</div>
            ) : requirements.length === 0 ? (
                <div className="twd-empty">
                    <Icon name="briefcase" size={40} />
                    <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--twd-soft)" }}>No requirements assigned yet</div>
                    <div style={{ fontSize: 13 }}>
                        Go to <b>Dashboard</b> -{'>'} Select from <b>Clients</b> -{'>'} click <b>Request for Assignment</b> to get started. Once assigned, the requirements will show up here.
                    </div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="twd-empty">
                    <Icon name="search" size={40} />
                    <div>No requirements match your filters</div>
                </div>
            ) : (
                <>
                    <Pager page={safePage} pageCount={pageCount} onChange={setPage} />
                    <div className="twd-table-wrap twd-fill twd-rise" style={{ animationDelay: "0.1s" }}>
                        <div className="twd-table-scroll">
                            <table className="twd-table twd-table--wide">
                                <thead>
                                    <tr>
                                        <th>Req ID</th>
                                        <th>Requirement Name</th>
                                        <th>Type</th>
                                        <th>Role</th>
                                        <th>Client SPOC</th>
                                        <th>SLA</th>
                                        <th>Profiles</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageItems.map(req => {
                                        // Pretty slug URL rooted in My Requirements - the path
                                        // itself carries the origin, like the breadcrumb depth.
                                        const reqUrl = `/my-requirements/${toSlug(req.requirement_name || "")}`;
                                        const goToReq = () => navigate(reqUrl, { state: { reqId: req.id } });
                                        return (
                                            <tr
                                                key={req.id}
                                                className="twd-row-link"
                                                onClick={(e) => { if (e.ctrlKey || e.metaKey) { window.open(reqUrl, '_blank'); } else { goToReq(); } }}
                                            >
                                                <td><span className="twd-mono">{req.req_id}</span></td>
                                                <td><strong>{req.requirement_name}</strong></td>
                                                <td className="twd-cell-soft">{req.requirement_type || "-"}</td>
                                                <td className="twd-cell-soft">{req.role_type || "-"}</td>
                                                <td className="twd-cell-soft">{req.client_spoc_name || "-"}</td>
                                                <td>{renderSla(req)}</td>
                                                <td>
                                                    {submissionCounts[req.id] > 0 ? (
                                                        <button
                                                            type="button"
                                                            className="twd-link"
                                                            onClick={(e) => { e.stopPropagation(); goToReq(); }}
                                                        >
                                                            <Icon name="sparkle" size={12} /> View fits
                                                        </button>
                                                    ) : (
                                                        <span className="twd-tag twd-tag--empty">No submissions yet</span>
                                                    )}
                                                </td>
                                                <td><StatusBadge status={req.status} /></td>
                                                <td className="twd-cell-muted">{fmtDate(req.created_at)}</td>
                                                <td onClick={e => e.stopPropagation()}>
                                                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                        <button className="twd-btn twd-btn-ghost twd-btn-sm" onClick={goToReq}>View</button>
                                                        <a
                                                            href={reqUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            title="Open in new tab"
                                                            aria-label="Open in new tab"
                                                            className="twd-icon-btn"
                                                            style={{ width: 32, minHeight: 32 }}
                                                        >
                                                            <Icon name="external" size={13} />
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
