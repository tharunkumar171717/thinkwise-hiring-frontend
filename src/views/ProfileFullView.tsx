import { useCallback, useEffect, useMemo, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useParams } from "../lib/router";
import { api, API_BASE, getToken } from "../services/api";
import { fmtTs } from "../utils/dateUtils";
import { STATUS_LABEL, formatStatus, statusTone } from "../utils/statusUtils";
import ScorecardReport from "../components/ScorecardReport";
import BackButton from "../components/BackButton";
import "../styles/dashboard.css";
import AuthenticityPanel from "../components/AuthenticityPanel";
import ProjectQualityBlock from "../components/ProjectQualityBlock";

type Profile = any;

function colorForLevel(level?: string): string {
    if (level === "green") return "#16a34a";
    if (level === "orange") return "#ca8a04";
    if (level === "red") return "#dc2626";
    if (level === "warning") return "#ca8a04";
    if (level === "info") return "#2563eb";
    return "#6b7280";
}


function ResumePreview({ candidateId, candidateName }: { candidateId: string; candidateName?: string }) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [mime, setMime] = useState<string>("application/pdf");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let created: string | null = null;
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/candidates/${candidateId}/resume`, {
                    headers: { Authorization: `Bearer ${await getToken()}` },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                if (cancelled) return;
                setMime(res.headers.get("Content-Type") || "application/pdf");
                created = URL.createObjectURL(blob);
                setBlobUrl(created);
            } catch (e: any) {
                if (!cancelled) setError(e?.message || "Failed to load resume");
            }
        })();
        return () => {
            cancelled = true;
            if (created) URL.revokeObjectURL(created);
        };
    }, [candidateId]);

    if (error) return <div style={{ padding: "1rem", color: "#dc2626", fontSize: 13 }}>{error}</div>;
    if (!blobUrl) return <div style={{ padding: "1rem", fontSize: 13, color: "var(--text-secondary)" }}>Loading resume…</div>;
    if (!mime.includes("pdf")) {
        return (
            <div style={{ padding: "1rem", fontSize: 13 }}>
                Inline preview is only supported for PDFs.{" "}
                <a href={blobUrl} download={candidateName || "resume"} style={{ color: "var(--accent)" }}>Download</a>
            </div>
        );
    }
    return <iframe src={blobUrl} title="Resume" style={{ width: "100%", height: "100%", border: "none" }} />;
}

export default function ProfileFullView({ reqId: reqIdProp, candidateId: candidateIdProp }: { reqId?: string; candidateId?: string } = {}) {
    const params = useParams<{ id: string; candidateId: string }>();
    const jdId = reqIdProp || params.id;
    const candidateId = candidateIdProp || params.candidateId;
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<"overview" | "deterministic" | "llm" | "comments" | "summary" | "resume" | "analysis">("overview");

    const load = useCallback(async () => {
        if (!jdId || !candidateId) return;
        setLoading(true); setError(null);
        try {
            const result = await api.get(`/requirements/${jdId}/profiles/${candidateId}`);
            setProfile(result);
        } catch (e: any) {
            setError(e?.detail || e?.message || "Failed to load profile");
        } finally {
            setLoading(false);
        }
    }, [jdId, candidateId]);

    useEffect(() => { void load(); }, [load]);

    const name = profile?.candidate?.Name || profile?.deterministic_scoring_analysis?.candidate_name || "Profile";
    useDocumentTitle(name);
    const det = profile?.deterministic_scoring_analysis;
    const llm = profile?.llm_analysis;

    const tabs = useMemo(() => ([
        { key: "overview" as const, label: "Overview" },
        { key: "llm" as const, label: llm ? "LLM Analysis" : "LLM Analysis (not run)" },
        { key: "comments" as const, label: `Comments (${(profile?.recruiter_comments || []).length})` },
        { key: "summary" as const, label: "Summary Report" },
        { key: "analysis" as const, label: "Assessment Analysis" },
        { key: "resume" as const, label: "Resume" },
    ]), [profile, llm]);

    if (loading) return <div style={{ padding: "2rem" }}>Loading…</div>;
    if (error || !profile) {
        return (
            <div style={{ padding: "2rem", color: "#dc2626" }}>
                {error || "Profile not found"}
                <div style={{ marginTop: "1rem" }}>
                    <BackButton />
                </div>
            </div>
        );
    }

    return (
        <div className="twd-scope twd-scope--fixed" style={{ gap: "0.9rem", paddingBottom: 20 }}>
            {/* Header */}
            <header style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: 4 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 className="twd-title twd-title--xs" style={{ margin: 0 }}>{name}</h2>
                    <div style={{ fontSize: 12.5, color: "var(--twd-soft)", marginTop: 4 }}>
                        {det?.current_role || "-"}
                        {det?.current_company && <> · {det.current_company}</>}
                        {" · "}Sourced by <strong>{profile.recruiter_name || "-"}</strong> ({profile.sourced_by?.source || "-"})
                    </div>
                </div>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center", fontSize: 13, color: "var(--twd-soft)" }}>
                    {llm?.overall_score != null && (
                        <div>AI <b style={{ color: "var(--twd-red-text)", fontVariantNumeric: "tabular-nums" }}>{llm.overall_score}/100</b> · {llm.rating}</div>
                    )}
                </div>
            </header>

            {/* Internal side nav + content */}
            <div style={{ display: "flex", gap: 16, flex: "1 1 auto", minHeight: 0 }}>
                <nav className="twd-vnav" aria-label="Candidate sections">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            type="button"
                            className="twd-vnav-item"
                            data-active={tab === t.key}
                            onClick={() => setTab(t.key)}
                            title={t.label}
                        >{t.label}</button>
                    ))}
                </nav>

                <section style={{ display: "flex", flexDirection: "column", background: "var(--twd-surface)", border: "1px solid var(--twd-line2)", borderRadius: 16, overflow: "hidden", flex: "1 1 auto", minWidth: 0, minHeight: 0 }}>
                    {tab === "resume" ? (
                        <div style={{ flex: 1, minHeight: 0 }}>
                            <ResumePreview candidateId={candidateId!} candidateName={name} />
                        </div>
                    ) : (
                        <div style={{ flex: 1, overflow: "auto", padding: "1.25rem 1.5rem" }}>
                            <div style={{ maxWidth: 900, margin: "0 auto" }}>
                                {tab === "overview" && <OverviewBlock profile={profile} />}
                                {tab === "llm" && <LlmBlock profile={profile} jdId={jdId!} onUpdated={load} />}
                                {tab === "comments" && <CommentsBlock profile={profile} jdId={jdId!} onUpdated={load} />}
                                {tab === "summary" && <ScorecardReport requirementId={jdId!} candidateId={candidateId!} />}
                                {tab === "analysis" && <ScorecardReport requirementId={jdId!} candidateId={candidateId!} forceView="analysis" />}
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

function OverviewBlock({ profile }: { profile: Profile }) {
    const det = profile.deterministic_scoring_analysis || {};
    const llm = profile.llm_analysis;
    const flags = [
        ...(det.flags || []).map((f: any) => ({ source: "det", ...f, level: f.severity })),
        ...(llm?.flags || []).map((f: any) => ({ source: "llm", ...f })),
    ];
    const recent = (profile.recruiter_comments || []).slice(-3).reverse();

    const mustSkillResults: Array<{ skill: string; matched: boolean }> = profile.must_have_skill_results ?? [];
    const missed = mustSkillResults.filter(s => !s.matched);
    const matchedSkills = mustSkillResults.filter(s => s.matched);
    const allMatched = mustSkillResults.length > 0 && missed.length === 0;

    const pastSubs: any[] = profile.past_submissions ?? [];
    const seq: number | null = profile.submission_sequence ?? null;
    const sentAt: string | null = profile.submission_sent_at ?? null;
    const appStatus: string | null = (profile.offer_status || profile.dynamic_status || profile.application_status) ?? null;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", fontSize: 13 }}>
            {llm?.headline && <div style={{ fontStyle: "italic" }}>"{llm.headline}"</div>}

            {mustSkillResults.length > 0 && (
                <div style={{ borderRadius: 6, border: `1px solid ${allMatched ? "#bbf7d0" : "#fecaca"}`, background: allMatched ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.05)", padding: "0.6rem 0.75rem" }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: "0.5rem", color: allMatched ? "#16a34a" : "#dc2626" }}>
                        {allMatched ? `✓ All ${mustSkillResults.length} must-have skills matched` : `⚠ ${missed.length} of ${mustSkillResults.length} must-have skills missing`}
                    </div>
                    {missed.length > 0 && (
                        <div style={{ marginBottom: "0.35rem" }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", marginBottom: "0.2rem" }}>Missing</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                                {missed.map((s, i) => (
                                    <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(220,38,38,0.1)", border: "1px solid #fecaca", color: "#dc2626" }}>✗ {s.skill}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    {matchedSkills.length > 0 && (
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#16a34a", marginBottom: "0.2rem" }}>Matched</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                                {matchedSkills.map((s, i) => (
                                    <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(22,163,74,0.1)", border: "1px solid #bbf7d0", color: "#16a34a" }}>✓ {s.skill}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {flags.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {flags.map((f, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorForLevel(f.level), flexShrink: 0 }} />
                            <span style={{ color: "var(--text-primary)", fontWeight: 500, minWidth: 80, textTransform: "capitalize" }}>{f.type}</span>
                            <span>{f.message}</span>
                        </div>
                    ))}
                </div>
            )}

            {(sentAt || pastSubs.length > 0) && (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" }}>Submission History</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                        {sentAt && (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: 12 }}>
                                {seq != null && (
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: seq === 1 ? "#16a34a" : "var(--bg-secondary)", color: seq === 1 ? "#fff" : "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
                                        {seq === 1 ? "First" : `#${seq}`}
                                    </span>
                                )}
                                <span style={{ fontWeight: 500 }}>This requirement</span>
                                <span style={{ color: "var(--text-secondary)" }}>·</span>
                                <span style={{ color: appStatus ? statusTone(appStatus).fg : "#16a34a", fontWeight: 500 }}>
                                    {appStatus ? formatStatus(appStatus) : "Submitted"}
                                </span>
                                <span style={{ color: "var(--text-secondary)" }}>· {fmtTs(sentAt)}</span>
                            </div>
                        )}
                        {pastSubs.map((ps: any, i: number) => {
                            const pst = ps.offer_status || ps.dynamic_status || ps.status;
                            return (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: 13, background: "var(--bg-secondary)", padding: "0.5rem 0.8rem", borderRadius: 6 }}>
                                    <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>↳</span>
                                    {ps.client && <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{ps.client}</span>}
                                    {ps.requirement_name && <span style={{ color: "var(--text-secondary)" }}>{ps.requirement_name}</span>}
                                    <span style={{ color: "var(--text-secondary)" }}>·</span>
                                    <span style={{ color: pst ? statusTone(pst).fg : "#2563eb", fontWeight: 500 }}>{pst ? formatStatus(pst) : "Submitted"}</span>
                                    {ps.rejection_reason && (
                                        <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }} title={ps.rejection_reason}>
                                            · "{ps.rejection_reason.slice(0, 50)}{ps.rejection_reason.length > 50 ? "…" : ""}"
                                        </span>
                                    )}
                                    {ps.sent_at && <span style={{ color: "var(--text-secondary)", marginLeft: "auto" }}>{fmtTs(ps.sent_at)}</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {recent.length > 0 && (
                <div>
                    <div style={{ fontWeight: 600, marginBottom: "0.3rem" }}>Recent comments</div>
                    {recent.map((c: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: "0.4rem", borderLeft: "3px solid var(--border-subtle)", paddingLeft: "0.6rem" }}>
                            <div style={{ color: "var(--text-primary)" }}>"{c.comment}"</div>
                            <div style={{ fontSize: 11 }}>- {c.author_name || "unknown"} · {fmtTs(c.date)} {c.requirement_name && `· for ${c.requirement_name}`}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function LlmBlock({ profile, jdId, onUpdated }: { profile: Profile; jdId: string; onUpdated: () => void }) {
    const [running, setRunning] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const llm = profile.llm_analysis;
    const run = async () => {
        if (running) return;
        setRunning(true); setErr(null);
        try {
            const result = await api.post(`/requirements/${jdId}/profiles/${profile.candidate_uuid}/llm-analysis?force=true`, {});
            if (result?.status !== "success") throw new Error(result?.error || "Failed");
            onUpdated();
        } catch (e: any) { setErr(e?.detail || e?.message || "Failed"); }
        finally { setRunning(false); }
    };
    if (!llm) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No LLM analysis yet.</div>
                <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} onClick={run} disabled={running}>
                    {running ? "Analyzing…" : "Analyse with AI"}
                </button>
                {err && <div style={{ fontSize: 12, color: "#dc2626" }}>{err}</div>}
            </div>
        );
    }
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", fontSize: 13 }}>
            {llm.headline && <div style={{ fontStyle: "italic" }}>"{llm.headline}"</div>}
            <div style={{ display: "flex", gap: "1.5rem" }}>
                <span><strong>Overall:</strong> <span className="font-mono">{llm.overall_score}/100</span></span>
                <span><strong>Rating:</strong> {llm.rating}</span>
            </div>
            <AuthenticityPanel authenticity={llm.authenticity} />
            {(llm.dimensions || []).map((d: any) => (
                <div key={d.id} style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 500 }}>{d.name}</span>
                        {/* Project quality is weight 0 by design - say so rather than showing "weight 0". */}
                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                            {d.weight ? `weight ${d.weight}` : "not scored"}
                        </span>
                        <span className="font-mono" style={{ marginLeft: "auto", fontWeight: 600 }}>{d.score}</span>
                    </div>
                    {d.reasoning && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: "0.2rem" }}>{d.reasoning}</div>}
                    {d.id === "project_quality" && <ProjectQualityBlock dim={d} />}
                </div>
            ))}
            {(llm.strengths?.length || llm.gaps?.length) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    {llm.strengths?.length > 0 && (
                        <div><div style={{ fontWeight: 600, color: "#16a34a", marginBottom: "0.3rem" }}>Strengths</div>
                            <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: 12 }}>{llm.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
                        </div>
                    )}
                    {llm.gaps?.length > 0 && (
                        <div><div style={{ fontWeight: 600, color: "#dc2626", marginBottom: "0.3rem" }}>Gaps</div>
                            <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: 12 }}>{llm.gaps.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
                        </div>
                    )}
                </div>
            )}
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={run} disabled={running}>
                {running ? "Re-analyzing…" : "Re-run AI analysis"}
            </button>
        </div>
    );
}

