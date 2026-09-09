import { useState, useEffect, useRef, useMemo, createContext, useContext } from "react";
import { toUtcDate, fmtDate } from "../utils/dateUtils";
import { useQuery } from "@tanstack/react-query";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// ── Global filter context shared across all tabs ──────────────────────────
interface AppliedFilters { client: string; search: string; status: string; recruiterId: string; dateFrom: string; dateTo: string; }
interface FilterCtxShape {
    applied: AppliedFilters;
    liveSearch: string;   // updates as you type - no Apply needed (client-side filter)
    recruiterOptions: { id: string; name: string }[];
    setRecruiterOptions: (opts: { id: string; name: string }[]) => void;
    setCounts: (nodes: React.ReactNode) => void;
    clientOptions: string[];
}
const FilterCtx = createContext<FilterCtxShape>({
    applied: { client: "", search: "", status: "", recruiterId: "", dateFrom: "", dateTo: "" },
    liveSearch: "",
    recruiterOptions: [],
    setRecruiterOptions: () => { },
    setCounts: () => { },
    clientOptions: [],
});
import { useNavigate, useParams, useSearchParams } from "../lib/router";

function toSlug(s: string) {
    return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
import { useAuth } from "../context/AuthContext";
import { analyticsApi, api, API_BASE, getToken } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import { APP_STATUSES, parseStatus, statusTone } from "../utils/statusUtils";
import TimelineDrawer, { type PipelineEntry } from "../components/TimelineDrawer";
import { DateTimeField, fieldCol, fieldControl, fieldLabel, fieldRow, hintText } from "../components/drawerKit";
import { ShortlistScheduleModal } from "../components/ShortlistScheduleModal";
import OfferDrawer, { type OfferEntry } from "../components/OfferDrawer";
import ScorecardReport from "../components/ScorecardReport";
import { PieChart, Pie, Tooltip, ResponsiveContainer, Cell } from "recharts";
import "../styles/pages.css";
import "../styles/dashboard.css";

// ── Design helpers ────────────────────────────────────────────────────────

const SLA_COLOR: Record<string, string> = {
    ON_TRACK: "#16a34a", AT_RISK: "#d97706", BREACHED: "#dc2626", MET: "#0891b2",
};
const SLA_LABEL: Record<string, string> = {
    ON_TRACK: "On Track", AT_RISK: "At Risk", BREACHED: "Breached", MET: "Met",
};
const FUNNEL_COLORS = ["#e5352b", "#d97706", "#16a34a", "#0891b2"];
const STAGE_COLORS = ["#e5352b", "#d97706", "#16a34a", "#0891b2", "#7c3aed"];



function dash(v: any) { return v == null || v === "" ? "-" : v; }

function noticePeriodColor(notice?: string | null): string {
    if (!notice) return "var(--twd-soft)";
    const l = notice.toLowerCase();
    if (l.includes("immediate") || l.includes("serving") || l === "0") return "#16a34a";
    const n = parseInt(l);
    if (!isNaN(n)) {
        if (n <= 15) return "#16a34a";
        if (n <= 60) return "#d97706";
        return "#dc2626";
    }
    return "var(--twd-soft)";
}

// ── Portal Filter Menu ────────────────────────────────────────────────────────
function PortalFilterMenu({ title, count, open, setOpen, onClear, options, filterSet, onToggle, anchorRef }: {
    title: string; count: number; open: boolean; setOpen: (v: boolean) => void;
    onClear: () => void; options: string[]; filterSet: Set<string>;
    onToggle: (v: string) => void; anchorRef: React.RefObject<HTMLElement | null>;
}) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (anchorRef.current?.contains(e.target as Node)) return;
            if (menuRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open, setOpen, anchorRef]);

    useEffect(() => {
        if (open && anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
        }
    }, [open, anchorRef]);

    if (!open) return null;

    return createPortal(
        <div ref={menuRef} className="twd-vars" style={{
            position: "absolute", top: pos.top + 4, left: pos.left, zIndex: 9999,
            minWidth: 200, maxHeight: 280, overflowY: "auto", background: "var(--twd-surface)",
            border: "1px solid var(--twd-line)", borderRadius: 12, boxShadow: "0 12px 32px rgba(28,18,16,0.16)",
            padding: "6px 0", fontWeight: 400, color: "var(--twd-ink)"
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 12px 8px", borderBottom: "1px solid var(--twd-line2)" }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--twd-faint)" }}>{title.toUpperCase()}</span>
                {count > 0 && (
                    <button type="button" onClick={onClear} style={{ border: "none", background: "none", color: "var(--twd-red-text)", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Clear</button>
                )}
            </div>
            {options.length === 0 && (
                <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--twd-faint)" }}>No options</div>
            )}
            {options.map(name => (
                <label key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--twd-surface2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <input type="checkbox" checked={filterSet.has(name)} onChange={() => onToggle(name)} style={{ width: 14, height: 14, accentColor: "var(--twd-red)" }} />
                    {name}
                </label>
            ))}
        </div>,
        document.body
    );
}

function SlaChip({ status }: { status: string }) {
    const color = SLA_COLOR[status] || "var(--twd-soft)";
    const label = SLA_LABEL[status] || status;
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
            {label}
        </span>
    );
}

function PillCount({ n, color }: { n: number; color: string }) {
    return (
        <span style={{
            display: "inline-block", minWidth: 28, padding: "1px 8px", borderRadius: 999,
            fontSize: 12, fontWeight: 700, textAlign: "center",
            background: `${color}18`, color, border: `1px solid ${color}30`,
        }}>{n}</span>
    );
}

// ── Pagination (mirrors the Profiles tab controls) ────────────────────────

const PAGE_SIZE = 15;

function pageBtnStyle(disabled: boolean): CSSProperties {
    return {
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: 8, border: "1px solid var(--twd-line2)",
        background: disabled ? "var(--twd-surface2)" : "var(--twd-surface)", cursor: disabled ? "default" : "pointer",
        color: disabled ? "var(--twd-faint)" : "var(--twd-red-text)",
        fontSize: 16, lineHeight: 1, opacity: disabled ? 0.5 : 1, userSelect: "none",
    };
}

function paginate<T>(rows: T[], page: number): T[] {
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const clamped = Math.min(page, totalPages);
    return rows.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);
}

function Pagination({ page, total, onPage, top, actions }: { page: number; total: number; onPage: (p: number) => void; top?: boolean; actions?: React.ReactNode }) {
    if (total <= PAGE_SIZE && !actions) return null;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const clamped = Math.min(page, totalPages);
    const rangeStart = total === 0 ? 0 : (clamped - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(clamped * PAGE_SIZE, total);
    const border = top ? { borderBottom: "1px solid var(--twd-line)" } : { borderTop: "1px solid var(--twd-line)" };
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.65rem 1rem", ...border, gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--twd-faint)", whiteSpace: "nowrap" }}>
                {total > 0 ? `Showing ${rangeStart}-${rangeEnd} of ${total}` : "No items found"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                {actions}
                {totalPages > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <button style={pageBtnStyle(clamped <= 1)} onClick={() => clamped > 1 && onPage(1)} title="First page">«</button>
                        <button style={pageBtnStyle(clamped <= 1)} onClick={() => clamped > 1 && onPage(clamped - 1)} title="Previous page">‹</button>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--twd-soft)", minWidth: 52, textAlign: "center", whiteSpace: "nowrap" }}>{clamped} / {totalPages}</span>
                        <button style={pageBtnStyle(clamped >= totalPages)} onClick={() => clamped < totalPages && onPage(clamped + 1)} title="Next page">›</button>
                        <button style={pageBtnStyle(clamped >= totalPages)} onClick={() => clamped < totalPages && onPage(totalPages)} title="Last page">»</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Skeleton ─────────────────────────────────────────────────────────────

function Skel({ h = 16, w = "100%" }: { h?: number; w?: string }) {
    return <div className="ana-skel" style={{ height: h, width: w, borderRadius: 4 }} />;
}
function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
    return (
        <>
            {Array.from({ length: rows }).map((_, i) => (
                <tr key={i}>
                    {Array.from({ length: cols }).map((_, j) => (
                        <td key={j}><Skel h={14} w={j === 0 ? "80%" : "60%"} /></td>
                    ))}
                </tr>
            ))}
        </>
    );
}

// ── Tab nav (PillNav) ─────────────────────────────────────────────────────

function PillNav({ tabs, active, onSelect }: { tabs: { key: string; label: string }[]; active: string; onSelect: (k: string) => void }) {
    return (
        <nav
            className="twd-vnav"
            aria-label="Analytics sections"
            style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 4 }}
        >
            {tabs.map(t => (
                <button
                    key={t.key}
                    className="twd-vnav-item"
                    data-active={t.key === active}
                    aria-current={t.key === active ? "page" : undefined}
                    onClick={() => onSelect(t.key)}
                >{t.label}</button>
            ))}
        </nav>
    );
}

function ErrMsg({ msg }: { msg: string }) {
    return <div style={{ padding: "2rem", color: "var(--twd-red-text)", textAlign: "center", fontSize: 13 }}>{msg}</div>;
}

// ────────────────────────────────────────────────────────────────────────────
// TAB 1 - Overview
// ────────────────────────────────────────────────────────────────────────────

