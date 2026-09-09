import { useState, useMemo, useRef, type ComponentProps } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useNavigate, useParams, useLocation } from "../lib/router";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import ModernDropdown from "../components/ModernDropdown";
import Icon from "../components/Icon";
import { useQuery } from "@tanstack/react-query";
import RequirementDetail from "./RequirementDetail";
import BackButton from "../components/BackButton";
import Pager from "../components/Pager";
import "../styles/pages.css";
import "../styles/dashboard.css";
import { fmtDate, fmtTs } from "../utils/dateUtils";
import { APP_STATUS_COLOR } from "../utils/statusUtils";

interface Notification {
    id: string;
    kind: string;
    title: string;
    subtitle: string;
    context: string;
    context_id?: string;
    requirement_id?: string | null;
    candidate_id?: string | null;
    status?: string | null;
    occurred_at?: string | null;
}

type NotifIcon = ComponentProps<typeof Icon>["name"];

const NOTIF_KIND_ICON: Record<string, NotifIcon> = {
    requirement_created: "document",
    requirement_assigned: "check",
    application: "user",
    assignment_request: "bell",
    assignment_decision: "mail",
};

function NotificationsFeed({ navigate }: { navigate: (path: string) => void }) {
    const { data: notifs = [], isLoading } = useQuery<Notification[]>({
        queryKey: ["notifications"],
        queryFn: () => api.get("/notifications").then((r: any) => r || []),
        staleTime: 5 * 60 * 1000,
        retry: false,
    });

    // Shares the same localStorage key as the topbar bell, so clearing the
    // feed also clears those entries from the bell dropdown (and vice versa).
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem("tw_dismissed_notifs") || "[]")); }
        catch { return new Set(); }
    });

    const visible = notifs.filter(n => !dismissedIds.has(n.id));

    const clearAll = () => {
        const next = new Set(dismissedIds);
        visible.forEach(n => next.add(n.id));
        localStorage.setItem("tw_dismissed_notifs", JSON.stringify([...next]));
        setDismissedIds(next);
    };

    if (isLoading) return null;
    if (notifs.length === 0) return null;

    // All items cleared → keep the section visible with a "caught up" state,
    // so the feed doesn't silently vanish after "Clear all".
    if (visible.length === 0) {
        return (
            <div style={{ marginTop: 30 }}>
                <div className="twd-feed-head">
                    <div className="twd-section-label">Activity Feed</div>
                </div>
                <div className="twd-empty" style={{ padding: "28px 16px" }}>
                    <Icon name="check" size={28} />
                    <div>You're all caught up - new activity will show up here</div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ marginTop: 30 }}>
            <div className="twd-feed-head">
                <div className="twd-section-label">Activity Feed</div>
                <button type="button" className="twd-link" onClick={clearAll}>
                    <Icon name="x" size={12} /> Clear all
                </button>
            </div>
            <div className="twd-feed twd-feed-scroll">
                {visible.map((n) => {
                    const iconName = NOTIF_KIND_ICON[n.kind] || "bell";
                    const timeStr = n.occurred_at ? fmtTs(n.occurred_at) : "";
                    const statusColor = n.kind === "application" && n.status ? (APP_STATUS_COLOR[n.status] || "var(--twd-soft)") : undefined;

                    const handleClick = () => {
                        if (n.requirement_id) navigate(`/requirements/${n.requirement_id}`);
                    };

                    return (
                        <div
                            key={n.id}
                            className={`twd-feed-item${n.requirement_id ? " twd-feed-item--link" : ""}`}
                            onClick={n.requirement_id ? handleClick : undefined}
                        >
                            <span className="twd-feed-ico"><Icon name={iconName} size={14} /></span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                                    <span className="twd-feed-title">{n.title}</span>
                                    <span className="twd-feed-sub" style={statusColor ? { color: statusColor, fontWeight: 600 } : undefined}>
                                        {n.subtitle}
                                    </span>
                                </div>
                                {n.context && <div className="twd-feed-ctx">{n.context}</div>}
                            </div>
                            {timeStr && <span className="twd-feed-time">{timeStr}</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
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
    location: string | null;
    mode_of_work: string | null;
    years_of_experience: string | null;
    must_have_skills: string[];
    good_to_have_skills: string[];
    special_instructions: string | null;
    notice_period: string | null;
    assigned_recruiters: string[];
    visibility?: string | null;
    created_at: string;
}

function SlaLine({ req }: { req: Requirement }) {
    const status = req.sla_status || "ON_TRACK";
    const breached = Boolean(req.sla_breached);
    if (status === "MET") {
        return <span className="twd-job-sla twd-job-sla--met"><Icon name="check" size={13} /> SLA met</span>;
    }
    if (breached || status === "BREACHED") {
        return <span className="twd-job-sla twd-job-sla--breached"><Icon name="warning" size={13} /> SLA breached</span>;
    }
    const label = req.sla_remaining_hours != null ? `${Math.ceil(req.sla_remaining_hours)}h left on SLA` : "SLA on track";
    return <span className="twd-job-sla twd-job-sla--ontrack"><Icon name="clock" size={13} /> {label}</span>;
}

const REQ_STATUS_META: Record<string, { label: string; color: string }> = {
    OPEN: { label: "Open", color: "var(--twd-green)" },
    ON_HOLD: { label: "On Hold", color: "var(--twd-amber)" },
    CLOSED: { label: "Closed", color: "var(--twd-faint)" },
    POSITION_CLOSED: { label: "Closed", color: "var(--twd-faint)" },
    ARCHIVED: { label: "Archived", color: "var(--twd-faint)" },
    DELETED: { label: "Deleted", color: "var(--twd-red-text)" },
};

function SkillPill({ label, variant }: { label: string; variant: "must" | "good" }) {
    return (
        <span className={`twd-skill ${variant === "must" ? "twd-skill--must" : "twd-skill--good"}`}>
            {label}
        </span>
    );
}

function JDDetailModal({ req, onClose }: { req: Requirement; onClose: () => void }) {
    const must = req.must_have_skills || [];
    const good = req.good_to_have_skills || [];

    return (
        <div
            className="twd-vars twd-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={req.requirement_name}
            onClick={onClose}
        >
            <div className="twd-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="twd-modal-head">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <span className="twd-chip">{req.req_id}</span>
                        <h2 className="twd-modal-title">{req.requirement_name}</h2>
                        <div className="twd-sub" style={{ marginTop: 3 }}>{req.company_name}</div>
                    </div>
                    <button type="button" className="twd-close" onClick={onClose} aria-label="Close">
                        <Icon name="x" size={15} />
                    </button>
                </div>

                {/* Body */}
                <div className="twd-modal-body">
                    {/* Must-have skills */}
                    {must.length > 0 && (
                        <div>
                            <div className="twd-field-label">Must-Have Skills</div>
                            <div className="twd-skill-row">
                                {must.map((sk, i) => <SkillPill key={i} label={sk} variant="must" />)}
                            </div>
                        </div>
                    )}

                    {/* Good-to-have skills */}
                    {good.length > 0 && (
                        <div>
                            <div className="twd-field-label">Good-to-Have Skills</div>
                            <div className="twd-skill-row">
                                {good.map((sk, i) => <SkillPill key={i} label={sk} variant="good" />)}
                            </div>
                        </div>
                    )}

                    {must.length === 0 && good.length === 0 && (
                        <div className="twd-loading" style={{ padding: "12px 0" }}>
                            No skills extracted for this requirement
                        </div>
                    )}

                    {/* Special instructions */}
                    {req.special_instructions && (
                        <div>
                            <div className="twd-field-label">Special Instructions</div>
                            <div className="twd-note-box">{req.special_instructions}</div>
                        </div>
                    )}

                    {/* Notice period */}
                    {req.notice_period && (
                        <div>
                            <div className="twd-field-label">Notice Period</div>
                            <div style={{ fontSize: 13 }}>{req.notice_period}</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function toSlug(s: string) {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function RequirementCard({
    req,
    onAssign,
    onViewDetails,
    onNavigate,
    assigning,
    userId,
    isRequested,
}: {
    req: Requirement;
    onAssign: (id: string) => void;
    onViewDetails: (req: Requirement) => void;
    onNavigate: (req: Requirement) => void;
    assigning: string | null;
    userId: string;
    isRequested?: boolean;
}) {
    const isAssigned = req.assigned_recruiters?.includes(userId);
    const status = REQ_STATUS_META[req.status] || { label: req.status.replace(/_/g, " "), color: "var(--twd-faint)" };
    const metaParts = [
        req.role_type,
        req.requirement_type?.replace("_", " "),
        req.mode_of_work,
        req.location,
        req.years_of_experience ? `${req.years_of_experience} yrs` : null,
        req.client_spoc_name,
    ].filter(Boolean) as string[];

    return (
        <div className="twd-row" onClick={() => onNavigate(req)}>
            <div className="twd-row-main">
                <div className="twd-row-line1">
                    <span className="twd-row-id"><span className="twd-title--accent">{req.req_id}</span></span>
                </div>
                <div className="twd-row-line1">
                    <span className="twd-row-title">{req.requirement_name}</span>
                    {req.visibility === "RESTRICTED" && (
                        <Icon
                            name="lock"
                            size={12}
                            title="Confidential requirement"
                            style={{ marginLeft: 6, opacity: 0.7, verticalAlign: "middle" }}
                        />
                    )}
                </div>
                {metaParts.length > 0 && (
                    <div className="twd-row-meta">
                        {metaParts.map((m, i) => <span key={i}>{m}</span>)}
                    </div>
                )}
            </div>

            <div className="twd-row-side">
                <SlaLine req={req} />
                <span className="twd-job-status" style={{ color: status.color }}>
                    <span className="twd-job-status-dot" />
                    {status.label}
                </span>
            </div>

            <div className="twd-row-actions">
                <button
                    className={`twd-btn twd-btn-sm ${isAssigned ? "twd-btn-ok" : isRequested ? "twd-btn-wait" : "twd-btn-quiet"}`}
                    onClick={(e) => { e.stopPropagation(); onAssign(req.id); }}
                    disabled={assigning === req.id || isAssigned || isRequested}
                >
                    {assigning === req.id
                        ? "Sending…"
                        : isAssigned
                            ? <><Icon name="check" size={13} /> Assigned</>
                            : isRequested
                                ? "Request Pending"
                                : "Request Assignment"}
                </button>
                <button
                    className="twd-btn twd-btn-sm twd-btn-plain"
                    onClick={(e) => { e.stopPropagation(); onViewDetails(req); }}
                >
                    Details
                </button>
                <a
                    href={`/requirements/${req.id}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    title="Open in new tab"
                    aria-label="Open in new tab"
                    className="twd-icon-btn twd-icon-btn--plain"
                    style={{ width: 32, minHeight: 32 }}
                >
                    <Icon name="external" size={13} />
                </a>
            </div>
        </div>
    );
}

function RecruiterAssignmentsTable({ requirements }: { requirements: Requirement[] }) {
    const { data: users = [] } = useQuery<any[]>({
        queryKey: ["users"],
        queryFn: () => api.get("/users").then((r: any) => r || []),
    });

    const recruiterMap = useMemo(() => {
        const map = new Map<string, { name: string; reqs: Requirement[] }>();
        for (const u of users) {
            if (u.role === "RECRUITER" || u.role === "ADMIN") {
                map.set(String(u.id), { name: u.name || u.email, reqs: [] });
            }
        }
        for (const req of requirements) {
            for (const uid of req.assigned_recruiters || []) {
                const key = String(uid);
                if (map.has(key)) map.get(key)!.reqs.push(req);
            }
        }
        const entries = [...map.entries()].filter(([, v]) => v.reqs.length > 0);
        entries.sort((a, b) => b[1].reqs.length - a[1].reqs.length);
        return entries;
    }, [users, requirements]);

    if (recruiterMap.length === 0) return null;

    return (
        <div style={{ marginBottom: 26, minWidth: 0 }}>
            <div className="twd-section-label">Recruiter Assignments</div>
            <div className="twd-table-wrap">
                <div className="twd-table-scroll">
                    <table className="twd-table" style={{ tableLayout: "fixed", width: "100%", minWidth: 640 }}>
                        <colgroup>
                            <col style={{ width: "22%" }} />
                            <col style={{ width: "58%" }} />
                            <col style={{ width: "20%" }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>Recruiter</th>
                                <th>Assigned Requirements</th>
                                <th>Count</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recruiterMap.map(([uid, { name, reqs }]) => (
                                <tr key={uid}>
                                    <td style={{ fontWeight: 600, fontSize: 13 }}>{name}</td>
                                    <td>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                                            {reqs.slice(0, 5).map(r => (
                                                <span key={r.id} className="twd-tag">
                                                    {r.req_id} · {r.requirement_name}
                                                </span>
                                            ))}
                                            {reqs.length > 5 && (
                                                <span className="twd-cell-muted" style={{ alignSelf: "center" }}>+{reqs.length - 5} more</span>
                                            )}
                                        </div>
                                    </td>
                                    <td><span className="twd-count-accent">{reqs.length}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default function Dashboard() {
    useDocumentTitle("Dashboard");
    const { user, isAdmin } = useAuth();
    const navigate = useNavigate();
    const { clientSlug, reqSlug } = useParams<{ clientSlug?: string; reqSlug?: string }>();
    const location = useLocation();
    const reqIdFromState = (location.state as any)?.reqId as string | undefined;
    const [assigning, setAssigning] = useState<string | null>(null);
    const [optimisticRequested, setOptimisticRequested] = useState<Set<string>>(new Set());
    const [detailReq, setDetailReq] = useState<Requirement | null>(null);
    const notice = "";

    const { data: requirements = [], isLoading: loading } = useQuery<Requirement[]>({
        queryKey: ["requirements"],
        queryFn: () => api.get("/requirements").then((r: any) => r || []),
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
    });

    const { data: pendingRequestIds = [] } = useQuery<string[]>({
        queryKey: ["assignment-requests-pending", user?.id],
        queryFn: () =>
            api.get("/assignment-requests?status=pending").then((reqs: any[]) =>
                (reqs || [])
                    .filter((r: any) => r.recruiter_id === user?.id)
                    .map((r: any) => r.requirement_id)
            ),
        enabled: !isAdmin && !!user?.id,
    });

    // Merge server-known pending with optimistic additions from this session
    const requestedReqs = useMemo(
        () => new Set([...pendingRequestIds, ...optimisticRequested]),
        [pendingRequestIds, optimisticRequested],
    );

    // Fetch official client list (companies user can manage)
    const { data: myCompaniesData } = useQuery<{ companies: string[]; all_access: boolean }>({
        queryKey: ["my-companies"],
        queryFn: () => api.get("/clients/my-companies").then((r: any) => r || { companies: [], all_access: false }),
        staleTime: 5 * 60 * 1000,
        retry: false,
    });

    const clientsMap = useMemo(() => {
        const map = new Map<string, Requirement[]>();
        for (const req of requirements) {
            const c = req.company_name || "Unknown Client";
            if (!map.has(c)) map.set(c, []);
            map.get(c)!.push(req);
        }
        return map;
    }, [requirements]);

    // Merge official client names with requirement-derived names.
    // Deduplicate by slug so "CtrlS" and "ctrls" become one card.
    // Requirements-derived names (canonical casing) win over API names.
    const clientNames = useMemo(() => {
        const fromReqs = Array.from(clientsMap.keys());
        const fromApi = myCompaniesData?.companies || [];
        const slugToName = new Map<string, string>();
        // API names first (lower priority)
        for (const n of fromApi) slugToName.set(toSlug(n), n);
        // Requirements names overwrite (higher priority - canonical casing)
        for (const n of fromReqs) slugToName.set(toSlug(n), n);
        return [...slugToName.values()].sort();
    }, [clientsMap, myCompaniesData]);

    // Resolve URL slug → client name
    const selectedClient = useMemo(() => {
        if (!clientSlug) return null;
        return clientNames.find(n => toSlug(n) === clientSlug) || null;
    }, [clientSlug, clientNames]);

    // Use slug-based match so "Cohere Health" and "cohere health" are treated as the same company.
    const clientRequirements = useMemo(() => {
        if (!selectedClient) return [];
        const slug = toSlug(selectedClient);
        return requirements.filter(r => toSlug(r.company_name || "") === slug);
    }, [selectedClient, requirements]);

    // True if the current user is an assigned client manager for the selected client.
    // Use slug comparison so "ctrls" matches "CtrlS" (same slug "ctrls").
    const isClientManager = Boolean(
        myCompaniesData?.all_access ||
        (myCompaniesData?.companies || []).some(c => toSlug(c) === (clientSlug || ""))
    );

    // Treat client managers like admins for their assigned client
    const effectiveAdmin = isAdmin || isClientManager;

    // On the all-clients overview there's no selected client to match against, so
    // `isClientManager` above is always false there. "Manages at least one client"
    // is what unlocks the create button - gating it on isAdmin hides the entry
    // point from client managers entirely.
    const canCreateRequirement = isAdmin ||
        Boolean(myCompaniesData?.all_access) ||
        (myCompaniesData?.companies?.length ?? 0) > 0;

    // Admin filter state
    const [searchParam, setSearchParam] = useState("");
    const [searchValue, setSearchValue] = useState("");
    const [appliedFilter, setAppliedFilter] = useState<{ param: string; value: string } | null>(null);

    // Recruiter card filter state
    const [cardSearch, setCardSearch] = useState("");
    const [cardStatus, setCardStatus] = useState("ALL");
    const [cardPage, setCardPage] = useState(1);
    const [adminPage, setAdminPage] = useState(1);
    const rowsScrollRef = useRef<HTMLDivElement>(null);

    const handleAssign = async (id: string) => {
        setAssigning(id);
        try {
            await api.post(`/requirements/${id}/assignment-requests`, { message: "Requested from Dashboard" });
            setOptimisticRequested(prev => new Set([...prev, id]));
        } catch (e: any) {
            alert(e?.detail || e?.message || "Failed to send request");
        } finally {
            setAssigning(null);
        }
    };

    // Admin helpers
    const openReqs = clientRequirements.filter(r => r.status === "OPEN");
    const holdReqs = clientRequirements.filter(r => r.status === "ON_HOLD");
    const closedReqs = clientRequirements.filter(r => r.status === "CLOSED" || r.status === "POSITION_CLOSED");
    const archivedReqs = clientRequirements.filter(r => r.status === "ARCHIVED");
    const deletedReqs = clientRequirements.filter(r => r.status === "DELETED");
    const [activeTab, setActiveTab] = useState("OPEN");

    const REQ_TABS = [
        { key: "OPEN", label: "Open", reqs: openReqs },
        { key: "ON_HOLD", label: "On Hold", reqs: holdReqs },
        { key: "CLOSED", label: "Closed", reqs: closedReqs },
        { key: "ARCHIVED", label: "Archived", reqs: archivedReqs },
        { key: "DELETED", label: "Deleted", reqs: deletedReqs },
    ];

    const getFilteredReqs = (reqs: Requirement[]) => {
        if (!appliedFilter) return reqs;
        return reqs.filter(r => {
            const { param, value } = appliedFilter;
            if (param === "role") return r.role_type === value;
            if (param === "contract") return r.requirement_type === value;
            if (param === "requirement") return r.requirement_name === value;
            return true;
        });
    };

    const getAdminDisplayedReqs = () => {
        const baseReqs = REQ_TABS.find(t => t.key === activeTab)?.reqs ?? openReqs;
        if (appliedFilter) return getFilteredReqs(baseReqs);
        return baseReqs;
    };

    const uniqueValues = {
        role: [...new Set(clientRequirements.map(r => r.role_type).filter(Boolean))],
        contract: [...new Set(clientRequirements.map(r => r.requirement_type).filter(Boolean))],
        requirement: [...new Set(clientRequirements.map(r => r.requirement_name).filter(Boolean))],
    };

    const handleSearch = () => {
        if (searchParam && searchValue) setAppliedFilter({ param: searchParam, value: searchValue });
    };

    const handleClear = () => {
        setSearchParam(""); setSearchValue(""); setAppliedFilter(null);
    };

    const renderSla = (req: Requirement) => {
        const status = req.sla_status || "ON_TRACK";
        const breached = Boolean(req.sla_breached);
        if (status === "MET") return <span className="twd-pill twd-pill--green">Met</span>;
        if (breached || status === "BREACHED") return <span className="twd-pill twd-pill--red">Breached</span>;
        const label = req.sla_remaining_hours != null ? `${Math.ceil(req.sla_remaining_hours)}h left` : "On Track";
        return <span className="twd-pill twd-pill--amber">{label}</span>;
    };

    const renderStatsRow = (reqs: Requirement[]) => {
        const activeReqs = reqs.filter(r => r.status !== "DELETED");
        const total = activeReqs.length;
        const open = activeReqs.filter(r => r.status === "OPEN").length;
        const hold = activeReqs.filter(r => r.status === "ON_HOLD").length;
        const closed = activeReqs.filter(r => r.status === "CLOSED" || r.status === "POSITION_CLOSED").length;
        return (
            <div className="twd-stat-strip">
                <span><b className="twd-accent">{total}</b> Total Requirements</span>
                <span className="twd-stat-sep">|</span>
                <span><b>{open}</b> Open</span>
                <span className="twd-stat-sep">|</span>
                <span><b>{hold}</b> On Hold</span>
                <span className="twd-stat-sep">|</span>
                <span><b>{closed}</b> Closed</span>
            </div>
        );
    };

    const renderClientCards = () => {
        return (
            <div className="twd-scope">
                <div className="twd-head twd-head--tight twd-rise">
                    <div>
                        <h1 className="twd-title"><span className="twd-title--accent">Clients</span> Overview</h1>
                        {/* <p className="twd-sub">Select a client to view their requirements</p> */}
                    </div>
                    <div className="twd-head-actions">
                        {renderStatsRow(requirements)}
                        {canCreateRequirement && (
                            <button className="twd-btn twd-btn-primary" onClick={() => navigate("/requirements/new")}>
                                <Icon name="plus" size={15} /> Create Requirement
                            </button>
                        )}
                    </div>
                </div>

                {notice && <div className="form-success" style={{ marginBottom: "1.5rem" }}>{notice}</div>}

                <div className="twd-grid twd-rise" style={{ animationDelay: "0.1s" }}>
                    {clientNames.map(c => {
                        const slug = toSlug(c);
                        const reqs = requirements.filter(r => toSlug(r.company_name || "") === slug);
                        const openCount = reqs.filter(r => r.status === "OPEN").length;
                        const isActive = openCount > 0;
                        return (
                            <button
                                key={c}
                                type="button"
                                className="twd-client-card"
                                onClick={() => navigate(`/dashboard/${toSlug(c)}`)}
                            >
                                <div className="twd-client-top">
                                    <h3 className="twd-client-name">{c}</h3>
                                    <span className={`twd-pill ${isActive ? "twd-pill--green" : "twd-pill--neutral"}`}>
                                        {isActive ? "Active" : "Inactive"}
                                    </span>
                                </div>
                                <div className="twd-client-count">
                                    <b>{openCount}</b>
                                    <span>Open Requirement{openCount !== 1 ? "s" : ""}</span>
                                </div>
                                {/* <div className="twd-bar">
                                    <div style={{ width: reqs.length ? `${Math.round((openCount / reqs.length) * 100)}%` : 0 }} />
                                </div> */}
                            </button>
                        );
                    })}
                </div>

                {!isAdmin && <NotificationsFeed navigate={navigate} />}
            </div>
        );
    };

    // ── Requirement detail view (/dashboard/:clientSlug/:reqSlug) ─────────────
    // Fast path: caller passed reqId in navigation state (from Analytics row click)
    if (reqIdFromState) {
        return <RequirementDetail key={reqIdFromState} reqId={reqIdFromState} />;
    }
    // Slug-resolution fallback (for direct URL access or Dashboard table row click)
    if (reqSlug) {
        if (loading) return <div className="page-loading">Loading…</div>;
        const matchedReq = requirements.find(
            r => toSlug(r.company_name || "") === clientSlug && toSlug(r.requirement_name || "") === reqSlug
        );
        if (matchedReq) return <RequirementDetail key={matchedReq.id} reqId={matchedReq.id} />;
        // No match - fall through to client view (slug may be stale)
    }

    if (!selectedClient) {
        return renderClientCards();
    }

    // Recruiter card view
    if (!effectiveAdmin) {

        const filtered = clientRequirements.filter(r => {
            const matchesStatus = cardStatus === "ALL"
                ? r.status !== "DELETED" && r.status !== "ARCHIVED"
                : r.status === cardStatus;
            const q = cardSearch.toLowerCase();
            const matchesSearch = !q ||
                r.requirement_name.toLowerCase().includes(q) ||
                r.req_id.toLowerCase().includes(q) ||
                (r.role_type || "").toLowerCase().includes(q);
            return matchesStatus && matchesSearch;
        });

        const PAGE_SIZE = 10;
        const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        const page = Math.min(cardPage, pageCount);
        const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        const gotoPage = (p: number) => {
            setCardPage(p);
            rowsScrollRef.current?.scrollTo({ top: 0 });
        };

        return (
            <>
                <div className="twd-scope">
                    <div className="twd-head twd-head--tight twd-rise">
                        <div className="twd-title-row">
                            {/* <BackButton to="/dashboard" /> */}
                            <h1 className="twd-title"><span className="twd-title--accent">{selectedClient}</span> Requirements</h1>
                        </div>
                        <div className="twd-head-actions">
                            {renderStatsRow(clientRequirements)}
                        </div>
                    </div>

                    {notice && <div className="form-success" style={{ marginBottom: "1.5rem" }}>{notice}</div>}

                    {/* Filters */}
                    <div className="twd-toolbar">
                        <input
                            type="text"
                            className="twd-input"
                            placeholder="Search by name, Req ID, company, role..."
                            aria-label="Search requirements"
                            value={cardSearch}
                            onChange={e => { setCardSearch(e.target.value); setCardPage(1); }}
                        />
                        <select
                            className="twd-select"
                            aria-label="Filter by status"
                            value={cardStatus}
                            onChange={e => { setCardStatus(e.target.value); setCardPage(1); }}
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="OPEN">Open</option>
                            <option value="ON_HOLD">On Hold</option>
                            <option value="CLOSED">Closed</option>
                        </select>
                        <span className="twd-count-note">
                            {filtered.length} requirement{filtered.length !== 1 ? "s" : ""}
                        </span>
                    </div>

                    {pageCount > 1 && (
                        <div className="twd-pager">
                            <span className="twd-pager-label">Page {page} of {pageCount}</span>
                            <button
                                type="button"
                                className="twd-pager-btn"
                                disabled={page === 1}
                                onClick={() => gotoPage(page - 1)}
                                aria-label="Previous page"
                            >
                                <Icon name="chevron-left" size={14} />
                            </button>
                            {Array.from({ length: pageCount }).map((_, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    className="twd-pager-btn"
                                    data-active={page === i + 1}
                                    aria-current={page === i + 1 ? "page" : undefined}
                                    onClick={() => gotoPage(i + 1)}
                                >
                                    {i + 1}
                                </button>
                            ))}
                            <button
                                type="button"
                                className="twd-pager-btn"
                                disabled={page === pageCount}
                                onClick={() => gotoPage(page + 1)}
                                aria-label="Next page"
                            >
                                <Icon name="chevron-right" size={14} />
                            </button>
                        </div>
                    )}

                    {loading ? (
                        <div className="twd-loading">Loading...</div>
                    ) : filtered.length === 0 ? (
                        <div className="twd-empty">
                            <Icon name="document" size={40} />
                            <div>No requirements found</div>
                        </div>
                    ) : (
                        <div className="twd-rows twd-fill" ref={rowsScrollRef}>
                            {pageItems.map(req => (
                                <RequirementCard
                                    key={req.id}
                                    req={req}
                                    onAssign={handleAssign}
                                    onViewDetails={setDetailReq}
                                    onNavigate={(req) => navigate(`/dashboard/${toSlug(req.company_name || "")}/${toSlug(req.requirement_name || "")}`, { state: { reqId: req.id } })}
                                    assigning={assigning}
                                    userId={user?.id || ""}
                                    isRequested={requestedReqs.has(req.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {detailReq && <JDDetailModal req={detailReq} onClose={() => setDetailReq(null)} />}
            </>
        );
    }

    // Admin table view
    const displayedReqs = getAdminDisplayedReqs();
    const ADMIN_PAGE_SIZE = 10;
    const adminPageCount = Math.max(1, Math.ceil(displayedReqs.length / ADMIN_PAGE_SIZE));
    const adminSafePage = Math.min(adminPage, adminPageCount);
    const adminPageItems = displayedReqs.slice((adminSafePage - 1) * ADMIN_PAGE_SIZE, adminSafePage * ADMIN_PAGE_SIZE);

    return (
        <div className="twd-scope">
            <div className="twd-head twd-head--tight twd-rise">
                <div>
                    <div className="twd-title-row">
                        {/* <BackButton to="/dashboard" /> */}
                        <h1 className="twd-title">{selectedClient}</h1>
                    </div>
                    <p className="twd-sub">Admin Dashboard - Here's your hiring overview</p>
                </div>
                <div className="twd-head-actions">
                    {renderStatsRow(clientRequirements)}
                    <button className="twd-btn twd-btn-primary" onClick={() => navigate(`/requirements/new?client=${encodeURIComponent(selectedClient || "")}`)}>
                        <Icon name="plus" size={15} /> Create Requirement
                    </button>
                </div>
            </div>

            {notice && <div className="form-success" style={{ marginBottom: "1.5rem" }}>{notice}</div>}

            {/* Search Toolbar */}
            {/* <div className="toolbar-row" style={{ marginBottom: "1.5rem", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                <ModernDropdown
                    value={searchParam}
                    onChange={val => { setSearchParam(val); setSearchValue(""); }}
                    options={[
                        { value: "role", label: "Role" },
                        { value: "contract", label: "Contract/Type" },
                        { value: "requirement", label: "Requirement Name" },
                    ]}
                    placeholder="Filter by..."
                    style={{ minWidth: "200px" }}
                />
                {searchParam && (
                    <ModernDropdown
                        value={searchValue}
                        onChange={val => setSearchValue(val)}
                        options={uniqueValues[searchParam as keyof typeof uniqueValues]?.map(val => ({ value: val as string, label: val as string })) || []}
                        placeholder={`Select ${searchParam}...`}
                        style={{ minWidth: "200px" }}
                    />
                )}
                {searchParam && searchValue && (
                    <button className="btn btn-primary btn-sm" onClick={handleSearch}>Search</button>
                )}
                {(searchParam || searchValue || appliedFilter) && (
                    <button className="btn btn-ghost btn-sm" onClick={handleClear}>Clear</button>
                )}
            </div> */}

            <RecruiterAssignmentsTable requirements={clientRequirements.filter(r => r.status !== "DELETED" && r.status !== "ARCHIVED")} />

            <div className="twd-tabs" role="tablist" aria-label="Requirement status">
                {REQ_TABS.map(tab => (
                    <button
                        key={tab.key}
                        role="tab"
                        aria-selected={activeTab === tab.key}
                        className="twd-tab"
                        data-active={activeTab === tab.key}
                        onClick={() => { setActiveTab(tab.key); setAdminPage(1); }}
                    >
                        {tab.label}
                        <span className="twd-tab-count">{tab.reqs.length}</span>
                    </button>
                ))}
            </div>

            {/* <div className="detail-section-title">
                {appliedFilter ? "Search Results" : `${REQ_TABS.find(t => t.key === activeTab)?.label ?? activeTab} Requirements`}
            </div> */}

            <Pager page={adminSafePage} pageCount={adminPageCount} onChange={setAdminPage} />

            {loading ? (
                <div className="twd-loading">Loading...</div>
            ) : displayedReqs.length === 0 ? (
                <div className="twd-empty">
                    <Icon name="document" size={40} />
                    <div>No {activeTab.toLowerCase().replace("_", " ")} requirements found</div>
                </div>
            ) : (
                <div className="twd-table-wrap twd-fill">
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
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {adminPageItems.map(req => (
                                    <tr
                                        key={req.id}
                                        className="twd-row-link"
                                        onClick={(e) => { if (e.ctrlKey || e.metaKey) { window.open(`/requirements/${req.id}`, '_blank'); } else { navigate(`/dashboard/${toSlug(req.company_name || "")}/${toSlug(req.requirement_name || "")}`, { state: { reqId: req.id } }); } }}
                                    >
                                        <td><span className="twd-mono">{req.req_id}</span></td>
                                        <td><strong>{req.requirement_name}</strong></td>
                                        <td className="twd-cell-soft">{req.requirement_type || "-"}</td>
                                        <td className="twd-cell-soft">{req.role_type || "-"}</td>
                                        <td className="twd-cell-soft">{req.client_spoc_name || "-"}</td>
                                        <td>{renderSla(req)}</td>
                                        <td><StatusBadge status={req.status} /></td>
                                        <td className="twd-cell-muted">{fmtDate(req.created_at)}</td>
                                        <td onClick={e => e.stopPropagation()}>
                                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                {/* <button className="twd-btn twd-btn-ghost twd-btn-sm" onClick={() => navigate(`/dashboard/${toSlug(req.company_name || "")}/${toSlug(req.requirement_name || "")}`)}>View</button> */}
                                                <a
                                                    href={`/requirements/${req.id}`}
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