function CommentsBlock({ profile, jdId, onUpdated }: { profile: Profile; jdId: string; onUpdated: () => void }) {
    const [draft, setDraft] = useState("");
    const [posting, setPosting] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const comments = profile.recruiter_comments || [];
    const submit = async () => {
        const t = draft.trim();
        if (!t || posting) return;
        setPosting(true); setErr(null);
        try {
            await api.post(`/requirements/${jdId}/profiles/${profile.candidate_uuid}/comments`, { comment: t });
            setDraft("");
            onUpdated();
        } catch (e: any) { setErr(e?.detail || e?.message || "Failed"); }
        finally { setPosting(false); }
    };
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Add a comment about this candidate for this requirement…"
                    rows={3}
                    style={{ resize: "vertical", padding: "0.5rem", fontSize: 13, border: "1px solid var(--border-subtle)", borderRadius: 4 }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    {err && <div style={{ fontSize: 12, color: "#dc2626" }}>{err}</div>}
                    <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={submit} disabled={posting || !draft.trim()}>
                        {posting ? "Posting…" : "Post comment"}
                    </button>
                </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {comments.length === 0 && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No comments yet.</div>}
                {[...comments].reverse().map((c: any, i: number) => (
                    <div key={i} style={{ fontSize: 13, borderLeft: "3px solid var(--border-subtle)", paddingLeft: "0.6rem" }}>
                        <div>{c.comment}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>- {c.author_name || "unknown"} · {fmtTs(c.date)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
