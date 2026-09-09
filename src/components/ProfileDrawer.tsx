import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "../lib/router";
import { api } from "../services/api";
import { useSideDrawer, type ProfileAction, type ProfileViewTab } from "../context/SideDrawerContext";
import { useAuth } from "../context/AuthContext";
import { fmtDate } from "../utils/dateUtils";
import { STATUS_LABEL, STATUS_LABEL_COMPACT, formatStatus, statusTone } from "../utils/statusUtils";
import ScorecardReport from "./ScorecardReport";
import Icon from "./Icon";
import "../styles/dashboard.css";
import AuthenticityPanel from "./AuthenticityPanel";
import ProjectQualityBlock from "./ProjectQualityBlock";

type Profile = any;

interface ProfileDrawerProps {
    jdId: string;
    profile: Profile;
    action: ProfileAction;
    initialTab?: ProfileViewTab;
    onUpdated?: (next: Profile) => void;
}

function colorForLevel(level?: string): string {
    if (level === "green") return "#16a34a";
    if (level === "orange") return "#ca8a04";
    if (level === "red") return "#dc2626";
    if (level === "warning") return "#ca8a04";
    if (level === "info") return "#2563eb";
    return "#6b7280";
}


function npColor(notice?: string | null): string {
    if (!notice) return "var(--text-secondary)";
    const l = notice.toLowerCase();
    if (l.includes("immediate") || l.includes("serving") || l === "0") return "#16a34a";
    const n = parseInt(l);
    if (!isNaN(n)) { if (n <= 15) return "#16a34a"; if (n <= 60) return "#d97706"; return "#dc2626"; }
    return "var(--text-secondary)";
}

function OverviewSection({ profile }: { profile: Profile }) {
    const det = profile.deterministic_scoring_analysis || {};
    const llm = profile.llm_analysis;
    const cand = profile.candidate || {};
    const personal = cand.PersonalDetails || {};
    const mostRecent = (cand.Experience || [])[0] || {};

    const currentRole = det.current_role || mostRecent.Position || cand.current_role || "-";
    const currentCompany = det.current_company || mostRecent.Company || cand.current_company || "-";
    const currentCtc = cand.current_ctc ?? cand.present_ctc;
    const expectedCtc = cand.expected_ctc;
    const noticePeriod = cand.notice_period || personal.NoticePeriod;
    const reasonForChange = cand.reason_for_change;
    const relevantExp = cand.relevant_experience;

    const flags = [
        ...(det.flags || []).map((f: any) => ({ source: "det", ...f, level: f.severity })),
        ...(llm?.flags || []).map((f: any) => ({ source: "llm", ...f })),
    ];

    const mustSkillResults: Array<{ skill: string; matched: boolean }> = profile.must_have_skill_results ?? [];
    const missed = mustSkillResults.filter(s => !s.matched);
    const matched = mustSkillResults.filter(s => s.matched);
    const allMatched = mustSkillResults.length > 0 && missed.length === 0;

    const pastSubs: any[] = profile.past_submissions ?? [];
    const seq: number | null = profile.submission_sequence ?? null;
    const sentAt: string | null = profile.submission_sent_at ?? null;
    const appStatus: string | null = (profile.offer_status || profile.dynamic_status || profile.application_status) ?? null;

    const Field = ({ label, value }: { label: string; value?: any }) => (
        <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, lineHeight: 1.45 }}>
                {value ?? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>-</span>}
            </div>
        </div>
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: 13 }}>
            {/* AI Score block */}
            {llm?.overall_score != null && (
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.65rem 0.9rem", background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                    <div style={{ flexShrink: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px" }}>AI Score</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#2563eb", fontFamily: "monospace", lineHeight: 1.1 }}>
                            {llm.overall_score}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" }}>/100</span>
                        </div>
                    </div>
                    {llm.rating && <span style={{ fontSize: 12, color: "var(--text-secondary)", background: "var(--bg-primary)", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border-subtle)", flexShrink: 0 }}>{llm.rating}</span>}
                    {llm.headline && <div style={{ fontStyle: "italic", color: "var(--text-secondary)", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{llm.headline}"</div>}
                </div>
            )}

            {/* Key submission details */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem 1.5rem" }}>
                <Field label="Current Role" value={currentRole} />
                <Field label="Current Company" value={currentCompany} />
                <Field label="Current CTC" value={currentCtc != null ? `${currentCtc} LPA` : undefined} />
                <Field label="Expected CTC" value={expectedCtc != null ? `${expectedCtc} LPA` : undefined} />
                <Field label="Notice Period" value={
                    noticePeriod
                        ? <span style={{ color: npColor(noticePeriod) }}>{noticePeriod}</span>
                        : undefined
                } />
            </div>

            {/* Relevant Experience */}
            {relevantExp && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 4 }}>Relevant Experience</div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.55 }}>{relevantExp}</div>
                </div>
            )}

            {/* Reason for Change */}
            {reasonForChange && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 4 }}>Reason for Change</div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.55 }}>{reasonForChange}</div>
                </div>
            )}

            {/* Must-have skills */}
            {mustSkillResults.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem", borderRadius: 6, border: `1px solid ${allMatched ? "#bbf7d0" : "#fecaca"}`, background: allMatched ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.05)", padding: "0.6rem 0.75rem" }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: "0.5rem", color: allMatched ? "#16a34a" : "#dc2626" }}>
                        {allMatched
                            ? `✓ All ${mustSkillResults.length} must-have skills matched`
                            : `⚠ ${missed.length} of ${mustSkillResults.length} must-have skills missing`}
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
                    {matched.length > 0 && (
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#16a34a", marginBottom: "0.2rem" }}>Matched</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                                {matched.map((s, i) => (
                                    <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(22,163,74,0.1)", border: "1px solid #bbf7d0", color: "#16a34a" }}>✓ {s.skill}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Flags */}
            {flags.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 6 }}>Flags</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                        {flags.map((f: any, i: number) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorForLevel(f.level), flexShrink: 0 }} />
                                <span style={{ color: "var(--text-primary)", fontWeight: 500, minWidth: 80, textTransform: "capitalize" as const }}>{f.type}</span>
                                <span style={{ color: "var(--text-secondary)" }}>{f.message}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Submission history */}
            {(sentAt || pastSubs.length > 0) && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 6 }}>Submission History</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                        {sentAt && (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: 12 }}>
                                {seq != null && (
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: seq === 1 ? "#16a34a" : "var(--bg-secondary)", color: seq === 1 ? "#fff" : "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
                                        {seq === 1 ? "First" : `#${seq}`}
                                    </span>
                                )}
                                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>This requirement</span>
                                <span style={{ color: "var(--text-secondary)" }}>·</span>
                                <span style={{ color: appStatus ? statusTone(appStatus).fg : "#16a34a", fontWeight: 500 }}>
                                    {appStatus ? formatStatus(appStatus) : "Submitted"}
                                </span>
                                <span style={{ color: "var(--text-secondary)" }}>·</span>
                                <span style={{ color: "var(--text-secondary)" }}>{fmtDate(sentAt)}</span>
                            </div>
                        )}
                        {pastSubs.map((ps: any, i: number) => {
                            const pst = ps.offer_status || ps.dynamic_status || ps.status;
                            return (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: 12 }}>
                                    <span style={{ color: "var(--text-secondary)", fontSize: 10 }}>↳</span>
                                    {ps.client && <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{ps.client}</span>}
                                    {ps.requirement_name && <span style={{ color: "var(--text-secondary)" }}>{ps.requirement_name}</span>}
                                    <span style={{ color: "var(--text-secondary)" }}>·</span>
                                    <span style={{ color: pst ? statusTone(pst).fg : "#2563eb", fontWeight: 500 }}>{pst ? formatStatus(pst) : "Submitted"}</span>
                                    {ps.rejection_reason && (
                                        <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }} title={ps.rejection_reason}>
                                            · "{ps.rejection_reason.slice(0, 40)}{ps.rejection_reason.length > 40 ? "…" : ""}"
                                        </span>
                                    )}
                                    {ps.sent_at && <span style={{ color: "var(--text-secondary)", marginLeft: "auto" }}>{fmtDate(ps.sent_at)}</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}


