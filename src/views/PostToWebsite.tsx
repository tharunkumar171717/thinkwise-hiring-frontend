import { useEffect, useMemo, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useNavigate, useParams } from "../lib/router";
import { api, websiteJobPostingApi, type PublishedPosting } from "../services/api";
import BackButton from "../components/BackButton";
import Icon from "../components/Icon";
import "../styles/pages.css";

// apiFetch rejects with the parsed error body, which carries `detail`.
const apiDetail = (err: unknown, fallback: string): string => {
    const detail = (err as { detail?: unknown } | null)?.detail;
    return typeof detail === "string" && detail ? detail : fallback;
};

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
    FULL_TIME: "Full Time",
    CONTRACT: "Contract",
    CONTRACT_TO_HIRE: "Contract to Hire",
    INTERNSHIP: "Internship",
};

interface RequirementLite {
    id: string;
    req_id?: string | null;
    requirement_name?: string | null;
    company_name?: string | null;
    jd?: string | null;
    requirement_type?: string | null;
    role_type?: string | null;
    location?: string | null;
    mode_of_work?: string | null;
    years_of_experience?: string | null;
    max_years_experience?: string | null;
    no_of_positions?: number | null;
    budget_range?: string | null;
    all_skills?: string[] | null;
    must_have_skills?: string[] | null;
    good_to_have_skills?: string[] | null;
    skill_requirements?: Array<{ label: string; tier: "must" | "good"; members: string[] }> | null;
}

type Draft = {
    title: string;
    company: string;
    location: string;
    employment_type: string;
    work_mode: string;
    experience: string;
    openings: string;
    salary_range: string;
    skills: string;          // comma-separated in the editor, split on publish
    description: string;
    apply_email: string;
};

const EMPTY_DRAFT: Draft = {
    title: "", company: "", location: "", employment_type: "", work_mode: "",
    experience: "", openings: "", salary_range: "", skills: "", description: "",
    apply_email: "",
};

function experienceLabel(req: RequirementLite): string {
    const min = (req.years_of_experience ?? "").toString().trim();
    const max = (req.max_years_experience ?? "").toString().trim();
    if (min && max) return `${min} - ${max} years`;
    if (min) return `${min}+ years`;
    if (max) return `Up to ${max} years`;
    return "";
}

function skillsFrom(req: RequirementLite): string[] {
    const fromGroups = (req.skill_requirements || []).map(s => s.label);
    const merged = [
        ...fromGroups,
        ...(req.must_have_skills || []),
        ...(req.good_to_have_skills || []),
        ...(req.all_skills || []),
    ].map(s => (s || "").trim()).filter(Boolean);
    // De-duplicate case-insensitively, keeping the first spelling seen.
    const seen = new Map<string, string>();
    for (const s of merged) if (!seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
    return [...seen.values()];
}

/**
 * Builds the public-facing description. The requirement's own JD is used when
 * it has one; otherwise a readable posting is assembled from the structured
 * fields, so a requirement created from a parsed file still has something to
 * publish. `special_instructions` is deliberately left out - it is internal
 * recruiter guidance, not candidate-facing copy.
 */
function buildDescription(req: RequirementLite, skills: string[]): string {
    if (req.jd?.trim()) return req.jd.trim();

    const lines: string[] = [];
    const role = req.requirement_name || req.role_type || "this role";
    lines.push(`${req.company_name ? `${req.company_name} is hiring` : "We are hiring"} for ${role}.`);
    lines.push("");
    const facts: string[] = [];
    if (req.location) facts.push(`Location: ${req.location}`);
    if (req.mode_of_work) facts.push(`Work mode: ${req.mode_of_work}`);
    const exp = experienceLabel(req);
    if (exp) facts.push(`Experience: ${exp}`);
    if (facts.length) { lines.push("About the role", ...facts.map(f => `- ${f}`), ""); }
    if (skills.length) { lines.push("What we're looking for", ...skills.map(s => `- ${s}`), ""); }
    lines.push("Apply through the link on this posting and our team will get back to you.");
    return lines.join("\n");
}

function draftFromRequirement(req: RequirementLite): Draft {
    const skills = skillsFrom(req);
    return {
        title: req.requirement_name || req.role_type || "",
        company: req.company_name || "",
        location: req.location || "",
        employment_type: req.requirement_type
            ? EMPLOYMENT_TYPE_LABEL[req.requirement_type] || req.requirement_type.replace(/_/g, " ")
            : "",
        work_mode: req.mode_of_work || "",
        experience: experienceLabel(req),
        openings: req.no_of_positions != null ? String(req.no_of_positions) : "",
        salary_range: req.budget_range || "",
        skills: skills.join(", "),
        description: buildDescription(req, skills),
        apply_email: "",
    };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="form-group">
            <label>{label}</label>
            {children}
            {hint && <span className="requirement-side-note">{hint}</span>}
        </div>
    );
}

