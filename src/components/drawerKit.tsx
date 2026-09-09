import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { statusTone } from "../utils/statusUtils";

/**
 * Shared chrome for the pipeline drawers (`TimelineDrawer`, `OfferDrawer`).
 *
 * Extracted rather than copy-pasted: Phase 0 of DYNAMIC_INTERVIEW_PIPELINE_PLAN.md exists
 * because duplicated presentation had silently diverged across eight files. Two 400-line
 * drawers would have recreated exactly that.
 */

// ── Layout constants ────────────────────────────────────────────────────────

/**
 * Two-up field row. Wraps to stacked rather than overlapping when the drawer is too
 * narrow for both - some option labels are wider than a fixed column.
 */
export const fieldRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 };
export const fieldCol: CSSProperties = { minWidth: 0 };
export const fieldLabel: CSSProperties = { fontSize: 10, color: "var(--twd-faint)", marginBottom: 4 };
export const fieldControl: CSSProperties = { width: "100%", minWidth: 0, boxSizing: "border-box" };

export const actionBtn: CSSProperties = {
    fontSize: 12, padding: "8px 0", borderRadius: 10, cursor: "pointer",
    fontWeight: 600, border: "1px solid", flex: 1, fontFamily: "inherit",
};

export const sectionLabel: CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "var(--twd-soft)",
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
};

export const formCard: CSSProperties = {
    padding: "10px 12px", background: "var(--twd-surface)",
    borderRadius: 8, border: "1px solid var(--twd-line2)",
};

export const hintText: CSSProperties = { fontSize: 10, color: "var(--twd-faint)", marginBottom: 8 };

// ── Helpers ─────────────────────────────────────────────────────────────────

/** apiFetch rejects with the parsed error body, which carries FastAPI's `detail`. */
export function errMessage(e: unknown, fallback: string): string {
    const detail = (e as { detail?: unknown } | null)?.detail;
    return typeof detail === "string" ? detail : fallback;
}

export function whenText(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Shared pieces ───────────────────────────────────────────────────────────

export function StatePill({ status, size = 11 }: { status: string; size?: number }) {
    const tone = statusTone(status);
    return (
        <span style={{
            fontSize: size, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
            background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, whiteSpace: "nowrap",
        }}>
            {status}
        </span>
    );
}

/**
 * Single date+time picker. The two values stay stored separately (`scheduled_date` /
 * `scheduled_time`) to match the legacy shape, so this splits and rejoins around a
 * native `datetime-local` control.
 */
export function DateTimeField({ date, time, onChange }: {
    date: string;
    time: string;
    onChange: (date: string, time: string) => void;
}) {
    // datetime-local needs 24h HH:mm. Legacy rows hold free text like "3 PM", which
    // can't round-trip - default it rather than feed the input something it renders blank.
    const asValue = date ? `${date}T${/^\d{2}:\d{2}$/.test(time) ? time : "09:00"}` : "";
    return (
        <input
            type="datetime-local"
            className="twd-input"
            style={{ ...fieldControl, marginBottom: 8 }}
            value={asValue}
            onChange={e => {
                const v = e.target.value;
                if (!v) { onChange("", ""); return; }
                const [d, t] = v.split("T");
                onChange(d || "", t || "");
            }}
        />
    );
}

/** Plain date picker, for fields with no time component (e.g. joining date). */
export function DateField({ value, onChange, placeholder }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    return (
        <input
            type="date"
            className="twd-input"
            aria-label={placeholder}
            style={fieldControl}
            value={value}
            onChange={e => onChange(e.target.value)}
        />
    );
}

export function ErrorBanner({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <div style={{
            fontSize: 12, color: "#dc2626", background: "#fee2e2", border: "1px solid #fca5a5",
            borderRadius: 8, padding: "8px 10px", marginBottom: 12,
        }}>
            {message}
        </div>
    );
}

/** One row of a timeline: a status pill plus optional subtext and timestamp. */
export function TimelineRow({ label, sub, when, muted, pill, edited }: {
    label: string;
    sub?: string;
    when?: string;
    muted?: boolean;
    pill?: boolean;
    edited?: boolean;
}) {
    return (
        <div style={{ marginBottom: 10, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {pill
                    ? <StatePill status={label} />
                    : <span style={{ fontSize: 11, fontWeight: 700, color: "var(--twd-faint)" }}>{label}</span>}
                {when && <span style={{ fontSize: 10, color: "var(--twd-faint)" }}>{when}</span>}
                {edited && <span style={{ fontSize: 10, color: "var(--twd-faint)", fontStyle: "italic" }}>edited</span>}
            </div>
            {sub && (
                <div style={{ fontSize: 11, color: muted ? "var(--twd-faint)" : "var(--twd-soft)", marginTop: 2 }}>
                    {sub}
                </div>
            )}
        </div>
    );
}

/**
 * Right-hand sliding drawer: portal, backdrop, scroll-lock, Escape-to-close, header.
 * Children render inside the scrollable body.
 */
export function DrawerShell({ title, titleAccent, subtitle, ariaLabel, onClose, children }: {
    title: string;
    /** Rendered italic in the brand accent, following the existing drawer style. */
    titleAccent?: string;
    subtitle?: string;
    ariaLabel: string;
    onClose: () => void;
    children: ReactNode;
}) {
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return createPortal(
        <div className="twd-vars">
            <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1099, background: "rgba(28,18,16,0.32)", backdropFilter: "blur(2px)" }} />
            <aside
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                onClick={e => e.stopPropagation()}
                style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 95vw)", background: "var(--twd-paper)", borderLeft: "1px solid var(--twd-line)", boxShadow: "-14px 0 40px rgba(28,18,16,0.16)", zIndex: 1100, display: "flex", flexDirection: "column", color: "var(--twd-ink)" }}
            >
                <header style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--twd-line)", background: "var(--twd-surface)", display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, letterSpacing: "-0.01em" }}>
                            {title}{titleAccent && <> <span style={{ color: "var(--twd-red-text)", fontStyle: "italic" }}>{titleAccent}</span></>}
                        </div>
                        {subtitle && <div style={{ fontSize: 12, color: "var(--twd-faint)", marginTop: 3 }}>{subtitle}</div>}
                    </div>
                    <button onClick={onClose} className="twd-close" aria-label="Close">×</button>
                </header>

                <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 20px" }}>
                    {children}
                </div>
            </aside>
        </div>,
        document.body
    );
}
