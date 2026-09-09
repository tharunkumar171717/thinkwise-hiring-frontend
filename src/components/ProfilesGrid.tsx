import { useEffect, useRef, useState } from "react";
import { useSideDrawer } from "../context/SideDrawerContext";
import { fmtTs, fmtDate } from "../utils/dateUtils";
import { STATUS_LABEL, formatStatus } from "../utils/statusUtils";
import Icon from "./Icon";
import "../styles/dashboard.css";

// Compact icon-only action button (profiles table Actions column).
const iconBtnStyle: React.CSSProperties = {
    width: 32, minHeight: 32,
};

type Profile = any;

interface ProfilesGridProps {
    profiles: Profile[];
    jdId: string;
    jobRole?: string;
    minExperience?: number | null;
    maxExperience?: number | null;
    onSubmit?: (profile: Profile) => void;
    onRemove?: (profile: Profile) => void;
    currentUserId?: string;
    isAdmin?: boolean;
    defaultSortKey?: SortKey;
}

function scoreColor(score: number): string {
    if (score >= 80) return "var(--twd-green)";
    if (score >= 60) return "var(--twd-amber)";
    if (score >= 40) return "#ea580c";
    return "var(--twd-red-text)";
}

// CSS classes for the how-acquired source chips (see dashboard.css .twd-src--*).
const SOURCE_TAG_CLASS: Record<string, string> = {
    linkedin: "twd-src--linkedin",
    email: "twd-src--email",
    bulk: "twd-src--bulk",
    manual: "twd-src--manual",
    assessment: "twd-src--assessment",
};
function sourceTagClass(key: string): string {
    return SOURCE_TAG_CLASS[key] || "twd-src--default";
}


// The one owner name: whoever currently holds the candidate. Null once the claim
// lapses or the owner is deactivated, so the column and the button always agree.
function ownerOf(profile: Profile): string | null {
    return profile.ownership?.ownership_active ? profile.ownership.owner_name ?? null : null;
}

/** Someone else owns this candidate, and they approved me for THIS requirement. */
function isApprovedForMe(profile: Profile): boolean {
    const o = profile.ownership;
    return Boolean(o?.ownership_active && !o.is_owner && o.access_status === "approved");
}

// Ownership is a property of the candidate, surfaced on the row as `ownership`.
function ownershipExpiry(profile: Profile): string | null {
    const exp = profile.ownership?.ownership_expires_at;
    if (!exp) return null;
    try {
        return fmtDate(exp);
    } catch { return null; }
}

// ── Smart sort helpers ─────────────────────────────────────────────────────

function hasExpFlag(p: Profile): boolean {
    const flags: any[] = p.deterministic_scoring_analysis?.flags ?? [];
    return flags.some((f: any) => f?.type?.includes("experience"));
}

function hasTitleMatch(p: Profile, jobRole?: string): boolean {
    if (!jobRole) return false;
    const role = (p.deterministic_scoring_analysis?.current_role || "").toLowerCase();
    if (!role || role === "-") return false;
    // Match if any meaningful word (>2 chars) from the JD title appears in the candidate's role
    const jdWords = jobRole.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    return jdWords.some(w => role.includes(w));
}

/** 0 = title match + exp OK · 1 = exp OK · 2 = title match + exp flagged · 3 = exp flagged */
function smartTier(p: Profile, jobRole?: string): number {
    const expFlagged = hasExpFlag(p);
    const titleMatch = hasTitleMatch(p, jobRole);
    if (titleMatch && !expFlagged) return 0;
    if (!expFlagged) return 1;
    if (titleMatch) return 2;
    return 3;
}

// ── Constants ──────────────────────────────────────────────────────────────

type SortKey = "recent" | "smart" | "score" | "ai_score" | "exp";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

