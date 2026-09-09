import { useState } from "react";
import { api } from "../services/api";
import {
    DateField, DrawerShell, ErrorBanner, TimelineRow,
    errMessage, fieldCol, fieldControl, fieldLabel, fieldRow,
    formCard, hintText, sectionLabel, whenText,
} from "./drawerKit";

/**
 * Editor for the offer stage (Selections tab).
 *
 * Same contract as `TimelineDrawer`: an APPEND-ONLY log where every action adds a row,
 * with contextual one-click actions and correct/undo limited to the newest entry.
 *
 * Statuses are bare strings - everything here is offer-related, so a prefix would carry
 * no information. Stored in `offer_status` / `offer_timeline`, deliberately separate from
 * legacy `status`: that field is gated by a transition whitelist and counted by four
 * analytics aggregations. See DYNAMIC_SELECTIONS_PLAN.md.
 */

export type OfferEntry = {
    status: string;
    reason?: string | null;
    offered_ctc?: string | null;
    date_of_joining?: string | null;
    comment?: string | null;
    created_at?: string | null;
    created_by?: string | null;
    edited_at?: string | null;
};

type OfferResponse = {
    ok?: boolean;
    offer_timeline?: OfferEntry[];
    offer_status?: string | null;
};

/** Mirrors OFFER_STATES in the backend. */
const ALL_OFFER_STATES = [
    "Selected", "Offer Released", "Offer Accepted", "Joined",
    "Offer Declined", "Backed Out", "Offer On Hold", "Offer Withdrawn",
];

/** Mirrors OFFER_LOSS_STATES - these require a reason and a comment. */
const LOSS_STATES = new Set(["Offer Declined", "Backed Out", "Offer Withdrawn"]);

/** Mirrors OFFER_REASONS. */
const OFFER_REASONS = [
    "Other Offer", "Counter Offer", "Compensation", "Location / Relocation",
    "Personal", "Role Mismatch", "Client Withdrew", "Other",
];

type ActionKind = "plain" | "loss" | "override";

type Action = {
    label: string;
    /** Status to append. Ignored for `override`, where the admin picks it. */
    status: string;
    /**
     * plain    = one click
     * loss     = ask for reason + comment
     * override = ask for the status too, unconstrained
     *
     * No kind collects CTC or joining date: those live in their own section, editable at
     * any status, because they get revised independently of the offer's state.
     */
    kind: ActionKind;
    danger?: boolean;
    primary?: boolean;
};

const A = {
    release: { label: "Release Offer", status: "Offer Released", kind: "plain", primary: true } as Action,
    accept: { label: "Offer Accepted", status: "Offer Accepted", kind: "plain", primary: true } as Action,
    joined: { label: "Joined", status: "Joined", kind: "plain", primary: true } as Action,
    onHold: { label: "Offer On Hold", status: "Offer On Hold", kind: "plain" } as Action,
    declined: { label: "Offer Declined", status: "Offer Declined", kind: "loss", danger: true } as Action,
    backedOut: { label: "Backed Out", status: "Backed Out", kind: "loss", danger: true } as Action,
    withdrawn: { label: "Offer Withdrawn", status: "Offer Withdrawn", kind: "loss", danger: true } as Action,
    override: { label: "Set manually", status: "", kind: "override" } as Action,
};

/**
 * The state machine, as the set of transitions offered from each status.
 * `null` means an empty log - the candidate is at the implicit "Selected" state.
 *
 * "Set manually" is available everywhere, including terminal states, for back-filling
 * candidates whose offer was handled before this existed or outside the system.
 */
function actionsFor(status: string | null): Action[] {
    switch (status) {
        case null:
        case "Selected": return [A.release, A.onHold, A.withdrawn, A.override];
        case "Offer Released": return [A.accept, A.declined, A.onHold, A.withdrawn, A.override];
        case "Offer Accepted": return [A.joined, A.backedOut, A.withdrawn, A.override];
        case "Offer On Hold": return [A.release, A.withdrawn, A.override];
        case "Joined":
        case "Offer Declined":
        case "Backed Out":
        case "Offer Withdrawn":
        default: return [A.override];
    }
}

function fmtCtc(v?: string | null): string | null {
    if (v == null) return null;
    return String(v);
}

function entrySub(e: OfferEntry): string | undefined {
    return [
        fmtCtc(e.offered_ctc),
        e.date_of_joining ? `DOJ ${e.date_of_joining}` : null,
        e.reason,
        e.comment,
        e.created_by,
    ].filter(Boolean).join(" - ") || undefined;
}

