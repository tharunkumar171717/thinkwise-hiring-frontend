import { useEffect, useMemo, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { eodApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Icon from "../components/Icon";
import "../styles/pages.css";
import "../styles/dashboard.css";

type EodRow = {
    requirement_id: string;
    req_id?: string | null;
    company_name: string;
    requirement_name: string;
    profiles_submitted: number;
};

type EodReport = {
    id: string;
    report_date: string; // YYYY-MM-DD (IST day)
    recruiter_id: string;
    recruiter_name: string;
    rows: EodRow[];
    total_profiles: number;
    generated_at?: string;
    generated_by?: string;
};

type MonthlyRow = { recruiter_id: string; recruiter_name: string; profiles_submitted: number };

const isoDaysAgo = (n: number): string => {
    const d = new Date(Date.now() - n * 86400000);
    return d.toISOString().slice(0, 10);
};

const fmtDay = (iso: string): string => {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
};

const currentMonth = (): string => new Date().toISOString().slice(0, 7);

export default function EODReports() {
    useDocumentTitle("EOD Reports");
    const { isAdmin } = useAuth();
    const [view, setView] = useState<"daily" | "monthly">("daily");
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<React.ReactNode>(null);
    const [showGenerateMenu, setShowGenerateMenu] = useState(false);

    // Daily
    const [dateFrom, setDateFrom] = useState(() => isoDaysAgo(6));
    const [dateTo, setDateTo] = useState(() => isoDaysAgo(0));
    const [reports, setReports] = useState<EodReport[]>([]);
    const [loadingDaily, setLoadingDaily] = useState(true);

    // Monthly
    const [month, setMonth] = useState(currentMonth);
    const [monthly, setMonthly] = useState<{ month: string; recruiters: MonthlyRow[]; total_profiles: number } | null>(null);
    const [loadingMonthly, setLoadingMonthly] = useState(false);

    const [generating, setGenerating] = useState(false);
    const [generatingAll, setGeneratingAll] = useState(false);

    const loadDaily = async (from = dateFrom, to = dateTo) => {
        setLoadingDaily(true);
        setError(null);
        try {
            const res = await eodApi.list({ date_from: from, date_to: to });
            setReports(res?.reports || []);
        } catch (e: any) {
            setError(e?.detail || "Failed to load EOD reports");
        } finally {
            setLoadingDaily(false);
        }
    };

    const loadMonthly = async (m = month) => {
        setLoadingMonthly(true);
        setError(null);
        try {
            setMonthly(await eodApi.monthly(m));
        } catch (e: any) {
            setError(e?.detail || "Failed to load monthly totals");
        } finally {
            setLoadingMonthly(false);
        }
    };

    useEffect(() => { void loadDaily(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (view === "monthly") void loadMonthly(); }, [view, month]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleGenerateMine = async () => {
        setGenerating(true);
        setError(null);
        setNotice(null);
        try {
            const rep = await eodApi.generateMine();
            setNotice(
                rep?.total_profiles
                    ? `EOD report for today generated - ${rep.total_profiles} profile${rep.total_profiles !== 1 ? "s" : ""} submitted.`
                    : "EOD report generated - no submissions recorded for today yet."
            );
            await loadDaily();
        } catch (e: any) {
            setError(e?.detail || "Failed to generate EOD report");
        } finally {
            setGenerating(false);
        }
    };

    const handleGenerateAll = async () => {
        setGeneratingAll(true);
        setError(null);
        setNotice(null);
        try {
            const res = await eodApi.generateAll(); // defaults to today (IST) on the backend
            const n = res?.generated ?? 0;
            setNotice(
                n > 0
                    ? `EOD reports generated for ${n} recruiter${n !== 1 ? "s" : ""} who submitted profiles today.`
                    : "No recruiters submitted profiles today - nothing to generate yet."
            );
            await loadDaily();
        } catch (e: any) {
            setError(e?.detail || "Failed to generate reports for all recruiters");
        } finally {
            setGeneratingAll(false);
        }
    };

    const [selectedRecruiters, setSelectedRecruiters] = useState<Set<string>>(new Set());
    const [showRecruiterMenu, setShowRecruiterMenu] = useState(false);

    const uniqueRecruiters = useMemo(() => {
        return Array.from(new Set(reports.map(r => r.recruiter_name))).sort();
    }, [reports]);

    const toggleRecruiterFilter = (rec: string) => {
        setSelectedRecruiters(prev => {
            const next = new Set(prev);
            if (next.has(rec)) next.delete(rec);
            else next.add(rec);
            return next;
        });
    };

    // Group flat list: date desc → recruiters (API already sorts this way)
    const byDate = useMemo(() => {
        const map = new Map<string, EodReport[]>();
        for (const r of reports) {
            if (selectedRecruiters.size > 0 && !selectedRecruiters.has(r.recruiter_name)) continue;
            if (!map.has(r.report_date)) map.set(r.report_date, []);
            map.get(r.report_date)!.push(r);
        }
        return Array.from(map.entries()); // insertion order = date desc
    }, [reports, selectedRecruiters]);

    // Accordion: which dates are expanded. Newest date opens by default; the
    // rest collapse so the history stays scannable.
    const [openDates, setOpenDates] = useState<Set<string>>(new Set());
    useEffect(() => {
        if (byDate.length === 0) return;
        setOpenDates(prev => (prev.size === 0 ? new Set([byDate[0][0]]) : prev));
    }, [byDate]);

    const toggleDate = (day: string) => {
        setOpenDates(prev => {
            const next = new Set(prev);
            next.has(day) ? next.delete(day) : next.add(day);
            return next;
        });
    };

    const fieldLabel: React.CSSProperties = {
        display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.06em", color: "var(--twd-faint)", marginBottom: 6,
    };

    return (
        <div className="twd-scope">
            <div className="twd-head twd-head--tight twd-rise">
                <div>
                    <h1 className="twd-title"><span className="twd-title--accent">EOD</span> Reports</h1>
                    <p className="twd-sub">Daily profile submissions per recruiter, by client and requirement (auto-generated at 6:30 PM IST)</p>
                </div>
                <div className="twd-head-actions">
                    <div className="twd-tabs" role="tablist" aria-label="Report view" style={{ alignSelf: "center", marginTop: "auto" }}>
                        {(["daily", "monthly"] as const).map(v => (
                            <button
                                key={v}
                                role="tab"
                                aria-selected={view === v}
                                className="twd-tab"
                                data-active={view === v}
                                onClick={() => setView(v)}
                            >
                                {v === "daily" ? "Daily" : "Monthly"}
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
            {notice && (
                <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "var(--twd-green-bg)", border: "1px solid color-mix(in srgb, var(--twd-green) 35%, transparent)", color: "var(--twd-green)", fontSize: 13 }}>
                    {notice}
                </div>
            )}

            <div className="twd-toolbar" style={{ alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", marginBottom: "1rem" }}>
                <div style={{ display: "flex", gap: "0.8rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                    {view === "daily" ? (
                        <>
                            <div>
                                <div style={fieldLabel}>From</div>
                                <input type="date" className="twd-input" value={dateFrom} max={dateTo} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 13, minWidth: 0, flex: "none" }} />
                            </div>
                            <div>
                                <div style={fieldLabel}>To</div>
                                <input type="date" className="twd-input" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 13, minWidth: 0, flex: "none" }} />
                            </div>
                            <div style={{ position: "relative" }}>
                                <div style={fieldLabel}>Recruiter</div>
                                <button className="twd-btn twd-btn-ghost" style={{ background: "var(--twd-surface)", border: "1px solid var(--twd-line2)", color: selectedRecruiters.size > 0 ? "var(--twd-ink)" : "var(--twd-faint)", minWidth: 160, justifyContent: "space-between" }} onClick={() => setShowRecruiterMenu(!showRecruiterMenu)}>
                                    {selectedRecruiters.size === 0 ? "All Recruiters" : `${selectedRecruiters.size} selected`}
                                    <Icon name={showRecruiterMenu ? "chevron-up" : "chevron-down"} size={14} />
                                </button>
                                {showRecruiterMenu && (
                                    <>
                                        <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={() => setShowRecruiterMenu(false)} />
                                        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "var(--twd-surface)", border: "1px solid var(--twd-line2)", borderRadius: 8, padding: 4, zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", minWidth: 200, maxHeight: 300, overflowY: "auto" }}>
                                            {uniqueRecruiters.map(rec => (
                                                <label key={rec} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", borderRadius: 4, fontSize: 13, userSelect: "none" }} className="hover-bg">
                                                    <input type="checkbox" checked={selectedRecruiters.has(rec)} onChange={() => toggleRecruiterFilter(rec)} style={{ accentColor: "var(--twd-primary)" }} />
                                                    {rec}
                                                </label>
                                            ))}
                                            {uniqueRecruiters.length === 0 && <div style={{ padding: "8px 12px", fontSize: 13, color: "var(--twd-faint)" }}>No recruiters available</div>}
                                        </div>
                                    </>
                                )}
                            </div>
                            <button className="twd-btn twd-btn-ghost" onClick={() => void loadDaily()} disabled={loadingDaily}>
                                {loadingDaily ? "Loading…" : "Apply"}
                            </button>
                        </>
                    ) : (
                        <>
                            <div>
                                <div style={fieldLabel}>Month</div>
                                <input type="month" className="twd-input" value={month} max={currentMonth()} onChange={e => setMonth(e.target.value)} style={{ fontSize: 13, minWidth: 0, flex: "none" }} />
                            </div>
                            <button className="twd-btn twd-btn-ghost" onClick={() => void loadMonthly()} disabled={loadingMonthly}>
                                {loadingMonthly ? "Loading…" : "Apply"}
                            </button>
                        </>
                    )}

                    <div style={{ position: "relative", marginLeft: "0.5rem" }}>
                        {isAdmin ? (
                            <>
                                <button className="twd-btn twd-btn-primary" disabled={generating || generatingAll} onClick={() => setShowGenerateMenu(!showGenerateMenu)}>
                                    <Icon name="send" size={15} />
                                    {(generating || generatingAll) ? "Generating…" : "Generate Report"}
                                    <Icon name={showGenerateMenu ? "chevron-up" : "chevron-down"} size={14} style={{ marginLeft: 4 }} />
                                </button>
                                {showGenerateMenu && (
                                    <>
                                        <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={() => setShowGenerateMenu(false)} />
                                        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "var(--twd-surface)", border: "1px solid var(--twd-line2)", borderRadius: 8, padding: 4, zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", minWidth: 200 }}>
                                            <button className="hover-bg" style={{ border: "none", background: "transparent", textAlign: "left", cursor: "pointer", borderRadius: 4, padding: "8px 12px", fontSize: 13, width: "100%" }} onClick={() => { setShowGenerateMenu(false); void handleGenerateMine(); }}>
                                                Generate my EOD report
                                            </button>
                                            <button className="hover-bg" style={{ border: "none", background: "transparent", textAlign: "left", cursor: "pointer", borderRadius: 4, padding: "8px 12px", fontSize: 13, width: "100%" }} onClick={() => { setShowGenerateMenu(false); void handleGenerateAll(); }}>
                                                Generate for all recruiters
                                            </button>
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <button className="twd-btn twd-btn-primary" disabled={generating} onClick={() => void handleGenerateMine()}>
                                <Icon name="send" size={15} />
                                {generating ? "Generating…" : "Generate my EOD report"}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {view === "daily" && (
                <>

                    {loadingDaily ? (
                        <div className="twd-loading">Loading EOD reports…</div>
                    ) : byDate.length === 0 ? (
                        <div className="twd-empty">
                            <Icon name="document" size={40} />
                            <div>No EOD reports in this range. Reports are generated automatically at 6:30 PM IST, or on demand with the button above.</div>
                        </div>
                    ) : (
                        byDate.map(([day, dayReports]) => {
                            const open = openDates.has(day);
                            const dayTotal = dayReports.reduce((s, r) => s + r.total_profiles, 0);
                            return (
                                <section key={day} style={{ marginBottom: "0.9rem", border: "1px solid var(--twd-line2)", borderRadius: 16, overflow: "hidden", background: "var(--twd-surface)" }}>
                                    <button
                                        onClick={() => toggleDate(day)}
                                        aria-expanded={open}
                                        style={{
                                            width: "100%", display: "flex", alignItems: "center", gap: "0.6rem",
                                            padding: "0.85rem 1.1rem", background: "var(--twd-surface)", border: "none",
                                            cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                                        }}
                                    >
                                        <span style={{ display: "inline-flex", color: "var(--twd-faint)", transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "none" }}>
                                            <Icon name="chevron-right" size={16} />
                                        </span>
                                        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--twd-ink)", margin: 0, letterSpacing: "-0.01em" }}>{fmtDay(day)}</h2>
                                        <span style={{ fontSize: 12.5, color: "var(--twd-faint)" }}>
                                            {dayTotal} profile{dayTotal !== 1 ? "s" : ""} · {dayReports.length} recruiter{dayReports.length !== 1 ? "s" : ""}
                                        </span>
                                    </button>
                                    {open && (
                                        <div style={{ display: "grid", gap: "0.9rem", padding: "0 1rem 1rem" }}>
                                            {dayReports.map(rep => {
                                                // Retain the client grouping since they explicitly requested it as a separate small improvement earlier
                                                const rowsByClient = new Map<string, typeof rep.rows>();
                                                for (const row of rep.rows) {
                                                    if (!rowsByClient.has(row.company_name)) {
                                                        rowsByClient.set(row.company_name, []);
                                                    }
                                                    rowsByClient.get(row.company_name)!.push(row);
                                                }
                                                return (
                                                    <div key={rep.id} style={{ border: "1px solid var(--twd-line2)", borderRadius: 12, background: "var(--twd-surface)", overflow: "hidden" }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.7rem 1rem", borderBottom: "1px solid var(--twd-line2)", background: "var(--twd-surface2)" }}>
                                                            <span style={{ fontWeight: 700, fontSize: 14 }}>{rep.recruiter_name}</span>
                                                            <span className="twd-pill twd-pill--red">
                                                                {rep.total_profiles} submitted
                                                            </span>
                                                        </div>
                                                        <div style={{ overflowX: "auto" }}>
                                                            <table className="twd-table" style={{ tableLayout: "fixed" }}>
                                                                <colgroup>
                                                                    <col style={{ width: "34%" }} />
                                                                    <col style={{ width: "46%" }} />
                                                                    <col style={{ width: "20%" }} />
                                                                </colgroup>
                                                                <thead>
                                                                    <tr>
                                                                        <th>Client</th>
                                                                        <th>Requirement</th>
                                                                        <th style={{ textAlign: "right" }}>Profiles Submitted</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {rep.rows.length === 0 ? (
                                                                        <tr>
                                                                            <td colSpan={3} className="twd-cell-muted">No submissions recorded.</td>
                                                                        </tr>
                                                                    ) : (
                                                                        Array.from(rowsByClient.entries()).map(([client, clientRows]) => (
                                                                            <tr key={client}>
                                                                                <td style={{ fontWeight: 600, verticalAlign: "top", paddingTop: "0.8rem" }}>{client}</td>
                                                                                <td className="twd-cell-soft" style={{ verticalAlign: "top", paddingTop: "0.8rem" }}>
                                                                                    {clientRows.map((row, idx) => (
                                                                                        <div key={row.requirement_id} style={{ marginBottom: idx === clientRows.length - 1 ? 0 : 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                                                            {row.req_id ? `${row.req_id} - ` : ""}{row.requirement_name}
                                                                                        </div>
                                                                                    ))}
                                                                                </td>
                                                                                <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", verticalAlign: "top", paddingTop: "0.8rem" }}>
                                                                                    {clientRows.map((row, idx) => (
                                                                                        <div key={row.requirement_id} style={{ marginBottom: idx === clientRows.length - 1 ? 0 : 6 }}>
                                                                                            {row.profiles_submitted}
                                                                                        </div>
                                                                                    ))}
                                                                                </td>
                                                                            </tr>
                                                                        ))
                                                                    )}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            );
                        })
                    )}
                </>
            )}

            {view === "monthly" && (
                <>

                    {loadingMonthly ? (
                        <div className="twd-loading">Loading monthly totals…</div>
                    ) : !monthly || monthly.recruiters.length === 0 ? (
                        <div className="twd-empty">
                            <Icon name="chart" size={40} />
                            <div>No submissions recorded for this month.</div>
                        </div>
                    ) : (
                        <div className="twd-table-wrap" style={{ maxWidth: 640 }}>
                            <div className="twd-table-scroll">
                                <table className="twd-table">
                                    <thead>
                                        <tr>
                                            <th>Recruiter</th>
                                            <th style={{ textAlign: "right" }}>Profiles Submitted</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {monthly.recruiters.map(r => (
                                            <tr key={r.recruiter_id}>
                                                <td style={{ fontWeight: 600 }}>{r.recruiter_name}</td>
                                                <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.profiles_submitted}</td>
                                            </tr>
                                        ))}
                                        <tr style={{ background: "var(--twd-surface2)" }}>
                                            <td style={{ fontWeight: 700 }}>Total</td>
                                            <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--twd-red-text)" }}>{monthly.total_profiles}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