function firstName(name?: string | null): string {
    if (!name) return "-";
    return name.split(" ")[0];
}

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "-";
    return ((parts[0][0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

export default function ProfilesGrid({ profiles, jdId, jobRole, onRemove, currentUserId, isAdmin, defaultSortKey }: ProfilesGridProps) {
    const drawer = useSideDrawer();
    const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: defaultSortKey ?? "recent", dir: "desc" });
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");

    // Toolbar filter: Recent/Smart are sort modes, Manual/LinkedIn filter by source.
    type GridFilter = "recent" | "smart" | "manual" | "linkedin";
    const [gridFilter, setGridFilter] = useState<GridFilter>(defaultSortKey === "smart" ? "smart" : "recent");

    const changeFilter = (v: GridFilter) => {
        setGridFilter(v);
        setSort({ key: v === "smart" ? "smart" : "recent", dir: "desc" });
        setPage(1);
    };

    // "Owned by" column filter - multi-select of owner names.
    const [ownerFilter, setOwnerFilter] = useState<Set<string>>(new Set());
    const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);
    const ownerMenuRef = useRef<HTMLDivElement>(null);
    const distinctOwners = Array.from(
        new Set(profiles.map((p) => ownerOf(p)).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b));

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ownerMenuRef.current && !ownerMenuRef.current.contains(e.target as Node)) setOwnerMenuOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const toggleOwner = (name: string) =>
        setOwnerFilter((prev) => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });

    const prevDefaultRef = useRef(defaultSortKey);
    useEffect(() => {
        if (defaultSortKey && defaultSortKey !== prevDefaultRef.current) {
            prevDefaultRef.current = defaultSortKey;
            setSort({ key: defaultSortKey, dir: "desc" });
            if (defaultSortKey === "smart" || defaultSortKey === "recent") setGridFilter(defaultSortKey);
            setPage(1);
        }
    }, [defaultSortKey]);

    const detScore = (p: Profile) => p.deterministic_scoring_analysis?.display_score ?? 0;
    const aiScore = (p: Profile): number => p.llm_analysis?.overall_score ?? 0;
    const expYearsVal = (p: Profile): number => p.deterministic_scoring_analysis?.total_experience_years ?? 0;
    const tsVal = (p: Profile): number => p.created_at ? new Date(p.created_at).getTime() : 0;

    const sorted = [...profiles].sort((a, b) => {
        if (sort.key === "recent") {
            return sort.dir === "desc" ? tsVal(b) - tsVal(a) : tsVal(a) - tsVal(b);
        }
        if (sort.key === "smart") {
            const ta = smartTier(a, jobRole), tb = smartTier(b, jobRole);
            if (ta !== tb) return ta - tb;               // tier ascending (0 = best)
            return detScore(b) - detScore(a);             // within same tier: score desc
        }
        const av = sort.key === "score" ? detScore(a)
            : sort.key === "ai_score" ? aiScore(a)
                : expYearsVal(a);
        const bv = sort.key === "score" ? detScore(b)
            : sort.key === "ai_score" ? aiScore(b)
                : expYearsVal(b);
        return sort.dir === "desc" ? bv - av : av - bv;
    });

    // Owner filter first (column header multi-select), then the source filter.
    const byOwner = ownerFilter.size
        ? sorted.filter((p) => ownerFilter.has(ownerOf(p) || ""))
        : sorted;
    const sourceKeys = (p: Profile): string[] => {
        const keys: string[] = (p.source_tags || []).map((t: any) => t?.key).filter(Boolean);
        if (p.sourced_by?.source) keys.push(p.sourced_by.source);
        return keys;
    };
    const bySource = gridFilter === "manual"
        ? byOwner.filter(p => sourceKeys(p).includes("manual"))
        : gridFilter === "linkedin"
            ? byOwner.filter(p => sourceKeys(p).includes("linkedin"))
            : byOwner;
    const filtered = search.trim()
        ? bySource.filter(p => {
            const q = search.trim().toLowerCase();
            const name = (p.candidate?.Name || p.deterministic_scoring_analysis?.candidate_name || "").toLowerCase();
            const role = (p.deterministic_scoring_analysis?.current_role || "").toLowerCase();
            return name.includes(q) || role.includes(q);
        })
        : bySource;

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const clampedPage = Math.min(page, totalPages);
    const visible = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
    const rangeStart = Math.min((clampedPage - 1) * PAGE_SIZE + 1, filtered.length);
    const rangeEnd = Math.min(clampedPage * PAGE_SIZE, filtered.length);

    const toggleSort = (key: SortKey) => {
        setSort(curr =>
            curr.key === key
                ? { key, dir: curr.dir === "desc" ? "asc" : "desc" }
                : { key, dir: "desc" }
        );
        setPage(1);
    };

    const sortLabel = (key: SortKey, label: string) => {
        const active = sort.key === key;
        return (
            <span
                onClick={() => toggleSort(key)}
                style={{
                    cursor: "pointer", userSelect: "none",
                    fontWeight: 700,
                    color: active ? "var(--twd-ink)" : "var(--twd-faint)",
                    whiteSpace: "nowrap",
                    display: "flex", alignItems: "center", gap: "3px",
                }}
            >
                {label}
                {active && key !== "smart" && (
                    <span style={{ fontSize: 9 }}>{sort.dir === "desc" ? "▼" : "▲"}</span>
                )}
            </span>
        );
    };

    if (!profiles.length) {
        return (
            <div className="twd-empty">
                <Icon name="search" size={40} />
                <div>No profiles yet. Upload resumes or scan the talent pool to populate this list.</div>
            </div>
        );
    }

    const openReview = (p: Profile) => drawer.openProfile(jdId, p, "submit");
    const openView = (p: Profile) => drawer.openProfile(jdId, p, "view");
    const openUpdate = (p: Profile) => drawer.openProfile(jdId, p, "update");

    return (
        <>
            {/* ── Filter + pagination controls (sticky below the condensed header) ── */}
            <div className="twd-grid-bar twd-grid-bar--float">
                <select
                    className="twd-select"
                    aria-label="Filter profiles"
                    value={gridFilter}
                    onChange={e => changeFilter(e.target.value as any)}
                    style={{ fontSize: 13.5, flex: "none" }}
                >
                    <option value="recent">Recent</option>
                    <option value="smart">Smart</option>
                    <option value="manual">Manual</option>
                    <option value="linkedin">LinkedIn</option>
                </select>
                <div className="twd-grid-search">
                    <Icon name="search" size={15} />
                    <input
                        type="text"
                        className="twd-input"
                        placeholder="Search by name or role…"
                        aria-label="Search profiles"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexShrink: 0 }}>
                    <button
                        type="button"
                        className="twd-pager-btn"
                        disabled={clampedPage <= 1}
                        onClick={() => clampedPage > 1 && setPage(p => p - 1)}
                        title="Previous page"
                        aria-label="Previous page"
                    ><Icon name="chevron-left" size={14} /></button>
                    <span style={{
                        fontSize: 13, fontWeight: 500,
                        color: "var(--twd-soft)", whiteSpace: "nowrap",
                        minWidth: 52, textAlign: "center",
                    }}>
                        {filtered.length === 0 ? "0 / 0" : `${clampedPage} / ${totalPages}`}
                    </span>
                    <button
                        type="button"
                        className="twd-pager-btn"
                        disabled={clampedPage >= totalPages}
                        onClick={() => clampedPage < totalPages && setPage(p => p + 1)}
                        title="Next page"
                        aria-label="Next page"
                    ><Icon name="chevron-right" size={14} /></button>
                </div>
                {filtered.length > 0 && (
                    <span className="twd-count-note" style={{ flexShrink: 0 }}>
                        {search.trim() ? `${filtered.length} found` : `${filtered.length} total`}
                    </span>
                )}
            </div>

            <div className="twd-table-wrap twd-sticky-head">
                <div className="twd-table-scroll">
                    <table className="twd-table" style={{ tableLayout: "fixed", width: "100%", minWidth: 760 }}>
                        <colgroup>
                            <col style={{ width: "26%" }} />
                            <col style={{ width: "12%" }} />
                            <col style={{ width: "7%" }} />
                            <col style={{ width: "19%" }} />
                            <col style={{ width: "13%" }} />
                            <col style={{ width: "23%" }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>Candidate</th>
                                <th>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        {/* {sortLabel("smart", "Smart")}
                                    <span style={{ color: "var(--twd-line)", fontSize: 10 }}>|</span> */}
                                        {sortLabel("ai_score", "AI Score")}
                                    </div>
                                </th>
                                <th
                                    style={{ cursor: "pointer", userSelect: "none" }}
                                    onClick={() => toggleSort("exp")}
                                >
                                    Exp {sort.key === "exp" && (sort.dir === "desc" ? "▼" : "▲")}
                                </th>
                                <th style={{ overflow: "visible" }}>
                                    <div ref={ownerMenuRef} style={{ position: "relative" }}>
                                        <span
                                            onClick={() => setOwnerMenuOpen((o) => !o)}
                                            style={{ cursor: "pointer", userSelect: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                                            title="Filter by owner"
                                        >
                                            Owned by
                                            {ownerFilter.size > 0 && (
                                                <span style={{ fontSize: 10, fontWeight: 700, background: "var(--twd-red)", color: "#fff", borderRadius: 999, padding: "0 6px" }}>{ownerFilter.size}</span>
                                            )}
                                            <span style={{ fontSize: 9, color: "var(--twd-faint)" }}>▼</span>
                                        </span>
                                        {ownerMenuOpen && (
                                            <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, marginTop: 6, minWidth: 200, maxHeight: 280, overflowY: "auto", background: "var(--twd-surface)", border: "1px solid var(--twd-line)", borderRadius: 11, boxShadow: "0 16px 40px -16px var(--twd-shadow-lg)", padding: "6px 0", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 12px 8px", borderBottom: "1px solid var(--twd-line2)" }}>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--twd-soft)" }}>Filter by owner</span>
                                                    {ownerFilter.size > 0 && (
                                                        <button type="button" onClick={() => { setOwnerFilter(new Set()); setPage(1); }} style={{ border: "none", background: "none", color: "var(--twd-red-text)", fontSize: 11, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>Clear</button>
                                                    )}
                                                </div>
                                                {distinctOwners.length === 0 && (
                                                    <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--twd-faint)" }}>No owners</div>
                                                )}
                                                {distinctOwners.map((name) => (
                                                    <label
                                                        key={name}
                                                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", color: "var(--twd-ink)" }}
                                                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--twd-surface2)")}
                                                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                                    >
                                                        <input type="checkbox" checked={ownerFilter.has(name)} onChange={() => { toggleOwner(name); setPage(1); }} style={{ width: 14, height: 14, accentColor: "var(--twd-red)" }} />
                                                        {name}
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </th>
                                <th>Upload time</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((p) => {
                                const llm = p.llm_analysis?.overall_score;
                                const hasAi = llm != null;
                                const aiStatus = p.candidate?.ai_status;
                                const aiPending = aiStatus === "pending" || aiStatus === "processing";
                                const fileNameBase = (p.candidate?.resume_filename || "").replace(/\.[^.]+$/, "");
                                const name = p.candidate?.Name || p.deterministic_scoring_analysis?.candidate_name || (aiPending ? (fileNameBase || "Structuring…") : "Unknown");
                                // Prefer the live (talent-pool) candidate fields so the profiles tab shows
                                // the same structured details once AI structuring completes; deterministic
                                // snapshot is only a fallback.
                                const recentExp = (p.candidate?.Experience || [])[0] || {};
                                const role = p.candidate?.current_role || recentExp.Position || p.deterministic_scoring_analysis?.current_role || "-";
                                const expLabel: string | null = p.candidate?.experience_label ?? null;
                                const expYrs = (p.candidate?.experience_months != null ? Math.round((p.candidate.experience_months / 12) * 10) / 10 : undefined)
                                    ?? p.deterministic_scoring_analysis?.total_experience_years;
                                const appStatus = p.offer_status || p.dynamic_status || p.application_status || (p.status === "submitted" ? "SENT" : null);
                                const titleMatch = hasTitleMatch(p, jobRole);
                                const expFlagged = hasExpFlag(p);

                                const formatAppStatus = (status: string) => formatStatus(status);


                                const seq: number | null = p.submission_sequence ?? null;
                                const sentAt: string | null = p.submission_sent_at ?? null;
                                const pastSubs: any[] = p.past_submissions ?? [];

                                return (
                                    <tr
                                        key={String(p.candidate_uuid)}
                                        className="twd-row-link"
                                        onClick={() => openView(p)}
                                        style={{ opacity: expFlagged ? 0.78 : 1 }}
                                    >
                                        <td style={{ overflow: "hidden", maxWidth: 0 }}>
                                            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                                                <span className="twd-avatar">{initialsOf(name)}</span>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", overflow: "hidden" }}>
                                                        <span style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                                                        {aiPending && (
                                                            <span className="twd-mini twd-mini--amber" title="AI structuring queued - name, skills and score update automatically when done">
                                                                {aiStatus === "processing" ? "Structuring…" : "In queue"}
                                                            </span>
                                                        )}
                                                        {titleMatch && (
                                                            <span className="twd-mini twd-mini--blue" title="Job title matches the requirement">Title</span>
                                                        )}
                                                        {seq != null && (
                                                            <span
                                                                className={`twd-mini ${seq === 1 ? "twd-mini--green" : "twd-mini--neutral"}`}
                                                                title={`Submission #${seq} for this requirement`}
                                                            >
                                                                {seq === 1 ? "1st" : `#${seq}`}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="twd-cell-soft" style={{ fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={role}>{role}</div>
                                                    {expFlagged && (
                                                        <div style={{ fontSize: 11, color: "var(--twd-amber)", marginTop: 2, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                                                            <Icon name="warning" size={11} /> Exp. outside range
                                                        </div>
                                                    )}
                                                    {sentAt && (
                                                        <div style={{ fontSize: 11, color: "var(--twd-green)", marginTop: 2, whiteSpace: "nowrap", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                                                            Submitted by {firstName(p.recruiter_name)} · {fmtTs(sentAt)}
                                                        </div>
                                                    )}
                                                    {pastSubs.length > 0 && (
                                                        <div style={{ marginTop: 3, display: "flex", flexDirection: "column", gap: 2 }}>
                                                            {pastSubs.slice(0, 2).map((ps, i) => {
                                                                const pst = ps.offer_status || ps.dynamic_status || ps.status;
                                                                return (
                                                                    <div key={i} style={{ fontSize: 11, color: pst === "REJECTED" ? "var(--twd-red-text)" : "var(--twd-soft)", display: "flex", gap: "0.3rem", alignItems: "center", flexWrap: "wrap" }}>
                                                                        <span style={{ opacity: 0.5 }}>↳</span>
                                                                        {ps.client && <span style={{ fontWeight: 600 }}>{ps.client}</span>}
                                                                        <span>·</span>
                                                                        <span>{formatStatus(pst)}</span>
                                                                        {ps.rejection_reason && (
                                                                            <span style={{ opacity: 0.75 }} title={ps.rejection_reason}>· "{ps.rejection_reason.slice(0, 30)}{ps.rejection_reason.length > 30 ? "…" : ""}"</span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ whiteSpace: "nowrap" }}>
                                            {hasAi ? (
                                                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                                                    <div style={{ width: 46, height: 6, background: "var(--twd-line2)", borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                                                        <div style={{ width: `${llm}%`, height: "100%", background: scoreColor(llm), borderRadius: 4 }} />
                                                    </div>
                                                    <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: scoreColor(llm) }}>{llm}</span>
                                                </div>
                                            ) : <span style={{ color: "var(--twd-faint)", fontSize: 13 }}>-</span>}
                                        </td>
                                        <td style={{ whiteSpace: "nowrap", fontSize: 13, fontWeight: 500 }}>
                                            {expLabel ?? (expYrs != null ? `${expYrs} yr` : "-")}
                                        </td>
                                        <td style={{ fontSize: 12, overflow: "hidden", maxWidth: 0 }}>
                                            <div style={{ overflow: "hidden" }}>
                                                {/* wraps so source tags (Manual, Assessment, …) never get ellipsized away */}
                                                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3px 5px" }}>
                                                    {/* Same field the Get Approval button routes to - never a second "owner". */}
                                                    <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", ...(p.ownership?.ownership_active ? {} : { color: "var(--twd-faint)", fontStyle: "italic", fontWeight: 400 }) }}>
                                                        {p.ownership?.ownership_active ? p.ownership.owner_name : "Not owned yet"}
                                                    </span>
                                                    {(p.source_tags && p.source_tags.length > 0
                                                        ? p.source_tags
                                                        : [{ key: "pool", label: "Pool" }]
                                                    ).map((tag: { key: string; label: string }) => (
                                                        <span
                                                            key={tag.key}
                                                            className={`twd-mini ${sourceTagClass(tag.key)}`}
                                                        >
                                                            {tag.label}
                                                        </span>
                                                    ))}
                                                </div>
                                                {ownershipExpiry(p) && p.ownership?.ownership_active && (
                                                    <div style={{ fontSize: 11, color: "var(--twd-faint)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                        Owned until {ownershipExpiry(p)}
                                                    </div>
                                                )}
                                                {p.ownership?.owner_name && !p.ownership?.ownership_active && (
                                                    <div style={{ fontSize: 11, color: "var(--twd-faint)", fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                                                        Previously owned by {p.ownership.owner_name}
                                                    </div>
                                                )}
                                                {/* Approved for THIS requirement: the owner keeps the candidate,
                                                you submit under your own name. Without this an approved row
                                                looks identical to one nobody owns. */}
                                                {isApprovedForMe(p) && (
                                                    <div style={{ fontSize: 11, color: "var(--twd-green)", fontWeight: 500, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                        {p.ownership.standing_approval
                                                            ? `Cleared by ${firstName(p.ownership.owner_name)} - submit as you`
                                                            : `Approved by ${firstName(p.ownership.owner_name)} - submit as you`}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="twd-cell-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                                            {p.created_at ? fmtTs(p.created_at) : "-"}
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
                                                <button
                                                    type="button"
                                                    className="twd-icon-btn"
                                                    style={iconBtnStyle}
                                                    onClick={() => drawer.openProfile(jdId, p, "view", "comments")}
                                                    title={p.recruiter_comments?.length > 0 ? `Notes (${p.recruiter_comments.length})` : "Notes"}
                                                    aria-label="View and post comments"
                                                >
                                                    <Icon name="document" size={15} />
                                                </button>
                                                <button type="button" className="twd-icon-btn" style={iconBtnStyle} onClick={() => openUpdate(p)} title="Update candidate info" aria-label="Edit">
                                                    <Icon name="edit" size={15} />
                                                </button>
                                                {onRemove && (appStatus == null || appStatus === "SENT" || isAdmin) && (
                                                    <button
                                                        type="button"
                                                        className="twd-icon-btn twd-icon-btn--danger"
                                                        style={iconBtnStyle}
                                                        onClick={() => onRemove(p)}
                                                        title="Remove this candidate from the requirement"
                                                        aria-label="Remove"
                                                    >
                                                        <Icon name="trash" size={15} />
                                                    </button>
                                                )}
                                                {appStatus ? (
                                                    <button type="button" className="twd-icon-btn twd-icon-btn--ok" style={iconBtnStyle} title={`Status: ${formatAppStatus(appStatus)}`} aria-label={formatAppStatus(appStatus)}>
                                                        <Icon name="check" size={15} />
                                                    </button>
                                                ) : (() => {
                                                    const locked = Boolean(p.ownership?.locked);
                                                    const pending = p.ownership?.access_status === "pending";
                                                    if (!locked) {
                                                        // Approved by the owner: same action, but say so, so it
                                                        // reads as a granted permission rather than a free profile.
                                                        const approved = isApprovedForMe(p);
                                                        return (
                                                            <button
                                                                type="button"
                                                                className={`twd-icon-btn ${approved ? "twd-icon-btn--ok" : "twd-icon-btn--primary"}`}
                                                                style={iconBtnStyle}
                                                                onClick={() => openReview(p)}
                                                                title={approved
                                                                    ? `${p.ownership.owner_name} approved this profile for this requirement - it submits under your name`
                                                                    : "Submit candidate to this requirement"}
                                                                aria-label={approved ? "Submit (approved by owner)" : "Submit"}
                                                            >
                                                                <Icon name="send" size={15} />
                                                            </button>
                                                        );
                                                    }
                                                    return (
                                                        <button
                                                            type="button"
                                                            style={{
                                                                ...iconBtnStyle,
                                                                width: "auto", minWidth: "auto", padding: "0 9px", fontSize: 11, fontWeight: 600,
                                                                whiteSpace: "nowrap",
                                                                color: pending ? "var(--twd-soft)" : "var(--twd-red-text)",
                                                                border: `1px solid ${pending ? "var(--twd-line)" : "var(--twd-red)"}`,
                                                                background: "transparent", borderRadius: "9px", cursor: "pointer",
                                                            }}
                                                            // Opens the drawer's OwnershipGate: disclaimer, then send
                                                            // or withdraw the request.
                                                            onClick={() => openReview(p)}
                                                            title={p.ownership?.message || "Owned by another recruiter"}
                                                        >
                                                            {pending ? "Requested" : "Get Approval"}
                                                        </button>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ── Footer ── */}
                <div style={{
                    padding: "0.55rem 1rem", borderTop: "1px solid var(--twd-line2)",
                    fontSize: 12, color: "var(--twd-faint)", display: "flex", alignItems: "center",
                }}>
                    {filtered.length === 0
                        ? "No profiles match this filter."
                        : `Showing ${rangeStart}–${rangeEnd} of ${filtered.length} profiles`
                    }
                </div>
            </div>
        </>
    );
}
