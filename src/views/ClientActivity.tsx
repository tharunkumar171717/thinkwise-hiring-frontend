import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { clientActivityApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Icon from "../components/Icon";
import "../styles/pages.css";

// ── Types ────────────────────────────────────────────────────────────────────
type Assignee = { id: string; name: string };
type ReqRow = {
    requirement_id: string;
    req_id?: string | null;
    requirement_name?: string | null;
    created_at?: string | null;
    status?: string | null;
    no_of_positions?: number | null;
    assigned_recruiters: Assignee[];
    assigned_count: number;
    submitted: number;
    in_process: number;
    shortlisted: number;
    selected: number;
    joined: number;
    is_rollover: boolean;
};
type ClientRow = {
    company_name: string;
    report_date: string;
    new_requirements_count: number;
    profiles_submitted: number;
    rolled_over_count: number;
    pending_count: number;
    requirements: ReqRow[];
    id?: string;
};
type Series = { company: string; points: { period: string; value: number }[] };

// ── Small helpers ────────────────────────────────────────────────────────────
const todayIso = (): string => new Date().toISOString().slice(0, 10);
const currentMonth = (): string => new Date().toISOString().slice(0, 7);
const isoDaysAgo = (n: number): string => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const fmtDay = (iso: string): string =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
const fmtCreated = (iso?: string | null): string =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "-";

// ── Categorical palette (validated; light + dark stepped) ────────────────────
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const MAX_SERIES = 8;

// ── Multi-line performance chart (inline SVG, theme-aware, hover crosshair) ───
function PerfChart({ periods, series, granularity }: { periods: string[]; series: Series[]; granularity: "daily" | "monthly" }) {
    const [dark, setDark] = useState(false);
    const [hover, setHover] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        const read = () => {
            const attr = document.documentElement.getAttribute("data-theme");
            setDark(attr ? attr === "dark" : window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
        };
        read();
        const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
        mq?.addEventListener?.("change", read);
        return () => mq?.removeEventListener?.("change", read);
    }, []);
    const colors = dark ? SERIES_DARK : SERIES_LIGHT;

    // Cap to the top MAX_SERIES clients by total; fold the rest into "Other".
    const capped = useMemo(() => {
        const withTotals = series.map(s => ({ s, total: s.points.reduce((a, p) => a + p.value, 0) }));
        withTotals.sort((a, b) => b.total - a.total);
        const top = withTotals.slice(0, MAX_SERIES).map(x => x.s);
        const rest = withTotals.slice(MAX_SERIES).map(x => x.s);
        if (rest.length) {
            top.push({
                company: `Other (${rest.length})`,
                points: periods.map(p => ({ period: p, value: rest.reduce((a, s) => a + (s.points.find(pt => pt.period === p)?.value || 0), 0) })),
            });
        }
        return top;
    }, [series, periods]);

    if (periods.length === 0 || capped.length === 0) {
        return <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>No submission activity to chart yet.</div>;
    }

    const W = 900, H = 280, padL = 40, padR = 16, padT = 16, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxY = Math.max(1, ...capped.flatMap(s => s.points.map(p => p.value)));
    const niceMax = Math.ceil(maxY / 4) * 4 || 4;
    const x = (i: number) => padL + (periods.length === 1 ? plotW / 2 : (i / (periods.length - 1)) * plotW);
    const y = (v: number) => padT + plotH - (v / niceMax) * plotH;
    const fmtLabel = (p: string) => granularity === "monthly"
        ? new Date(`${p}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
        : new Date(`${p}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

    const yTicks = [0, niceMax / 4, niceMax / 2, (niceMax * 3) / 4, niceMax];
    const xEvery = Math.ceil(periods.length / 10);

    const onMove = (e: React.MouseEvent) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const px = ((e.clientX - rect.left) / rect.width) * W;
        const i = Math.round(((px - padL) / plotW) * (periods.length - 1));
        setHover(Math.max(0, Math.min(periods.length - 1, i)));
    };

    return (
        <div>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}
                onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Profiles submitted per client over time">
                {/* gridlines + y ticks */}
                {yTicks.map((t, i) => (
                    <g key={i}>
                        <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="var(--border-subtle)" strokeWidth={1} opacity={0.6} />
                        <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(t)}</text>
                    </g>
                ))}
                {/* x labels */}
                {periods.map((p, i) => (i % xEvery === 0 || i === periods.length - 1) && (
                    <text key={p} x={x(i)} y={H - 12} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{fmtLabel(p)}</text>
                ))}
                {/* hover crosshair */}
                {hover != null && <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} stroke="var(--text-muted)" strokeDasharray="3 3" opacity={0.6} />}
                {/* lines */}
                {capped.map((s, si) => {
                    const col = colors[si % colors.length];
                    const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
                    return (
                        <g key={s.company}>
                            <path d={d} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                            {hover != null && <circle cx={x(hover)} cy={y(s.points[hover].value)} r={3.5} fill={col} stroke="var(--bg-primary)" strokeWidth={1.5} />}
                        </g>
                    );
                })}
            </svg>

            {/* legend (identity never by color alone) */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem 1rem", marginTop: "0.5rem" }}>
                {capped.map((s, si) => (
                    <span key={s.company} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                        <span style={{ width: 11, height: 11, borderRadius: 3, background: colors[si % colors.length], flexShrink: 0 }} />
                        {s.company}{hover != null ? <strong style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}> · {s.points[hover].value}</strong> : null}
                    </span>
                ))}
                {hover != null && <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>{fmtLabel(periods[hover])}</span>}
            </div>
        </div>
    );
}

