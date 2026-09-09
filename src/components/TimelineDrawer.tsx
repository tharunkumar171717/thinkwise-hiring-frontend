import { useState } from "react";
import { api } from "../services/api";
import {
    DateField, DateTimeField, DrawerShell, ErrorBanner, TimelineRow,
    errMessage, fieldCol, fieldControl, fieldLabel, fieldRow,
    formCard, hintText, sectionLabel, whenText,
} from "./drawerKit";

/**
 * Editor for the dynamic (n-round) interview pipeline.
 *
 * The pipeline is an APPEND-ONLY log: every action adds a row rather than editing one,
 * so `L1.Scheduled` → `L1.NoShow` → `L1.Rescheduled` all stay visible. The only
 * mutations are correcting or undoing the newest entry.
 *
 * Actions are contextual - the drawer offers exactly the transitions that are legal
 * from the current state, so advancing is one click. Nothing happens automatically;
 * "Selected" ends the interview pipeline and "Shortlist next" continues it, and which
 * of those occurs is entirely the admin's choice.
 *
 * Offer stages are NOT handled here - they belong to the Selections tab.
 * See DYNAMIC_INTERVIEW_PIPELINE_PLAN.md.
 */

export type PipelineEntry = {
    /** Absent for pre-round states (on hold / rejected before any round exists). */
    round_name?: string | null;
    state: string;
    scheduled_date?: string | null;
    scheduled_time?: string | null;
    comment?: string | null;
    created_at?: string | null;
    created_by?: string | null;
    edited_at?: string | null;
};

type PipelineResponse = {
    ok?: boolean;
    dynamic_timeline?: PipelineEntry[];
    dynamic_status?: string;
};

type ActionKind = "plain" | "round" | "schedule" | "override";

type Action = {
    label: string;
    /** State to append. Ignored for `override`, where the admin picks it. */
    state: string;
    /**
     * plain    = one click
     * round    = ask for a round name
     * schedule = ask for date/time
     * override = ask for BOTH round name and state, unconstrained
     */
    kind: ActionKind;
    /** Where the appended entry lands: same round, the next one, or no round at all. */
    target: "same" | "next" | "none";
    danger?: boolean;
    primary?: boolean;
};

/** Every state an override may jump to. */
const ALL_STATES = ["Shortlisted", "Scheduled", "Rescheduled", "NoShow", "Onhold", "Selected", "Rejected"];

const A = {
    shortlistFirst: { label: "Shortlist", state: "Shortlisted", kind: "round", target: "next", primary: true } as Action,
    shortlistNext: { label: "Shortlist next", state: "Shortlisted", kind: "round", target: "next", primary: true } as Action,
    schedule: { label: "Schedule", state: "Scheduled", kind: "schedule", target: "same", primary: true } as Action,
    reschedule: { label: "Reschedule", state: "Rescheduled", kind: "schedule", target: "same" } as Action,
    selected: { label: "Final Selected", state: "Selected", kind: "plain", target: "same", primary: true } as Action,
    noShow: { label: "No Show", state: "NoShow", kind: "plain", target: "same" } as Action,
    onHoldRound: { label: "On Hold", state: "Onhold", kind: "plain", target: "same" } as Action,
    onHoldBare: { label: "On Hold", state: "Onhold", kind: "plain", target: "none" } as Action,
    rejectRound: { label: "Reject", state: "Rejected", kind: "plain", target: "same", danger: true } as Action,
    rejectBare: { label: "Reject", state: "Rejected", kind: "plain", target: "none", danger: true } as Action,
    override: { label: "Set manually", state: "", kind: "override", target: "next" } as Action,
};

/**
 * The state machine, as the set of transitions offered from each state.
 *
 * `null` means an empty timeline. Everything reaching the Interviews tab was already
 * shortlisted in Submissions, so that reads as "Shortlisted" with no round - hence the
 * pre-round On Hold / Reject, which store no `round_name` and render bare.
 *
 * "Set manually" is appended to every state, including the terminal ones. It bypasses
 * the machine entirely so an admin can record a pipeline that didn't happen here -
 * back-filling older data, or a client/third-party round we never tracked. That is why
 * a fresh candidate can start straight at "L3.Selected" without inventing L1 and L2.
 */
