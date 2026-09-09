import { useEffect, useState } from "react";
import { requirementActivityApi } from "../services/api";
import { fmtTs } from "../utils/dateUtils";
import Icon, { type IconName } from "./Icon";

type ActivityEvent = {
    at: string;
    kind: string;
    actor?: string | null;
    title: string;
    detail?: string | null;
};

// One icon + accent colour per event kind emitted by
// requirement_activity_service.get_timeline. Unknown kinds fall back to a
// neutral document/slate pairing rather than rendering blank.
const HISTORY_ICON: Record<string, IconName> = {
    created: "document", assigned: "users", unassigned: "users", rollover: "send",
    status_changed: "refresh", submission: "send", app_status: "check",
};

const HISTORY_COLOR: Record<string, string> = {
    created: "#4f46e5", assigned: "#16a34a", unassigned: "#d97706", rollover: "#9333ea",
    status_changed: "#2563eb", submission: "#0891b2", app_status: "#64748b",
};

const FALLBACK_COLOR = "#64748b";

/** Audit trail for a requirement: creation, assignment/rollover, status changes,
 *  submissions and application-status moves, newest first. */
export default function RequirementHistory({ requirementId }: { requirementId: string }) {
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        requirementActivityApi.getActivity(requirementId)
            .then((res: any) => { if (alive) setEvents(res?.events || []); })
            .catch((e: any) => { if (alive) setError(e?.detail || e?.message || "Failed to load history"); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [requirementId]);

    if (loading) {
        return (
            <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--twd-soft)", fontSize: 13 }}>
                Loading history…
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                margin: "1rem 0", padding: "10px 14px", borderRadius: 10,
                background: "var(--twd-red-bg)",
                border: "1px solid color-mix(in srgb, var(--twd-red) 35%, transparent)",
                color: "var(--twd-red-text)", fontSize: 13,
            }}>
                {error}
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <div className="twd-empty">
                <Icon name="document" size={40} />
                <div style={{ fontSize: 14 }}>No history recorded yet.</div>
            </div>
        );
    }

    // The API returns oldest-first; the timeline reads newest-first.
    const ordered = [...events].reverse();

    return (
        <div style={{ position: "relative", paddingLeft: 8, paddingTop: 4 }}>
            {ordered.map((ev, i) => {
                const color = HISTORY_COLOR[ev.kind] || FALLBACK_COLOR;
                const isLast = i === ordered.length - 1;
                return (
                    <div
                        key={`${ev.at}-${i}`}
                        style={{
                            display: "flex", gap: "0.85rem", position: "relative",
                            paddingBottom: isLast ? 0 : "1.1rem",
                        }}
                    >
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                            <span style={{
                                width: 30, height: 30, borderRadius: "50%",
                                background: `color-mix(in srgb, ${color} 15%, transparent)`,
                                border: `1.5px solid ${color}`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color,
                            }}>
                                <Icon name={HISTORY_ICON[ev.kind] || "document"} size={14} />
                            </span>
                            {!isLast && (
                                <span style={{
                                    flex: 1, width: 2, background: "var(--twd-line2)",
                                    marginTop: 2, minHeight: 14,
                                }} />
                            )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--twd-ink)" }}>{ev.title}</div>
                            {ev.detail && (
                                <div style={{ fontSize: 12.5, color: "var(--twd-soft)", marginTop: 2 }}>{ev.detail}</div>
                            )}
                            <div style={{ fontSize: 11.5, color: "var(--twd-faint)", marginTop: 3 }}>
                                {fmtTs(ev.at)}{ev.actor ? ` · ${ev.actor}` : ""}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
