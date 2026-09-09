import { useState, useEffect, useRef } from 'react';
import { candidateApi, api } from '../services/api';
import { fmtTs } from '../utils/dateUtils';
import Icon from './Icon';
import '../styles/dashboard.css';

/* icon tile shown at the top of each integration card */
function CardIcon({ name }: { name: "settings" | "refresh" | "mail" }) {
    return (
        <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: "var(--twd-red-bg)", color: "var(--twd-red-text)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0
        }}>
            <Icon name={name} size={20} />
        </div>
    );
}

const fieldLabel: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.06em", color: "var(--twd-faint)", marginBottom: 6,
};

export default function EmailResumes() {
    const [isSyncingEmail, setIsSyncingEmail] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Microsoft Graph (Entra ID) mailbox - app-only, server-configured.
    const [graphStatus, setGraphStatus] = useState<any>(null);
    const [graphSyncing, setGraphSyncing] = useState(false);
    const loadGraphStatus = () => { api.get("/integrations/graph/status").then(setGraphStatus).catch(() => { }); };
    useEffect(loadGraphStatus, []);

    // One-off filters for a manual fetch. These narrow THIS run only - the
    // persisted incremental marker only ever moves forward, so using "since" to
    // re-scan an earlier window can't make a later automatic poll skip mail.
    const [showGraphFilters, setShowGraphFilters] = useState(false);
    const filtersBtnRef = useRef<HTMLDivElement>(null);
    const [openUpwards, setOpenUpwards] = useState(false);

    useEffect(() => {
        if (showGraphFilters && filtersBtnRef.current) {
            const rect = filtersBtnRef.current.getBoundingClientRect();
            // Estimate dropdown height to be ~220px
            if (window.innerHeight - rect.bottom < 250) {
                setOpenUpwards(true);
            } else {
                setOpenUpwards(false);
            }
        }
    }, [showGraphFilters]);
    const [graphSince, setGraphSince] = useState("");
    const [graphUntil, setGraphUntil] = useState("");
    const [graphKeywords, setGraphKeywords] = useState("");
    const [historySince, setHistorySince] = useState("");
    const [historyUntil, setHistoryUntil] = useState("");

    const [graphFetchError, setGraphFetchError] = useState<string | null>(null);

    const handleGraphFetch = async () => {
        setGraphSyncing(true);
        setGraphFetchError(null);
        try {
            const body: any = {};
            if (graphSince) body.since = new Date(graphSince).toISOString();
            if (graphUntil) body.until = new Date(graphUntil).toISOString();
            if (graphKeywords.trim()) body.subject_keywords = graphKeywords.split(",").map(k => k.trim()).filter(Boolean);

            // Fetch now runs in the BACKGROUND - the POST returns immediately and we
            // poll /status until the server clears `fetch_running`, refreshing the
            // fetch-history table when the run lands.
            const res: any = await api.post("/integrations/graph/fetch", body);
            if (res.error) { setGraphFetchError(res.error); setGraphSyncing(false); return; }
            pollUntilFetchDone();
        } catch (error: any) {
            setGraphFetchError(error.detail || error.message || "Microsoft Graph fetch failed.");
            setGraphSyncing(false);
        }
    };

    // Poll status while a background fetch is running; stop when it clears (or after
    // a safety cap so the button never stays stuck if something goes wrong).
    const pollUntilFetchDone = () => {
        let elapsed = 0;
        const tick = async () => {
            let status: any = null;
            try { status = await api.get("/integrations/graph/status"); } catch { /* transient */ }
            if (status) setGraphStatus(status);
            elapsed += 5;
            if (status && status.fetch_running && elapsed < 600) {
                setTimeout(tick, 5000);
            } else {
                setGraphSyncing(false);
            }
        };
        setTimeout(tick, 5000);
    };

    // Resume the progress indicator if a fetch is already running when the page
    // loads (started by the scheduler, another admin, or before a refresh).
    useEffect(() => {
        if (graphStatus?.fetch_running && !graphSyncing) {
            setGraphSyncing(true);
            pollUntilFetchDone();
        }
    }, [graphStatus?.fetch_running]); // eslint-disable-line react-hooks/exhaustive-deps

    // Settings State
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [imapServer, setImapServer] = useState("outlook.office365.com");

    // Load saved settings when page opens
    useEffect(() => {
        const savedEmail = localStorage.getItem("tw_email") || "";
        const savedPass = localStorage.getItem("tw_email_pass") || "";
        const savedServer = localStorage.getItem("tw_imap_server") || "outlook.office365.com";
        setEmail(savedEmail);
        setPassword(savedPass);
        setImapServer(savedServer);
    }, []);

    const saveSettings = () => {
        if (!email || !password || !imapServer) {
            alert("Please fill in all fields!");
            return;
        }
        localStorage.setItem("tw_email", email);
        localStorage.setItem("tw_email_pass", password);
        localStorage.setItem("tw_imap_server", imapServer);
        alert("Settings saved successfully!");
        setShowSettings(false);
    };

    const handleEmailSync = async () => {
        if (!email || !password) {
            alert("Please configure your email settings first!");
            setShowSettings(true);
            return;
        }

        setIsSyncingEmail(true);
        try {
            // Send the saved credentials to your Python backend!
            const res = await candidateApi.fetchFromEmail({
                email: email,
                password: password,
                imap_server: imapServer
            });
            const lines = [`Sync complete! Added ${res.processed} new resumes.`];
            if (res.ai_failed) {
                lines.push(`${res.ai_failed} saved as raw text only - AI structuring failed for those.`);
            }
            if (res.failed) {
                lines.push(`${res.failed} attachment${res.failed > 1 ? "s" : ""} failed to process.`);
            }
            if (Array.isArray(res.errors) && res.errors.length) {
                lines.push("\nErrors:\n• " + res.errors.slice(0, 5).join("\n• "));
            }
            alert(lines.join("\n"));
        } catch (error: any) {
            alert(error.detail || error.message || "Failed to connect to email. Check your app password and settings.");
        } finally {
            setIsSyncingEmail(false);
        }
    };

    const cardStyle: React.CSSProperties = {
        background: "var(--twd-surface)",
        border: "1px solid var(--twd-line2)",
        borderRadius: 16,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
    };

    return (
        <div className="twd-scope">
            <div className="twd-head twd-head--tight twd-rise">
                <div>
                    <h1 className="twd-title"><span className="twd-title--accent">Email</span> Integrations</h1>
                    <p className="twd-sub">Connect your inbox to automatically pull resumes into your talent pool.</p>
                </div>
            </div>

            {showSettings ? (
                <div className="twd-rise" style={{ ...cardStyle, maxWidth: 560, marginBottom: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                        <CardIcon name="settings" />
                        <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>
                            Configuration Settings
                        </h3>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
                        <div>
                            <label style={fieldLabel}>Email Provider (IMAP Server)</label>
                            <select
                                className="twd-select"
                                value={imapServer}
                                onChange={(e) => setImapServer(e.target.value)}
                                style={{ width: "100%" }}
                            >
                                <option value="outlook.office365.com">Outlook / Hotmail (outlook.office365.com)</option>
                                <option value="imap.gmail.com">Gmail (imap.gmail.com)</option>
                            </select>
                        </div>

                        <div>
                            <label style={fieldLabel}>Email Address</label>
                            <input
                                type="email"
                                className="twd-input"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your.email@outlook.com"
                                style={{ width: "100%" }}
                            />
                        </div>

                        <div>
                            <label style={fieldLabel}>App Password</label>
                            <input
                                type="password"
                                className="twd-input"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Paste your 16-character App Password here"
                                style={{ width: "100%" }}
                            />
                        </div>

                        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                            <button className="twd-btn twd-btn-primary" onClick={saveSettings}>
                                Save Settings
                            </button>
                            <button className="twd-btn twd-btn-ghost" onClick={() => setShowSettings(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="twd-rise" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, alignItems: "stretch", position: "relative", zIndex: 10 }}>
                    {/* CARD 1: Configure Email */}
                    <div style={cardStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                            <CardIcon name="settings" />
                            <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>Configure Email</h3>
                        </div>
                        <p style={{ color: "var(--twd-soft)", fontSize: 13.5, lineHeight: 1.55, margin: "0 0 20px", flexGrow: 1 }}>
                            Set up your IMAP connection, app passwords, and select which inbox to monitor.
                        </p>
                        <button
                            className="twd-btn twd-btn-ghost"
                            style={{ width: "100%" }}
                            onClick={() => setShowSettings(true)}
                        >
                            Open Settings
                        </button>
                    </div>

                    {/* CARD 2: Fetch New */}
                    <div style={cardStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                            <CardIcon name="refresh" />
                            <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>Fetch New Resumes</h3>
                        </div>
                        <p style={{ color: "var(--twd-soft)", fontSize: 13.5, lineHeight: 1.55, margin: "0 0 20px", flexGrow: 1 }}>
                            Manually trigger a scan of your configured inbox to download any new unread resumes.
                        </p>
                        <button
                            className="twd-btn twd-btn-primary"
                            style={{ width: "100%" }}
                            onClick={handleEmailSync}
                            disabled={isSyncingEmail}
                        >
                            {isSyncingEmail ? "Syncing Inbox..." : "Fetch Now"}
                        </button>
                    </div>

                    {/* CARD 3: Microsoft Mailbox */}
                    <div style={cardStyle}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <CardIcon name="mail" />
                                <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>Microsoft Mailbox</h3>
                            </div>
                            {graphStatus?.configured ? (
                                <span className="twd-pill twd-pill--green">Connected</span>
                            ) : (
                                <span className="twd-pill twd-pill--amber">Not configured</span>
                            )}
                        </div>
                        <p style={{ color: "var(--twd-soft)", fontSize: 13.5, lineHeight: 1.55, margin: "0 0 14px", flexGrow: 1 }}>
                            New resumes are tagged <b style={{ color: "var(--twd-ink)" }}>"{graphStatus?.tag || "linkedin"}"</b> and routed to a requirement when the email references its code or name.
                        </p>
                        {graphStatus?.configured ? (
                            <div style={{ fontSize: 12.5, color: "var(--twd-soft)", marginBottom: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                                {graphStatus.mailbox}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12.5, color: "var(--twd-amber)", marginBottom: 14 }}>
                                Set TENANT_ID, CLIENT_ID, CLIENT_SECRET and GRAPH_MAILBOX in the server environment.
                            </div>
                        )}
                        {(() => {
                            const busy = graphSyncing || !!graphStatus?.fetch_running;
                            const disabled = busy || !graphStatus?.configured;
                            return (
                                <div style={{ display: "flex", gap: 8, width: "100%", alignItems: "stretch" }}>
                                    <button
                                        className="twd-btn twd-btn-primary"
                                        style={{ flexGrow: 1 }}
                                        onClick={handleGraphFetch}
                                        disabled={disabled}
                                    >
                                        {busy ? "Fetching… (runs in background)" : "Fetch from Microsoft"}
                                    </button>
                                    <div style={{ position: "relative", display: "flex" }} ref={filtersBtnRef}>
                                        <button
                                            type="button"
                                            className="twd-btn twd-btn-ghost"
                                            style={{ padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "center" }}
                                            onClick={() => setShowGraphFilters(s => !s)}
                                            title={showGraphFilters ? "Hide filters" : "Filters"}
                                        >
                                            <Icon name="filter" size={16} />
                                        </button>

                                        {showGraphFilters && (
                                            <div style={{
                                                position: "absolute",
                                                ...(openUpwards ? { bottom: "100%", marginBottom: 8 } : { top: "100%", marginTop: 8 }),
                                                right: 0,
                                                background: "var(--twd-surface)",
                                                border: "1px solid var(--twd-line2)",
                                                borderRadius: 12,
                                                padding: 16,
                                                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                                                zIndex: 50,
                                                width: 480,
                                                maxWidth: "90vw",
                                                display: "grid",
                                                gridTemplateColumns: "1fr 1fr",
                                                gap: 12
                                            }}>
                                                <div>
                                                    <label style={fieldLabel}>Since (optional)</label>
                                                    <input
                                                        type="datetime-local"
                                                        className="twd-input"
                                                        value={graphSince}
                                                        onChange={(e) => setGraphSince(e.target.value)}
                                                        style={{ width: "100%", fontSize: 13, boxSizing: "border-box" }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={fieldLabel}>Until (optional)</label>
                                                    <input
                                                        type="datetime-local"
                                                        className="twd-input"
                                                        value={graphUntil}
                                                        onChange={(e) => setGraphUntil(e.target.value)}
                                                        style={{ width: "100%", fontSize: 13, boxSizing: "border-box" }}
                                                    />
                                                </div>
                                                <div style={{ gridColumn: "1 / -1" }}>
                                                    <label style={fieldLabel}>Subject keywords (optional, comma-separated)</label>
                                                    <input
                                                        type="text"
                                                        className="twd-input"
                                                        value={graphKeywords}
                                                        onChange={(e) => setGraphKeywords(e.target.value)}
                                                        placeholder="e.g. resume, application, applied"
                                                        style={{ width: "100%", fontSize: 13, boxSizing: "border-box" }}
                                                    />
                                                </div>
                                                <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 11.5, color: "var(--twd-faint)", lineHeight: 1.5 }}>
                                                    Since/Until only bound this one run - they never move the saved incremental position backward,
                                                    so future fetches (and the background poller) still pick up where they'd normally be.
                                                    Leave blank for the normal "resume from last fetch" behavior.
                                                </p>
                                                <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                                                    <button
                                                        type="button"
                                                        className="twd-btn twd-btn-ghost"
                                                        onClick={() => {
                                                            setGraphSince("");
                                                            setGraphUntil("");
                                                            setGraphKeywords("");
                                                        }}
                                                    >
                                                        Clear
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="twd-btn twd-btn-primary"
                                                        onClick={() => {
                                                            setShowGraphFilters(false);
                                                            handleGraphFetch();
                                                        }}
                                                        disabled={graphSyncing || !!graphStatus?.fetch_running || !graphStatus?.configured}
                                                    >
                                                        {graphSyncing || !!graphStatus?.fetch_running ? "Fetching..." : "Apply & Fetch"}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Microsoft mailbox - filters, errors and fetch history (the action
                card lives in the row above). Only shown once there's something to show. */}
            {(graphStatus?.configured || showGraphFilters || graphFetchError || (graphStatus?.runs?.length ?? 0) > 0) && (
                <div className="twd-rise" style={{ ...cardStyle, marginTop: 20, display: "block" }}>

                    {graphFetchError && (
                        <div style={{ marginTop: showGraphFilters ? 16 : 0, padding: "10px 14px", borderRadius: 10, background: "var(--twd-red-bg)", border: "1px solid color-mix(in srgb, var(--twd-red) 35%, transparent)", color: "var(--twd-red-text)", fontSize: 13 }}>
                            {graphFetchError}
                        </div>
                    )}

                    {(graphStatus?.runs?.length ?? 0) > 0 && (
                        <div style={{ marginTop: graphFetchError ? 20 : 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 10px" }}>
                                <div className="twd-section-label" style={{ margin: 0 }}>Fetch history</div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--twd-faint)", margin: 0 }}>Since:</label>
                                    <input
                                        type="datetime-local"
                                        className="twd-input"
                                        value={historySince}
                                        onChange={(e) => setHistorySince(e.target.value)}
                                        style={{ fontSize: 12, padding: "4px 8px" }}
                                    />
                                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--twd-faint)", margin: "0 0 0 8px" }}>Until:</label>
                                    <input
                                        type="datetime-local"
                                        className="twd-input"
                                        value={historyUntil}
                                        onChange={(e) => setHistoryUntil(e.target.value)}
                                        style={{ fontSize: 12, padding: "4px 8px" }}
                                    />
                                    {(historySince || historyUntil) && (
                                        <button
                                            type="button"
                                            className="twd-link"
                                            style={{ padding: "4px", display: "flex", alignItems: "center", marginLeft: 4 }}
                                            onClick={() => { setHistorySince(""); setHistoryUntil(""); }}
                                            title="Clear history filters"
                                        >
                                            <Icon name="x" size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="twd-table-wrap">
                                <div className="twd-table-scroll" style={{ maxHeight: 320, overflowY: "auto" }}>
                                    <table className="twd-table">
                                        <thead>
                                            <tr>
                                                <th>When</th>
                                                <th>Trigger</th>
                                                <th>Job roles</th>
                                                <th style={{ textAlign: "right" }}>Emails scanned</th>
                                                <th style={{ textAlign: "right" }}>Resumes fetched</th>
                                                <th style={{ textAlign: "right" }}>Routed</th>
                                                <th style={{ textAlign: "right" }}>Duplicates</th>
                                                <th style={{ textAlign: "right" }}>Errors</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {graphStatus.runs.filter((run: any) => {
                                                if (historySince && new Date(run.run_at) < new Date(historySince)) return false;
                                                if (historyUntil && new Date(run.run_at) > new Date(historyUntil)) return false;
                                                return true;
                                            }).map((run: any, i: number) => (
                                                <tr key={i}>
                                                    <td style={{ whiteSpace: "nowrap" }} className="twd-cell-soft">
                                                        {run.run_at ? fmtTs(run.run_at) : "-"}
                                                    </td>
                                                    <td>
                                                        <span className={`twd-pill ${run.trigger === "poller" ? "twd-pill--neutral" : "twd-pill--green"}`}>
                                                            {run.trigger === "poller" ? "auto" : "manual"}
                                                        </span>
                                                    </td>
                                                    <td className="twd-cell-soft" style={{ minWidth: 180, maxWidth: 320, whiteSpace: "normal" }}>
                                                        {run.roles && Object.keys(run.roles).length > 0
                                                            ? Object.entries(run.roles)
                                                                .map(([role, n]) => `${role}${(n as number) > 1 ? ` ×${n}` : ""}`)
                                                                .join(", ")
                                                            : "-"}
                                                    </td>
                                                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{run.processed ?? 0}</td>
                                                    <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{run.created ?? 0}</td>
                                                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{run.routed ?? 0}</td>
                                                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{run.duplicates ?? 0}</td>
                                                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: (run.errors || run.error) ? "var(--twd-red-text)" : "inherit" }} title={run.error || undefined}>
                                                        {run.errors ?? 0}{run.error ? " !" : ""}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