function actionsFor(entry: PipelineEntry | null): Action[] {
    const state = entry?.state ?? null;
    // A pre-round entry has no round to act "within", so its follow-ups stay bare.
    const inRound = Boolean((entry?.round_name || "").trim());

    switch (state) {
        case null: return [A.shortlistFirst, A.onHoldBare, A.rejectBare, A.override];
        case "Shortlisted": return inRound
            ? [A.schedule, A.onHoldRound, A.rejectRound, A.override]
            : [A.shortlistFirst, A.onHoldBare, A.rejectBare, A.override];
        case "Scheduled":
        case "Rescheduled": return [A.shortlistNext, A.reschedule, A.noShow, A.onHoldRound, A.rejectRound, A.selected, A.override];
        case "NoShow": return [A.reschedule, A.onHoldRound, A.rejectRound, A.override];
        case "Onhold": return inRound
            ? [A.schedule, A.shortlistNext, A.rejectRound, A.override]
            : [A.shortlistFirst, A.rejectBare, A.override];
        // Terminal under the normal flow - but an override can still correct or continue
        // them, which matters for back-filled records entered out of order.
        case "Selected":
        case "Rejected":
        default: return [A.override];
    }
}

/** Display label: "L1.Scheduled", or bare "Onhold" for pre-round entries. */
function entryLabel(e: PipelineEntry): string {
    const round = (e.round_name || "").trim();
    return round ? `${round}.${e.state}` : e.state;
}

/** "L3" -> "L4". Non-numeric names fall back to the count of distinct rounds. */
function suggestNextRoundName(timeline: PipelineEntry[]): string {
    const named = timeline.filter(e => (e.round_name || "").trim());
    const last = named[named.length - 1];
    const m = last && /^L(\d+)$/.exec((last.round_name || "").trim());
    if (m) return `L${Number(m[1]) + 1}`;
    const distinct = new Set(named.map(e => e.round_name));
    return `L${distinct.size + 1}`;
}

function scheduleText(e: PipelineEntry): string | null {
    if (!e.scheduled_date && !e.scheduled_time) return null;
    return [e.scheduled_date, e.scheduled_time].filter(Boolean).join(" · ");
}