// ── Assigned-recruiters cell: count → names on click ─────────────────────────
function AssignedCell({ assignees }: { assignees: Assignee[] }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLSpanElement | null>(null);
    useEffect(() => {
        if (!open) return;
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open]);
    if (assignees.length === 0) return <span style={{ color: "#dc2626", fontSize: 12 }}>Unassigned</span>;
    return (
        <span ref={ref} style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setOpen(o => !o)} title="Show assigned recruiters"
                style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", borderRadius: 999, padding: "1px 9px", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}>
                <Icon name="users" size={12} /> {assignees.length}
            </button>
            {open && (
                <span style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20, background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "0.4rem 0.6rem", minWidth: 150 }}>
                    {assignees.map(a => <div key={a.id} style={{ fontSize: 12.5, color: "var(--text-primary)", padding: "2px 0", whiteSpace: "nowrap" }}>{a.name}</div>)}
                </span>
            )}
        </span>
    );
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: "new" | "sub" | "roll" | "pending" }) {
    const color = tone === "pending" ? "var(--twd-amber)" : tone === "roll" ? "#9333ea" : tone === "sub" ? "#2a78d6" : "var(--twd-green)";
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 70 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--twd-faint)", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center" }}>{label}</span>
        </div>
    );
}

function ClientCard({ row, defaultOpen = false }: { row: ClientRow; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ border: "1px solid var(--twd-line2)", borderRadius: 12, background: "var(--twd-surface)", overflow: "hidden", marginBottom: "0.9rem" }}>
            <button onClick={() => setOpen(o => !o)} aria-expanded={open}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", padding: "0.85rem 1.1rem", borderTop: "none", borderRight: "none", borderLeft: "none", borderBottom: open ? "1px solid var(--twd-line2)" : "none", background: "var(--twd-surface)", flexWrap: "wrap", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
                    <span style={{ display: "inline-flex", color: "var(--twd-faint)", transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "none" }}><Icon name="chevron-right" size={16} /></span>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--twd-ink)", margin: 0, letterSpacing: "-0.01em" }}>{row.company_name}</h2>
                    <span style={{ fontSize: 12.5, color: "var(--twd-faint)" }}>{row.requirements.length} req{row.requirements.length !== 1 ? "s" : ""}</span>
                </span>
                <div style={{ display: "flex", gap: "1rem" }}>
                    <StatPill label="New Reqs" value={row.new_requirements_count} tone="new" />
                    <StatPill label="Submitted" value={row.profiles_submitted} tone="sub" />
                    <StatPill label="Rolled Over" value={row.rolled_over_count} tone="roll" />
                    <StatPill label="Pending" value={row.pending_count} tone="pending" />
                </div>
            </button>
            {open && (
                <div style={{ overflowX: "auto" }}>
                    {row.requirements.length === 0 ? (
                        <div style={{ padding: "0.9rem 1rem", fontSize: 13, color: "var(--twd-faint)" }}>No open requirements.</div>
                    ) : (
                        <table className="twd-table" style={{ width: "100%", tableLayout: "auto" }}>
                            <thead>
                                <tr>
                                    <th>Requirement</th>
                                    <th style={{ textAlign: "right" }} title="Number of positions">Positions</th>
                                    <th style={{ textAlign: "right" }}>Assigned</th>
                                    <th style={{ textAlign: "right" }} title="Profiles submitted in the selected day / month">Submitted</th>
                                    <th style={{ textAlign: "right" }} title="Candidates currently in an interview round">In Process</th>
                                    <th style={{ textAlign: "right" }} title="Candidates moved to the interview stage (client shortlisted)">Shortlisted</th>
                                </tr>
                            </thead>
                            <tbody>
                                {row.requirements.map(r => (
                                    <tr key={r.requirement_id}>
                                        <td style={{ fontWeight: 600, verticalAlign: "top", paddingTop: "0.8rem" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                                {r.req_id ? `${r.req_id} · ` : ""}{r.requirement_name || "Untitled"}
                                                {r.is_rollover && <span className="twd-pill" style={{ fontSize: 10, padding: "2px 6px", color: "#9333ea", background: "color-mix(in srgb, #9333ea 12%, transparent)" }}>Rolled over</span>}
                                                {r.status && r.status !== "OPEN" && <span className="twd-pill" style={{ fontSize: 10, padding: "2px 6px", color: "var(--twd-soft)", border: "1px solid var(--twd-line2)" }}>{r.status.replace("_", " ")}</span>}
                                            </div>
                                            <div className="twd-sub" style={{ fontSize: 12, marginTop: 2 }}>Created {fmtCreated(r.created_at)}</div>
                                        </td>
                                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", verticalAlign: "top", paddingTop: "0.8rem" }}>{r.no_of_positions ?? "-"}</td>
                                        <td style={{ textAlign: "right", verticalAlign: "top", paddingTop: "0.8rem" }}><AssignedCell assignees={r.assigned_recruiters} /></td>
                                        <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", verticalAlign: "top", paddingTop: "0.8rem" }}>{r.submitted}</td>
                                        <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", verticalAlign: "top", paddingTop: "0.8rem" }}>{r.in_process}</td>
                                        <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", verticalAlign: "top", paddingTop: "0.8rem" }}>{r.shortlisted}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ClientActivity() {
    useDocumentTitle("Client Activity");
    const { isAdmin } = useAuth();
    const [granularity, setGranularity] = useState<"daily" | "monthly">("daily");
    const [view, setView] = useState<"live" | "history">("live");
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [dayValue, setDayValue] = useState(todayIso);
    const [monthValue, setMonthValue] = useState(currentMonth);
    const [activity, setActivity] = useState<{ report_date: string; clients: ClientRow[]; totals: any } | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    const [chart, setChart] = useState<{ periods: string[]; series: Series[] } | null>(null);

    // History
    const [dateFrom, setDateFrom] = useState(() => isoDaysAgo(6));
    const [dateTo, setDateTo] = useState(todayIso);
    const [reports, setReports] = useState<ClientRow[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const loadActivity = async () => {
        setLoading(true); setError(null);
        try {
            setActivity(granularity === "daily" ? await clientActivityApi.live(dayValue) : await clientActivityApi.monthly(monthValue));
        } catch (e: any) { setError(e?.detail || "Failed to load client activity"); }
        finally { setLoading(false); }
    };
    const loadChart = async () => {
        try { setChart(await clientActivityApi.timeseries(granularity)); } catch { setChart(null); }
    };
    const loadHistory = async (from = dateFrom, to = dateTo) => {
        setLoadingHistory(true); setError(null);
        try { const res = await clientActivityApi.history({ date_from: from, date_to: to }); setReports(res?.reports || []); }
        catch (e: any) { setError(e?.detail || "Failed to load history"); }
        finally { setLoadingHistory(false); }
    };

    useEffect(() => { if (view === "live") { void loadActivity(); void loadChart(); } }, [granularity, dayValue, monthValue, view]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (view === "history") void loadHistory(); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleGenerate = async () => {
        setGenerating(true); setError(null); setNotice(null);
        try {
            const res = await clientActivityApi.generate(granularity === "daily" ? dayValue : undefined);
            setNotice(`Snapshot saved for ${res?.generated ?? 0} client${(res?.generated ?? 0) !== 1 ? "s" : ""}.`);
        } catch (e: any) { setError(e?.detail || "Failed to snapshot"); }
        finally { setGenerating(false); }
    };

    const byDate = useMemo(() => {
        const map = new Map<string, ClientRow[]>();
        for (const r of reports) { if (!map.has(r.report_date)) map.set(r.report_date, []); map.get(r.report_date)!.push(r); }
        return Array.from(map.entries());
    }, [reports]);
    const [openDates, setOpenDates] = useState<Set<string>>(new Set());
    useEffect(() => { if (byDate.length) setOpenDates(prev => (prev.size === 0 ? new Set([byDate[0][0]]) : prev)); }, [byDate]);
    const toggleDate = (day: string) => setOpenDates(prev => { const n = new Set(prev); n.has(day) ? n.delete(day) : n.add(day); return n; });

    const fieldLabel: React.CSSProperties = {
        display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.06em", color: "var(--twd-faint)", marginBottom: 6,
    };

    return (
        <div className="twd-scope">
            <div className="twd-head twd-head--tight twd-rise" style={{ position: "relative", zIndex: 10, marginBottom: 12 }}>
                <div>
                    <h1 className="twd-title"><span className="twd-title--accent">Client</span> Activity</h1>
                    <p className="twd-sub">Per-client operational view - new requirements, submissions, rollovers, and pending work</p>
                </div>
                <div className="twd-head-actions">
                    <div className="twd-tabs" role="tablist" aria-label="View mode">
                        {(["live", "history"] as const).map(v => (
                            <button
                                key={v}
                                role="tab"
                                aria-selected={view === v}
                                className="twd-tab"
                                data-active={view === v}
                                onClick={() => setView(v)}
                            >
                                {v === "live" ? "Dashboard" : "History"}
                            </button>
                        ))}
                    </div>
                    {isAdmin && (
                        <button className="twd-btn twd-btn-ghost" disabled={generating} onClick={() => void handleGenerate()}>
                            <Icon name="send" size={15} /><span style={{ marginLeft: 6 }}>{generating ? "Saving…" : "Save snapshot"}</span>
                        </button>
                    )}
                </div>
            </div>

            {error && <div className="form-error" style={{ marginBottom: "1rem" }}>{error}</div>}
            {notice && <div className="form-success" style={{ marginBottom: "1rem" }}>{notice}</div>}

            {view === "live" && (
                <>
                    <div className="twd-toolbar" style={{ alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", marginBottom: "1rem" }}>
                        <div style={{ display: "flex", gap: "0.8rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                            <div className="twd-tabs" role="tablist" style={{ marginRight: "0.5rem" }}>
                                {(["daily", "monthly"] as const).map(g => (
                                    <button
                                        key={g}
                                        role="tab"
                                        className="twd-tab"
                                        data-active={granularity === g}
                                        onClick={() => setGranularity(g)}
                                    >
                                        {g === "daily" ? "Daily" : "Monthly"}
                                    </button>
                                ))}
                            </div>
                            {granularity === "daily" ? (
                                <div>
                                    <div style={fieldLabel}>Date</div>
                                    <input type="date" className="twd-input" value={dayValue} max={todayIso()} onChange={e => setDayValue(e.target.value)} style={{ fontSize: 13, minWidth: 0, flex: "none" }} />
                                </div>
                            ) : (
                                <div>
                                    <div style={fieldLabel}>Month</div>
                                    <input type="month" className="twd-input" value={monthValue} max={currentMonth()} onChange={e => setMonthValue(e.target.value)} style={{ fontSize: 13, minWidth: 0, flex: "none" }} />
                                </div>
                            )}
                        </div>
                        {activity && (
                            <div style={{ fontSize: 12, color: "var(--twd-soft)" }}>
                                {activity.totals.new_requirements} new · {activity.totals.profiles_submitted} submitted · {activity.totals.rolled_over} rolled over · {activity.totals.pending_requirements} pending
                            </div>
                        )}
                    </div>

                    {/* Performance chart */}
                    <div className="card" style={{ padding: "1rem 1.1rem", marginBottom: "1.25rem" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
                            Profiles submitted per client · {granularity === "daily" ? "last 30 days" : "last 12 months"}
                        </div>
                        {chart ? <PerfChart periods={chart.periods} series={chart.series} granularity={granularity} />
                            : <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>Loading chart…</div>}
                    </div>

                    {loading ? (
                        <div className="twd-loading">Loading…</div>
                    ) : !activity || activity.clients.length === 0 ? (
                        <div className="twd-empty">
                            <Icon name="document" size={40} />
                            <div>No client activity for this period.</div>
                        </div>
                    ) : (
                        <div style={{ display: "grid", gap: "0.9rem" }}>
                            {activity.clients.map(row => <ClientCard key={row.company_name} row={row} />)}
                        </div>
                    )}
                </>
            )}

            {view === "history" && (
                <>
                    <div className="twd-toolbar" style={{ alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1rem" }}>
                        <div style={{ display: "flex", gap: "0.8rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                            <div>
                                <div style={fieldLabel}>From</div>
                                <input type="date" className="twd-input" value={dateFrom} max={dateTo} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 13, minWidth: 0, flex: "none" }} />
                            </div>
                            <div>
                                <div style={fieldLabel}>To</div>
                                <input type="date" className="twd-input" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 13, minWidth: 0, flex: "none" }} />
                            </div>
                            <button className="twd-btn twd-btn-ghost" onClick={() => void loadHistory()} disabled={loadingHistory}>{loadingHistory ? "Loading…" : "Apply"}</button>
                        </div>
                    </div>
                    {loadingHistory ? (
                        <div className="twd-loading">Loading history…</div>
                    ) : byDate.length === 0 ? (
                        <div className="twd-empty">
                            <Icon name="document" size={40} />
                            <div>No saved snapshots in this range. Snapshots save automatically at 6:30 PM IST, or via “Save snapshot”.</div>
                        </div>
                    ) : (
                        byDate.map(([day, dayRows]) => {
                            const open = openDates.has(day);
                            const tNew = dayRows.reduce((s, r) => s + (r.new_requirements_count || 0), 0);
                            const tSub = dayRows.reduce((s, r) => s + (r.profiles_submitted || 0), 0);
                            return (
                                <section key={day} style={{ marginBottom: "0.9rem", border: "1px solid var(--twd-line2)", borderRadius: 16, overflow: "hidden", background: "var(--twd-surface)" }}>
                                    <button onClick={() => toggleDate(day)} aria-expanded={open} style={{ width: "100%", display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.85rem 1.1rem", background: "var(--twd-surface)", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                                        <span style={{ display: "inline-flex", color: "var(--twd-faint)", transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "none" }}><Icon name="chevron-right" size={16} /></span>
                                        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--twd-ink)", margin: 0, letterSpacing: "-0.01em" }}>{fmtDay(day)}</h2>
                                        <span style={{ fontSize: 12.5, color: "var(--twd-faint)" }}>{dayRows.length} client{dayRows.length !== 1 ? "s" : ""} · {tNew} new · {tSub} submitted</span>
                                    </button>
                                    {open && <div style={{ display: "grid", gap: "0.9rem", padding: "0 1rem 1rem" }}>{dayRows.map(row => <ClientCard key={(row.id || row.company_name)} row={row} />)}</div>}
                                </section>
                            );
                        })
                    )}
                </>
            )}
        </div>
    );
}