function OverviewTab() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        analyticsApi.getOverview()
            .then(setData)
            .catch((e: any) => setError(e?.detail || "Failed to load overview"))
            .finally(() => setLoading(false));
    }, []);

    if (error) return <ErrMsg msg={error} />;

    const d = data || {};
    const funnelData = [
        { name: "Submitted", value: d.total_submissions || 0 },
        { name: "Interviews", value: d.in_interview || 0 },
        { name: "Selected", value: d.selected || 0 },
        { name: "Joined", value: d.joined || 0 },
    ];

    return (
        <>
            {/* KPI row */}
            <div className="stats-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                {[
                    { label: "Active Requirements", val: loading ? null : d.active_requirements ?? 0 },
                    { label: "Total Submissions", val: loading ? null : d.total_submissions ?? 0 },
                    { label: "In Interview", val: loading ? null : d.in_interview ?? 0 },
                    { label: "Selected / Joined", val: loading ? null : `${d.selected ?? 0} / ${d.joined ?? 0}` },
                    { label: "SLA Breached", val: loading ? null : d.sla_breached ?? 0, danger: true },
                ].map(kpi => (
                    <div key={kpi.label} className="stat-box">
                        <div className="stat-box-value" style={kpi.danger ? { color: "#dc2626" } : {}}>
                            {loading ? <Skel h={28} w="60%" /> : kpi.val}
                        </div>
                        <div className="stat-box-label">{kpi.label}</div>
                    </div>
                ))}
            </div>

            {/* Funnel chart + SLA grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>

                {/* Funnel as a donut */}
                <div className="card" style={{ padding: "1.25rem" }}>
                    <div className="card-title" style={{ fontSize: 14, marginBottom: "1rem" }}>Hiring Funnel</div>
                    {loading ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220 }}>
                            <div className="ana-skel" style={{ width: 170, height: 170, borderRadius: "50%" }} />
                        </div>
                    ) : funnelData.every(f => f.value === 0) ? (
                        <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--twd-faint)", fontSize: 13 }}>
                            No pipeline activity yet
                        </div>
                    ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                            <div
                                style={{ flex: "1 1 220px", minWidth: 200, position: "relative" }}
                                onMouseMove={e => {
                                    const r = e.currentTarget.getBoundingClientRect();
                                    setTipPos({ x: e.clientX - r.left, y: e.clientY - r.top });
                                }}
                            >
                                <ResponsiveContainer width="100%" height={230}>
                                    <PieChart>
                                        <Pie
                                            data={funnelData.filter(f => f.value > 0)}
                                            dataKey="value"
                                            nameKey="name"
                                            innerRadius={62}
                                            outerRadius={95}
                                            paddingAngle={3}
                                            stroke="var(--twd-surface)"
                                            strokeWidth={2}
                                        >
                                            {funnelData.filter(f => f.value > 0).map((f) => (
                                                <Cell key={f.name} fill={FUNNEL_COLORS[funnelData.findIndex(x => x.name === f.name)]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            position={{ x: tipPos.x + 14, y: tipPos.y + 14 }}
                                            isAnimationActive={false}
                                            contentStyle={{ background: "var(--twd-surface)", border: "1px solid var(--twd-line)", borderRadius: 10, fontSize: 12.5, color: "var(--twd-ink)" }}
                                            itemStyle={{ color: "var(--twd-ink)" }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div style={{ flex: "0 1 auto", display: "flex", flexDirection: "column", gap: 8 }}>
                                {funnelData.map((f, i) => (
                                    <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--twd-soft)" }}>
                                        <span style={{ width: 9, height: 9, borderRadius: 3, background: FUNNEL_COLORS[i], flexShrink: 0 }} />
                                        <span style={{ minWidth: 76 }}>{f.name}</span>
                                        <strong style={{ color: "var(--twd-ink)" }}>{f.value}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right column: by client + SLA health */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                    <div className="card" style={{ padding: "1.25rem", flex: 1 }}>
                        <div className="card-title" style={{ fontSize: 14, marginBottom: "0.75rem" }}>Open by Client</div>
                        {loading ? <Skel h={80} /> : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto", overscrollBehavior: "contain", paddingRight: 6 }}>
                                {(d.clients || []).length === 0
                                    ? <span style={{ fontSize: 12, color: "var(--twd-faint)" }}>No open requirements</span>
                                    : (d.clients as string[]).map((c: string) => (
                                        <div key={c} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--twd-soft)" }}>
                                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--twd-red)", flexShrink: 0 }} />
                                            {c}
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>

                    <div className="card" style={{ padding: "1.25rem", flex: 0 }}>
                        <div className="card-title" style={{ fontSize: 14, marginBottom: "0.75rem" }}>SLA Health</div>
                        {loading ? <Skel h={60} /> : (
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                {[
                                    { label: "On Track", val: d.sla_on_track ?? 0, color: "#16a34a" },
                                    { label: "At Risk", val: d.sla_at_risk ?? 0, color: "#d97706" },
                                    { label: "Breached", val: d.sla_breached ?? 0, color: "#dc2626" },
                                ].map(s => (
                                    <span key={s.label} style={{
                                        padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                                        background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}30`,
                                    }}>
                                        {s.val} {s.label}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

function AssignedPopover({ names }: { names: string[] }) {
    const [rect, setRect] = useState<DOMRect | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!rect) return;
        const handler = (e: MouseEvent) => {
            if (btnRef.current && !btnRef.current.contains(e.target as Node)) setRect(null);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [rect]);

    if (names.length === 0) return <span style={{ color: "var(--twd-faint)", fontSize: 12 }}>-</span>;

    const toggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setRect(r => r ? null : btnRef.current!.getBoundingClientRect());
    };

    return (
        <>
            <button
                ref={btnRef}
                onClick={toggle}
                style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "2px 9px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", border: "1px solid var(--twd-line2)",
                    background: rect ? "var(--twd-surface2)" : "var(--twd-surface)",
                    color: "var(--twd-ink)",
                }}
            >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--twd-red)", flexShrink: 0 }} />
                {names.length}
            </button>
            {rect && (
                <div
                    className="twd-vars"
                    style={{
                        position: "fixed",
                        top: rect.top - 8,
                        left: rect.left + rect.width / 2,
                        transform: "translate(-50%, -100%)",
                        background: "var(--twd-surface)",
                        border: "1px solid var(--twd-line)",
                        borderRadius: 10,
                        boxShadow: "0 10px 28px rgba(28,18,16,0.16)",
                        padding: "6px 0",
                        minWidth: 160, maxWidth: 240,
                        zIndex: 9999,
                    }}
                    onMouseDown={e => e.stopPropagation()}
                >
                    <div style={{
                        position: "absolute", bottom: -5, left: "50%",
                        transform: "translateX(-50%) rotate(45deg)",
                        width: 9, height: 9, background: "var(--twd-surface)",
                        borderRight: "1px solid var(--twd-line)",
                        borderBottom: "1px solid var(--twd-line)",
                    }} />
                    {names.map((n, i) => (
                        <div key={i} style={{ padding: "5px 14px", fontSize: 12, color: "var(--twd-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {n}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// TAB 2 - Requirements Tracker
// ────────────────────────────────────────────────────────────────────────────

function TrackerTab() {
    const { applied: { client, search }, setCounts } = useContext(FilterCtx);
    const navigate = useNavigate();
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<string>("submitted");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [page, setPage] = useState(1);
    const scrollRef = useRef<HTMLDivElement>(null);
    const goPage = (p: number) => { setPage(p); scrollRef.current?.scrollTo({ top: 0 }); };
    useEffect(() => { setPage(1); }, [client, search, sortKey, sortDir]);

    useEffect(() => {
        analyticsApi.getRequirementsTracker()
            .then(setRows)
            .catch((e: any) => setError(e?.detail || "Failed to load"))
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => rows.filter(r => {
        const matchesClient = !client || toSlug(r.company_name || "") === toSlug(client);
        const matchesSearch = !search
            || r.company_name?.toLowerCase().includes(search.toLowerCase())
            || r.requirement_name?.toLowerCase().includes(search.toLowerCase())
            || r.req_id?.toLowerCase().includes(search.toLowerCase());
        return matchesClient && matchesSearch;
    }), [rows, client, search]);

    useEffect(() => {
        const totalClients = new Set(filtered.map(r => r.company_name).filter(Boolean)).size;
        const openReqs = filtered.filter(r => r.status === "OPEN").length;
        const closedReqs = filtered.filter(r => r.status === "CLOSED").length;

        setCounts(
            <>
                {!client && <div style={{ fontSize: 13, color: "var(--twd-soft)" }}>Clients: <strong style={{ color: "var(--twd-ink)" }}>{totalClients}</strong></div>}
                <div style={{ fontSize: 13, color: "var(--twd-soft)" }}>Open Reqs: <strong style={{ color: "var(--twd-ink)" }}>{openReqs}</strong></div>
                {client && <div style={{ fontSize: 13, color: "var(--twd-soft)" }}>Closed Reqs: <strong style={{ color: "var(--twd-ink)" }}>{closedReqs}</strong></div>}
            </>
        );
        return () => setCounts(null);
    }, [filtered, client, setCounts]);

    const sorted = useMemo(() => [...filtered].sort((a, b) => {
        const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
        if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === "asc" ? av - bv : bv - av;
    }), [filtered, sortKey, sortDir]);

    const toggleSort = (k: string) => {
        if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortKey(k); setSortDir("desc"); }
    };

    const Th = ({ k, label }: { k: string; label: string }) => (
        <th style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} onClick={() => toggleSort(k)}>
            {label} {sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : ""}
        </th>
    );

    if (error) return <ErrMsg msg={error} />;

    return (
        <>
            <div className="data-table-wrap">
                <Pagination top page={page} total={sorted.length} onPage={goPage} />
                <div className="data-table-scroll" ref={scrollRef} style={{ height: "calc(100vh - 275px)", minHeight: 300 }}>
                    <table className="data-table" style={{ tableLayout: "fixed", width: "100%", minWidth: 900 }}>
                        <colgroup>
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "14%" }} />
                            <col style={{ width: "18%" }} />
                            <col style={{ width: "5%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "7%" }} />
                            <col style={{ width: "7%" }} />
                            <col style={{ width: "7%" }} />
                            <col style={{ width: "6%" }} />
                            <col style={{ width: "9%" }} />
                            <col style={{ width: "9%" }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>Req ID</th><th>Client</th><th>Role</th><th>Type</th>
                                <Th k="sla_status" label="SLA" /><Th k="submitted" label="Subm." />
                                <Th k="in_interview" label="Intvw" /><Th k="selected" label="Sel." />
                                <Th k="joined" label="Jnd" /><Th k="status" label="Status" />
                                <th>Assigned</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <SkeletonRows cols={11} /> : sorted.length === 0 ? (
                                <tr><td colSpan={11} className="table-empty">No requirements found.</td></tr>
                            ) : paginate(sorted, page).map(r => (
                                <tr key={r.id} style={{ cursor: "pointer" }}
                                    onClick={() => {
                                        const slug = toSlug(r.requirement_name || "");
                                        navigate(slug ? `/analytics/requirements/${slug}` : `/requirements/${r.id}`);
                                    }}>
                                    <td>
                                        <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--twd-red-text)" }}>
                                            {r.req_id}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.company_name || "-"}</td>
                                    <td style={{ overflow: "hidden" }}>
                                        <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.requirement_name}</div>
                                        {r.years_of_experience && <div style={{ fontSize: 11, color: "var(--twd-faint)" }}>{r.years_of_experience} yrs</div>}
                                    </td>
                                    <td>
                                        {r.is_rollover
                                            ? <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>Rollover</span>
                                            : <span style={{ color: "var(--twd-faint)", fontSize: 12 }}>-</span>}
                                    </td>
                                    <td><SlaChip status={r.sla_status} /></td>
                                    <td><PillCount n={r.submitted} color="#e5352b" /></td>
                                    <td><PillCount n={r.in_interview} color="#d97706" /></td>
                                    <td><PillCount n={r.selected} color="#16a34a" /></td>
                                    <td><PillCount n={r.joined} color="#0891b2" /></td>
                                    <td><StatusBadge status={r.status} /></td>
                                    <td><AssignedPopover names={r.assigned_recruiters || []} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// TAB 3 - Submissions
// ────────────────────────────────────────────────────────────────────────────

function firstNameOnly(name?: string | null): string {
    if (!name) return "-";
    return name.split(" ")[0];
}

const COPY_COLS = [
    { label: "S.No", get: (_: any, i: number) => String(i + 1) },
    { label: "Date", get: (s: any) => fmtDate(s.sent_at) },
    { label: "Job Role", get: (s: any) => s.requirement_name ?? "-" },
    { label: "Candidate Name", get: (s: any) => s.candidate_name ?? "-" },
    { label: "Contact No.", get: (s: any) => s.candidate_phone ?? "-" },
    { label: "Email ID", get: (s: any) => s.candidate_email ?? "-" },
    { label: "Total Exp", get: (s: any) => s.total_experience ?? "-" },
    { label: "Rel Exp", get: (s: any) => s.relevant_experience ?? "-" },
    { label: "NP (days)", get: (s: any) => s.notice_period ?? "-" },
    { label: "Current CTC", get: (s: any) => s.current_ctc != null ? `${s.current_ctc} LPA` : "-" },
    { label: "Expected CTC", get: (s: any) => s.expected_ctc != null ? `${s.expected_ctc} LPA` : "-" },
    { label: "Current Company", get: (s: any) => s.current_company ?? "-" },
    { label: "Location", get: (s: any) => s.location ?? "-" },
    { label: "Recruiter", get: (s: any) => s.recruiter_name ?? "-" },
    { label: "Status", get: (s: any) => s.status ?? "-" },
];

function buildCopyHtml(rows: any[], startIdx = 0, includeHeader = true): string {
    const thStyle = "border:1px solid #9ca3af;background:#bfdbfe;padding:6px 10px;font-size:12px;font-weight:700;white-space:nowrap;text-align:left;";
    const tdStyle = "border:1px solid #d1d5db;padding:5px 10px;font-size:12px;white-space:nowrap;";
    const trAlt = "background:#eff6ff;";

    const thead = includeHeader
        ? `<thead><tr>${COPY_COLS.map(c => `<th style="${thStyle}">${c.label}</th>`).join("")}</tr></thead>`
        : "";
    const bodyRows = rows.map((s, i) => {
        const cells = COPY_COLS.map(c => `<td style="${tdStyle}">${c.get(s, startIdx + i)}</td>`).join("");
        return `<tr${i % 2 === 1 ? ` style="${trAlt}"` : ""}>${cells}</tr>`;
    }).join("");

    return `<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;">${thead}<tbody>${bodyRows}</tbody></table>`;
}

function buildCopyText(rows: any[], startIdx = 0, includeHeader = true): string {
    const body = rows.map((s, i) => COPY_COLS.map(c => c.get(s, startIdx + i)).join("\t")).join("\n");
    if (!includeHeader) return body;
    return `${COPY_COLS.map(c => c.label).join("\t")}\n${body}`;
}

async function copySubmissionsTable(rows: any[], setCopied: (v: boolean) => void) {
    if (!rows.length) return;
    const html = buildCopyHtml(rows, 0);
    const text = buildCopyText(rows, 0);
    try {
        if (typeof ClipboardItem !== "undefined") {
            await navigator.clipboard.write([
                new ClipboardItem({
                    "text/html": new Blob([html], { type: "text/html" }),
                    "text/plain": new Blob([text], { type: "text/plain" }),
                }),
            ]);
        } else {
            await navigator.clipboard.writeText(text);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    } catch {
        // fallback: select a hidden textarea
        const el = document.createElement("textarea");
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    }
}

const CELL: CSSProperties = {
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    maxWidth: 0,
};

// Shortlisted cell - collapsed shows the current value (or a gray "Update" placeholder when
// unset); pressing it (admin only) reveals the Yes / No choices.
function ShortlistCell({ value, editable, onChange }: { value: boolean | null; editable: boolean; onChange: (val: boolean | null) => void }) {
    const [open, setOpen] = useState(false);
    const base: CSSProperties = { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 4, display: "inline-block", whiteSpace: "nowrap", border: "1px solid" };

    if (open && editable) {
        return (
            <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                <button onClick={() => { onChange(true); setOpen(false); }}
                    style={{ ...base, cursor: "pointer", background: "#dcfce7", color: "#16a34a", borderColor: "#16a34a" }}>✓ Yes</button>
                <button onClick={() => { onChange(false); setOpen(false); }}
                    style={{ ...base, cursor: "pointer", background: "#fee2e2", color: "#dc2626", borderColor: "#dc2626" }}>✗ No</button>
                {value !== null && (
                    <button onClick={() => { onChange(null); setOpen(false); }}
                        style={{ ...base, cursor: "pointer", background: "var(--twd-surface2)", color: "var(--twd-faint)", borderColor: "var(--twd-line2)" }}>× Clear</button>
                )}
            </span>
        );
    }

    const style: CSSProperties = value === true
        ? { background: "#dcfce7", color: "#16a34a", borderColor: "#86efac" }
        : value === false
            ? { background: "#fee2e2", color: "#dc2626", borderColor: "#fca5a5" }
            : { background: "var(--twd-surface2)", color: "var(--twd-faint)", borderColor: "var(--twd-line2)" };
    const label = value === true ? "✓ Yes" : value === false ? "✗ No" : "Update";

    return (
        <span
            onClick={editable ? () => {
                if (value === null) {
                    onChange(true);
                } else {
                    setOpen(true);
                }
            } : undefined}
            title={editable ? "Click to set shortlisted status" : "Set automatically from interview progress"}
            style={{ ...base, ...style, cursor: editable ? "pointer" : "default" }}
        >{label}</span>
    );
}

// Focused side drawer for a submission - shows only the recruiter-submitted details
// (already present in the list response, so no extra fetch), plus resume + comments.
function EditField({ label, value, onChange, placeholder, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
    return (
        <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--twd-faint)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 3 }}>{label}</div>
            <input
                type={type || "text"} value={value} placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: "6px 9px", border: "1px solid var(--twd-line2)", borderRadius: 6, background: "var(--twd-surface)", color: "var(--twd-ink)" }}
            />
        </div>
    );
}

function SubmissionDrawer({ sub, isAdmin, onClose, onShortlist, onCandidateSaved }: { sub: any; isAdmin: boolean; onClose: () => void; onShortlist?: (appId: string, val: boolean | null) => void; onCandidateSaved?: (appId: string, patch: any) => void }) {
    const [comments, setComments] = useState<any[]>([]);
    const [draft, setDraft] = useState("");
    const [posting, setPosting] = useState(false);
    const [resumeUrl, setResumeUrl] = useState<string | null>(null);
    const [resumeErr, setResumeErr] = useState<string | null>(null);
    const [resumeMime, setResumeMime] = useState("application/pdf");
    const [shortlisted, setShortlisted] = useState<boolean | null>(sub.client_shortlisted ?? null);
    const [savingSL, setSavingSL] = useState(false);
    const [includeSummary, setIncludeSummary] = useState<boolean>(sub.include_summary_report ?? false);
    const [savingIS, setSavingIS] = useState(false);
    const [view, setView] = useState<"details" | "summary">("details");

    // Manual edit of candidate details - for when résumé parsing missed them.
    const [editing, setEditing] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editErr, setEditErr] = useState<string | null>(null);
    const emptyForm = () => ({
        name: sub.candidate_name ?? "", phone: sub.candidate_phone ?? "", email: sub.candidate_email ?? "",
        current_role: sub.current_role ?? "", current_company: sub.current_company ?? "",
        total_experience: sub.total_experience ?? "", relevant_experience: sub.relevant_experience ?? "",
        notice_period: sub.notice_period ?? "", location: sub.location ?? "",
        current_ctc: sub.current_ctc != null ? String(sub.current_ctc) : "", expected_ctc: sub.expected_ctc != null ? String(sub.expected_ctc) : "",
    });
    const [form, setForm] = useState(emptyForm());
    const startEdit = () => { setForm(emptyForm()); setEditErr(null); setEditing(true); };
    const setF = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

    const saveEdit = async () => {
        if (!sub.candidate_id) return;
        setSavingEdit(true); setEditErr(null);
        const s = (v: string) => (v.trim() === "" ? null : v.trim());
        const num = (v: string) => (v.trim() === "" ? null : (isNaN(parseFloat(v)) ? null : parseFloat(v)));
        const patch: any = {
            Name: s(form.name), PhoneNumber: s(form.phone), Email: s(form.email),
            current_role: s(form.current_role), current_company: s(form.current_company),
            experience_label: s(form.total_experience), relevant_experience: s(form.relevant_experience),
            notice_period: s(form.notice_period), location: s(form.location),
            current_ctc: num(form.current_ctc), expected_ctc: num(form.expected_ctc),
        };
        try {
            await api.patch(`/candidates/${sub.candidate_id}`, patch);
            onCandidateSaved?.(sub.application_id, {
                candidate_name: patch.Name, candidate_phone: patch.PhoneNumber, candidate_email: patch.Email,
                current_role: patch.current_role, current_company: patch.current_company,
                total_experience: patch.experience_label, relevant_experience: patch.relevant_experience,
                notice_period: patch.notice_period, location: patch.location,
                current_ctc: patch.current_ctc, expected_ctc: patch.expected_ctc,
            });
            setEditing(false);
        } catch (e: any) {
            setEditErr(e?.detail || "Failed to save");
        } finally {
            setSavingEdit(false);
        }
    };

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    // Lock the page scroll while the drawer is open
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);

    const loadComments = () => {
        if (!sub.candidate_id) return;
        api.get(`/candidates/${sub.candidate_id}/profile-comments`)
            .then((d: any) => setComments(d.comments || []))
            .catch(() => setComments([]));
    };
    useEffect(loadComments, [sub.candidate_id]);

    // Resume - fetch the binary with auth (iframe can't send headers) and show it as a blob URL.
    useEffect(() => {
        if (!sub.candidate_id) return;
        let url: string | null = null;
        let cancelled = false;
        (async () => {
            setResumeErr(null);
            try {
                const token = await getToken();
                const res = await fetch(`${API_BASE}/candidates/${sub.candidate_id}/resume`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (!res.ok) throw new Error(res.status === 404 ? "No resume on file" : `Failed (HTTP ${res.status})`);
                const blob = await res.blob();
                if (cancelled) return;
                setResumeMime(res.headers.get("Content-Type") || "application/pdf");
                url = URL.createObjectURL(blob);
                setResumeUrl(url);
            } catch (e: any) {
                if (!cancelled) setResumeErr(e?.message || "Failed to load resume");
            }
        })();
        return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    }, [sub.candidate_id]);

    // Shortlisted - admin/client-manager sets Yes / No / null (clear). Optimistic, reverts on failure.
    const setShortlist = async (val: boolean | null) => {
        if (savingSL || shortlisted === val) return;
        const prev = shortlisted;
        setSavingSL(true);
        setShortlisted(val);
        try {
            await api.patch(`/applications/${sub.application_id}/shortlist`, { shortlisted: val });
            onShortlist?.(sub.application_id, val);
        } catch {
            setShortlisted(prev);
        } finally {
            setSavingSL(false);
        }
    };

    const toggleIncludeSummary = async (val: boolean) => {
        if (savingIS || includeSummary === val) return;
        const prev = includeSummary;
        setSavingIS(true);
        setIncludeSummary(val);
        try {
            await api.patch(`/applications/${sub.application_id}/include-summary`, { include_summary_report: val });
        } catch {
            setIncludeSummary(prev);
        } finally {
            setSavingIS(false);
        }
    };

    const postComment = async () => {
        const text = draft.trim();
        if (!text || posting || !sub.requirement_id || !sub.candidate_id) return;
        setPosting(true);
        try {
            await api.post(`/requirements/${sub.requirement_id}/profiles/${sub.candidate_id}/comments`, { comment: text });
            setDraft("");
            loadComments();
        } catch { /* ignore */ } finally {
            setPosting(false);
        }
    };

    const Field = ({ label, value }: { label: string; value?: any }) => (
        <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--twd-faint)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, color: "var(--twd-ink)", fontWeight: 500, lineHeight: 1.45 }}>
                {value ?? <span style={{ color: "var(--twd-faint)" }}>-</span>}
            </div>
        </div>
    );

    return (
        <>
            <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(28,18,16,0.32)", backdropFilter: "blur(2px)" }} />
            <aside className="twd-vars" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(55vw, 720px)", background: "var(--twd-paper)", borderLeft: "1px solid var(--twd-line)", boxShadow: "-14px 0 40px rgba(28,18,16,0.16)", zIndex: 1000, display: "flex", flexDirection: "column", color: "var(--twd-ink)" }}>
                <header style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--twd-line)", background: "var(--twd-surface)", display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 21, letterSpacing: "-0.01em", color: "var(--twd-ink)", lineHeight: 1.2 }}>{sub.candidate_name || "-"}</div>
                        <div style={{ fontSize: 12, color: "var(--twd-soft)", marginTop: 5, display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                            <StatusBadge status={sub.offer_status || sub.dynamic_status || sub.status} />
                            <span style={{ color: "var(--twd-faint)" }}>·</span>
                            <span>{fmtDate(sub.sent_at)}</span>
                            {isAdmin && sub.recruiter_name && <span>· by <strong style={{ color: "var(--twd-ink)" }}>{sub.recruiter_name}</strong></span>}
                        </div>
                        {(sub.requirement_name || sub.company_name) && (
                            <div style={{ fontSize: 12, color: "var(--twd-faint)", marginTop: 2 }}>{sub.requirement_name}{sub.company_name ? ` · ${sub.company_name}` : ""}</div>
                        )}
                    </div>
                    {isAdmin && (sub.status === "REJECTED" || sub.dynamic_status === "Rejected") && (
                        <button
                            className="twd-btn twd-btn-ghost twd-btn-sm"
                            style={{ color: "#d97706", borderColor: "#fcd34d" }}
                            onClick={() => setShortlist(null)}
                            disabled={savingSL}
                            title="Undo rejection and move back to Submissions"
                        >{savingSL ? "Reverting..." : "Revert Rejection"}</button>
                    )}
                    <button onClick={onClose} className="twd-close" title="Close (Esc)" aria-label="Close">×</button>
                </header>

                <div style={{ display: "flex", gap: 6, padding: "0.65rem 1.2rem 0" }}>
                    {(["details", "summary"] as const).map((v) => (
                        <button key={v} onClick={() => setView(v)}
                            style={{
                                padding: "4px 12px", borderRadius: 999, border: `1px solid ${view === v ? "var(--twd-red)" : "var(--twd-line)"}`, cursor: "pointer", fontSize: 12.5,
                                background: view === v ? "var(--twd-red)" : "transparent", color: view === v ? "#fff" : "var(--twd-soft)", fontWeight: view === v ? 600 : 400,
                                transition: "background 0.15s ease, color 0.15s ease"
                            }}>
                            {v === "details" ? "Details & Resume" : "Summary Report"}
                        </button>
                    ))}
                </div>

                {view === "summary" && (
                    <div style={{ flex: 1, overflowY: "auto", padding: "1.1rem 1.2rem" }}>
                        {sub.candidate_id && sub.requirement_id
                            ? <ScorecardReport requirementId={sub.requirement_id} candidateId={sub.candidate_id} />
                            : <div style={{ fontSize: 13, color: "var(--twd-soft)" }}>No candidate summary available for this submission.</div>}
                    </div>
                )}

                <div style={{ flex: 1, overflowY: "auto", padding: "1.1rem 1.2rem", display: view === "details" ? "flex" : "none", flexDirection: "column", gap: "1rem" }}>
                    {/* Recruiter-submitted details - editable when résumé parsing missed fields */}
                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--twd-faint)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Candidate Details</div>
                            {sub.candidate_id && (editing ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button className="twd-btn twd-btn-primary twd-btn-sm" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving…" : "Save"}</button>
                                    <button className="twd-btn twd-btn-ghost twd-btn-sm" onClick={() => setEditing(false)} disabled={savingEdit}>Cancel</button>
                                </div>
                            ) : (
                                <button className="twd-btn twd-btn-ghost twd-btn-sm" onClick={startEdit} title="Fill in details missed by résumé parsing">✎ Edit</button>
                            ))}
                        </div>
                        {editErr && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 6 }}>{editErr}</div>}
                        {editing ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem 1rem" }}>
                                <EditField label="Candidate Name" value={form.name} onChange={(v) => setF("name", v)} />
                                <EditField label="Phone" value={form.phone} onChange={(v) => setF("phone", v)} />
                                <EditField label="Email" value={form.email} onChange={(v) => setF("email", v)} />
                                <EditField label="Current Role" value={form.current_role} onChange={(v) => setF("current_role", v)} />
                                <EditField label="Current Company" value={form.current_company} onChange={(v) => setF("current_company", v)} />
                                <EditField label="Total Experience" value={form.total_experience} onChange={(v) => setF("total_experience", v)} placeholder="e.g. 20.5 yrs" />
                                <EditField label="Relevant Experience" value={form.relevant_experience} onChange={(v) => setF("relevant_experience", v)} />
                                <EditField label="Notice Period" value={form.notice_period} onChange={(v) => setF("notice_period", v)} />
                                <EditField label="Location" value={form.location} onChange={(v) => setF("location", v)} />
                                <EditField label="Current CTC (LPA)" value={form.current_ctc} onChange={(v) => setF("current_ctc", v)} type="number" />
                                <EditField label="Expected CTC (LPA)" value={form.expected_ctc} onChange={(v) => setF("expected_ctc", v)} type="number" />
                            </div>
                        ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem 1.5rem" }}>
                                <Field label="Phone" value={sub.candidate_phone
                                    ? <a href={`tel:${sub.candidate_phone}`} style={{ color: "var(--twd-red-text)", textDecoration: "none", fontFamily: "monospace" }}>{sub.candidate_phone}</a>
                                    : undefined} />
                                <Field label="Email" value={sub.candidate_email
                                    ? <a href={`mailto:${sub.candidate_email}`} style={{ color: "var(--twd-red-text)", textDecoration: "none", fontSize: 12 }}>{sub.candidate_email}</a>
                                    : undefined} />
                                <Field label="Current Role" value={sub.current_role} />
                                <Field label="Current Company" value={sub.current_company} />
                                <Field label="Total Experience" value={sub.total_experience} />
                                <Field label="Relevant Experience" value={sub.relevant_experience} />
                                <Field label="Notice Period" value={sub.notice_period ? <span style={{ color: noticePeriodColor(sub.notice_period), fontWeight: 600 }}>{sub.notice_period}</span> : undefined} />
                                <Field label="Location" value={sub.location} />
                                <Field label="Current CTC" value={sub.current_ctc != null ? `${sub.current_ctc} LPA` : undefined} />
                                <Field label="Expected CTC" value={sub.expected_ctc != null ? `${sub.expected_ctc} LPA` : undefined} />
                            </div>
                        )}
                    </div>

                    {/* Shortlisted - admin/client-manager toggles Yes / No */}
                    <div style={{ borderTop: "1px solid var(--twd-line2)", paddingTop: "0.85rem", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--twd-faint)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Shortlisted</div>
                        {isAdmin ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                {shortlisted == null && (
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: "var(--twd-surface2)", color: "var(--twd-faint)", border: "1px solid var(--twd-line2)" }}>Not set</span>
                                )}
                                <button onClick={() => setShortlist(true)} disabled={savingSL}
                                    style={{
                                        fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                                        background: shortlisted === true ? "#dcfce7" : "transparent", color: "#16a34a",
                                        border: `1px solid ${shortlisted === true ? "#16a34a" : "var(--twd-line2)"}`
                                    }}>✓ Yes</button>
                                <button onClick={() => setShortlist(false)} disabled={savingSL}
                                    style={{
                                        fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                                        background: shortlisted === false ? "#fee2e2" : "transparent", color: "#dc2626",
                                        border: `1px solid ${shortlisted === false ? "#dc2626" : "var(--twd-line2)"}`
                                    }}>✗ No</button>
                                {shortlisted !== null && (
                                    <button onClick={() => setShortlist(null)} disabled={savingSL}
                                        style={{
                                            fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                                            background: "transparent", color: "var(--twd-faint)",
                                            border: "1px solid var(--twd-line2)"
                                        }}>× Clear</button>
                                )}
                            </div>
                        ) : (
                            <span style={{ fontSize: 12, fontWeight: 700, color: shortlisted === true ? "#16a34a" : shortlisted === false ? "#dc2626" : "var(--twd-faint)" }}>
                                {shortlisted === true ? "✓ Yes" : shortlisted === false ? "✗ No" : "-"}
                            </span>
                        )}
                    </div>

                    {/* Include Summary Report toggle */}
                    <div style={{ borderTop: "1px solid var(--twd-line2)", paddingTop: "0.85rem", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--twd-faint)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Summary Report</div>
                        <div style={{ flex: 1, fontSize: 12, color: "var(--twd-soft)" }}>Include assessment scorecard with this submission</div>
                        <button
                            onClick={() => toggleIncludeSummary(!includeSummary)}
                            disabled={savingIS}
                            style={{
                                fontSize: 12, fontWeight: 700, padding: "4px 14px", borderRadius: 6, cursor: "pointer",
                                background: includeSummary ? "#dbeafe" : "transparent",
                                color: includeSummary ? "#1d4ed8" : "var(--twd-faint)",
                                border: `1px solid ${includeSummary ? "#93c5fd" : "var(--twd-line2)"}`,
                            }}>
                            {savingIS ? "…" : includeSummary ? "Included" : "Not included"}
                        </button>
                    </div>

                    {/* Flags */}
                    {Array.isArray(sub.flags) && sub.flags.length > 0 && (
                        <div style={{ borderTop: "1px solid var(--twd-line2)", paddingTop: "0.85rem" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--twd-faint)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>Flags</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {sub.flags.map((f: any, i: number) => {
                                    const warn = f.severity === "warning";
                                    return (
                                        <div key={i} style={{
                                            fontSize: 12.5, padding: "5px 9px", borderRadius: 6, lineHeight: 1.4,
                                            background: warn ? "#fef3c7" : "#dbeafe", color: warn ? "#92400e" : "#1d4ed8",
                                            border: `1px solid ${warn ? "#fde68a" : "#bfdbfe"}`
                                        }}>{f.message}</div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Reason for Change */}
                    {sub.reason_for_change && (
                        <div style={{ borderTop: "1px solid var(--twd-line2)", paddingTop: "0.85rem" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--twd-faint)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Reason for Change</div>
                            <div style={{ fontSize: 13, color: "var(--twd-ink)", lineHeight: 1.55 }}>{sub.reason_for_change}</div>
                        </div>
                    )}

                    {/* Comments */}
                    <div style={{ borderTop: "1px solid var(--twd-line2)", paddingTop: "0.85rem" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--twd-faint)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>Comments</div>
                        {isAdmin && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} placeholder="Add a comment about this candidate…"
                                    style={{ resize: "vertical", padding: "0.5rem", fontSize: 13, border: "1px solid var(--twd-line2)", borderRadius: 6, background: "var(--twd-surface)", color: "var(--twd-ink)" }} />
                                <button className="twd-btn twd-btn-primary twd-btn-sm" style={{ marginLeft: "auto" }} onClick={postComment} disabled={posting || !draft.trim()}>{posting ? "Posting…" : "Post comment"}</button>
                            </div>
                        )}
                        {comments.length === 0
                            ? <div style={{ fontSize: 13, color: "var(--twd-faint)" }}>No comments yet.</div>
                            : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {comments.map((c: any, i: number) => (
                                    <div key={i} style={{ background: "var(--twd-surface2)", borderRadius: 6, padding: "0.55rem 0.7rem" }}>
                                        <div style={{ fontSize: 13, color: "var(--twd-ink)" }}>{c.comment}</div>
                                        <div style={{ fontSize: 11, color: "var(--twd-soft)", marginTop: 3 }}>
                                            <strong style={{ color: "var(--twd-ink)" }}>{c.author_name || "Unknown"}</strong>
                                            {c.date && <> · {fmtDate(c.date)}</>}
                                            {c.requirement_name && <> · {c.requirement_name}</>}
                                        </div>
                                    </div>
                                ))}
                            </div>}
                    </div>

                    {/* Resume - always shown at the bottom */}
                    <div style={{ borderTop: "1px solid var(--twd-line2)", paddingTop: "0.85rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--twd-faint)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Resume</div>
                            {resumeUrl && (
                                <div style={{ display: "flex", gap: 8 }}>
                                    <a href={resumeUrl} target="_blank" rel="noopener noreferrer" className="twd-btn twd-btn-ghost twd-btn-sm">Open in new tab ↗</a>
                                    <a href={resumeUrl} download={sub.candidate_name || "resume"} className="twd-btn twd-btn-ghost twd-btn-sm">Download</a>
                                </div>
                            )}
                        </div>
                        <div style={{ height: "72vh", border: "1px solid var(--twd-line2)", borderRadius: 8, overflow: "hidden", background: "var(--twd-surface2)" }}>
                            {resumeErr
                                ? <div style={{ padding: "1rem", fontSize: 13, color: "#dc2626" }}>{resumeErr}</div>
                                : !resumeUrl
                                    ? <div style={{ padding: "1rem", fontSize: 13, color: "var(--twd-soft)" }}>Loading resume…</div>
                                    : resumeMime.includes("pdf")
                                        ? <iframe src={resumeUrl} title="Resume" style={{ width: "100%", height: "100%", border: "none" }} />
                                        : <div style={{ padding: "1rem", fontSize: 13, color: "var(--twd-soft)" }}>Preview is only available for PDFs - use “Open in new tab” or “Download”.</div>}
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}



function SubmissionsTab({ isAdmin }: { isAdmin: boolean }) {
    const { applied, liveSearch, setRecruiterOptions, setCounts, clientOptions } = useContext(FilterCtx);
    const [subs, setSubs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<any>(null);
    const [scheduleModalApp, setScheduleModalApp] = useState<any>(null);
    const [copied, setCopied] = useState(false);
    const [rowCopied, setRowCopied] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const goPage = (p: number) => { setPage(p); scrollRef.current?.scrollTo({ top: 0 }); };

    const [clientFilter, setClientFilter] = useState<Set<string>>(new Set());
    const [clientMenuOpen, setClientMenuOpen] = useState(false);
    const clientMenuRef = useRef<HTMLDivElement>(null);

    const [recruiterFilter, setRecruiterFilter] = useState<Set<string>>(new Set());
    const [recruiterMenuOpen, setRecruiterMenuOpen] = useState(false);
    const recruiterMenuRef = useRef<HTMLDivElement>(null);

    const distinctClients = useMemo(() => {
        const set = new Set(clientOptions);
        subs.forEach((s: any) => {
            if (s.company_name) set.add(s.company_name);
        });
        return Array.from(set).sort();
    }, [subs, clientOptions]);
    const distinctRecruiters = useMemo(() => Array.from(new Set(subs.map((s: any) => s.recruiter_name).filter(Boolean))).sort() as string[], [subs]);

    // Menu outside-click is handled by PortalFilterMenu

    const toggleClient = (name: string) => setClientFilter(prev => {
        const next = new Set(prev);
        next.has(name) ? next.delete(name) : next.add(name);
        return next;
    });

    const toggleRecruiter = (name: string) => setRecruiterFilter(prev => {
        const next = new Set(prev);
        next.has(name) ? next.delete(name) : next.add(name);
        return next;
    });

    // Load the full filtered set in one go, then paginate client-side (same as the
    // Profiles tab). The text search is applied live below, not on the server.
    const load = (filters: AppliedFilters) => {
        setLoading(true);
        setError(null);
        analyticsApi.getSubmissions({
            client: filters.client,
            status: filters.status,
            recruiter_id: filters.recruiterId,
            date_from: filters.dateFrom || undefined,
            date_to: filters.dateTo || undefined,
            skip: 0,
            limit: 500,   // server max (le=500); paginated client-side below
        })
            .then((res: any[]) => {
                const items = res || [];
                setSubs(items);
                const opts = Array.from(
                    new Map(items.filter((s: any) => s.recruiter_id && s.recruiter_name).map((s: any) => [s.recruiter_id, s.recruiter_name])).entries()
                ).map(([id, name]) => ({ id: id as string, name: name as string })).sort((a, b) => a.name.localeCompare(b.name));
                setRecruiterOptions(opts);
            })
            .catch((e: any) => setError(e?.detail || "Failed to load submissions"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        setSubs([]);
        setPage(1);
        load(applied);
    }, [applied.client, applied.status, applied.recruiterId, applied.dateFrom, applied.dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

    const displayed = subs.filter((s: any) => {
        if (clientFilter.size > 0 && !clientFilter.has(s.company_name)) return false;
        if (recruiterFilter.size > 0 && !recruiterFilter.has(s.recruiter_name)) return false;
        if (liveSearch.trim()) {
            const q = liveSearch.toLowerCase();
            return s.candidate_name?.toLowerCase().includes(q) ||
                s.requirement_name?.toLowerCase().includes(q) ||
                s.recruiter_name?.toLowerCase().includes(q);
        }
        return true;
    });

    const paged = paginate(displayed, page);

    useEffect(() => { setPage(1); }, [liveSearch, clientFilter, recruiterFilter]);

    useEffect(() => {
        setCounts(
            <div style={{ fontSize: 13, color: "var(--twd-soft)" }}>
                Total Submissions: <strong style={{ color: "var(--twd-ink)" }}>{displayed.length}</strong>
            </div>
        );
        return () => setCounts(null);
    }, [displayed.length, setCounts]);

    const colCount = 12; // +1 for the per-row copy button column

    const copyRow = async (s: any, idx: number) => {
        const html = buildCopyHtml([s], idx, false);
        const text = buildCopyText([s], idx, false);
        try {
            if (typeof ClipboardItem !== "undefined") {
                await navigator.clipboard.write([new ClipboardItem({
                    "text/html": new Blob([html], { type: "text/html" }),
                    "text/plain": new Blob([text], { type: "text/plain" }),
                })]);
            } else {
                await navigator.clipboard.writeText(text);
            }
            setRowCopied(s.application_id);
            setTimeout(() => setRowCopied(null), 2000);
        } catch { /* ignore */ }
    };

    const handleShortlistChange = (appId: string, val: boolean | null, dynamicStatus?: string | null) => {
        const updater = (s: any) => {
            if (s.application_id === appId) {
                const nextStatus = val === false ? "REJECTED" : (val === null ? "SENT" : s.status);
                const updates: any = { client_shortlisted: val, status: nextStatus };
                if (!val) {
                    updates.dynamic_status = null;
                    updates.dynamic_timeline = [];
                } else if (dynamicStatus !== undefined) {
                    updates.dynamic_status = dynamicStatus;
                }
                return { ...s, ...updates };
            }
            return s;
        };
        setSubs(prev => prev.map(updater));
        setSelected((sel: any) => sel ? updater(sel) : sel);
    };

    // Set shortlisted to Yes / No, or clear to null (optimistic, reverts on failure).
    const setShortlistValue = async (appId: string, val: boolean | null) => {
        if (val === true) {
            const app = subs.find(s => s.application_id === appId);
            if (app) setScheduleModalApp(app);
            return;
        }

        const prev = subs.find(s => s.application_id === appId)?.client_shortlisted ?? null;
        const prevStatus = subs.find(s => s.application_id === appId)?.status ?? null;
        handleShortlistChange(appId, val);
        try {
            await api.patch(`/applications/${appId}/shortlist`, { shortlisted: val });
        } catch {
            setSubs(p => p.map(s => s.application_id === appId ? { ...s, client_shortlisted: prev, status: prevStatus || s.status } : s));
        }
    };

    // Manual candidate-detail edit saved from the drawer - reflect it in the row + open drawer.
    const handleCandidateSaved = (appId: string, patch: any) => {
        setSubs(prev => prev.map(s => s.application_id === appId ? { ...s, ...patch } : s));
        setSelected((sel: any) => (sel && sel.application_id === appId ? { ...sel, ...patch } : sel));
    };

    return (
        <>
            {scheduleModalApp && (
                <ShortlistScheduleModal
                    app={scheduleModalApp}
                    onClose={() => setScheduleModalApp(null)}
                    onSuccess={(appId, shortlisted, dynamicStatus) => {
                        handleShortlistChange(appId, shortlisted, dynamicStatus);
                        setScheduleModalApp(null);
                    }}
                />
            )}
            {selected && <SubmissionDrawer sub={selected} isAdmin={isAdmin} onClose={() => setSelected(null)} onShortlist={handleShortlistChange} onCandidateSaved={handleCandidateSaved} />}

            {error && <ErrMsg msg={error} />}

            <div className="data-table-wrap">
                <Pagination
                    top
                    page={page}
                    total={displayed.length}
                    onPage={goPage}
                    actions={
                        displayed.length > 0 && (
                            <button className="twd-btn twd-btn-ghost twd-btn-sm"
                                onClick={() => copySubmissionsTable(displayed, setCopied)}
                                title="Copy all visible rows as a formatted table - paste directly into Gmail or Outlook"
                                style={{ fontSize: 12, gap: 6, display: "flex", alignItems: "center", height: 30 }}>
                                {copied ? <>✓ Copied!</> : <>⧉ Copy All ({displayed.length})</>}
                            </button>
                        )
                    }
                />
                <div className="data-table-scroll" ref={scrollRef} style={{ height: "calc(100vh - 250px)", minHeight: 300 }}>
                    <table className="data-table" style={{ tableLayout: "fixed", minWidth: 940, width: "100%" }}>
                        <colgroup>
                            <col style={{ width: "78px" }} />
                            <col style={{ width: "90px" }} />
                            <col style={{ width: "90px" }} />
                            <col style={{ width: "106px" }} />
                            <col style={{ width: "110px" }} />
                            <col style={{ width: "52px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "54px" }} />
                            <col style={{ width: "72px" }} />
                            <col style={{ width: "92px" }} />
                            <col style={{ width: "104px" }} />
                            <col style={{ width: "40px" }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th style={{ fontSize: 12 }}>Date</th>
                                <th style={{ fontSize: 12, overflow: "visible" }}>
                                    <div ref={clientMenuRef} style={{ display: "inline-block" }}>
                                        <span
                                            onClick={() => setClientMenuOpen(o => !o)}
                                            style={{ cursor: "pointer", userSelect: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                                            title="Filter by client"
                                        >
                                            Client
                                            {clientFilter.size > 0 && (
                                                <span style={{ fontSize: 10, fontWeight: 700, background: "var(--twd-red)", color: "#fff", borderRadius: 999, padding: "0 6px", marginLeft: 4 }}>{clientFilter.size}</span>
                                            )}
                                            &nbsp;<span style={{ fontSize: 9, color: "var(--twd-faint)" }}>▼</span>
                                        </span>
                                        <PortalFilterMenu
                                            title="Filter by client"
                                            count={clientFilter.size}
                                            open={clientMenuOpen}
                                            setOpen={setClientMenuOpen}
                                            onClear={() => { setClientFilter(new Set()); setPage(1); }}
                                            options={distinctClients}
                                            filterSet={clientFilter}
                                            onToggle={(name) => { toggleClient(name); setPage(1); }}
                                            anchorRef={clientMenuRef}
                                        />
                                    </div>
                                </th>
                                <th style={{ fontSize: 12, overflow: "visible" }}>
                                    <div ref={recruiterMenuRef} style={{ display: "inline-block" }}>
                                        <span
                                            onClick={() => setRecruiterMenuOpen(o => !o)}
                                            style={{ cursor: "pointer", userSelect: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                                            title="Filter by recruiter"
                                        >
                                            Recruiter
                                            {recruiterFilter.size > 0 && (
                                                <span style={{ fontSize: 10, fontWeight: 700, background: "var(--twd-red)", color: "#fff", borderRadius: 999, padding: "0 6px", marginLeft: 4 }}>{recruiterFilter.size}</span>
                                            )}
                                            &nbsp;<span style={{ fontSize: 9, color: "var(--twd-faint)" }}>▼</span>
                                        </span>
                                        <PortalFilterMenu
                                            title="Filter by recruiter"
                                            count={recruiterFilter.size}
                                            open={recruiterMenuOpen}
                                            setOpen={setRecruiterMenuOpen}
                                            onClear={() => { setRecruiterFilter(new Set()); setPage(1); }}
                                            options={distinctRecruiters}
                                            filterSet={recruiterFilter}
                                            onToggle={(name) => { toggleRecruiter(name); setPage(1); }}
                                            anchorRef={recruiterMenuRef}
                                        />
                                    </div>
                                </th>
                                <th style={{ fontSize: 12 }}>Role</th>
                                <th style={{ fontSize: 12 }}>Candidate</th>
                                <th style={{ fontSize: 12 }}>Exp</th>
                                <th style={{ fontSize: 12 }}>CTC</th>
                                <th style={{ fontSize: 12 }}>Exp CTC</th>
                                <th style={{ fontSize: 12 }}>Notice</th>
                                <th style={{ fontSize: 12 }} title="Client shortlisted for interview">Shortlisted</th>
                                <th style={{ fontSize: 12 }}>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && subs.length === 0
                                ? <SkeletonRows cols={colCount} />
                                : displayed.length === 0
                                    ? <tr><td colSpan={colCount} className="table-empty">No submissions found.</td></tr>
                                    : paged.map((s: any) => (
                                        <tr
                                            key={s.application_id}
                                            onClick={() => setSelected(s)}
                                            style={{ cursor: "pointer" }}
                                            title="Click to view full details"
                                        >
                                            <td style={{ ...CELL, fontSize: 12 }} title={fmtDate(s.sent_at)}>{fmtDate(s.sent_at)}</td>
                                            <td style={{ ...CELL, fontSize: 13, fontWeight: 600 }} title={s.company_name}>{dash(s.company_name)}</td>
                                            <td style={{ ...CELL, fontSize: 12 }} title={s.recruiter_name}>{firstNameOnly(s.recruiter_name)}</td>
                                            <td style={{ ...CELL, fontSize: 12 }} title={s.requirement_name}>{dash(s.requirement_name)}</td>
                                            <td style={{ ...CELL }} title={s.candidate_name}>
                                                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dash(s.candidate_name)}</div>
                                            </td>
                                            <td style={{ ...CELL, fontSize: 12 }} title={s.total_experience}>{dash(s.total_experience)}</td>
                                            <td style={{ ...CELL, fontSize: 12 }} title={String(s.current_ctc ?? "")}>{dash(s.current_ctc)}</td>
                                            <td style={{ ...CELL, fontSize: 12 }} title={String(s.expected_ctc ?? "")}>{dash(s.expected_ctc)}</td>
                                            <td style={{ ...CELL, fontSize: 12, color: noticePeriodColor(s.notice_period), fontWeight: 600 }} title={s.notice_period}>{dash(s.notice_period)}</td>
                                            <td onClick={e => e.stopPropagation()} style={{ textAlign: "center" }}>
                                                <ShortlistCell
                                                    value={s.client_shortlisted ?? null}
                                                    editable={isAdmin && s.status === "SENT"}
                                                    onChange={(v) => setShortlistValue(s.application_id, v)}
                                                />
                                            </td>
                                            <td><StatusBadge status={s.offer_status || s.dynamic_status || s.status} /></td>
                                            <td onClick={e => e.stopPropagation()} style={{ textAlign: "center", padding: "0 4px" }}>
                                                <button
                                                    title="Copy this row as a table (paste into Gmail / Outlook)"
                                                    onClick={() => copyRow(s, displayed.indexOf(s))}
                                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: rowCopied === s.application_id ? "#16a34a" : "var(--twd-faint)", padding: 2, lineHeight: 1 }}
                                                >{rowCopied === s.application_id ? "✓" : "⧉"}</button>
                                            </td>
                                        </tr>
                                    ))
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// TAB 4 - Interviews
// ────────────────────────────────────────────────────────────────────────────

const SCHEDULE_STATUSES = [
    { value: "yet_to_schedule", label: "Yet to Schedule" },
    { value: "scheduled", label: "Scheduled" },
    { value: "rescheduled", label: "Rescheduled" },
    { value: "no_show", label: "No Show" },
    { value: "clear", label: "- Clear Round -" },
];

const ROUND_ARROW: Record<string, string> = { L1: "→ L2", L2: "→ L3", L3: "→ HR" };

// Small truncated text cell with title tooltip
function Trunc({ text, style }: { text: any; style?: React.CSSProperties }) {
    const v = text == null || text === "" ? "-" : String(text);
    return (
        <div title={v} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...style }}>
            {v}
        </div>
    );
}

function RoundCell({ appId, round, data, onSave, readOnly, onPassedFinal, candidateName }: {
    appId: string; round: string; data: any;
    onSave: (appId: string, round: string, patch: any) => Promise<void>;
    readOnly?: boolean;
    onPassedFinal?: () => void;
    candidateName?: string;
}) {
    const savedOutcome = data?.outcome || "";
    const savedStatus = data?.schedule_status || "yet_to_schedule";
    const savedDate = data?.scheduled_date || "";
    const savedTime = data?.scheduled_time || "";

    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState(savedStatus);
    const [date, setDate] = useState(savedDate);
    const [time, setTime] = useState(savedTime);
    const [comment, setComment] = useState("");
    const [commentErr, setCommentErr] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);

    // Re-sync when parent data changes (after save)
    useEffect(() => {
        setStatus(data?.schedule_status || "yet_to_schedule");
        setDate(data?.scheduled_date || "");
        setTime(data?.scheduled_time || "");
    }, [data]);

    // Outside-click closes popover
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const popEl = document.getElementById(`round-popover-${appId}-${round}`);
            if (popEl?.contains(e.target as Node)) return;
            if (anchorRef.current?.contains(e.target as Node)) return;
            handleDiscard();
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const openPopover = () => {
        if (readOnly) return;  // only admins / client managers may edit interview rounds
        setOpen(o => !o);
    };

    // Lock the page scroll while the round drawer is open
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    // Save with the given outcome (called immediately when Passed/Rejected/Clear clicked)
    const saveWithOutcome = async (newOutcome: string) => {
        const c = comment.trim();
        if (newOutcome === "rejected" && !c) {
            setCommentErr("A comment is required when rejecting.");
            return;
        }
        setCommentErr(null);
        setSaving(true);
        await onSave(appId, round, {
            schedule_status: savedStatus,
            scheduled_date: savedDate || null,
            scheduled_time: savedTime || null,
            outcome: newOutcome || null,
            comment: c || null,
        });
        setSaving(false);
        setComment("");
        setOpen(false);
        // After L3/HR passes, prompt for selection details
        if (newOutcome === "passed" && (round === "L3" || round === "HR")) {
            onPassedFinal?.();
        }
    };

    // Save schedule fields only
    const saveSchedule = async () => {
        setSaving(true);
        const isClearRound = status === "clear";
        await onSave(appId, round, {
            schedule_status: isClearRound ? "yet_to_schedule" : status,
            scheduled_date: isClearRound ? null : (date || null),
            scheduled_time: isClearRound ? null : (time || null),
            outcome: isClearRound ? null : (savedOutcome || null),
        });
        setSaving(false);
        if (isClearRound) setStatus("yet_to_schedule");
        setOpen(false);
    };

    const handleDiscard = () => {
        setStatus(savedStatus);
        setDate(savedDate);
        setTime(savedTime);
        setComment("");
        setCommentErr(null);
        setOpen(false);
    };

    const needsSave = status !== savedStatus || date !== savedDate || time !== savedTime;

    // ── Badge shown in the cell ───────────────────────────────────────────
    const base: CSSProperties = { fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, cursor: "pointer", display: "inline-block", whiteSpace: "nowrap" };
    const badge = () => {
        if (savedOutcome === "passed")
            return <span style={{ ...base, background: "#ede9fe", color: "#7c3aed", border: "1px solid #c4b5fd" }}>{ROUND_ARROW[round] || "→"}</span>;
        if (savedOutcome === "rejected")
            return <span style={{ ...base, background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5" }}>Rejected</span>;
        if (savedStatus === "scheduled" || savedStatus === "rescheduled") {
            const d = savedDate ? toUtcDate(savedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }) : "";
            return <span style={{ ...base, background: "#fef9c3", color: "#a16207", border: "1px solid #fde68a" }}>
                {savedStatus === "rescheduled" ? "Rescheduled" : "Scheduled"}{d ? ` · ${d}` : ""}{savedTime ? ` ${savedTime}` : ""}
            </span>;
        }
        if (savedStatus === "no_show")
            return <span style={{ ...base, background: "#f3f4f6", color: "#6b7280", border: "1px solid #d1d5db" }}>No Show</span>;
        return <span style={{ ...base, background: "var(--twd-surface2)", color: "var(--twd-faint)", border: "1px solid var(--twd-line2)" }}>+ Schedule</span>;
    };

    const btnBase: CSSProperties = { fontSize: 12, padding: "8px 0", borderRadius: 10, cursor: "pointer", fontWeight: 600, border: "1px solid", flex: 1, fontFamily: "inherit" };

    const popover = open ? createPortal(
        <div className="twd-vars">
            <div onClick={handleDiscard} style={{ position: "fixed", inset: 0, zIndex: 1099, background: "rgba(28,18,16,0.32)", backdropFilter: "blur(2px)" }} />
            <aside
                id={`round-popover-${appId}-${round}`}
                role="dialog"
                aria-modal="true"
                aria-label={`${round} interview`}
                onClick={e => e.stopPropagation()}
                style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(400px, 95vw)", background: "var(--twd-paper)", borderLeft: "1px solid var(--twd-line)", boxShadow: "-14px 0 40px rgba(28,18,16,0.16)", zIndex: 1100, display: "flex", flexDirection: "column", color: "var(--twd-ink)" }}>

                {/* Header */}
                <header style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--twd-line)", background: "var(--twd-surface)", display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, letterSpacing: "-0.01em" }}>{round} <span style={{ color: "var(--twd-red-text)", fontStyle: "italic" }}>interview</span></div>
                        {candidateName && <div style={{ fontSize: 12, color: "var(--twd-faint)", marginTop: 3 }}>{candidateName}</div>}
                    </div>
                    <button onClick={handleDiscard} className="twd-close" aria-label="Close">×</button>
                </header>

                <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 20px" }}>

                    {/* Schedule status */}
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--twd-soft)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Schedule Status</div>
                    <select value={status} onChange={e => setStatus(e.target.value)}
                        className="twd-select"
                        style={{ width: "100%", marginBottom: 10 }}>
                        {SCHEDULE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>

                    {(status === "scheduled" || status === "rescheduled") && (
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)}
                                className="twd-input" style={{ flex: 1, minWidth: 0 }} />
                            <input type="text" placeholder="3 PM" value={time} onChange={e => setTime(e.target.value)}
                                className="twd-input" style={{ width: 90 }} />
                        </div>
                    )}

                    {/* Divider */}
                    <div style={{ borderTop: "1px solid var(--twd-line2)", margin: "10px 0" }} />

                    {/* Outcome */}
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--twd-soft)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Outcome</div>
                    {savedOutcome && (
                        <button onClick={() => !saving && saveWithOutcome("")} disabled={saving}
                            style={{
                                width: "100%", marginBottom: 8, fontSize: 12, padding: "7px 0", borderRadius: 10,
                                cursor: saving ? "not-allowed" : "pointer", fontWeight: 600,
                                background: "var(--twd-red-bg)", color: "var(--twd-red-text)", border: "1px solid color-mix(in srgb, var(--twd-red) 35%, transparent)"
                            }}>
                            × Clear outcome ({savedOutcome})
                        </button>
                    )}

                    {/* Comment - optional on pass, required on reject. Routed to the unified comment store. */}
                    <textarea
                        value={comment}
                        onChange={e => { setComment(e.target.value); if (commentErr) setCommentErr(null); }}
                        rows={2}
                        placeholder="Comment (required to reject)…"
                        className="twd-input"
                        style={{ width: "100%", boxSizing: "border-box", marginBottom: commentErr ? 3 : 8, resize: "vertical", fontFamily: "inherit", ...(commentErr ? { borderColor: "#fca5a5" } : {}) }}
                    />
                    {commentErr && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 8 }}>{commentErr}</div>}

                    {/* Outcome buttons - click saves immediately */}
                    <div style={{ display: "flex", gap: 6, marginBottom: needsSave ? 10 : 0 }}>
                        <button onClick={() => !saving && saveWithOutcome("passed")} disabled={saving}
                            style={{ ...btnBase, background: savedOutcome === "passed" ? "#dcfce7" : "transparent", color: "#16a34a", borderColor: savedOutcome === "passed" ? "#16a34a" : "#86efac" }}>
                            {saving ? "…" : "✓ Passed"}
                        </button>
                        <button onClick={() => !saving && saveWithOutcome("rejected")} disabled={saving}
                            style={{ ...btnBase, background: savedOutcome === "rejected" ? "#fee2e2" : "transparent", color: "#dc2626", borderColor: savedOutcome === "rejected" ? "#dc2626" : "#fca5a5" }}>
                            {saving ? "…" : "✗ Rejected"}
                        </button>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--twd-faint)", marginBottom: needsSave ? 10 : 4 }}>Click to save outcome immediately</div>

                </div>

                {/* Save / Cancel for schedule changes - pinned drawer footer */}
                {needsSave && (
                    <footer style={{ padding: "12px 20px", borderTop: "1px solid var(--twd-line)", background: "var(--twd-surface)" }}>
                        <div style={{ fontSize: 11, color: "#d97706", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#d97706", flexShrink: 0 }} />
                            Schedule changes not yet saved
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button className="twd-btn twd-btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={saveSchedule} disabled={saving}>
                                {saving ? "Saving…" : "Save Changes"}
                            </button>
                            <button className="twd-btn twd-btn-ghost" onClick={handleDiscard} disabled={saving}>
                                Discard
                            </button>
                        </div>
                    </footer>
                )}
            </aside>
        </div>,
        document.body
    ) : null;

    return (
        <div ref={anchorRef} style={{ display: "inline-block" }} onClick={openPopover}>
            {badge()}
            {popover}
        </div>
    );
}

// ── Selection Details Drawer ──────────────────────────────────────────────
// Opened after L3/HR passes to collect offer + joining details.
function SelectionDetailsDrawer({ appId, candidateName, onClose, onSaved }: {
    appId: string; candidateName?: string; onClose: () => void; onSaved: (patch: any) => void;
}) {
    const [offeredCtc, setOfferedCtc] = useState("");
    const [doj, setDoj] = useState("");
    const [status, setStatus] = useState("SELECTED");
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    // Lock the page scroll while the drawer is open
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setErr(null);
        try {
            await api.patch(`/applications/${appId}/selection-details`, {
                offered_ctc: offeredCtc || undefined,
                date_of_joining: doj || undefined,
                status,
            });
            onSaved({ offered_ctc: offeredCtc || null, date_of_joining: doj || null, status });
            onClose();
        } catch (e: any) {
            setErr(e?.detail || "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--twd-faint)", textTransform: "uppercase" as const, letterSpacing: "0.6px", display: "block", marginBottom: 4 };
    const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box" as const, fontSize: 13, padding: "7px 10px", border: "1px solid var(--twd-line2)", borderRadius: 6, background: "var(--twd-surface)", color: "var(--twd-ink)" };

    return (
        <>
            <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1099, background: "rgba(28,18,16,0.32)", backdropFilter: "blur(2px)" }} />
            <aside className="twd-vars" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 95vw)", background: "var(--twd-paper)", borderLeft: "1px solid var(--twd-line)", boxShadow: "-14px 0 40px rgba(28,18,16,0.16)", zIndex: 1100, display: "flex", flexDirection: "column", color: "var(--twd-ink)" }}>
                <header style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--twd-line)", background: "var(--twd-surface)", display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, letterSpacing: "-0.01em", color: "var(--twd-ink)" }}>Selection <span style={{ color: "var(--twd-red-text)", fontStyle: "italic" }}>details</span></div>
                        {candidateName && <div style={{ fontSize: 12, color: "var(--twd-faint)", marginTop: 3 }}>{candidateName}</div>}
                    </div>
                    <button onClick={onClose} className="twd-close" aria-label="Close">×</button>
                </header>
                <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div style={{ padding: "0.75rem 1rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 13, color: "#1d4ed8", lineHeight: 1.5 }}>
                        Candidate cleared the final interview round. Fill in the offer details below.
                    </div>
                    <div>
                        <label style={labelStyle}>Offered CTC (LPA)</label>
                        <input type="text" value={offeredCtc} onChange={e => setOfferedCtc(e.target.value)}
                            placeholder="e.g. 25 LPA" style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Date of Joining</label>
                        <input type="date" value={doj} onChange={e => setDoj(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Status</label>
                        <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
                            <option value="SELECTED">Selected</option>
                            <option value="HOLD">Hold</option>
                            <option value="JOINED">Joined</option>
                        </select>
                    </div>
                    {err && <div style={{ fontSize: 12, color: "#dc2626" }}>{err}</div>}
                </div>
                <footer style={{ padding: "12px 20px", borderTop: "1px solid var(--twd-line)", background: "var(--twd-surface)", display: "flex", gap: 8 }}>
                    <button className="twd-btn twd-btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={handleSave} disabled={saving}>
                        {saving ? "Saving…" : "Save Details"}
                    </button>
                    <button className="twd-btn twd-btn-ghost" onClick={onClose} disabled={saving}>Skip for now</button>
                </footer>
            </aside>
        </>
    );
}

/** The subset of an interviews row that the dynamic-pipeline UI reads. */
type InterviewRow = {
    application_id: string;
    candidate_name?: string;
    current_status?: string;
    dynamic_status?: string | null;
    dynamic_timeline?: PipelineEntry[];
    offered_ctc?: string | null;
    date_of_joining?: string | null;
    client_shortlisted?: boolean;
};

// Dynamic-pipeline status cell. Renders the derived `{Round}.{Status}` string with the
// schedule as subtext, and opens the TimelineDrawer.
function DynamicStatusCell({ row, onOpen }: { row: InterviewRow; onOpen: () => void }) {
    const status: string | null = row.dynamic_status || (row.client_shortlisted ? "Shortlisted" : null);
    const log: PipelineEntry[] = row.dynamic_timeline || [];
    const active = log.length ? log[log.length - 1] : null;
    const sched = active && (active.scheduled_date || active.scheduled_time)
        ? [active.scheduled_date, active.scheduled_time].filter(Boolean).join(" · ")
        : null;
    const tone = statusTone(status);

    return (
        <div onClick={onOpen} style={{ cursor: "pointer", display: "inline-block" }}>
            {status ? (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, whiteSpace: "nowrap", display: "inline-block" }}>
                    {status}
                </span>
            ) : (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "var(--twd-surface2)", color: "var(--twd-faint)", border: "1px solid var(--twd-line2)", whiteSpace: "nowrap", display: "inline-block" }}>
                    + Start
                </span>
            )}
            {sched && <div style={{ fontSize: 10, color: "var(--twd-soft)", marginTop: 3 }}>{sched}</div>}
        </div>
    );
}

function InterviewsTab({ isAdmin }: { isAdmin: boolean }) {
    const { applied: { client }, liveSearch, setCounts } = useContext(FilterCtx);
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [timelineAppId, setTimelineAppId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const scrollRef = useRef<HTMLDivElement>(null);
    const goPage = (p: number) => { setPage(p); scrollRef.current?.scrollTo({ top: 0 }); };
    useEffect(() => { setPage(1); }, [client, liveSearch]);

    useEffect(() => {
        analyticsApi.getInterviews()
            .then(setRows)
            .catch((e: any) => setError(e?.detail || "Failed to load"))
            .finally(() => setLoading(false));
    }, []);

    if (error) return <ErrMsg msg={error} />;

    // Memoized for a stable reference - see the TrackerTab note above. A new array
    // each render would make the setCounts effect loop and starve route navigation.
    const displayed = useMemo(() => rows.filter(r => {
        const mc = !client || r.company_name === client;
        const ms = !liveSearch || r.candidate_name?.toLowerCase().includes(liveSearch.toLowerCase()) || r.requirement_name?.toLowerCase().includes(liveSearch.toLowerCase());
        return mc && ms;
    }), [rows, client, liveSearch]);
    const paged = paginate(displayed, page);

    useEffect(() => {
        let l1 = 0, l2 = 0, l3 = 0;
        displayed.forEach(r => {
            const sched = r.interview_schedule || {};
            if (sched.L1 && Object.keys(sched.L1).length > 0) l1++;
            if (sched.L2 && Object.keys(sched.L2).length > 0) l2++;
            if (sched.L3 && Object.keys(sched.L3).length > 0) l3++;
        });
        setCounts(
            <>
                <div style={{ fontSize: 13, color: "var(--twd-soft)" }}>L1: <strong style={{ color: "var(--twd-ink)" }}>{l1}</strong></div>
                <div style={{ fontSize: 13, color: "var(--twd-soft)" }}>L2: <strong style={{ color: "var(--twd-ink)" }}>{l2}</strong></div>
                <div style={{ fontSize: 13, color: "var(--twd-soft)" }}>L3/HR: <strong style={{ color: "var(--twd-ink)" }}>{l3}</strong></div>
            </>
        );
        return () => setCounts(null);
    }, [displayed, setCounts]);

    const handleRoundSave = async (appId: string, round: string, patch: any) => {
        try {
            const res = await api.patch(`/applications/${appId}/interview-round`, { round, ...patch });
            // Apply the saved round + any cascaded rounds (L1/L2 auto-passed when L2/L3 updated)
            setRows(prev => prev.map(r => {
                if (r.application_id !== appId) return r;
                const updated = { ...(r.interview_schedule || {}), [round]: patch };
                // Back-fill cascaded rounds returned by the server
                if (res?.data && round !== "L1") updated.L1 = res.data.L1 ?? updated.L1;
                if (res?.data && round === "L3") updated.L2 = res.data.L2 ?? updated.L2;

                return {
                    ...r,
                    interview_schedule: updated,
                    client_shortlisted: true,
                    current_status: res?.status || r.current_status
                };
            }));
        } catch (e: any) {
            alert(e?.detail || "Failed to save");
        }
    };

    // V2 writes come back with the authoritative arrays, so the row is replaced from the
    // server response rather than patched optimistically.
    const handleDynamicSaved = (appId: string, patch: Partial<InterviewRow>) => {
        setRows(prev => prev.map(r => r.application_id === appId ? { ...r, ...patch } : r));
    };

    /**
     * Terminal outcome for a row. A dynamic candidate never advances legacy `status`, so
     * reading only `current_status` showed "-" beside a finished V2 timeline. The dynamic
     * state wins whenever there is one; legacy rows are unaffected.
     */
    const outcomeBadge = (row: InterviewRow) => {
        const legacy: Record<string, [string, string, string]> = {
            SELECTED: ["Selected", "#dcfce7", "#16a34a"],
            JOINED: ["Joined", "#dcfce7", "#16a34a"],
            OFFER_RELEASED: ["Offered", "#ede9fe", "#7c3aed"],
            OFFER_ACCEPTED: ["Offered", "#ede9fe", "#7c3aed"],
            REJECTED: ["Rejected", "#fee2e2", "#dc2626"],
        };

        const dynState = parseStatus(row.dynamic_status).state;
        if (dynState === "Selected" || dynState === "Rejected") {
            const tone = statusTone(row.dynamic_status);
            return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}>{dynState}</span>;
        }

        const s = legacy[row.current_status ?? ""];
        if (!s) return <span style={{ color: "var(--twd-faint)" }}>-</span>;
        return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: s[1], color: s[2], border: `1px solid ${s[2]}30` }}>{s[0]}</span>;
    };

    const COLS = 6; // Client, Role, Candidate, Phone, Recruiter, Current Status (V2)
    const timelineRow = timelineAppId ? rows.find(r => r.application_id === timelineAppId) : null;
    return (
        <>
            {timelineRow && (
                <TimelineDrawer
                    appId={timelineRow.application_id}
                    candidateName={timelineRow.candidate_name}
                    timeline={timelineRow.dynamic_timeline || []}
                    offeredCtc={timelineRow.offered_ctc}
                    dateOfJoining={timelineRow.date_of_joining}
                    readOnly={!isAdmin}
                    onClose={() => setTimelineAppId(null)}
                    onSaved={(patch) => handleDynamicSaved(timelineRow.application_id, patch)}
                    onRevertShortlist={() => {
                        setRows(prev => prev.filter(r => r.application_id !== timelineRow.application_id));
                        setTimelineAppId(null);
                    }}
                />
            )}
            <div className="data-table-wrap">
                <Pagination top page={page} total={displayed.length} onPage={goPage} />
                <div className="data-table-scroll" ref={scrollRef} style={{ height: "calc(100vh - 250px)", minHeight: 300 }}>
                    <table className="data-table" style={{ tableLayout: "fixed", width: "100%", minWidth: 960 }}>
                        <colgroup>
                            <col style={{ width: "16%" }} />
                            <col style={{ width: "19%" }} />
                            <col style={{ width: "18%" }} />
                            <col style={{ width: "12%" }} />
                            <col style={{ width: "13%" }} />
                            <col style={{ width: "22%" }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>Client</th><th>Role</th><th>Candidate</th><th>Phone</th><th>Recruiter</th>
                                <th>Current Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <SkeletonRows cols={COLS} /> : displayed.length === 0 ? (
                                <tr><td colSpan={COLS} className="table-empty">No interviews found.</td></tr>
                            ) : paged.map((r: any) => {
                                const sched = r.interview_schedule || {};
                                return (
                                    <tr key={r.application_id}>
                                        <td><Trunc text={r.company_name} style={{ fontWeight: 500, fontSize: 13 }} /></td>
                                        <td><Trunc text={r.requirement_name} style={{ fontSize: 12 }} /></td>
                                        <td><Trunc text={r.candidate_name} style={{ fontWeight: 600, fontSize: 13 }} /></td>
                                        <td><span style={{ fontSize: 12, fontFamily: "monospace", color: r.candidate_phone ? "var(--twd-ink)" : "var(--twd-faint)" }}>{r.candidate_phone || "-"}</span></td>
                                        <td><Trunc text={r.recruiter_name} style={{ fontSize: 12 }} /></td>
                                        <td>
                                            <DynamicStatusCell row={r} onOpen={() => setTimelineAppId(r.application_id)} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// TAB 5 - Selections
// ────────────────────────────────────────────────────────────────────────────

function SelectionsTab({ isAdmin }: { isAdmin: boolean }) {
    const { applied: { client }, liveSearch } = useContext(FilterCtx);
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [offerAppId, setOfferAppId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    useEffect(() => { setPage(1); }, [client, liveSearch]);

    useEffect(() => {
        analyticsApi.getSelections()
            .then(setRows)
            .catch((e: any) => setError(e?.detail || "Failed to load"))
            .finally(() => setLoading(false));
    }, []);

    if (error) return <ErrMsg msg={error} />;

    const displayed = rows.filter(r => {
        const mc = !client || r.company_name === client;
        const ms = !liveSearch || r.candidate_name?.toLowerCase().includes(liveSearch.toLowerCase()) || r.requirement_name?.toLowerCase().includes(liveSearch.toLowerCase()) || r.recruiter_name?.toLowerCase().includes(liveSearch.toLowerCase());
        return mc && ms;
    });
    const paged = paginate(displayed, page);

    // The offer routes return the authoritative arrays, so rows are replaced from the
    // server response rather than patched optimistically.
    const handleOfferSaved = (appId: string, patch: {
        offer_timeline?: OfferEntry[];
        offer_status?: string | null;
        offered_ctc?: string | null;
        date_of_joining?: string | null;
    }) => {
        setRows(prev => prev.map(r => r.application_id === appId ? { ...r, ...patch } : r));
    };

    const offerRow = offerAppId ? rows.find(r => r.application_id === offerAppId) : null;

    return (
        <div className="data-table-wrap">
            {offerRow && (
                <OfferDrawer
                    appId={offerRow.application_id}
                    candidateName={offerRow.candidate_name}
                    timeline={(offerRow.offer_timeline || []) as OfferEntry[]}
                    offeredCtc={offerRow.offered_ctc}
                    dateOfJoining={offerRow.date_of_joining}
                    readOnly={!isAdmin}
                    onClose={() => setOfferAppId(null)}
                    onSaved={(patch) => handleOfferSaved(offerRow.application_id, patch)}
                />
            )}
            <Pagination top page={page} total={displayed.length} onPage={setPage} />
            <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Recruiter</th><th>Client</th><th>Candidate</th><th>Role</th>
                            <th>Exp</th><th>Cur CTC</th><th>Offered</th><th>Notice</th><th>DOJ</th><th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? <SkeletonRows cols={10} /> : displayed.length === 0 ? (
                            <tr><td colSpan={10} className="table-empty">No selections found.</td></tr>
                        ) : paged.map((r: any, i: number) => (
                            <tr key={i}>
                                <td style={{ fontSize: 12 }}>{dash(r.recruiter_name)}</td>
                                <td style={{ fontWeight: 500, fontSize: 13 }}>{dash(r.company_name)}</td>
                                <td style={{ fontWeight: 500 }}>{dash(r.candidate_name)}</td>
                                <td style={{ fontSize: 13 }}>{dash(r.requirement_name)}</td>
                                <td style={{ fontSize: 12 }}>{dash(r.total_experience)}</td>
                                <td style={{ fontSize: 12 }}>{dash(r.current_ctc)}</td>
                                <td style={{ fontSize: 12, fontWeight: 600, color: "#16a34a" }}>{dash(r.offered_ctc)}</td>
                                <td style={{ fontSize: 12, color: noticePeriodColor(r.notice_period), fontWeight: 500 }}>{dash(r.notice_period)}</td>
                                <td style={{ fontSize: 12 }}>{fmtDate(r.date_of_joining)}</td>
                                <td>
                                    {/* The backend always populates `offer_status`, defaulting to
                                        "Selected" - the interview position never surfaces here. */}
                                    <span
                                        onClick={() => setOfferAppId(r.application_id)}
                                        title={isAdmin ? "Click to manage the offer" : "Click to view the offer history"}
                                        style={{
                                            fontSize: 11, fontWeight: 600, padding: "2px 9px",
                                            borderRadius: 999, display: "inline-block", cursor: "pointer",
                                            background: statusTone(r.offer_status).bg,
                                            color: statusTone(r.offer_status).fg,
                                            border: `1px solid ${statusTone(r.offer_status).border}`,
                                        }}
                                    >{r.offer_status}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pagination page={page} total={displayed.length} onPage={setPage} />
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// TAB 6 - Recruiter Metrics (admin only)
// ────────────────────────────────────────────────────────────────────────────

function RecruitersTab() {
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        analyticsApi.getRecruiterMetrics()
            .then(setRows)
            .catch((e: any) => setError(e?.detail || "Failed to load"))
            .finally(() => setLoading(false));
    }, []);

    if (error) return <ErrMsg msg={error} />;

    if (loading) {
        return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="card" style={{ padding: "1.25rem" }}><Skel h={90} /></div>
                ))}
            </div>
        );
    }

    if (rows.length === 0) {
        return <div className="data-table-wrap"><div className="table-empty">No recruiter data yet.</div></div>;
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
            {rows.map(r => (
                <div key={r.recruiter_id} className="card" style={{ padding: "1.25rem" }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: "0.75rem", color: "var(--twd-ink)" }}>
                        {r.recruiter_name}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem 0.75rem", marginBottom: "0.85rem" }}>
                        {[
                            { label: "Submitted", val: r.submitted, color: "#e5352b" },
                            { label: "Interviews", val: r.in_interview, color: "#d97706" },
                            { label: "Selected", val: r.selected, color: "#16a34a" },
                            { label: "Joined", val: r.joined, color: "#0891b2" },
                        ].map(item => (
                            <div key={item.label}>
                                <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.val}</div>
                                <div style={{ fontSize: 10, color: "var(--twd-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Interview conversion rate bar */}
                    <div style={{ marginBottom: "0.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--twd-soft)", marginBottom: 4 }}>
                            <span>Interview conversion</span>
                            <span style={{ fontWeight: 600 }}>{r.interview_conversion_rate}%</span>
                        </div>
                        <div style={{ height: 5, background: "var(--twd-line2)", borderRadius: 999, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(r.interview_conversion_rate, 100)}%`, background: "var(--twd-red)", borderRadius: 999 }} />
                        </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--twd-soft)" }}>
                        <span>Selection rate</span>
                        <span style={{ fontWeight: 600, color: "#16a34a" }}>{r.selection_rate}%</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// TAB 7 - Insights (admin only)
// ────────────────────────────────────────────────────────────────────────────

function InsightsTab() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        analyticsApi.getInsights()
            .then(setData)
            .catch((e: any) => setError(e?.detail || "Failed to load insights"))
            .finally(() => setLoading(false));
    }, []);

    if (error) return <ErrMsg msg={error} />;

    const d = data || {};

    const fmtHrs = (h: number | null | undefined) => {
        if (h == null) return "-";
        if (h < 24) return `${h}h`;
        return `${(h / 24).toFixed(1)}d`;
    };

    const funnel: { stage: string; count: number }[] = d.funnel_with_conversion || [];
    const topTotal = funnel[0]?.count || 0;

    return (
        <>
            {/* KPI row */}
            <div className="stats-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginBottom: "1.5rem" }}>
                {[
                    { label: "Total Submissions", val: loading ? null : d.total_submissions ?? 0 },
                    { label: "Total Selected", val: loading ? null : d.total_selected ?? 0 },
                    { label: "Conversion Rate", val: loading ? null : `${d.conversion_pct ?? 0}%` },
                ].map(kpi => (
                    <div key={kpi.label} className="stat-box">
                        <div className="stat-box-value">{loading ? <Skel h={28} w="60%" /> : kpi.val}</div>
                        <div className="stat-box-label">{kpi.label}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem", marginBottom: "1.5rem" }}>
                {/* Stage funnel */}
                <div className="card" style={{ padding: "1.25rem" }}>
                    <div className="card-title" style={{ fontSize: 14, marginBottom: "1rem" }}>Stage Conversion Funnel</div>
                    {loading ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220 }}>
                            <div className="ana-skel" style={{ width: 170, height: 170, borderRadius: "50%" }} />
                        </div>
                    ) : funnel.length === 0 || topTotal === 0 ? (
                        <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--twd-faint)", fontSize: 13 }}>
                            No pipeline activity yet
                        </div>
                    ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                            <div
                                style={{ flex: "1 1 200px", minWidth: 180, position: "relative" }}
                                onMouseMove={e => {
                                    const r = e.currentTarget.getBoundingClientRect();
                                    setTipPos({ x: e.clientX - r.left, y: e.clientY - r.top });
                                }}
                            >
                                <ResponsiveContainer width="100%" height={230}>
                                    <PieChart>
                                        <Pie
                                            data={funnel.filter(f => f.count > 0).map(f => ({ name: f.stage, value: f.count }))}
                                            dataKey="value"
                                            nameKey="name"
                                            innerRadius={62}
                                            outerRadius={95}
                                            paddingAngle={3}
                                            stroke="var(--twd-surface)"
                                            strokeWidth={2}
                                        >
                                            {funnel.filter(f => f.count > 0).map((f) => (
                                                <Cell key={f.stage} fill={STAGE_COLORS[funnel.findIndex(x => x.stage === f.stage) % STAGE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            position={{ x: tipPos.x + 14, y: tipPos.y + 14 }}
                                            isAnimationActive={false}
                                            contentStyle={{ background: "var(--twd-surface)", border: "1px solid var(--twd-line)", borderRadius: 10, fontSize: 12.5, color: "var(--twd-ink)" }}
                                            itemStyle={{ color: "var(--twd-ink)" }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div style={{ flex: "0 1 auto", display: "flex", flexDirection: "column", gap: 8 }}>
                                {funnel.map((row, i) => {
                                    const pct = topTotal > 0 ? Math.round(row.count / topTotal * 100) : 0;
                                    return (
                                        <div key={row.stage} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--twd-soft)" }}>
                                            <span style={{ width: 9, height: 9, borderRadius: 3, background: STAGE_COLORS[i % STAGE_COLORS.length], flexShrink: 0 }} />
                                            <span style={{ minWidth: 86 }}>{row.stage}</span>
                                            <strong style={{ color: "var(--twd-ink)" }}>{row.count}</strong>
                                            <span style={{ color: "var(--twd-faint)", fontSize: 12 }}>({pct}%)</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Avg time between stages */}
                <div className="card" style={{ padding: "1.25rem" }}>
                    <div className="card-title" style={{ fontSize: 14, marginBottom: "1rem" }}>Avg Time Between Stages</div>
                    {loading ? <Skel h={180} /> : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            {[
                                { label: "Submission → L1 Selected", val: fmtHrs(d.avg_hours_sent_to_l1) },
                                { label: "L1 Selected → L2 Selected", val: fmtHrs(d.avg_hours_l1_to_l2) },
                                { label: "L2 Selected → HR Round", val: fmtHrs(d.avg_hours_l2_to_hr) },
                            ].map(row => (
                                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid var(--twd-line2)" }}>
                                    <span style={{ fontSize: 13, color: "var(--twd-soft)" }}>{row.label}</span>
                                    <span style={{ fontWeight: 700, fontSize: 15, color: "var(--twd-ink)" }}>{row.val}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Rejection patterns */}
            <div className="card" style={{ padding: "1.25rem" }}>
                <div className="card-title" style={{ fontSize: 14, marginBottom: "1rem" }}>Top Rejection Reasons</div>
                {loading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {Array.from({ length: 5 }).map((_, i) => <Skel key={i} h={14} w={i % 2 === 0 ? "80%" : "60%"} />)}
                    </div>
                ) : (
                    d.top_rejection_reasons?.length > 0 ? (
                        <div className="data-table-wrap">
                            <table className="data-table">
                                <thead><tr><th>Reason</th><th style={{ width: 80 }}>Count</th></tr></thead>
                                <tbody>
                                    {d.top_rejection_reasons.map((r: any, i: number) => (
                                        <tr key={i}>
                                            <td>{r.reason}</td>
                                            <td><PillCount n={r.count} color="#dc2626" /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : <div className="table-empty">No rejections with reasons recorded yet.</div>
                )}
            </div>
        </>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────

const FILTER_TABS = ["tracker", "submissions", "interviews", "selections"];

export default function Analytics() {
    useDocumentTitle("Analytics");
    const { isAdmin } = useAuth();
    const { tab: tabParam } = useParams<{ tab: string }>();
    const navigate = useNavigate();

    // Client managers (any role) get editing access in the tabs, scoped to their companies.
    // The backend enforces per-company authorization; this just unlocks the UI.
    const { data: myCompaniesData } = useQuery<{ companies: string[]; all_access: boolean }>({
        queryKey: ["my-companies"],
        queryFn: () => api.get("/clients/my-companies").then((r: any) => r || { companies: [], all_access: false }),
        staleTime: 5 * 60 * 1000,
        retry: false,
    });
    const isEffectiveAdmin = isAdmin ||
        Boolean(myCompaniesData?.all_access || (myCompaniesData?.companies?.length ?? 0) > 0);
    const [searchParams] = useSearchParams();

    const VALID_TABS = ["overview", "tracker", "submissions", "interviews", "selections", "recruiters", "insights"];
    // Local state gives an instant visual switch when a tab is clicked.
    // The useEffect below keeps it in sync with the URL so back/forward and
    // hard-refresh both land on the correct tab.
    const [activeTab, setActiveTab] = useState<string>(
        () => VALID_TABS.includes(tabParam || "") ? tabParam! : "overview"
    );

    useEffect(() => {
        const t = VALID_TABS.includes(tabParam || "") ? tabParam! : "overview";
        if (t !== activeTab) setActiveTab(t);
    }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

    const emptyFilters: AppliedFilters = { client: "", search: "", status: "", recruiterId: "", dateFrom: "", dateTo: "" };

    // Filters live in URL query params so they survive refresh and share via URL.
    // useMemo prevents a new object reference on every render (which would cause
    // child useEffects that depend on `applied` to fire even when values haven't changed).
    const applied = useMemo((): AppliedFilters => ({
        client: searchParams.get("client") || "",
        search: searchParams.get("search") || "",
        status: searchParams.get("status") || "",
        recruiterId: searchParams.get("recruiterId") || "",
        dateFrom: searchParams.get("dateFrom") || "",
        dateTo: searchParams.get("dateTo") || "",
    }), [searchParams.get("client"), searchParams.get("search"), searchParams.get("status"), searchParams.get("recruiterId"), searchParams.get("dateFrom"), searchParams.get("dateTo")]); // eslint-disable-line react-hooks/exhaustive-deps

    // Draft = local state of filter bar before Apply is clicked.
    const [draft, setDraft] = useState<AppliedFilters>(applied);

    // Live search - filters the visible rows as you type, no Apply needed.
    // Seeded from the URL so a shared/refreshed link keeps the term.
    const [liveSearch, setLiveSearch] = useState(applied.search);

    // Sync draft + live search when URL params change (back/forward navigation).
    useEffect(() => {
        setDraft({
            client: searchParams.get("client") || "",
            search: searchParams.get("search") || "",
            status: searchParams.get("status") || "",
            recruiterId: searchParams.get("recruiterId") || "",
            dateFrom: searchParams.get("dateFrom") || "",
            dateTo: searchParams.get("dateTo") || "",
        });
        setLiveSearch(searchParams.get("search") || "");
    }, [searchParams.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

    const [clientOptions, setClientOptions] = useState<string[]>([]);
    const [recruiterOptions, setRecruiterOptions] = useState<{ id: string; name: string }[]>([]);
    const [counts, setCounts] = useState<React.ReactNode>(null);

    useEffect(() => {
        analyticsApi.getRequirementsTracker()
            .then((rows: any[]) => {
                const names = [...new Set((rows || []).map((r: any) => r.company_name).filter(Boolean))].sort() as string[];
                setClientOptions(names);
            })
            .catch(() => { });
    }, []);

    const buildQs = (filters: AppliedFilters) => {
        const p = new URLSearchParams();
        if (filters.client) p.set("client", filters.client);
        if (filters.search) p.set("search", filters.search);
        if (filters.status) p.set("status", filters.status);
        if (filters.recruiterId) p.set("recruiterId", filters.recruiterId);
        if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) p.set("dateTo", filters.dateTo);
        return p.toString();
    };

    const handleTabChange = (key: string) => {
        setActiveTab(key); // instant visual switch - don't wait for router re-render
        const qs = buildQs({ ...applied, search: liveSearch });
        navigate(`/analytics/${key}${qs ? `?${qs}` : ""}`, { replace: false });
    };

    const handleApply = () => {
        const qs = buildQs({ ...draft, search: liveSearch });
        navigate(`/analytics/${activeTab}${qs ? `?${qs}` : ""}`, { replace: true });
    };

    const handleClear = () => {
        setDraft(emptyFilters);
        setLiveSearch("");
        navigate(`/analytics/${activeTab}`, { replace: true });
    };

    const hasFilters = Object.values(applied).some(v => v !== "");

    const tabs = [
        { key: "overview", label: "Overview" },
        { key: "tracker", label: "Requirements" },
        { key: "submissions", label: "Submissions" },
        { key: "interviews", label: "Interviews" },
        { key: "selections", label: "Selections" },
        ...(isAdmin ? [
            { key: "recruiters", label: "Recruiters" },
            { key: "insights", label: "Insights" },
        ] : []),
    ];

    return (
        <FilterCtx.Provider value={{ applied, liveSearch, recruiterOptions, setRecruiterOptions, setCounts, clientOptions }}>
            <div className="twd-scope">
                <style>{`
                @keyframes ana-pulse { 0%,100%{opacity:.45} 50%{opacity:.9} }
                .ana-skel { background: var(--twd-surface2); animation: ana-pulse 1.5s ease-in-out infinite; }
            `}</style>

                <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
                    <div style={{ flex: "0 0 200px", minWidth: 0 }}>
                        <h1 className="twd-title" style={{ margin: "0 0 14px 4px" }}><span className="twd-title--accent">Analytics</span></h1>
                        <PillNav tabs={tabs} active={activeTab} onSelect={handleTabChange} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                        {FILTER_TABS.includes(activeTab) && (
                            <div className="filter-bar" style={{ marginBottom: "1.25rem" }}>
                                {activeTab !== "submissions" && (
                                    <select
                                        value={draft.client}
                                        onChange={e => {
                                            const v = e.target.value;
                                            setDraft(p => ({ ...p, client: v }));
                                            const qs = buildQs({ ...applied, client: v, search: liveSearch });
                                            navigate(`/analytics/${activeTab}${qs ? `?${qs}` : ""}`, { replace: true });
                                        }}
                                        style={{ minWidth: 180 }}
                                    >
                                        <option value="">All clients</option>
                                        {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                )}
                                <input
                                    type="text"
                                    placeholder="Search candidate, role, recruiter…"
                                    value={liveSearch}
                                    onChange={e => setLiveSearch(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && handleApply()}
                                    style={{ minWidth: 220 }}
                                />
                                {activeTab === "submissions" && (
                                    <>
                                        <select
                                            value={draft.status}
                                            onChange={e => {
                                                const v = e.target.value;
                                                setDraft(p => ({ ...p, status: v }));
                                                const qs = buildQs({ ...applied, status: v, search: liveSearch });
                                                navigate(`/analytics/${activeTab}${qs ? `?${qs}` : ""}`, { replace: true });
                                            }}
                                        >
                                            {APP_STATUSES.map(s => <option key={s} value={s}>{s || "All statuses"}</option>)}
                                        </select>
                                        <DatePicker
                                            portalId="datepicker-portal"
                                            selectsRange={true}
                                            startDate={draft.dateFrom ? new Date(draft.dateFrom) : null}
                                            endDate={draft.dateTo ? new Date(draft.dateTo) : null}
                                            onChange={(update: [Date | null, Date | null]) => {
                                                const [start, end] = update;
                                                const toLocal = (d: Date) => {
                                                    const offset = d.getTimezoneOffset();
                                                    const local = new Date(d.getTime() - (offset * 60 * 1000));
                                                    return local.toISOString().split("T")[0];
                                                };
                                                const dFrom = start ? toLocal(start) : "";
                                                const dTo = end ? toLocal(end) : "";

                                                setDraft(p => ({ ...p, dateFrom: dFrom, dateTo: dTo }));

                                                if ((start && end) || (!start && !end)) {
                                                    const qs = buildQs({ ...applied, dateFrom: dFrom, dateTo: dTo, search: liveSearch });
                                                    navigate(`/analytics/${activeTab}${qs ? `?${qs}` : ""}`, { replace: true });
                                                }
                                            }}
                                            isClearable={true}
                                            placeholderText="Select date range"
                                            dateFormat="MMM d, yyyy"
                                            customInput={
                                                <input
                                                    type="text"
                                                    style={{ minWidth: 220, padding: "0.45rem 0.75rem", border: "1px solid var(--twd-line2)", borderRadius: 6, fontSize: 13, background: "var(--twd-surface)", color: "var(--twd-ink)" }}
                                                />
                                            }
                                        />
                                    </>
                                )}
                                {hasFilters && (
                                    <button className="twd-btn twd-btn-ghost twd-btn-sm" onClick={handleClear}>Clear</button>
                                )}
                                <div style={{ marginLeft: "auto", display: "flex", gap: "1rem", alignItems: "center" }}>
                                    {counts}
                                </div>
                            </div>
                        )}

                        {activeTab === "overview" && <OverviewTab />}
                        {activeTab === "tracker" && <TrackerTab />}
                        {activeTab === "submissions" && <SubmissionsTab isAdmin={isEffectiveAdmin} />}
                        {activeTab === "interviews" && <InterviewsTab isAdmin={isEffectiveAdmin} />}
                        {activeTab === "selections" && <SelectionsTab isAdmin={isEffectiveAdmin} />}
                        {activeTab === "recruiters" && isAdmin && <RecruitersTab />}
                        {activeTab === "insights" && isAdmin && <InsightsTab />}
                    </div>
                </div>
            </div>
        </FilterCtx.Provider>
    );
}