export default function TimelineDrawer({
    appId, candidateName, timeline, offeredCtc, dateOfJoining, readOnly, onClose, onSaved, onRevertShortlist,
}: {
    appId: string;
    candidateName?: string;
    timeline: PipelineEntry[];
    offeredCtc?: string | null;
    dateOfJoining?: string | null;
    readOnly?: boolean;
    onClose: () => void;
    onSaved: (patch: {
        dynamic_timeline?: PipelineEntry[];
        dynamic_status?: string;
        offered_ctc?: string | null;
        date_of_joining?: string | null;
    }) => void;
    onRevertShortlist?: () => void;
}) {
    const log = timeline || [];
    const last = log.length ? log[log.length - 1] : null;
    const currentState = last?.state ?? null;
    const currentRound = (last?.round_name || "").trim();
    const actions = actionsFor(last);
    // Offer details surface here once the candidate is selected, so a recruiter who
    // already knows the package can record it without switching tabs. Same endpoint the
    // Selections tab uses - no status transition, no timeline entry.
    const isSelected = currentState === "Selected";

    // The action awaiting extra input (a round name, or a date/time).
    const [pending, setPending] = useState<Action | null>(null);
    const [roundName, setRoundName] = useState("");
    const [overrideState, setOverrideState] = useState("Shortlisted");
    // Shortlist can schedule in the same step, collapsing what would otherwise be two
    // entries ({Round}.Shortlisted then {Round}.Scheduled) into one.
    const [scheduleNow, setScheduleNow] = useState(false);
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [comment, setComment] = useState("");
    const [commentErr, setCommentErr] = useState<string | null>(null);
    const [editingLast, setEditingLast] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [ctc, setCtc] = useState(offeredCtc != null ? String(offeredCtc) : "");
    const [doj, setDoj] = useState(dateOfJoining || "");
    const [detailsErr, setDetailsErr] = useState<string | null>(null);
    const [savingDetails, setSavingDetails] = useState(false);
    const detailsDirty =
        ctc !== (offeredCtc != null ? String(offeredCtc) : "") || doj !== (dateOfJoining || "");

    const saveDetails = async () => {
        setSavingDetails(true);
        setDetailsErr(null);
        try {
            const result = await api.patch(`/applications/${appId}/offer/details`, {
                offered_ctc: ctc.trim() || null,
                date_of_joining: doj || null,
            });
            const res = result?.data as { offered_ctc?: string | null; date_of_joining?: string | null };
            onSaved({ offered_ctc: res?.offered_ctc ?? null, date_of_joining: res?.date_of_joining ?? null });
        } catch (e: unknown) {
            setDetailsErr(errMessage(e, "Failed to save"));
        } finally {
            setSavingDetails(false);
        }
    };

    const resetForm = () => {
        setPending(null); setRoundName(""); setOverrideState("Shortlisted");
        setScheduleNow(false);
        setDate(""); setTime(""); setComment(""); setCommentErr(null);
    };

    const send = async (method: "post" | "patch" | "delete", path: string, body?: unknown) => {
        setSaving(true);
        setError(null);
        try {
            const res = (method === "delete"
                ? await api.delete(path)
                : await api[method](path, body)) as PipelineResponse;
            onSaved({ dynamic_timeline: res?.dynamic_timeline, dynamic_status: res?.dynamic_status });
            return true;
        } catch (e: unknown) {
            setError(errMessage(e, "Failed to save"));
            return false;
        } finally {
            setSaving(false);
        }
    };

    const revertToSubmissions = async () => {
        if (!window.confirm("Move candidate back to Submissions? This will remove them from the Interviews tab.")) return;
        setSaving(true);
        setError(null);
        try {
            await api.patch(`/applications/${appId}/shortlist`, { shortlisted: null });
            if (onRevertShortlist) onRevertShortlist();
        } catch (e: unknown) {
            setError(errMessage(e, "Failed to revert"));
        } finally {
            setSaving(false);
        }
    };

    /** Resolve which round an action lands on. "" means a pre-round entry. */
    const targetRound = (a: Action): string => {
        if (a.kind === "override") return roundName.trim();
        if (a.target === "none") return "";
        if (a.target === "next") return roundName.trim() || suggestNextRoundName(log);
        return currentRound;
    };

    /**
     * The state an action will append. Shortlisting with "Scheduled" picked skips the
     * intermediate Shortlisted row entirely - one entry instead of two.
     */
    const targetState = (a: Action): string => {
        if (a.kind === "override") return overrideState;
        if (a.kind === "round" && scheduleNow) return "Scheduled";
        return a.state;
    };

    const commit = async (a: Action) => {
        const c = comment.trim();
        const state = targetState(a);
        if (state === "Rejected" && !c) {
            setCommentErr("A comment is required when rejecting.");
            return;
        }
        const round = targetRound(a);
        if (a.target !== "none" && !round) { setError("Round name is required."); return; }

        const wantsSchedule = a.kind === "schedule"
            || (a.kind === "round" && scheduleNow)
            || (a.kind === "override" && (state === "Scheduled" || state === "Rescheduled"));

        const ok = await send("post", `/applications/${appId}/dynamic-pipeline`, {
            round_name: round || null,
            state,
            ...(wantsSchedule ? { scheduled_date: date || null, scheduled_time: time || null } : {}),
            ...(c ? { comment: c } : {}),
        });
        if (ok) resetForm();
    };

    /** One click for plain actions; the others open a small form first. */
    const onAction = (a: Action) => {
        setError(null);
        setCommentErr(null);
        if (a.kind === "plain" && a.state !== "Rejected") { void commit(a); return; }
        setPending(a);
        if (a.kind === "round") { setRoundName(suggestNextRoundName(log)); setScheduleNow(false); }
        if (a.kind === "override") {
            setRoundName(currentRound || "L1");
            setOverrideState(last?.state ?? "Shortlisted");
        }
        if (a.kind === "schedule") {
            setDate(last?.scheduled_date || "");
            setTime(last?.scheduled_time || "");
        }
    };

    const saveEdit = async () => {
        // Blank is allowed - it clears the entry back to a pre-round state.
        const round = roundName.trim();
        if (overrideState === "Rejected" && !comment.trim()) {
            setCommentErr("A comment is required when rejecting.");
            return;
        }
        const keepsSchedule = overrideState === "Scheduled" || overrideState === "Rescheduled";
        const ok = await send("patch", `/applications/${appId}/dynamic-pipeline/last`, {
            round_name: round || null,
            state: overrideState,
            // Correcting away from a scheduled state clears the stale date/time.
            scheduled_date: keepsSchedule ? (date || null) : null,
            scheduled_time: keepsSchedule ? (time || null) : null,
            comment: comment.trim() || null,
        });
        if (ok) { setEditingLast(false); resetForm(); }
    };

    const undoLast = async () => {
        if (!last) return;
        const ok = await send("delete", `/applications/${appId}/dynamic-pipeline/last`);
        if (ok) resetForm();
    };

    const btn = (a: Action, i: number) => (
        <button
            key={`${a.label}-${i}`}
            className={a.primary ? "twd-btn twd-btn-primary" : "twd-btn twd-btn-ghost"}
            style={{ fontSize: 12, ...(a.danger ? { color: "#dc2626", borderColor: "#fca5a5" } : {}) }}
            disabled={saving}
            onClick={() => onAction(a)}
        >
            {a.label}
        </button>
    );

    return (
        <DrawerShell
            title="Interview" titleAccent="pipeline"
            subtitle={candidateName} ariaLabel="Interview pipeline" onClose={onClose}
        >
            <ErrorBanner message={error} />

            {/* ── Timeline ─────────────────────────────────────────── */}
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Timeline</div>

            <div style={{ borderLeft: "2px solid var(--twd-line2)", paddingLeft: 14, marginBottom: 18 }}>
                <TimelineRow label="Shortlisted" sub="Shortlisted from Submissions" muted />
                {log.map((e, i) => (
                    <TimelineRow
                        key={`${e.round_name ?? ""}-${e.state}-${e.created_at ?? i}`}
                        label={entryLabel(e)}
                        pill
                        sub={[scheduleText(e), e.comment, e.created_by].filter(Boolean).join(" - ") || undefined}
                        when={whenText(e.created_at)}
                        edited={Boolean(e.edited_at)}
                    />
                ))}
            </div>

            {/* ── Correct the newest entry / Revert ────────────────── */}
            {!readOnly && !pending && (
                editingLast && last ? (
                    <div style={{ ...formCard, marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--twd-soft)", marginBottom: 8 }}>
                            Correct <strong>{entryLabel(last)}</strong>
                        </div>

                        <div style={fieldRow}>
                            <div style={{ ...fieldCol, flex: "1 1 130px" }}>
                                <div style={fieldLabel}>Round</div>
                                <input
                                    autoFocus className="twd-input" style={fieldControl}
                                    value={roundName} onChange={e => setRoundName(e.target.value)}
                                />
                            </div>
                            <div style={{ ...fieldCol, flex: "1 1 130px" }}>
                                <div style={fieldLabel}>State</div>
                                <select value={overrideState} onChange={e => setOverrideState(e.target.value)} className="twd-select" style={fieldControl}>
                                    {ALL_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>

                        {(overrideState === "Scheduled" || overrideState === "Rescheduled") && (
                            <DateTimeField date={date} time={time} onChange={(d, t) => { setDate(d); setTime(t); }} />
                        )}

                        <textarea
                            value={comment}
                            onChange={e => { setComment(e.target.value); if (commentErr) setCommentErr(null); }}
                            rows={2}
                            placeholder={overrideState === "Rejected" ? "Reason (required)…" : "Comment…"}
                            className="twd-input"
                            style={{ width: "100%", boxSizing: "border-box", marginBottom: commentErr ? 3 : 8, resize: "vertical", fontFamily: "inherit", ...(commentErr ? { borderColor: "#fca5a5" } : {}) }}
                        />
                        {commentErr && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 8 }}>{commentErr}</div>}

                        <div style={hintText}>
                            Changes this entry to <strong>{entryLabel({ round_name: roundName.trim(), state: overrideState })}</strong>. No new row is added.
                            {!roundName.trim() && " Leave the round blank for a pre-round state."}
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                            <button className="twd-btn twd-btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => void saveEdit()} disabled={saving}>
                                {saving ? "Saving…" : "Save"}
                            </button>
                            <button className="twd-btn twd-btn-ghost" onClick={() => { setEditingLast(false); resetForm(); }} disabled={saving}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                        {last && (
                            <>
                                <button
                                    className="twd-btn twd-btn-ghost" style={{ fontSize: 11 }} disabled={saving}
                                    onClick={() => {
                                        setEditingLast(true);
                                        setError(null);
                                        setCommentErr(null);
                                        setRoundName(last.round_name || "");
                                        setOverrideState(last.state || "Shortlisted");
                                        setDate(last.scheduled_date || "");
                                        setTime(last.scheduled_time || "");
                                        setComment(last.comment || "");
                                    }}
                                >
                                    Correct last entry
                                </button>
                                <button className="twd-btn twd-btn-ghost" style={{ fontSize: 11, color: "#dc2626", borderColor: "#fca5a5" }} onClick={() => void undoLast()} disabled={saving}>
                                    Undo last entry
                                </button>
                            </>
                        )}
                        {onRevertShortlist && (
                            <button className="twd-btn twd-btn-ghost" style={{ fontSize: 11, color: "#d97706", borderColor: "#fcd34d" }} onClick={() => void revertToSubmissions()} disabled={saving}>
                                Move back to Submissions
                            </button>
                        )}
                    </div>
                )
            )}

            {/* ── Next actions ─────────────────────────────────────── */}
            {!readOnly && !editingLast && (
                <>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--twd-soft)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                        Next action
                    </div>

                    {(currentState === "Selected" || currentState === "Rejected") && !pending && (
                        <div style={{ fontSize: 11, color: "var(--twd-faint)", marginBottom: 8, lineHeight: 1.45 }}>
                            {currentState === "Selected"
                                ? "Interview pipeline complete - offer details are handled in the Selections tab."
                                : "This candidate's pipeline is closed."}
                            {" "}Use <strong>Set manually</strong> to record anything further.
                        </div>
                    )}

                    {pending ? (
                        <div style={formCard}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--twd-soft)", marginBottom: 8 }}>{pending.label}</div>

                            {pending.kind === "round" && (
                                <>
                                    <div style={fieldRow}>
                                        <div style={{ ...fieldCol, flex: "1 1 130px" }}>
                                            <div style={fieldLabel}>Round name</div>
                                            <input
                                                autoFocus className="twd-input" style={fieldControl}
                                                value={roundName} onChange={e => setRoundName(e.target.value)}
                                                onKeyDown={e => { if (e.key === "Enter") void commit(pending); }}
                                            />
                                        </div>
                                        <div style={{ ...fieldCol, flex: "1 1 175px" }}>
                                            <div style={fieldLabel}>Interview</div>
                                            <select
                                                value={scheduleNow ? "scheduled" : "pending"}
                                                onChange={e => setScheduleNow(e.target.value === "scheduled")}
                                                className="twd-select" style={fieldControl}
                                            >
                                                <option value="pending">Yet to be Scheduled</option>
                                                <option value="scheduled">Scheduled</option>
                                            </select>
                                        </div>
                                    </div>
                                    {scheduleNow && (
                                        <DateTimeField date={date} time={time} onChange={(d, t) => { setDate(d); setTime(t); }} />
                                    )}
                                </>
                            )}

                            {pending.kind === "override" && (
                                <>
                                    <div style={{ fontSize: 10, color: "var(--twd-faint)", marginBottom: 6, lineHeight: 1.45 }}>
                                        Records any state directly, skipping the normal flow - for back-filling
                                        older candidates or rounds run outside this system.
                                    </div>
                                    <div style={fieldRow}>
                                        <div style={{ ...fieldCol, flex: "1 1 130px" }}>
                                            <div style={fieldLabel}>Round</div>
                                            <input
                                                autoFocus className="twd-input" style={fieldControl}
                                                placeholder="L3" value={roundName} onChange={e => setRoundName(e.target.value)}
                                                onKeyDown={e => { if (e.key === "Enter") void commit(pending); }}
                                            />
                                        </div>
                                        <div style={{ ...fieldCol, flex: "1 1 130px" }}>
                                            <div style={fieldLabel}>State</div>
                                            <select value={overrideState} onChange={e => setOverrideState(e.target.value)} className="twd-select" style={fieldControl}>
                                                {ALL_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    {(overrideState === "Scheduled" || overrideState === "Rescheduled") && (
                                        <DateTimeField date={date} time={time} onChange={(d, t) => { setDate(d); setTime(t); }} />
                                    )}
                                </>
                            )}

                            {pending.kind === "schedule" && (
                                <DateTimeField date={date} time={time} onChange={(d, t) => { setDate(d); setTime(t); }} />
                            )}

                            <textarea
                                value={comment}
                                onChange={e => { setComment(e.target.value); if (commentErr) setCommentErr(null); }}
                                rows={2}
                                placeholder={targetState(pending) === "Rejected" ? "Reason (required)…" : "Comment (optional)…"}
                                className="twd-input"
                                style={{ width: "100%", boxSizing: "border-box", marginBottom: commentErr ? 3 : 8, resize: "vertical", fontFamily: "inherit", ...(commentErr ? { borderColor: "#fca5a5" } : {}) }}
                            />
                            {commentErr && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 8 }}>{commentErr}</div>}

                            <div style={hintText}>
                                {pending.target !== "none" && !targetRound(pending)
                                    ? "Enter a round name."
                                    : <>
                                        Adds <strong>{entryLabel({ round_name: targetRound(pending), state: targetState(pending) })}</strong> to the timeline.
                                        {pending.kind === "round" && scheduleNow && " Shortlisted is skipped."}
                                    </>}
                            </div>

                            <div style={{ display: "flex", gap: 8 }}>
                                <button className="twd-btn twd-btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => void commit(pending)} disabled={saving}>
                                    {saving ? "Saving…" : "Confirm"}
                                </button>
                                <button className="twd-btn twd-btn-ghost" onClick={resetForm} disabled={saving}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {actions.map(btn)}
                        </div>
                    )}
                </>
            )}

            {/* ── Offer details ────────────────────────────────────
                        Only once selected - capturing a package before the candidate
                        has cleared the pipeline would be recording a decision that
                        hasn't happened. Writes to the same endpoint the Selections tab
                        uses, so the value is already there when they reach that tab. */}
            {isSelected && (
                <div style={{ marginTop: 18, borderTop: "1px solid var(--twd-line2)", paddingTop: 14 }}>
                    <div style={sectionLabel}>Offer details</div>
                    <div style={{ ...hintText, lineHeight: 1.45 }}>
                        Optional - record these now if known. The offer itself is managed
                        in the Selections tab.
                    </div>

                    {readOnly ? (
                        <div style={{ fontSize: 12, color: "var(--twd-soft)" }}>
                            {[offeredCtc != null ? String(offeredCtc) : null,
                            dateOfJoining ? `Joining ${dateOfJoining}` : null]
                                .filter(Boolean).join(" · ") || "Not recorded."}
                        </div>
                    ) : (
                        <>
                            <div style={fieldRow}>
                                <div style={{ ...fieldCol, flex: "1 1 130px" }}>
                                    <div style={fieldLabel}>Offered CTC</div>
                                    <input
                                        className="twd-input" style={fieldControl}
                                        placeholder="e.g. 25 LPA" value={ctc}
                                        onChange={e => { setCtc(e.target.value); if (detailsErr) setDetailsErr(null); }}
                                    />
                                </div>
                                <div style={{ ...fieldCol, flex: "1 1 130px" }}>
                                    <div style={fieldLabel}>Joining date</div>
                                    <DateField value={doj} onChange={setDoj} placeholder="Joining date" />
                                </div>
                            </div>

                            {detailsErr && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 8 }}>{detailsErr}</div>}

                            {detailsDirty && (
                                <button
                                    className="twd-btn twd-btn-primary"
                                    style={{ width: "100%", justifyContent: "center" }}
                                    onClick={() => void saveDetails()}
                                    disabled={savingDetails}
                                >
                                    {savingDetails ? "Saving…" : "Save Details"}
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
        </DrawerShell>
    );
}
