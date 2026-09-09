/**
 * Single source of truth for application-status presentation.
 *
 * Before this module the label maps below were copy-pasted across eight call sites.
 * They had quietly diverged, so they are consolidated here as *named vocabularies*
 * rather than force-merged into one map - each variant below is load-bearing
 * somewhere, and the comments record why.
 *
 * `parseStatus` also understands the dynamic `{Round}.{Status}` vocabulary
 * (e.g. "L7.Scheduled"). No legacy status contains a dot, so that branch is inert
 * until the dynamic pipeline starts writing `dynamic_status`.
 * See DYNAMIC_INTERVIEW_PIPELINE_PLAN.md.
 */

// ── Legacy vocabularies ─────────────────────────────────────────────────────

/**
 * Full labels - the "Submitted" family. Used by the candidate/profile surfaces
 * (ProfilesGrid, ProfileDrawer, ProfileFullView, CandidateDetail), which all had
 * byte-identical copies of this map.
 */
export const STATUS_LABEL: Record<string, string> = {
    SENT: "Submitted", L1_SELECTED: "L1 Selected", L2_SELECTED: "L2 Selected",
    L3_SELECTED: "L3 Selected", HR_SELECTED: "HR Selected", HR_ROUND: "HR Round",
    SELECTED: "Selected", OFFER_RELEASED: "Offer Released", OFFER_ACCEPTED: "Offer Accepted",
    JOINED: "Joined", REJECTED: "Rejected",
};

/**
 * Abbreviated labels for dense lists. Deliberately terser than STATUS_LABEL -
 * used in ProfileDrawer's "Other Requirements" rows where horizontal space is tight.
 */
export const STATUS_LABEL_COMPACT: Record<string, string> = {
    SENT: "Submitted", L1_SELECTED: "L1", L2_SELECTED: "L2",
    L3_SELECTED: "L3", HR_ROUND: "HR Round", HR_SELECTED: "HR",
    SELECTED: "Selected", OFFER_RELEASED: "Offered", OFFER_ACCEPTED: "Accepted",
    JOINED: "Joined", REJECTED: "Rejected",
};

/**
 * The "Sent" family - note SENT reads "Sent", not "Submitted", and HOLD is included.
 * Used by the requirement-side surfaces (RequirementDetail's status dropdown), which
 * talk about the submission rather than the candidate. Offer/L3 states are absent
 * because that dropdown never offers them.
 */
export const STATUS_LABEL_SHORT: Record<string, string> = {
    SENT: "Sent",
    L1_SELECTED: "L1 Selected",
    L2_SELECTED: "L2 Selected",
    HR_ROUND: "HR Round",
    SELECTED: "Selected",
    HOLD: "On Hold",
    JOINED: "Joined",
    REJECTED: "Rejected",
};

/**
 * Notification feed labels. The key set is deliberately PARTIAL: DashboardLayout
 * renders `NOTIFICATION_STATUS_LABEL[status] || n.subtitle`, so any status omitted
 * here intentionally falls through to the notification's own subtitle text.
 * Do not "complete" this map - added keys will suppress subtitles.
 */
export const NOTIFICATION_STATUS_LABEL: Record<string, string> = {
    L1_SELECTED: "L1 Selected",
    L2_SELECTED: "L2 Selected",
    HR_ROUND: "HR Round",
    SELECTED: "Selected",
    REJECTED: "Rejected",
};

/** Accent colours for application statuses in notification feeds. */
export const APP_STATUS_COLOR: Record<string, string> = {
    SELECTED: "#16a34a",
    REJECTED: "#dc2626",
    L1_SELECTED: "#2563eb",
    L2_SELECTED: "#7c3aed",
    HR_ROUND: "#d97706",
    SENT: "var(--twd-faint)",
};

/**
 * Status filter options. The leading "" is the "All statuses" option.
 * Call sites render the entries differently (raw vs underscore-stripped), so only
 * the list itself is shared.
 */
export const APP_STATUSES = ["", "SENT", "L1_SELECTED", "L2_SELECTED", "HR_ROUND", "SELECTED", "HOLD", "JOINED", "REJECTED"];

// ── Parsing / formatting ────────────────────────────────────────────────────

export type ParsedStatus = {
    /** Round name for dynamic statuses ("L7"), else null. */
    round: string | null;
    /** State portion ("Scheduled") for dynamic, or the raw enum for legacy. */
    state: string;
    /** True when the input used the dynamic `{Round}.{Status}` form. */
    isDynamic: boolean;
};

