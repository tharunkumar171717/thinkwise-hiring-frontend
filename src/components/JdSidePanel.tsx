import { useState, useEffect, useMemo } from "react";
import { useJdViewer } from "../context/JdViewerContext";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "./StatusBadge";
import Icon from "./Icon";
import "./JdSidePanel.css";
import "../styles/dashboard.css";
import { fmtTs } from "../utils/dateUtils";
import {
    normalizeBooleanSearches,
    BOOLEAN_VARIANTS,
    type BooleanSearches,
    type BooleanVariant,
} from "../utils/buildBooleanSearch";

const VARIANT_META: Record<BooleanVariant, { label: string; hint: string }> = {
    broad: { label: "Broad", hint: "Widest net - most candidates" },
    balanced: { label: "Balanced", hint: "Recommended default" },
    strict: { label: "Strict", hint: "Highest precision - fewest, best-fit" },
};

const REQ_TYPE_LABELS: Record<string, string> = {
    FULL_TIME: "Full Time",
    CONTRACT: "Contract",
    CONTRACT_TO_HIRE: "Contract to Hire",
    INTERNSHIP: "Internship",
};

/**
 * One Overview row. Always renders: a field that silently disappeared when blank
 * left the reader unable to tell "nobody filled this in" from "this panel doesn't
 * show it". Empty now reads "Not specified", styled muted so a filled panel still
 * scans quickly.
 */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
    const blank = value === null || value === undefined || value === "";
    return (
        <div className="jd-panel-field">
            <div className="jd-panel-field-label">{label}</div>
            <div className={`jd-panel-field-value${blank ? " jd-panel-unset" : ""}`}>
                {blank ? "Not specified" : value}
            </div>
        </div>
    );
}

function Chips({ items }: { items?: string[] | null }) {
    if (!items || items.length === 0) return null;
    return (
        <div className="jd-panel-chips">
            {items.map((s, i) => (
                <span key={`${s}-${i}`} className="twd-tag">{s}</span>
            ))}
        </div>
    );
}

// Boolean-search block. Shows three auto-generated variants (broad / balanced /
// strict) as a segmented control. Each user can tweak any variant just for
// themselves - the edit is saved in THEIR browser (localStorage, keyed by user +
// requirement + variant) and never touches the requirement others see.
function BooleanSearch({ searches, storageKeyBase }: { searches: BooleanSearches; storageKeyBase: string | null }) {
    const [variant, setVariant] = useState<BooleanVariant>("balanced");
    const [overrides, setOverrides] = useState<Partial<Record<BooleanVariant, string>>>({});
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [copied, setCopied] = useState(false);

    const keyFor = (v: BooleanVariant) => (storageKeyBase ? `${storageKeyBase}:${v}` : null);

    // Load this user's personal overrides (per variant) whenever the requirement changes.
    useEffect(() => {
        setEditing(false);
        setCopied(false);
        if (!storageKeyBase) { setOverrides({}); return; }
        const loaded: Partial<Record<BooleanVariant, string>> = {};
        for (const v of BOOLEAN_VARIANTS) {
            try {
                const saved = localStorage.getItem(`${storageKeyBase}:${v}`);
                if (saved && saved.trim()) loaded[v] = saved;
            } catch { /* ignore */ }
        }
        setOverrides(loaded);
    }, [storageKeyBase]);

    const base = searches[variant] || "";
    const override = overrides[variant];
    const effective = override ?? base;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(effective);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable - user can still select the text */ }
    };

    const startEdit = () => { setDraft(effective); setEditing(true); };

    const save = () => {
        const v = draft.trim();
        const cleared = !v || v === base.trim(); // empty or unchanged → track the auto string again
        const key = keyFor(variant);
        try {
            if (key) { if (cleared) localStorage.removeItem(key); else localStorage.setItem(key, v); }
        } catch { /* storage unavailable - keep the in-memory value for this session */ }
        setOverrides((prev) => {
            const next = { ...prev };
            if (cleared) delete next[variant]; else next[variant] = v;
            return next;
        });
        setEditing(false);
    };

    const resetToAuto = () => {
        const key = keyFor(variant);
        try { if (key) localStorage.removeItem(key); } catch { /* ignore */ }
        setOverrides((prev) => { const next = { ...prev }; delete next[variant]; return next; });
        setEditing(false);
    };

    return (
        <section className="jd-panel-section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <div className="jd-panel-section-title" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    Boolean Search
                    {override != null && (
                        <span
                            title="You've customised this variant for yourself - it isn't shared with the team"
                            style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "1px 6px" }}
                        >
                            edited by you
                        </span>
                    )}
                </div>
                {!editing && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
                        {override != null && (
                            <button className="btn btn-ghost btn-sm" onClick={resetToAuto} title="Discard your edit and restore the auto-generated string" style={{ padding: "2px 10px", fontWeight: 600, color: "var(--text-secondary)" }}>Reset</button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={startEdit} title="Edit this variant - just for you" style={{ padding: "2px 10px", fontWeight: 600, color: "var(--primary)" }}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={copy} title="Copy this boolean search" style={{ padding: "2px 10px", fontWeight: 600, color: copied ? "#16a34a" : "var(--primary)" }}>{copied ? "Copied" : "Copy"}</button>
                    </div>
                )}
            </div>

            {/* Variant selector */}
            <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.6rem", background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 3 }}>
                {BOOLEAN_VARIANTS.map((v) => {
                    const active = v === variant;
                    return (
                        <button
                            key={v}
                            onClick={() => { setVariant(v); setEditing(false); }}
                            title={VARIANT_META[v].hint}
                            style={{
                                flex: 1, padding: "4px 8px", borderRadius: 6, border: "none", cursor: "pointer",
                                fontSize: 12, fontWeight: active ? 600 : 500, whiteSpace: "nowrap",
                                background: active ? "var(--accent)" : "transparent",
                                color: active ? "#fff" : "var(--text-secondary)",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                            }}
                        >
                            {VARIANT_META[v].label}
                            {overrides[v] != null && (
                                <span title="You've edited this variant" style={{ width: 5, height: 5, borderRadius: "50%", background: active ? "#fff" : "var(--primary)" }} />
                            )}
                        </button>
                    );
                })}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: "0.35rem" }}>{VARIANT_META[variant].hint}</div>

            {editing ? (
                <>
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={4}
                        autoFocus
                        spellCheck={false}
                        className="jd-panel-jd"
                        style={{ marginTop: "0.5rem", width: "100%", fontFamily: "var(--font-mono, monospace)", resize: "vertical" }}
                    />
                    <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <button className="btn btn-primary btn-sm" onClick={save} style={{ padding: "3px 12px" }}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} style={{ padding: "3px 12px" }}>Cancel</button>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>Saved only in your browser</span>
                    </div>
                </>
            ) : effective ? (
                <pre className="jd-panel-jd" style={{ marginTop: "0.5rem", fontFamily: "var(--font-mono, monospace)", userSelect: "all" }}>
                    {effective}
                </pre>
            ) : (
                <p className="jd-panel-text jd-panel-muted" style={{ marginTop: "0.5rem" }}>No skills to build this variant from yet.</p>
            )}
        </section>
    );
}

