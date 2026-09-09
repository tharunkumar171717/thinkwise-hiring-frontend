import React, { useState } from "react";
import { api } from "../services/api";
import { DateTimeField, fieldCol, fieldControl, fieldLabel, fieldRow } from "./drawerKit";

interface ShortlistScheduleModalProps {
    app: {
        application_id?: string;
        id?: string;
        candidate_name?: string | null;
        requirement_name?: string | null;
    };
    onClose: () => void;
    onSuccess: (appId: string, shortlisted: boolean, dynamicStatus: string | null) => void;
}

export function ShortlistScheduleModal({ app, onClose, onSuccess }: ShortlistScheduleModalProps) {
    const appId = app.application_id || app.id;
    const [action, setAction] = useState<"shortlist" | "interview" | "reject">("shortlist");
    const [roundName, setRoundName] = useState("L1");
    const [scheduleStatus, setScheduleStatus] = useState<"pending" | "scheduled">("pending");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [comment, setComment] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!appId) {
            setError("Missing application ID");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            if (action === "reject") {
                if (!comment.trim()) {
                    setError("A reason is required to reject a candidate.");
                    setSaving(false);
                    return;
                }
                await api.patch(`/applications/${appId}/shortlist`, { shortlisted: false });
                await api.post(`/applications/${appId}/dynamic-pipeline`, {
                    round_name: null,
                    state: "Rejected",
                    comment: comment.trim()
                });
                onSuccess(appId, false, "Rejected");
            } else {
                await api.patch(`/applications/${appId}/shortlist`, { shortlisted: true });
                
                if (action === "interview") {
                    const state = scheduleStatus === "scheduled" ? "Scheduled" : "Shortlisted";
                    await api.post(`/applications/${appId}/dynamic-pipeline`, {
                        round_name: roundName.trim() || null,
                        state,
                        ...(scheduleStatus === "scheduled" ? { scheduled_date: date || null, scheduled_time: time || null } : {})
                    });
                    const dStatus = `${roundName.trim() ? roundName.trim() + "." : ""}${state}`;
                    onSuccess(appId, true, dStatus);
                } else {
                    onSuccess(appId, true, "Shortlisted");
                }
            }
        } catch (e: any) {
            setError(e?.detail || "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="twd-vars twd-overlay" role="dialog" aria-modal="true" aria-label="Update Candidate Status" onClick={onClose} style={{ zIndex: 10000, backdropFilter: "none", WebkitBackdropFilter: "none" }}>
            <div className="twd-modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
                <div className="twd-modal-head" style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
                    <h2 className="twd-modal-title" style={{ margin: 0 }}>Update Status</h2>
                    <div style={{ fontSize: 13, color: "var(--twd-soft)" }}>
                        {app.candidate_name} — {app.requirement_name}
                    </div>
                </div>
                <div className="twd-modal-body">
                    {error && <div style={{ background: "#fee2e2", color: "#dc2626", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                            <input type="radio" name="action" value="shortlist" checked={action === "shortlist"} onChange={() => setAction("shortlist")} />
                            <span style={{ fontSize: 14, fontWeight: action === "shortlist" ? 600 : 400 }}>Shortlist Only</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                            <input type="radio" name="action" value="interview" checked={action === "interview"} onChange={() => setAction("interview")} />
                            <span style={{ fontSize: 14, fontWeight: action === "interview" ? 600 : 400 }}>Move to Interviews</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                            <input type="radio" name="action" value="reject" checked={action === "reject"} onChange={() => setAction("reject")} />
                            <span style={{ fontSize: 14, fontWeight: action === "reject" ? 600 : 400 }}>Reject</span>
                        </label>
                    </div>

                    {action === "interview" && (
                        <div style={{ background: "var(--twd-surface2)", padding: "12px", borderRadius: "8px", border: "1px solid var(--twd-line2)" }}>
                            <div style={fieldRow}>
                                <div style={{ ...fieldCol, flex: "1 1 130px" }}>
                                    <div style={fieldLabel}>Round Name</div>
                                    <input
                                        autoFocus className="twd-input" style={fieldControl}
                                        value={roundName} onChange={e => setRoundName(e.target.value)}
                                        placeholder="e.g. L1"
                                    />
                                </div>
                                <div style={{ ...fieldCol, flex: "1 1 175px" }}>
                                    <div style={fieldLabel}>Interview Status</div>
                                    <select
                                        value={scheduleStatus}
                                        onChange={e => setScheduleStatus(e.target.value as "pending" | "scheduled")}
                                        className="twd-select" style={fieldControl}
                                    >
                                        <option value="pending">Yet to schedule</option>
                                        <option value="scheduled">Scheduled</option>
                                    </select>
                                </div>
                            </div>
                            {scheduleStatus === "scheduled" && (
                                <div style={{ marginTop: 12 }}>
                                    <DateTimeField date={date} time={time} onChange={(d, t) => { setDate(d); setTime(t); }} />
                                </div>
                            )}
                        </div>
                    )}

                    {action === "reject" && (
                        <div style={{ background: "var(--twd-surface2)", padding: "12px", borderRadius: "8px", border: "1px solid var(--twd-line2)" }}>
                            <div style={fieldLabel}>Rejection Reason (Required)</div>
                            <textarea
                                autoFocus className="twd-input" style={{ ...fieldControl, minHeight: "80px", resize: "vertical" }}
                                value={comment} onChange={e => setComment(e.target.value)}
                                placeholder="Why is this candidate being rejected?"
                            />
                        </div>
                    )}
                </div>
                <div className="twd-modal-foot" style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "16px" }}>
                    <button className="twd-btn twd-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="twd-btn twd-btn-primary" onClick={submit} disabled={saving}>
                        {saving ? "Saving..." : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}