export default function PostToWebsite() {
    useDocumentTitle("Post to Website");
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [req, setReq] = useState<RequirementLite | null>(null);
    const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT });
    const [showSalary, setShowSalary] = useState(false);
    const [loading, setLoading] = useState(true);
    const [posting, setPosting] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState<PublishedPosting | null>(null);

    const set = (field: keyof Draft, value: string) =>
        setDraft(prev => ({ ...prev, [field]: value }));

    useEffect(() => {
        if (!id) return;
        let alive = true;
        setLoading(true);
        api.get(`/requirements/${id}`)
            .then((r: RequirementLite) => {
                if (!alive) return;
                setReq(r);
                setDraft(draftFromRequirement(r));
                // Salary is internal by default: publishing a budget range is a
                // deliberate choice, not something that leaks by omission.
                setShowSalary(false);
            })
            .catch((err: unknown) => { if (alive) setError(apiDetail(err, "Failed to load requirement")); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [id]);

    const skillList = useMemo(
        () => draft.skills.split(",").map(s => s.trim()).filter(Boolean),
        [draft.skills]
    );

    const handlePost = async () => {
        setError("");
        if (!draft.title.trim()) { setError("Job title is required."); return; }
        if (!draft.description.trim()) { setError("Job description is required."); return; }

        setPosting(true);
        try {
            const published = await websiteJobPostingApi.publish({
                requirement_id: id,
                req_id: req?.req_id || null,
                title: draft.title.trim(),
                company: draft.company.trim() || null,
                location: draft.location.trim() || null,
                employment_type: draft.employment_type.trim() || null,
                work_mode: draft.work_mode.trim() || null,
                experience: draft.experience.trim() || null,
                openings: draft.openings ? Number.parseInt(draft.openings, 10) || null : null,
                salary_range: showSalary ? draft.salary_range.trim() || null : null,
                skills: skillList,
                description: draft.description.trim(),
                apply_email: draft.apply_email.trim() || null,
            });
            setResult(published);
        } catch (err: unknown) {
            setError(apiDetail(err, "Failed to post to the website"));
        } finally {
            setPosting(false);
        }
    };

    if (loading) {
        return <div className="requirement-create-page"><div className="loading-spinner">Loading requirement…</div></div>;
    }

    return (
        <div className="requirement-create-page">
            <BackButton to={`/requirements/${id}`} label="Back to requirement" />
            <div className="page-header">
                <div>
                    <h1>Post to Website</h1>
                    <p className="page-header-sub">
                        {req?.req_id ? `${req.req_id} · ` : ""}
                        Review and edit the job description below, then publish it to the careers site.
                    </p>
                </div>
            </div>

            {error && <div className="form-error" style={{ marginBottom: "1rem" }}>{error}</div>}

            {result && (
                <div
                    className={result.simulated ? "form-error" : "form-success"}
                    style={{ marginBottom: "1rem", display: "flex", flexDirection: "column", gap: 6 }}
                >
                    <strong>
                        {result.simulated
                            ? "Not published - the website integration is not configured"
                            : "Published to the website"}
                    </strong>
                    {result.detail && <span>{result.detail}</span>}
                    <span>
                        {result.simulated ? "It would appear at: " : "Live at: "}
                        <a href={result.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                            {result.url} <Icon name="external" size={12} />
                        </a>
                    </span>
                </div>
            )}

            <div className="requirement-create-layout">
                <form
                    className="dash-form requirement-create-form"
                    onSubmit={(e) => { e.preventDefault(); void handlePost(); }}
                >
                    <div className="form-sections-grid">
                        <div className="form-section">
                            <div className="form-section-title">Posting details</div>
                            <Field label="Job Title *">
                                <input type="text" value={draft.title}
                                    onChange={(e) => set("title", e.target.value)}
                                    placeholder="e.g. Senior Backend Engineer" required />
                            </Field>
                            <Field label="Company">
                                <input type="text" value={draft.company}
                                    onChange={(e) => set("company", e.target.value)} />
                            </Field>
                            <div className="form-row">
                                <Field label="Location">
                                    <input type="text" value={draft.location}
                                        onChange={(e) => set("location", e.target.value)} />
                                </Field>
                                <Field label="Work Mode">
                                    <input type="text" value={draft.work_mode}
                                        onChange={(e) => set("work_mode", e.target.value)}
                                        placeholder="Remote / Hybrid / On-site" />
                                </Field>
                            </div>
                            <div className="form-row">
                                <Field label="Employment Type">
                                    <input type="text" value={draft.employment_type}
                                        onChange={(e) => set("employment_type", e.target.value)} />
                                </Field>
                                <Field label="Experience">
                                    <input type="text" value={draft.experience}
                                        onChange={(e) => set("experience", e.target.value)}
                                        placeholder="e.g. 5 - 8 years" />
                                </Field>
                            </div>
                            <div className="form-row">
                                <Field label="Openings">
                                    <input type="number" min={1} value={draft.openings}
                                        onChange={(e) => set("openings", e.target.value)} />
                                </Field>
                                <Field label="Apply Email"
                                    hint="Shown on the posting for candidate replies. Optional.">
                                    <input type="email" value={draft.apply_email}
                                        onChange={(e) => set("apply_email", e.target.value)}
                                        placeholder="careers@company.com" />
                                </Field>
                            </div>
                        </div>

                        <div className="form-section">
                            <div className="form-section-title">Visibility</div>
                            <Field label="Skills"
                                hint="Comma-separated. These render as tags on the posting.">
                                <input type="text" value={draft.skills}
                                    onChange={(e) => set("skills", e.target.value)}
                                    placeholder="React, TypeScript, Node.js" />
                            </Field>
                            <div className="form-group">
                                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                                    <input type="checkbox" checked={showSalary}
                                        onChange={(e) => setShowSalary(e.target.checked)}
                                        style={{ width: "auto", margin: 0 }} />
                                    Show salary range on the public posting
                                </label>
                                <span className="requirement-side-note">
                                    The requirement's budget range is internal. It is only sent to the website
                                    when this is ticked.
                                </span>
                            </div>
                            {showSalary && (
                                <Field label="Salary Range">
                                    <input type="text" value={draft.salary_range}
                                        onChange={(e) => set("salary_range", e.target.value)}
                                        placeholder="e.g. 25 - 35 LPA" />
                                </Field>
                            )}
                            {skillList.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                                    {skillList.map(s => (
                                        <span key={s} style={{
                                            fontSize: 12, fontWeight: 600, padding: "3px 10px",
                                            borderRadius: 999, background: "var(--twd-surface2, rgba(127,127,127,0.12))",
                                            border: "1px solid var(--border-subtle)",
                                        }}>{s}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="form-section form-section--full">
                        <div className="form-section-title">Job Description</div>
                        <textarea
                            value={draft.description}
                            onChange={(e) => set("description", e.target.value)}
                            rows={20}
                            placeholder="The job description candidates will read on the website…"
                            style={{
                                width: "100%", padding: "0.75rem", borderRadius: "8px",
                                border: "1px solid var(--border-subtle)", background: "var(--bg-primary)",
                                color: "var(--fg-primary)", fontFamily: "inherit", lineHeight: 1.6,
                                resize: "vertical",
                            }}
                        />
                        <span className="requirement-side-note">
                            Edits here only change what is published. The requirement's own JD is left untouched.
                        </span>
                    </div>

                    <div className="form-actions">
                        <button type="submit" className="btn btn-primary" disabled={posting}>
                            <Icon name="send" size={14} />
                            {posting ? "Posting…" : result ? "Post again" : "Post to Website"}
                        </button>
                        <button type="button" className="btn btn-ghost" disabled={posting}
                            onClick={() => navigate(`/requirements/${id}`)}>
                            Cancel
                        </button>
                        {req && (
                            <button type="button" className="btn btn-ghost" disabled={posting}
                                onClick={() => { setDraft(draftFromRequirement(req)); setError(""); }}>
                                <Icon name="refresh" size={14} /> Reset to requirement
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
