import { useState, useEffect, useRef } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useNavigate, useParams } from "../lib/router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import Icon from "../components/Icon";
import SkillGroupEditor, { skillReqsFromRequirement, type SkillReq } from "../components/SkillGroupEditor";
import BackButton from "../components/BackButton";
import RequirementVisibilityPicker, { type VisibilityChoice } from "../components/RequirementVisibilityPicker";
import "../styles/pages.css";

// Standalone client picker (mirrors RequirementCreate's combobox so the edit
// page looks identical). Duplicated intentionally - the two pages are kept as
// separate copies.
function ClientCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [clients, setClients] = useState<string[]>([]);

    useEffect(() => {
        const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const dedupe = (low: string[], high: string[] = []) => {
            const m = new Map<string, string>();
            for (const n of low) m.set(toSlug(n), n);
            for (const n of high) m.set(toSlug(n), n);
            return [...m.values()].sort();
        };
        api.get("/clients/my-companies")
            .then(({ companies, all_access }: { companies: string[]; all_access: boolean }) => {
                if (all_access) {
                    api.get("/requirements")
                        .then((reqs: any[]) => setClients(dedupe(companies, (reqs || []).map((r: any) => r.company_name).filter(Boolean))))
                        .catch(() => setClients(dedupe(companies)));
                } else {
                    setClients(dedupe(companies));
                }
            })
            .catch(() => { });
    }, []);

    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required
            style={{ width: "100%" }}
        >
            <option value="" disabled>Select a company</option>
            {clients.map(c => (
                <option key={c} value={c}>{c}</option>
            ))}
        </select>
    );
}

const REQUIREMENT_TYPE_SUGGESTIONS = [
    { label: "Full Time", value: "FULL_TIME" },
    { label: "Contract", value: "CONTRACT" },
    { label: "Contract to Hire", value: "CONTRACT_TO_HIRE" },
    { label: "Internship", value: "INTERNSHIP" },
];
const MODE_OF_WORK_OPTIONS = ["Remote", "On-site", "Hybrid"];
const STATUS_OPTIONS = ["OPEN", "ON_HOLD", "CLOSED"];

const EMPTY_FORM = {
    company_name: "", requirement_name: "", jd: "", special_instructions: "",
    requirement_type: "", role_type: "", location: "", notice_period: "",
    years_of_experience: "", max_years_experience: "", mode_of_work: "",
    client_spoc_name: "", sla_hours_to_first_submission: "48", no_of_positions: "",
    budget_range: "", assessment_required: false, status: "OPEN",
};