function LlmSection({ profile, jdId, onUpdated }: { profile: Profile; jdId: string; onUpdated: (next: Profile) => void }) {
    const [running, setRunning] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const llm = profile.llm_analysis;

    const run = async () => {
        if (running) return;
        setRunning(true); setErr(null);
        try {
            const result = await api.post(`/requirements/${jdId}/profiles/${profile.candidate_uuid}/llm-analysis?force=true`, {});
            if (result?.status !== "success") throw new Error(result?.error || "Analysis failed");
            onUpdated({ ...profile, llm_analysis: result.analysis });
        } catch (e: any) {
            setErr(e?.detail || e?.message || "Analysis failed");
        } finally {
            setRunning(false);
        }
    };

    if (!llm) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0.5rem 0" }}>
                <div className="text-sm text-muted">No LLM analysis yet for this candidate × requirement.</div>
                <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} onClick={run} disabled={running}>
                    {running ? "Analyzing…" : "Analyse with AI"}
                </button>
                {err && <div style={{ fontSize: 12, color: "#dc2626" }}>{err}</div>}
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", fontSize: 13 }}>
            {llm.headline && (
                <div style={{ fontStyle: "italic", color: "var(--text-primary)" }}>"{llm.headline}"</div>
            )}
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
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
                    {d.matched_skills?.length > 0 && (
                        <div style={{ marginTop: "0.3rem", fontSize: 11, color: "var(--text-secondary)" }}>
                            Matched: {d.matched_skills.map((m: any) => `${m.skill} (${m.strength})`).join(", ")}
                        </div>
                    )}
                </div>
            ))}
            {(llm.strengths?.length > 0 || llm.gaps?.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    {llm.strengths?.length > 0 && (
                        <div>
                            <div style={{ fontWeight: 600, color: "#16a34a", marginBottom: "0.3rem" }}>Strengths</div>
                            <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: 12, color: "var(--text-secondary)" }}>
                                {llm.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                            </ul>
                        </div>
                    )}
                    {llm.gaps?.length > 0 && (
                        <div>
                            <div style={{ fontWeight: 600, color: "#dc2626", marginBottom: "0.3rem" }}>Gaps</div>
                            <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: 12, color: "var(--text-secondary)" }}>
                                {llm.gaps.map((s: string, i: number) => <li key={i}>{s}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={run} disabled={running}>
                {running ? "Re-analyzing…" : "Re-run AI analysis"}
            </button>
            {err && <div style={{ fontSize: 12, color: "#dc2626" }}>{err}</div>}
        </div>
    );
}

function CommentsSection({ profile, jdId, onUpdated }: { profile: Profile; jdId: string; onUpdated: (next: Profile) => void }) {
    const { user } = useAuth();
    const [draft, setDraft] = useState("");
    const [posting, setPosting] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [editSaving, setEditSaving] = useState(false);
    const comments = profile.recruiter_comments || [];

    const [reqHistory, setReqHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    useEffect(() => {
        if (!profile.candidate_uuid) return;
        setHistoryLoading(true);
        api.get(`/candidates/${profile.candidate_uuid}/requirement-history`)
            .then((data: any[]) => setReqHistory((data || []).filter(h => String(h.requirement_id) !== String(jdId))))
            .catch(() => setReqHistory([]))
            .finally(() => setHistoryLoading(false));
    }, [profile.candidate_uuid, jdId]);

    const submit = async () => {
        const trimmed = draft.trim();
        if (!trimmed || posting) return;
        setPosting(true); setErr(null);
        try {
            const updated = await api.post(
                `/requirements/${jdId}/profiles/${profile.candidate_uuid}/comments`,
                { comment: trimmed }
            );
            onUpdated(updated);
            setDraft("");
        } catch (e: any) {
            setErr(e?.detail || e?.message || "Could not post comment");
        } finally {
            setPosting(false);
        }
    };

    const saveEdit = async (commentId: string) => {
        const trimmed = editText.trim();
        if (!trimmed || editSaving) return;
        setEditSaving(true);
        try {
            const updated = await api.patch(
                `/requirements/${jdId}/profiles/${profile.candidate_uuid}/comments/${commentId}`,
                { comment: trimmed }
            );
            onUpdated(updated);
            setEditingId(null);
        } catch (e: any) {
            setErr(e?.detail || e?.message || "Could not save edit");
        } finally {
            setEditSaving(false);
        }
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
                    <button
                        className="btn btn-primary btn-sm"
                        style={{ marginLeft: "auto" }}
                        onClick={submit}
                        disabled={posting || !draft.trim()}
                    >{posting ? "Posting…" : "Post comment"}</button>
                </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {comments.length === 0 && <div className="text-sm text-muted">No comments yet.</div>}
                {[...comments].reverse().map((c: any, i: number) => {
                    const isOwn = user?.id && c.author_id && String(c.author_id) === String(user.id);
                    const isEditing = editingId === String(c.id);
                    return (
                        <div key={i} style={{ fontSize: 13, borderLeft: "3px solid var(--border-subtle)", paddingLeft: "0.6rem" }}>
                            {isEditing ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                                    <textarea
                                        value={editText}
                                        onChange={e => setEditText(e.target.value)}
                                        rows={2}
                                        autoFocus
                                        style={{ resize: "vertical", padding: "0.4rem", fontSize: 13, border: "1px solid var(--accent)", borderRadius: 4, width: "100%" }}
                                    />
                                    <div style={{ display: "flex", gap: "0.4rem" }}>
                                        <button className="btn btn-primary btn-sm" onClick={() => saveEdit(String(c.id))} disabled={editSaving || !editText.trim()}>
                                            {editSaving ? "Saving…" : "Save"}
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)} disabled={editSaving}>Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ color: "var(--text-primary)" }}>{c.comment}</div>
                            )}
                            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: "0.2rem", display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{c.author_name || "Unknown"}</span>
                                <span>·</span>
                                <span>{fmtDate(c.date)}</span>
                                {c.requirement_name && (
                                    <>
                                        <span>·</span>
                                        <span style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "0px 6px", fontSize: 10 }}>
                                            {c.requirement_name}
                                        </span>
                                    </>
                                )}
                                {isOwn && !isEditing && c.id && (
                                    <button
                                        style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}
                                        onClick={() => { setEditingId(String(c.id)); setEditText(c.comment); }}
                                    >Edit</button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Requirement history */}
            {(historyLoading || reqHistory.length > 0) && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 8 }}>
                        Other Requirements
                    </div>
                    {historyLoading ? (
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                            {reqHistory.map((h, i) => {
                                const pst = h.offer_status || h.dynamic_status || h.status;
                                const statusColor = pst ? statusTone(pst).fg : "var(--text-muted)";
                                return (
                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", background: "var(--bg-secondary)", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {h.req_id && <span style={{ color: "var(--text-muted)", fontWeight: 400, marginRight: 4, fontFamily: "monospace", fontSize: 11 }}>{h.req_id}</span>}
                                                {h.requirement_name || "-"}
                                            </div>
                                            {h.sent_at && (
                                                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                                    {fmtDate(h.sent_at)}
                                                    {h.recruiter_name && <> · {h.recruiter_name}</>}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                                            {h.det_score != null && <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)" }}>{h.det_score}%</span>}
                                            {h.ai_score != null && <span style={{ fontSize: 11, fontFamily: "monospace", color: "#2563eb" }}>AI {h.ai_score}</span>}
                                            <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>
                                                {pst ? formatStatus(pst) : "Pool"}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function UpdateForm({ profile, jdId, refreshProfile }: {
    profile: Profile;
    jdId: string;
    refreshProfile: () => Promise<Profile | null>;
}) {
    const cand = profile.candidate || {};
    const [fields, setFields] = useState({
        current_ctc: cand.current_ctc != null ? String(cand.current_ctc) : "",
        expected_ctc: cand.expected_ctc != null ? String(cand.expected_ctc) : "",
        notice_period: cand.notice_period || "",
        relevant_experience: cand.relevant_experience || "",
        reason_for_change: cand.reason_for_change || "",
    });
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [posting, setPosting] = useState(false);
    const [commentErr, setCommentErr] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [editSaving, setEditSaving] = useState(false);
    const comments = profile.recruiter_comments || [];

    useEffect(() => {
        const c = profile.candidate || {};
        setFields({
            current_ctc: c.current_ctc != null ? String(c.current_ctc) : "",
            expected_ctc: c.expected_ctc != null ? String(c.expected_ctc) : "",
            notice_period: c.notice_period || "",
            relevant_experience: c.relevant_experience || "",
            reason_for_change: c.reason_for_change || "",
        });
    }, [profile.candidate_uuid]);

    const handleSaveFields = async () => {
        if (!fields.reason_for_change.trim()) {
            setSaveMsg("Reason for change is required");
            return;
        }
        setSaving(true); setSaveMsg(null);
        try {
            const body: any = {
                current_ctc: fields.current_ctc.trim() ? parseFloat(fields.current_ctc) : null,
                expected_ctc: fields.expected_ctc.trim() ? parseFloat(fields.expected_ctc) : null,
                notice_period: fields.notice_period.trim() || null,
                relevant_experience: fields.relevant_experience.trim() || null,
                reason_for_change: fields.reason_for_change.trim() || null,
            };
            await api.patch(`/candidates/${profile.candidate_uuid}`, body);
            await refreshProfile();
            setSaveMsg("Saved");
        } catch (e: any) { setSaveMsg(e?.detail || e?.message || "Save failed"); }
        finally { setSaving(false); setTimeout(() => setSaveMsg(null), 2500); }
    };

    const handlePostComment = async () => {
        const trimmed = draft.trim();
        if (!trimmed || posting) return;
        setPosting(true); setCommentErr(null);
        try {
            await api.post(
                `/requirements/${jdId}/profiles/${profile.candidate_uuid}/comments`,
                { comment: trimmed },
            );
            await refreshProfile();
            setDraft("");
        } catch (e: any) { setCommentErr(e?.detail || e?.message || "Could not post comment"); }
        finally { setPosting(false); }
    };

    const handleSaveEdit = async (commentId: string) => {
        const trimmed = editText.trim();
        if (!trimmed || editSaving) return;
        setEditSaving(true);
        try {
            await api.patch(
                `/requirements/${jdId}/profiles/${profile.candidate_uuid}/comments/${commentId}`,
                { comment: trimmed },
            );
            await refreshProfile();
            setEditingId(null);
        } catch (e: any) { setCommentErr(e?.detail || e?.message || "Could not save edit"); }
        finally { setEditSaving(false); }
    };

    const inputStyle: React.CSSProperties = {
        padding: "0.45rem 0.65rem", fontSize: 13,
        border: "1px solid var(--border-subtle)", borderRadius: 4,
        background: "var(--bg-input, var(--bg-secondary))",
        color: "var(--text-primary)", width: "100%", fontFamily: "inherit",
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: "0.5rem" }}>Candidate Details</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 2, display: "block" }}>Current CTC (LPA)</label>
                        <input type="number" value={fields.current_ctc} placeholder="e.g. 12" style={inputStyle}
                            onChange={e => setFields(p => ({ ...p, current_ctc: e.target.value }))} />
                    </div>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 2, display: "block" }}>Expected CTC (LPA)</label>
                        <input type="number" value={fields.expected_ctc} placeholder="e.g. 18" style={inputStyle}
                            onChange={e => setFields(p => ({ ...p, expected_ctc: e.target.value }))} />
                    </div>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 2, display: "block" }}>Notice Period</label>
                        <input type="text" value={fields.notice_period} placeholder="e.g. 30 days" style={inputStyle}
                            onChange={e => setFields(p => ({ ...p, notice_period: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 2, display: "block" }}>Relevant Experience</label>
                        <textarea rows={3} value={fields.relevant_experience} placeholder="Experience directly relevant to this requirement..."
                            style={{ ...inputStyle, resize: "vertical" }}
                            onChange={e => setFields(p => ({ ...p, relevant_experience: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 2, display: "block" }}>
                            Reason for Change <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <textarea rows={2} value={fields.reason_for_change} placeholder="Why is the candidate looking for a change?"
                            style={{ ...inputStyle, resize: "vertical", borderColor: fields.reason_for_change.trim() ? undefined : "#dc2626" }}
                            onChange={e => setFields(p => ({ ...p, reason_for_change: e.target.value }))} />
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.65rem" }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveFields} disabled={saving}>
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                    {saveMsg && <span style={{ fontSize: 12, color: saveMsg === "Saved" ? "#16a34a" : "#dc2626" }}>{saveMsg}</span>}
                </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: "0.5rem" }}>Add Comment</div>
                <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="Add a comment about this candidate..."
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.35rem" }}>
                    {commentErr && <div style={{ fontSize: 12, color: "#dc2626" }}>{commentErr}</div>}
                    <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }}
                        onClick={handlePostComment} disabled={posting || !draft.trim()}>
                        {posting ? "Posting..." : "Post comment"}
                    </button>
                </div>
            </div>

            {comments.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: "0.5rem" }}>Comments ({comments.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                        {[...comments].reverse().map((c: any, i: number) => {
                            const isOwn = user?.id && c.author_id && String(c.author_id) === String(user.id);
                            const isEditing = editingId === String(c.id);
                            return (
                                <div key={i} style={{ fontSize: 13, borderLeft: "3px solid var(--border-subtle)", paddingLeft: "0.6rem" }}>
                                    {isEditing ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                                            <textarea
                                                value={editText}
                                                onChange={e => setEditText(e.target.value)}
                                                rows={2}
                                                autoFocus
                                                style={{ resize: "vertical", padding: "0.4rem", fontSize: 13, border: "1px solid var(--accent)", borderRadius: 4, width: "100%" }}
                                            />
                                            <div style={{ display: "flex", gap: "0.4rem" }}>
                                                <button className="btn btn-primary btn-sm" onClick={() => handleSaveEdit(String(c.id))} disabled={editSaving || !editText.trim()}>
                                                    {editSaving ? "Saving…" : "Save"}
                                                </button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)} disabled={editSaving}>Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ color: "var(--text-primary)" }}>{c.comment}</div>
                                    )}
                                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: "0.15rem", display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                                        <span>- {c.author_name || "unknown"} · {fmtDate(c.date)}</span>
                                        {isOwn && !isEditing && c.id && (
                                            <button
                                                style={{ fontSize: 10, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}
                                                onClick={() => { setEditingId(String(c.id)); setEditText(c.comment); }}
                                            >Edit</button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}


function ReviewPanel({ profile, jdId }: { profile: Profile; jdId: string }) {
    const drawer = useSideDrawer();
    const cand = profile.candidate || {};
    const det = profile.deterministic_scoring_analysis || {};
    const llm = profile.llm_analysis;
    const mostRecent = (cand.Experience || [])[0] || {};
    const currentRole = det.current_role || mostRecent.Position || "-";
    const currentCompany = det.current_company || mostRecent.Company || "-";
    const name = cand.Name || det.candidate_name || "-";
    const totalExp = det.total_experience_years != null ? `${det.total_experience_years} yr` : "-";
    const src = profile.sourced_by?.source;
    const sourceLabel = src === "manual" ? "Manual upload" : src === "email" ? "Email sync" : "Talent pool";

    const [fields, setFields] = useState({
        current_ctc: cand.current_ctc != null ? String(cand.current_ctc) : "",
        expected_ctc: cand.expected_ctc != null ? String(cand.expected_ctc) : "",
        notice_period: cand.notice_period || "",
        relevant_experience: cand.relevant_experience || "",
        reason_for_change: cand.reason_for_change || "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const requiredFilled =
        fields.current_ctc.trim() !== "" &&
        fields.expected_ctc.trim() !== "" &&
        fields.notice_period.trim() !== "" &&
        fields.reason_for_change.trim() !== "";

    const inputStyle: React.CSSProperties = {
        padding: "0.45rem 0.65rem", fontSize: 13,
        border: "1px solid var(--border-subtle)", borderRadius: 4,
        background: "var(--bg-input, var(--bg-secondary))",
        color: "var(--text-primary)", width: "100%", fontFamily: "inherit",
    };
    const requiredInputStyle = (val: string): React.CSSProperties => ({
        ...inputStyle,
        borderColor: val.trim() === "" ? "#dc2626" : undefined,
    });

    const handleSaveAndSubmit = async () => {
        if (!requiredFilled) return;
        setSaving(true);
        setError(null);
        try {
            const body: any = {
                current_ctc: fields.current_ctc.trim() ? parseFloat(fields.current_ctc) : null,
                expected_ctc: fields.expected_ctc.trim() ? parseFloat(fields.expected_ctc) : null,
                notice_period: fields.notice_period.trim() || null,
                relevant_experience: fields.relevant_experience.trim() || null,
                reason_for_change: fields.reason_for_change.trim() || null,
            };
            await api.patch(`/candidates/${profile.candidate_uuid}`, body);
            await api.post(`/requirements/${jdId}/profiles/${profile.candidate_uuid}/submit`, {});
            const next = { ...profile, status: "submitted", candidate: { ...cand, ...body } };
            window.dispatchEvent(new CustomEvent("tw-profile-updated", { detail: { profile: next, jdId } }));
            drawer.close();
        } catch (e: any) {
            setError(e?.detail || e?.message || "Failed to submit");
        } finally {
            setSaving(false);
        }
    };

    const Row = ({ label, value }: { label: string; value: any }) => (
        <div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 13 }}>{value || <span style={{ color: "var(--text-muted)" }}>-</span>}</div>
        </div>
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Read-only candidate summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
                <Row label="Candidate" value={<span style={{ fontWeight: 600 }}>{name}</span>} />
                <Row label="Total Experience" value={totalExp} />
                <Row label="Current Role" value={currentRole} />
                <Row label="Current Company" value={currentCompany} />
                <Row label="AI Score" value={llm?.overall_score != null ? <span className="font-mono">{llm.overall_score}/100</span> : "-"} />
            </div>

            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
                <Row label="Owned by" value={profile.ownership?.ownership_active ? profile.ownership.owner_name : "Not owned yet"} />
                <Row label="Sourced from" value={sourceLabel} />
            </div>

            {/* Required fields before submit */}
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: "0.5rem" }}>
                    Candidate Details <span style={{ color: "#dc2626", fontWeight: 400 }}>- required before submitting</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 2 }}>
                            Current CTC (LPA) <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <input type="number" placeholder="e.g. 12" style={requiredInputStyle(fields.current_ctc)}
                            value={fields.current_ctc} onChange={e => setFields(p => ({ ...p, current_ctc: e.target.value }))} />
                    </div>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 2 }}>
                            Expected CTC (LPA) <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <input type="number" placeholder="e.g. 18" style={requiredInputStyle(fields.expected_ctc)}
                            value={fields.expected_ctc} onChange={e => setFields(p => ({ ...p, expected_ctc: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 2 }}>
                            Notice Period <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <input type="text" placeholder="e.g. 30 days / immediate" style={requiredInputStyle(fields.notice_period)}
                            value={fields.notice_period} onChange={e => setFields(p => ({ ...p, notice_period: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 2 }}>Relevant Experience</label>
                        <textarea rows={3} placeholder="Experience relevant to this requirement…" style={{ ...inputStyle, resize: "vertical" }}
                            value={fields.relevant_experience} onChange={e => setFields(p => ({ ...p, relevant_experience: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 2 }}>
                            Reason for Change <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <textarea rows={2} placeholder="Why is the candidate looking for a change?" style={{ ...inputStyle, resize: "vertical", borderColor: fields.reason_for_change.trim() ? undefined : "#dc2626" }}
                            value={fields.reason_for_change} onChange={e => setFields(p => ({ ...p, reason_for_change: e.target.value }))} />
                    </div>
                </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {!requiredFilled && (
                    <div style={{ fontSize: 12, color: "#dc2626" }}>Fill in all required fields (CTC, Notice Period, Reason for Change) to enable submission.</div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                    <button className="btn btn-ghost" onClick={drawer.close} disabled={saving}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSaveAndSubmit} disabled={saving || !requiredFilled}>
                        {saving ? "Submitting…" : "Save & Submit"}
                    </button>
                </div>
                {error && <div style={{ color: "#dc2626", fontSize: 13, textAlign: "right" }}>{error}</div>}
            </div>
        </div>
    );
}


/**
 * Shown instead of the review/edit form when the profile belongs to someone else.
 * The owner â€” not an admin â€” is the one who can unlock it, so the only action
 * offered here is asking them for approval.
 *
 * This is the sole entry point for POST /profile-access-requests; without it the
 * approvals inbox can never receive anything.
 */
/**
 * Shown above the review form when the owner has approved this requester for this
 * requirement. Ownership does not move: the owner keeps the candidate, and the
 * submission is credited to whoever submits. Saying so here avoids the reasonable
 * assumption that approval handed the profile over.
 */
function ApprovedBanner({ profile }: { profile: Profile }) {
    const own = profile.ownership;
    if (!own?.ownership_active || own.is_owner || own.access_status !== "approved") return null;
    return (
        <div style={{
            display: "flex", alignItems: "flex-start", gap: "0.6rem",
            margin: "0 0 1rem", padding: "0.7rem 0.9rem",
            border: "1px solid var(--twd-green)", borderRadius: "var(--twd-radius)",
            background: "rgba(22,163,74,0.07)",
        }}>
            <Icon name="check" size={15} />
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--twd-ink)" }}>
                {own.standing_approval ? (
                    <>
                        <strong>{own.owner_name}</strong> already approved you for this candidate,
                        so you can use them here without asking again. They will see this
                        requirement listed against the approval.
                    </>
                ) : (
                    <>
                        <strong>{own.owner_name}</strong> approved this profile for this requirement.
                    </>
                )}
                {" "}It stays theirs in the talent pool, and this submission goes out under your name.
            </div>
        </div>
    );
}


function OwnershipGate({ profile, jdId, onRequested }: { profile: Profile; jdId: string; onRequested: () => void }) {
    const own = profile.ownership || {};
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    // Local echo of the request we just sent/withdrew, so the panel flips without
    // waiting for the parent refresh to come back.
    const [localStatus, setLocalStatus] = useState<"pending" | "cancelled" | null>(null);
    const [localRequestId, setLocalRequestId] = useState<string | null>(null);

    const status = localStatus ?? own.access_status ?? null;
    const pending = status === "pending";
    const requestId = localRequestId ?? own.access_request_id ?? null;

    const requestApproval = async () => {
        setBusy(true);
        setError("");
        try {
            const doc = await api.post("/profile-access-requests", {
                requirement_id: jdId,
                candidate_id: profile.candidate_uuid,
            });
            setLocalRequestId(doc?.id ?? null);
            setLocalStatus("pending");
            onRequested();
        } catch (e: any) {
            setError(e?.detail || e?.message || "Could not send the request");
        } finally {
            setBusy(false);
        }
    };

    const cancelRequest = async () => {
        if (!requestId) {
            setError("No request id on this profile - reopen the drawer and try again.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            await api.post(`/profile-access-requests/${requestId}/cancel`, {});
            setLocalStatus("cancelled");
            setLocalRequestId(null);
            onRequested();
        } catch (e: any) {
            // Show status + id: "404 Request not found" and "500 Internal Server
            // Error" are very different problems and read the same otherwise.
            const detail = typeof e?.detail === "string" ? e.detail : e?.message;
            const status = e?.status ? `${e.status} ` : "";
            setError(`${status}${detail || "Could not cancel the request"} (request ${requestId})`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ padding: "2.5rem 1.5rem", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: "0.75rem" }}>🔒</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: "0.5rem", color: "var(--twd-ink)" }}>
                {pending ? "Approval Requested" : "Owned by another recruiter"}
            </div>
            <div style={{ fontSize: 13, color: "var(--twd-soft)", lineHeight: 1.6, maxWidth: 420, margin: "0 auto" }}>
                {pending
                    ? <>Waiting for <strong>{own.owner_name}</strong> to approve. You&apos;ll be able to edit and submit this profile as soon as they accept, and it will go out under your name.</>
                    : <>This profile is owned by <strong>{own.owner_name}</strong>. If you want to submit this profile then get approval from them.</>}
            </div>
            {status === "rejected" && (
                <div style={{ fontSize: 12, color: "var(--twd-amber)", marginTop: "0.6rem" }}>
                    Your last request was declined. You can ask again.
                </div>
            )}
            {status === "cancelled" && (
                <div style={{ fontSize: 12, color: "var(--twd-soft)", marginTop: "0.6rem" }}>
                    Request withdrawn.
                </div>
            )}
            {pending ? (
                <button
                    onClick={cancelRequest}
                    disabled={busy || !requestId}
                    className="twd-btn twd-btn-ghost"
                    style={{ marginTop: "1.25rem", opacity: busy ? 0.7 : 1 }}
                >
                    {busy ? "Cancelling..." : "Cancel Request"}
                </button>
            ) : (
                <button
                    onClick={requestApproval}
                    disabled={busy}
                    className="twd-btn twd-btn-primary"
                    style={{ marginTop: "1.25rem", opacity: busy ? 0.7 : 1 }}
                >
                    {busy ? "Sending..." : "Get Approval"}
                </button>
            )}
            {error && <div style={{ color: "var(--twd-red-text)", fontSize: 12, marginTop: "0.75rem" }}>{error}</div>}
        </div>
    );
}


export default function ProfileDrawer({ jdId, profile, action, initialTab, onUpdated }: ProfileDrawerProps) {
    const drawer = useSideDrawer();
    const navigate = useNavigate();
    const location = useLocation();
    // No admin bypass on ownership - an admin asks the owner like everyone else.
    const { user } = useAuth();
    const [tab, setTab] = useState<ProfileViewTab>(initialTab || "overview");

    useEffect(() => {
        if (initialTab) setTab(initialTab);
    }, [initialTab, profile.candidate_uuid]);

    // Lock the page scroll while the drawer is open (restored on close).
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);

    const refreshProfile = async () => {
        try {
            const fresh = await api.get(`/requirements/${jdId}/profiles/${profile.candidate_uuid}`);
            drawer.patchProfile(fresh);
            drawer.notifyProfileChanged();
            window.dispatchEvent(new CustomEvent("tw-profile-updated", { detail: { profile: fresh, jdId } }));
            onUpdated?.(fresh);
            return fresh;
        } catch {
            drawer.notifyProfileChanged();
            return null;
        }
    };


    const name = profile.candidate?.Name || profile.deterministic_scoring_analysis?.candidate_name || "Profile";
    const aiScore = profile.llm_analysis?.overall_score;
    const comments = profile.recruiter_comments || [];

    const viewTabs = useMemo(() => {
        const arr: Array<{ key: ProfileViewTab; label: string }> = [
            { key: "overview", label: "Overview" },
            { key: "llm", label: "LLM Analysis" },
            { key: "comments", label: comments.length > 0 ? `Comments (${comments.length})` : "Comments" },
            { key: "scorecard", label: "Summary Report" },
            { key: "analysis", label: "Assessment Analysis" },
        ];
        return arr;
    }, [comments.length]);

    const headerLabel = action === "update" ? "Update Profile" : action === "submit" ? "Review" : "";

    return (
        <>
            <div
                onClick={drawer.close}
                style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(22, 13, 11, 0.38)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
            />
            <aside
                className="twd-vars"
                style={{
                    position: "fixed", top: 0, right: 0, bottom: 0,
                    width: "min(45vw, 640px)",
                    background: "var(--twd-paper)",
                    borderLeft: "1px solid var(--twd-line)",
                    boxShadow: "-28px 0 64px -36px var(--twd-shadow-lg)",
                    zIndex: 1000,
                    display: "flex", flexDirection: "column",
                    fontFamily: '"Cambria", system-ui, serif',
                    color: "var(--twd-ink)",
                }}
            >
                <header style={{ padding: "0.85rem 1.1rem", borderBottom: "1px solid var(--twd-line)", background: "var(--twd-surface)", display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {name}
                            {headerLabel && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--twd-soft)", marginLeft: "0.5rem" }}>- {headerLabel}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--twd-soft)", marginTop: 2 }}>
                            {aiScore != null && <>AI <strong>{aiScore}/100</strong> · </>}
                            {(() => {
                                const s = profile.sourced_by?.source;
                                // One owner, from the candidate - the same person the
                                // approval request goes to.
                                const owned = profile.ownership?.ownership_active;
                                const ownerLabel = owned
                                    ? <>Owned by <strong>{profile.ownership.owner_name}</strong></>
                                    : <>Not owned by anyone</>;
                                return s === "manual"
                                    ? <>Manual upload · {ownerLabel}</>
                                    : s === "email"
                                        ? <>Email sync · {ownerLabel}</>
                                        : <>From talent pool · {ownerLabel}</>;
                            })()}
                        </div>
                    </div>
                    <button
                        className="twd-btn twd-btn-ghost twd-btn-sm"
                        onClick={() => {
                            drawer.close();
                            // Prefer the pretty slug URL when we're on a dashboard
                            // client page; fall back to the uuid route elsewhere.
                            // Inherit the page's own origin context (e.g. the user came
                            // via My Requirements) instead of overwriting it, so the
                            // breadcrumb + sidebar highlight stay consistent.
                            const path = window.location.pathname;
                            const inheritedFrom = (location.state as any)?.from as string | undefined;
                            const candSlug = (name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                            const onSlugPage = /^\/dashboard\/[^/]+\/[^/]+$/.test(path) || /^\/my-requirements\/[^/]+$/.test(path);
                            const target = onSlugPage && candSlug
                                ? `${path}/${candSlug}`
                                : `/requirements/${jdId}/profiles/${profile.candidate_uuid}`;
                            navigate(target, { state: { from: inheritedFrom || path } });
                        }}
                        title="Open in full screen"
                    >Full View</button>
                    <button
                        className="twd-btn twd-btn-ghost twd-btn-sm"
                        onClick={() => drawer.openResume(profile.candidate_uuid, name)}
                        title="View resume"
                    >Resume</button>

                    <button
                        className="twd-close"
                        onClick={drawer.close}
                        title="Close"
                        aria-label="Close"
                    ><Icon name="x" size={14} /></button>
                </header>

                {action === "view" && (
                    <nav style={{ padding: "0.6rem 1.1rem", borderBottom: "1px solid var(--twd-line2)", background: "var(--twd-surface)", display: "flex", gap: "0.4rem", overflowX: "auto" }}>
                        {viewTabs.map(t => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                style={{
                                    padding: "5px 13px", borderRadius: 999,
                                    border: `1px solid ${tab === t.key ? "var(--twd-red)" : "var(--twd-line)"}`,
                                    background: tab === t.key ? "var(--twd-red)" : "var(--twd-paper)",
                                    color: tab === t.key ? "#fff" : "var(--twd-soft)",
                                    cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                                    fontFamily: "inherit",
                                    whiteSpace: "nowrap",
                                    transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                                }}
                            >{t.label}</button>
                        ))}
                    </nav>
                )}

                <div style={{ flex: 1, overflow: "auto", padding: "1rem 1.1rem" }}>
                    {action === "view" && (
                        <>
                            {tab === "overview" && <OverviewSection profile={profile} />}
                            {tab === "llm" && (
                                <LlmSection profile={profile} jdId={jdId} onUpdated={(next) => {
                                    drawer.patchProfile(next);
                                    window.dispatchEvent(new CustomEvent("tw-profile-updated", { detail: { profile: next, jdId } }));
                                }} />
                            )}
                            {tab === "comments" && (
                                <CommentsSection profile={profile} jdId={jdId} onUpdated={() => { void refreshProfile(); }} />
                            )}
                            {tab === "scorecard" && (
                                <ScorecardReport requirementId={jdId} candidateId={profile.candidate_uuid} hideWorksheet={true} />
                            )}
                            {tab === "analysis" && (
                                <ScorecardReport requirementId={jdId} candidateId={profile.candidate_uuid} forceView="analysis" />
                            )}
                        </>
                    )}
                    {action === "update" && (
                        profile.ownership?.locked ? (
                            <OwnershipGate profile={profile} jdId={jdId} onRequested={() => { void refreshProfile(); }} />
                        ) : (
                            <UpdateForm profile={profile} jdId={jdId} refreshProfile={refreshProfile} />
                        )
                    )}
                    {action === "submit" && (
                        // One gate: the candidate's owner decides. An approved
                        // requester submits from here under their own name.
                        profile.ownership?.locked ? (
                            <OwnershipGate profile={profile} jdId={jdId} onRequested={() => { void refreshProfile(); }} />
                        ) : (
                            <>
                                <ApprovedBanner profile={profile} />
                                <ReviewPanel profile={profile} jdId={jdId} />
                            </>
                        )
                    )}
                </div>
            </aside>
        </>
    );
}