export default function OfferDrawer({
    appId, candidateName, timeline, offeredCtc, dateOfJoining, readOnly, onClose, onSaved,
}: {
    appId: string;
    candidateName?: string;
    timeline: OfferEntry[];
    offeredCtc?: string | null;
    dateOfJoining?: string | null;
    readOnly?: boolean;
    onClose: () => void;
    onSaved: (patch: {
        offer_timeline?: OfferEntry[];
        offer_status?: string | null;
        offered_ctc?: string | null;
        date_of_joining?: string | null;
    }) => void;
}) {
    const log = timeline || [];
    const last = log.length ? log[log.length - 1] : null;
    const currentStatus = last?.status ?? null;
    const actions = actionsFor(currentStatus);

    const [pending, setPending] = useState<Action | null>(null);
    const [overrideStatus, setOverrideStatus] = useState("Offer Released");
    const [reason, setReason] = useState("");
    const [comment, setComment] = useState("");
    const [formErr, setFormErr] = useState<string | null>(null);
    const [editingLast, setEditingLast] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Offer details - their own state, saved by their own button, never coupled to a
    // status transition.
    const [ctc, setCtc] = useState(offeredCtc != null ? String(offeredCtc) : "");
    const [doj, setDoj] = useState(dateOfJoining || "");
    const [detailsErr, setDetailsErr] = useState<string | null>(null);
    const [savingDetails, setSavingDetails] = useState(false);
    const detailsDirty =
        ctc !== (offeredCtc != null ? String(offeredCtc) : "") || doj !== (dateOfJoining || "");

    const resetForm = () => {
        setPending(null); setOverrideStatus("Offer Released"); setReason("");
        setComment(""); setFormErr(null);
    };

    const send = async (method: "post" | "patch" | "delete", path: string, body?: unknown) => {
        setSaving(true);
        setError(null);
        try {
            const res = (method === "delete"
                ? await api.delete(path)
                : await api[method](path, body)) as OfferResponse;
            onSaved({ offer_timeline: res?.offer_timeline, offer_status: res?.offer_status });
            return true;
        } catch (e: unknown) {
            setError(errMessage(e, "Failed to save"));
            return false;
        } finally {
            setSaving(false);
        }
    };

    const targetStatus = (a: Action): string => (a.kind === "override" ? overrideStatus : a.status);

    /** Shared guard so append and correct can't diverge from the server's rules. */
    const validate = (status: string): string | null => {
        if (LOSS_STATES.has(status)) {
            if (!reason) return "A reason is required.";
            if (!comment.trim()) return "A comment is required.";
        }
        return null;
    };

    const commit = async (a: Action) => {
        const status = targetStatus(a);
        const err = validate(status);
        if (err) { setFormErr(err); return; }
        const ok = await send("post", `/applications/${appId}/offer`, {
            status,
            ...(LOSS_STATES.has(status) ? { reason } : {}),
            ...(comment.trim() ? { comment: comment.trim() } : {}),
        });
        if (ok) resetForm();
    };

    const onAction = (a: Action) => {
        setError(null);
        setFormErr(null);
        if (a.kind === "plain") { void commit(a); return; }
        setPending(a);
        if (a.kind === "override") {
            setOverrideStatus(last?.status ?? "Offer Released");
            setReason(last?.reason || "");
        }
    };

    const saveEdit = async () => {
        const err = validate(overrideStatus);
        if (err) { setFormErr(err); return; }
        const ok = await send("patch", `/applications/${appId}/offer/last`, {
            status: overrideStatus,
            reason: LOSS_STATES.has(overrideStatus) ? reason : null,
            comment: comment.trim() || null,
        });
        if (ok) { setEditingLast(false); resetForm(); }
    };

    const undoLast = async () => {
        if (!last) return;
        const ok = await send("delete", `/applications/${appId}/offer/last`);
        if (ok) resetForm();
    };

    /** Offer details save independently - no status transition, no timeline entry. */
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

    return (
        <DrawerShell
            title="Offer" titleAccent="stage"
            subtitle={candidateName} ariaLabel="Offer stage" onClose={onClose}
        >
            <ErrorBanner message={error} />

            {/* ── Timeline ─────────────────────────────────────────────── */}
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Timeline</div>

            <div style={{ borderLeft: "2px solid var(--twd-line2)", paddingLeft: 14, marginBottom: 18 }}>
                <TimelineRow label="Selected" sub="Cleared the interview pipeline" muted />
                {log.map((e, i) => (
                    <TimelineRow
                        key={`${e.status}-${e.created_at ?? i}`}
                        label={e.status}
                        pill
                        sub={entrySub(e)}
                        when={whenText(e.created_at)}
                        edited={Boolean(e.edited_at)}
                    />
                ))}
            </div>

            {/* ── Correct / undo the newest entry ──────────────────────── */}
            {!readOnly && last && !pending && (
                editingLast ? (
                    <div style={{ ...formCard, marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--twd-soft)", marginBottom: 8 }}>
                            Correct <strong>{last.status}</strong>
                        </div>

                        <div style={fieldRow}>
                            <div style={{ ...fieldCol, flex: "1 1 150px" }}>
                                <div style={fieldLabel}>Status</div>
                                <select value={overrideStatus} onChange={e => setOverrideStatus(e.target.value)} className="twd-select" style={fieldControl}>
                                    {ALL_OFFER_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            {LOSS_STATES.has(overrideStatus) && (
                                <div style={{ ...fieldCol, flex: "1 1 150px" }}>
                                    <div style={fieldLabel}>Reason</div>
                                    <select value={reason} onChange={e => setReason(e.target.value)} className="twd-select" style={fieldControl}>
                                        <option value="">Select…</option>
                                        {OFFER_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>

                        <textarea
                            value={comment}
                            onChange={e => { setComment(e.target.value); if (formErr) setFormErr(null); }}
                            rows={2}
                            placeholder={LOSS_STATES.has(overrideStatus) ? "Reason detail (required)…" : "Comment…"}
                            className="twd-input"
                            style={{ ...fieldControl, marginBottom: formErr ? 3 : 8, resize: "vertical", fontFamily: "inherit", ...(formErr ? { borderColor: "#fca5a5" } : {}) }}
                        />
                        {formErr && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 8 }}>{formErr}</div>}

                        <div style={hintText}>
                            Changes this entry to <strong>{overrideStatus}</strong>. No new row is added.
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
                        <button
                            className="twd-btn twd-btn-ghost" style={{ fontSize: 11 }} disabled={saving}
                            onClick={() => {
                                setEditingLast(true);
                                setError(null); setFormErr(null);
                                setOverrideStatus(last.status);
                                setReason(last.reason || "");
                                setComment(last.comment || "");
                            }}
                        >
                            Correct last entry
                        </button>
                        <button className="twd-btn twd-btn-ghost" style={{ fontSize: 11, color: "#dc2626", borderColor: "#fca5a5" }} onClick={() => void undoLast()} disabled={saving}>
                            Undo last entry
                        </button>
                    </div>
                )
            )}

            {/* ── Next actions ─────────────────────────────────────────── */}
            {!readOnly && !editingLast && (
                <>
                    <div style={sectionLabel}>Next action</div>

                    {currentStatus && actions.length === 1 && !pending && (
                        <div style={{ fontSize: 11, color: "var(--twd-faint)", marginBottom: 8, lineHeight: 1.45 }}>
                            This offer is closed. Use <strong>Set manually</strong> to record anything further.
                        </div>
                    )}

                    {pending ? (
                        <div style={formCard}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--twd-soft)", marginBottom: 8 }}>{pending.label}</div>

                            {pending.kind === "override" && (
                                <>
                                    <div style={{ ...hintText, lineHeight: 1.45 }}>
                                        Records any status directly, skipping the normal flow - for back-filling
                                        older candidates or offers handled outside this system.
                                    </div>
                                    <div style={fieldRow}>
                                        <div style={{ ...fieldCol, flex: "1 1 150px" }}>
                                            <div style={fieldLabel}>Status</div>
                                            <select autoFocus value={overrideStatus} onChange={e => setOverrideStatus(e.target.value)} className="twd-select" style={fieldControl}>
                                                {ALL_OFFER_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </>
                            )}

                            {LOSS_STATES.has(targetStatus(pending)) && (
                                <div style={fieldRow}>
                                    <div style={{ ...fieldCol, flex: "1 1 100%" }}>
                                        <div style={fieldLabel}>Reason</div>
                                        <select
                                            autoFocus={pending.kind === "loss"}
                                            value={reason}
                                            onChange={e => { setReason(e.target.value); if (formErr) setFormErr(null); }}
                                            className="twd-select" style={fieldControl}
                                        >
                                            <option value="">Select a reason…</option>
                                            {OFFER_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}

                            <textarea
                                value={comment}
                                onChange={e => { setComment(e.target.value); if (formErr) setFormErr(null); }}
                                rows={2}
                                placeholder={LOSS_STATES.has(targetStatus(pending)) ? "Reason detail (required)…" : "Comment (optional)…"}
                                className="twd-input"
                                style={{ ...fieldControl, marginBottom: formErr ? 3 : 8, resize: "vertical", fontFamily: "inherit", ...(formErr ? { borderColor: "#fca5a5" } : {}) }}
                            />
                            {formErr && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 8 }}>{formErr}</div>}

                            <div style={hintText}>
                                Adds <strong>{targetStatus(pending)}</strong> to the timeline.
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
                            {actions.map((a, i) => (
                                <button
                                    key={`${a.label}-${i}`}
                                    className={a.primary ? "twd-btn twd-btn-primary" : "twd-btn twd-btn-ghost"}
                                    style={{ fontSize: 12, ...(a.danger ? { color: "#dc2626", borderColor: "#fca5a5" } : {}) }}
                                    disabled={saving}
                                    onClick={() => onAction(a)}
                                >
                                    {a.label}
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ── Offer details ────────────────────────────────────────────
                Deliberately outside the status flow: CTC and joining date get
                revised without the status changing, and are often known before an
                offer is formally released. Editable at any status. */}
            <div style={{ marginTop: 18, borderTop: "1px solid var(--twd-line2)", paddingTop: 14 }}>
                <div style={sectionLabel}>Offer details</div>

                {readOnly ? (
                    <div style={{ fontSize: 12, color: "var(--twd-soft)" }}>
                        {[fmtCtc(offeredCtc), dateOfJoining ? `Joining ${dateOfJoining}` : null]
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
        </DrawerShell>
    );
}