export default function RequirementEdit() {
    useDocumentTitle("Edit Requirement");
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const queryClient = useQueryClient();
    // Kept out of `form` for the same reason as the create page: visible_to is a
    // string[], while `update()` is typed for the flat string/boolean fields.
    const [visibility, setVisibility] = useState<VisibilityChoice>("ALL");
    const [visibleTo, setVisibleTo] = useState<string[]>([]);

    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [skillReqs, setSkillReqs] = useState<SkillReq[]>([]);
    const [parsedSkills, setParsedSkills] = useState<string[]>([]);
    // AI assessment questions produced by a JD (re)parse - saved with the requirement.
    const [aiQuestions, setAiQuestions] = useState<any[]>([]);
    const [reqId, setReqId] = useState<string>("");      // human code (TWxxx) for the header
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const update = (field: string, value: string | boolean) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    // Load existing requirement and prefill the form + skills editor.
    useEffect(() => {
        if (!id) return;
        let alive = true;
        api.get(`/requirements/${id}`)
            .then((req: any) => {
                if (!alive) return;
                setReqId(req.req_id || "");
                setForm({
                    company_name: req.company_name || "",
                    requirement_name: req.requirement_name || "",
                    jd: req.jd || "",
                    special_instructions: req.special_instructions || "",
                    requirement_type: req.requirement_type || "",
                    role_type: req.role_type || "",
                    location: req.location || "",
                    notice_period: req.notice_period || "",
                    years_of_experience: req.years_of_experience != null ? String(req.years_of_experience) : "",
                    max_years_experience: req.max_years_experience != null ? String(req.max_years_experience) : "",
                    mode_of_work: req.mode_of_work || "",
                    client_spoc_name: req.client_spoc_name || "",
                    sla_hours_to_first_submission: req.sla_hours_to_first_submission != null ? String(req.sla_hours_to_first_submission) : "48",
                    no_of_positions: req.no_of_positions != null ? String(req.no_of_positions) : "",
                    budget_range: req.budget_range || "",
                    assessment_required: !!req.assessment_required,
                    status: req.status || "OPEN",
                });
                setVisibility(req.visibility === "RESTRICTED" ? "RESTRICTED" : "ALL");
                setVisibleTo((req.visible_to || []).map((u: any) => String(u)));
                setSkillReqs(skillReqsFromRequirement(req));
                setParsedSkills(req.all_skills || []);
            })
            .catch((e: any) => setError(e?.detail || "Failed to load requirement"))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [id]);

    // Seed the skills editor from a parser result, preserving any rows already present.
    const seedFromParsed = (all?: string[], must?: string[], good?: string[]) => {
        const goodSet = new Set((good || []).map((s) => (s || "").toLowerCase().trim()));
        const base = (all && all.length) ? all : [...(must || []), ...(good || [])];
        const existing = new Set(skillReqs.flatMap((r) => [r.label.toLowerCase(), ...r.members.map((m) => m.toLowerCase())]));
        const additions: SkillReq[] = [];
        const seen = new Set<string>();
        base.forEach((s) => {
            const k = (s || "").toLowerCase().trim();
            if (s && s.trim() && !existing.has(k) && !seen.has(k)) {
                seen.add(k);
                additions.push({ label: s.trim(), tier: goodSet.has(k) ? "good" : "must", members: [] });
            }
        });
        if (additions.length) setSkillReqs((rs) => [...rs, ...additions]);
        setParsedSkills((prev) => Array.from(new Set([...prev, ...(all || [])])));
    };

    const applyParsedFields = (parsed: any) => {
        setForm((prev) => ({
            ...prev,
            company_name: prev.company_name || parsed.company_name || "",
            requirement_name: prev.requirement_name || parsed.requirement_name || "",
            requirement_type: prev.requirement_type || parsed.requirement_type || "",
            role_type: prev.role_type || parsed.role_type || "",
            location: prev.location || parsed.location || "",
            notice_period: prev.notice_period || parsed.notice_period || "",
            years_of_experience: prev.years_of_experience || parsed.years_of_experience || "",
            mode_of_work: prev.mode_of_work || parsed.mode_of_work || "",
            jd: parsed.jd_text || prev.jd,
        }));
        seedFromParsed(parsed?.all_skills, parsed?.must_have_skills, parsed?.good_to_have_skills);
        if (Array.isArray(parsed?.assessment_questions) && parsed.assessment_questions.length) {
            setAiQuestions(parsed.assessment_questions);
        }
    };

    // Parse the pasted JD text (manual fallback when AI file parsing failed).
    const handleParseText = async () => {
        if (!form.jd.trim()) { setError("Paste some JD text first."); return; }
        setError(""); setNotice(""); setParsing(true);
        try {
            const parsed = await api.post("/requirements/parse-jd-text", { jd_text: form.jd });
            applyParsedFields(parsed);
            const n = (parsed?.all_skills || []).length;
            const qn = (parsed?.assessment_questions || []).length;
            const parts = [n ? `${n} skill(s)` : "", qn ? `${qn} assessment question(s)` : ""].filter(Boolean);
            setNotice(parts.length
                ? `Parsed JD - ${parts.join(" and ")} added. They save when you click Save Changes.`
                : "Parsed, but nothing was detected. Add skills manually below.");
        } catch (e: any) {
            setError(e?.detail || "Could not parse the JD text. Add skills manually below.");
        } finally {
            setParsing(false);
        }
    };

    const handleParseFile = async (file: File | null) => {
        if (!file) return;
        setError(""); setNotice(""); setParsing(true);
        try {
            const payload = new FormData();
            payload.append("jd_file", file);
            const parsed = await api.post("/requirements/parse-jd-file", payload);
            applyParsedFields(parsed);
            setNotice(`Parsed "${file.name}" - fields and skills updated where empty.`);
        } catch (e: any) {
            setError(e?.detail || "Failed to parse JD file. Add skills manually below.");
        } finally {
            setParsing(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(""); setSaving(true);
        try {
            const payload = {
                company_name: form.company_name,
                requirement_name: form.requirement_name,
                jd: form.jd || null,
                special_instructions: form.special_instructions || null,
                requirement_type: form.requirement_type || null,
                role_type: form.role_type || null,
                client_spoc_name: form.client_spoc_name || null,
                sla_hours_to_first_submission: Number.parseInt(form.sla_hours_to_first_submission || "48", 10) || 48,
                location: form.location || null,
                notice_period: form.notice_period || null,
                years_of_experience: form.years_of_experience || null,
                max_years_experience: form.max_years_experience || null,
                mode_of_work: form.mode_of_work || null,
                no_of_positions: form.no_of_positions ? parseInt(form.no_of_positions, 10) : null,
                budget_range: form.budget_range || null,
                assessment_required: form.assessment_required,
                status: form.status,
                visibility: visibility || "ALL",
                visible_to: visibility === "RESTRICTED" ? visibleTo : [],
                skill_requirements: skillReqs,
                // Only sent when a JD parse produced questions - the PATCH stores
                // them as the requirement's assessment_config. Omitted otherwise so
                // existing questions are never wiped.
                ...(aiQuestions.length ? { assessment_questions: aiQuestions } : {}),
            };
            await api.patch(`/requirements/${id}`, payload);
            queryClient.invalidateQueries({ queryKey: ["requirements"] });
            queryClient.invalidateQueries({ queryKey: ["my-companies"] });
            navigate(`/requirements/${id}`);
        } catch (err: any) {
            setError(err?.detail || "Failed to save changes");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="requirement-create-page"><div className="loading-spinner">Loading requirement…</div></div>;
    }

    return (
        <div className="requirement-create-page">
            <BackButton />
            <div className="page-header">
                <div>
                    <h1>Edit Requirement</h1>
                    <p className="page-header-sub">{reqId ? `${reqId} · ` : ""}Update fields and skills - this updates the same requirement.</p>
                </div>
            </div>

            {error && <div className="form-error" style={{ marginBottom: "1rem" }}>{error}</div>}
            {notice && <div className="form-success" style={{ marginBottom: "1rem" }}>{notice}</div>}

            <div className="requirement-create-layout">
                <form className="dash-form requirement-create-form" onSubmit={handleSubmit}>

                    {/* Job Description - paste + parse controls */}
                    <div className="form-section form-section--full">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                            <div className="form-section-title" style={{ border: "none", padding: 0 }}>Job Description</div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <input ref={fileInputRef} type="file"
                                    accept=".pdf,.doc,.docx,.txt,.rtf"
                                    style={{ display: "none" }}
                                    onChange={(e) => void handleParseFile(e.target.files?.[0] || null)} />
                                <button type="button" className="btn btn-ghost btn-sm" disabled={parsing}
                                    onClick={() => fileInputRef.current?.click()}>
                                    <Icon name="document" size={13} /> Upload & parse
                                </button>
                                <button type="button" className="btn btn-primary btn-sm" disabled={parsing || !form.jd.trim()}
                                    onClick={() => void handleParseText()}>
                                    {parsing ? "Parsing…" : "Parse JD"}
                                </button>
                            </div>
                        </div>
                        <textarea
                            placeholder="Paste the complete job description here, then click Parse JD to extract skills (or add them manually below)…"
                            value={form.jd}
                            onChange={(e) => update("jd", e.target.value)}
                            rows={7}
                            style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-primary)", color: "var(--fg-primary)", fontFamily: "inherit", resize: "vertical" }}
                        />
                        <span className="requirement-side-note">
                            If AI parsing fails or finds nothing, you can still add and group skills by hand below - the skills editor works without parsing.
                        </span>
                    </div>

                    <div className="form-sections-grid">

                        {/* Section 1: Client & Requirement Info */}
                        <div className="form-section">
                            <div className="form-section-title">Section 1: Client &amp; Requirement Info</div>
                            <div className="form-group">
                                <label>Company Name *</label>
                                <ClientCombobox value={form.company_name} onChange={(v) => update("company_name", v)} />
                            </div>
                            <div className="form-group">
                                <label>Requirement Name *</label>
                                <input type="text" placeholder="e.g. Senior Backend Architect" value={form.requirement_name}
                                    onChange={(e) => update("requirement_name", e.target.value)} required />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Client SPOC Name</label>
                                    <input type="text" placeholder="e.g. Sarah Jenkins" value={form.client_spoc_name}
                                        onChange={(e) => update("client_spoc_name", e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Status</label>
                                    <select value={form.status} onChange={(e) => update("status", e.target.value)}>
                                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Job Specifics */}
                        <div className="form-section">
                            <div className="form-section-title">Section 2: Job Specifics</div>
                            <div className="form-group">
                                <label>Requirement Type</label>
                                <select value={form.requirement_type} onChange={(e) => update("requirement_type", e.target.value)}>
                                    <option value="">Select type</option>
                                    {REQUIREMENT_TYPE_SUGGESTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Role Type</label>
                                    <input type="text" placeholder="e.g. Individual Contributor" value={form.role_type}
                                        onChange={(e) => update("role_type", e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Mode of Work</label>
                                    <select value={form.mode_of_work} onChange={(e) => update("mode_of_work", e.target.value)}>
                                        <option value="">Select Mode</option>
                                        {MODE_OF_WORK_OPTIONS.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Location</label>
                                <input type="text" placeholder="City, State or Country" value={form.location}
                                    onChange={(e) => update("location", e.target.value)} />
                            </div>
                        </div>

                        {/* Section 3: Required Skills */}
                        <div className="form-section form-section--full">
                            <div className="form-section-title">Section 3: Required Skills</div>
                            <span className="requirement-side-note">
                                Click chips to select, move between <strong>Mandatory / Good-to-have</strong>, or <strong>Group</strong>
                                related skills (met if the candidate has <strong>any one</strong>). Drag a chip to move or group it, or add new skills with the bar above.
                            </span>
                            <SkillGroupEditor value={skillReqs} onChange={setSkillReqs} suggestions={parsedSkills} />
                        </div>

                        {/* Section 4: Candidate Specifications */}
                        <div className="form-section">
                            <div className="form-section-title">Section 4: Candidate Specifications</div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Min Experience (Yrs)</label>
                                    <input type="text" placeholder="e.g. 5" value={form.years_of_experience}
                                        onChange={(e) => update("years_of_experience", e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Max Experience (Yrs)</label>
                                    <input type="text" placeholder="e.g. 10" value={form.max_years_experience}
                                        onChange={(e) => update("max_years_experience", e.target.value)} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Notice Period</label>
                                    <input type="text" placeholder="e.g. 30 Days" value={form.notice_period}
                                        onChange={(e) => update("notice_period", e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>No. of Positions</label>
                                    <input type="number" min={1} step={1} placeholder="1" value={form.no_of_positions}
                                        onChange={(e) => update("no_of_positions", e.target.value)} />
                                </div>
                            </div>
                        </div>

                        {/* Section 5: Budget & Timeline */}
                        <div className="form-section">
                            <div className="form-section-title">Section 5: Budget &amp; Timeline</div>
                            <div className="form-group">
                                <label>Budget Range</label>
                                <input type="text" placeholder="e.g. 15–25 LPA" value={form.budget_range}
                                    onChange={(e) => update("budget_range", e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>SLA to First Submission (Hours)</label>
                                <input type="number" min={1} step={1} value={form.sla_hours_to_first_submission}
                                    onChange={(e) => update("sla_hours_to_first_submission", e.target.value)} />
                            </div>
                        </div>

                        <RequirementVisibilityPicker
                            visibility={visibility}
                            visibleTo={visibleTo}
                            note="Takes effect as soon as you save."
                            onChange={({ visibility: v, visible_to }) => {
                                setVisibility(v);
                                setVisibleTo(visible_to);
                            }}
                        />

                        {/* Special Instructions + assessment gate (full width) */}
                        <div className="form-section form-section--full">
                            <div className="form-group">
                                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                                    <input type="checkbox" checked={form.assessment_required}
                                        onChange={(e) => update("assessment_required", e.target.checked)} style={{ width: 16, height: 16 }} />
                                    Require candidate summary report before submission
                                </label>
                            </div>
                            <div className="form-group">
                                <label>Special Instructions</label>
                                <textarea placeholder="Any special notes for recruiters..." value={form.special_instructions}
                                    onChange={(e) => update("special_instructions", e.target.value)} rows={5} />
                            </div>
                        </div>
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => navigate(`/requirements/${id}`)}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