export type LabelVariant = "full" | "compact" | "short";

const LABEL_MAPS: Record<LabelVariant, Record<string, string>> = {
    full: STATUS_LABEL,
    compact: STATUS_LABEL_COMPACT,
    short: STATUS_LABEL_SHORT,
};

/**
 * Split a status into round + state. Dotted input is the dynamic vocabulary;
 * anything else is a legacy enum and comes back with `round: null`.
 */
export function parseStatus(status: string | null | undefined): ParsedStatus {
    const s = (status || "").trim();
    if (!s) return { round: null, state: "", isDynamic: false };

    const dot = s.indexOf(".");
    if (dot > 0) {
        return { round: s.slice(0, dot), state: s.slice(dot + 1), isDynamic: true };
    }
    return { round: null, state: s, isDynamic: false };
}

/**
 * Human label for a status in either vocabulary.
 *
 * Legacy enums go through the requested lookup and fall back to the raw string,
 * matching the `?? status` behaviour every call site had before.
 *
 * Dynamic statuses render verbatim as "L7.Scheduled" - the plan specifies the
 * `{Round}.{Status}` form as the display format, so no separator rewriting here.
 */
export function formatStatus(status: string | null | undefined, variant: LabelVariant = "full"): string {
    const s = (status || "").trim();
    if (!s) return "";

    const parsed = parseStatus(s);
    if (parsed.isDynamic) return s;

    return LABEL_MAPS[variant][s] ?? s;
}

// ── Dynamic pipeline presentation ───────────────────────────────────────────

export type StatusTone = {
    /** Background fill. */
    bg: string;
    /** Text colour, also used for the border at reduced opacity. */
    fg: string;
    /** Border colour. */
    border: string;
};

const NEUTRAL_TONE: StatusTone = { bg: "var(--twd-surface2)", fg: "var(--twd-faint)", border: "var(--twd-line2)" };

/**
 * Tone per pipeline *state*, reusing the palette the legacy round cells already use
 * so the V2 column reads as the same system while both run side by side.
 *
 * Keyed on the state portion only, so it works for any round number.
 */
const STATE_TONE: Record<string, StatusTone> = {
    Shortlisted: NEUTRAL_TONE,
    Scheduled: { bg: "#fef9c3", fg: "#a16207", border: "#fde68a" },
    Rescheduled: { bg: "#fef9c3", fg: "#a16207", border: "#fde68a" },
    NoShow: { bg: "#f3f4f6", fg: "#6b7280", border: "#d1d5db" },
    Onhold: { bg: "#f3f4f6", fg: "#6b7280", border: "#d1d5db" },
    Selected: { bg: "#ede9fe", fg: "#7c3aed", border: "#c4b5fd" },
    Rejected: { bg: "#fee2e2", fg: "#dc2626", border: "#fca5a5" },
    Screening: NEUTRAL_TONE,

    // Offer stage (Selections tab). Bare strings, so `parseStatus` returns them whole
    // as the state and this lookup matches directly.
    "Offer Released": { bg: "#fef9c3", fg: "#a16207", border: "#fde68a" },  // awaiting response
    "Offer Accepted": { bg: "#dbeafe", fg: "#2563eb", border: "#93c5fd" },  // committed, not started
    Joined: { bg: "#dcfce7", fg: "#16a34a", border: "#86efac" },
    "Offer Declined": { bg: "#fee2e2", fg: "#dc2626", border: "#fca5a5" },
    "Backed Out": { bg: "#fee2e2", fg: "#dc2626", border: "#fca5a5" },
    "Offer Withdrawn": { bg: "#fee2e2", fg: "#dc2626", border: "#fca5a5" },
    "Offer On Hold": { bg: "#f3f4f6", fg: "#6b7280", border: "#d1d5db" },
};

/**
 * Colour treatment for a status in the dynamic vocabulary.
 *
 * "Offer.Rejected" resolves to the Rejected tone because the state portion is shared -
 * which is the intent, an offer turned down reads the same as a round rejection.
 */
export function statusTone(status: string | null | undefined): StatusTone {
    const { state } = parseStatus(status);
    return STATE_TONE[state] ?? NEUTRAL_TONE;
}

/** Just the accent colour - for callers that only need text/dot colour. */
export function statusColor(status: string | null | undefined): string {
    return statusTone(status).fg;
}