export default function JdSidePanel() {
    const { activeReq, isOpen, closeJd } = useJdViewer();
    const { user } = useAuth();
    const [isJdExpanded, setIsJdExpanded] = useState(false);

    // Prefer the AI-generated variants produced during JD extraction; backfill any
    // missing variant with the deterministic builder (also covers older
    // requirements / failed parses and keeps strings live as skills are regrouped).
    const booleanSearches = useMemo(
        () => (activeReq ? normalizeBooleanSearches(activeReq.boolean_search, activeReq) : null),
        [activeReq?.boolean_search, activeReq?.must_have_skills, activeReq?.good_to_have_skills, activeReq?.important_information]
    );
    const hasBoolean = !!booleanSearches && BOOLEAN_VARIANTS.some((v) => booleanSearches[v]);

    // Per-user, per-requirement key base for personal (browser-local) edits.
    const boolStorageKey = activeReq?.id
        ? `tw-boolean-search:${user?.id ?? "anon"}:${activeReq.id}`
        : null;

    useEffect(() => {
        if (isOpen) setIsJdExpanded(false);
    }, [isOpen, activeReq?.req_id]);

    if (!activeReq) return null;

    const r = activeReq;
    const typeLabel = r.requirement_type ? (REQ_TYPE_LABELS[r.requirement_type] ?? r.requirement_type) : null;
    const sla = r.sla_hours_to_first_submission != null ? `${r.sla_hours_to_first_submission}h` : null;
    const deadline = r.sla_deadline_ist ? fmtTs(r.sla_deadline_ist) : null;
    const created = r.created_at ? fmtTs(r.created_at) : null;

    // Min and max are two separate inputs on the create form. Shown as one range
    // so a half-filled pair still reads as a sentence ("5+ yrs") instead of two
    // rows where one always says "Not specified".
    const minExp = r.years_of_experience ?? null;
    const maxExp = r.max_years_experience ?? null;
    const experience =
        minExp && maxExp ? `${minExp} – ${maxExp} yrs`
        : minExp ? `${minExp}+ yrs`
        : maxExp ? `Up to ${maxExp} yrs`
        : null;

    const assessment = r.assessment_required === true ? "Required"
        : r.assessment_required === false ? "Not required"
        : null;

    // A requirement created before confidentiality existed has no `visibility`
    // field; it is treated as ALL everywhere, so say so rather than "Not specified".
    const visibility = r.visibility === "RESTRICTED"
        ? `Confidential${r.visible_to?.length ? ` · ${r.visible_to.length} added viewer${r.visible_to.length === 1 ? "" : "s"}` : ""}`
        : "Everyone";

    return (
        <aside className={`twd-vars jd-panel ${isOpen ? "jd-panel--open" : ""}`} role="complementary" aria-label="Job description viewer">
            <header className="jd-panel-header">
                <div className="jd-panel-header-main">
                    <div className="jd-panel-header-row">
                        {r.req_id && (
                            <span className="twd-mono" style={{ fontSize: 13 }}>
                                {r.req_id}
                            </span>
                        )}
                        {r.status && <StatusBadge status={r.status} />}
                    </div>
                    <h2 className="jd-panel-title">{r.requirement_name || "Job Description"}</h2>
                </div>
                <button
                    className="jd-panel-close"
                    onClick={closeJd}
                    aria-label="Close job description panel"
                    title="Close"
                >
                    <Icon name="x" size={15} />
                </button>
            </header>

            <div className="jd-panel-body">
                <section className="jd-panel-section">
                    <div className="jd-panel-section-title">Overview</div>
                    <div className="jd-panel-grid">
                        <Field label="Company" value={r.company_name} />
                        <Field label="Client SPOC" value={r.client_spoc_name} />
                        <Field label="Type" value={typeLabel} />
                        <Field label="Role" value={r.role_type} />
                        <Field label="Mode of Work" value={r.mode_of_work} />
                        <Field label="Location" value={r.location} />
                        <Field label="Experience" value={experience} />
                        <Field label="Notice Period" value={r.notice_period} />
                        <Field label="No. of Positions" value={r.no_of_positions} />
                        <Field label="Budget Range" value={r.budget_range} />
                        <Field label="SLA" value={sla} />
                        <Field label="Summary Report" value={assessment} />
                        <Field label="Visibility" value={visibility} />
                        <Field label="Deadline" value={deadline} />
                        <Field label="Created" value={created} />
                    </div>
                </section>

                {hasBoolean && booleanSearches && <BooleanSearch searches={booleanSearches} storageKeyBase={boolStorageKey} />}

                {(r.all_skills?.length || r.must_have_skills?.length || r.good_to_have_skills?.length) ? (
                    <section className="jd-panel-section">
                        <div className="jd-panel-section-title">Skills</div>
                        {r.must_have_skills && r.must_have_skills.length > 0 && (
                            <div className="jd-panel-subgroup">
                                <div className="jd-panel-subtitle">Must-have</div>
                                <Chips items={r.must_have_skills} />
                            </div>
                        )}
                        {r.good_to_have_skills && r.good_to_have_skills.length > 0 && (
                            <div className="jd-panel-subgroup">
                                <div className="jd-panel-subtitle">Good to have</div>
                                <Chips items={r.good_to_have_skills} />
                            </div>
                        )}
                        {(!r.must_have_skills || r.must_have_skills.length === 0) &&
                            (!r.good_to_have_skills || r.good_to_have_skills.length === 0) &&
                            r.all_skills && r.all_skills.length > 0 && (
                                <div className="jd-panel-subgroup">
                                    <div className="jd-panel-subtitle">All Skills</div>
                                    <Chips items={r.all_skills} />
                                </div>
                            )}
                    </section>
                ) : null}

                <section className="jd-panel-section">
                    <div className="jd-panel-section-title">Special Instructions</div>
                    {r.special_instructions ? (
                        <p className="jd-panel-text">{r.special_instructions}</p>
                    ) : (
                        <p className="jd-panel-text jd-panel-unset">Not specified</p>
                    )}
                </section>

                <section className="jd-panel-section">
                    <div className="jd-panel-section-title">Job Description</div>
                    {r.jd ? (
                        <pre className="jd-panel-jd">
                            {(() => {
                                const lines = r.jd.split('\n');
                                if (lines.length > 10 && !isJdExpanded) {
                                    return lines.slice(0, 10).join('\n') + '\n... ';
                                }
                                return r.jd + '\n\n';
                            })()}
                            {r.jd.split('\n').length > 10 && (
                                <button
                                    onClick={() => setIsJdExpanded(!isJdExpanded)}
                                    className="twd-link"
                                    style={{ display: "inline", verticalAlign: "baseline" }}
                                >
                                    {isJdExpanded ? "View less" : "View more"}
                                </button>
                            )}
                        </pre>
                    ) : (
                        <p className="jd-panel-text jd-panel-unset">Not specified</p>
                    )}
                </section>
            </div>
        </aside>
    );
}
