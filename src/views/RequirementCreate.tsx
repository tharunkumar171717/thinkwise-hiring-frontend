import { useState, useEffect, useRef } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useNavigate, useSearchParams } from "../lib/router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import Icon from "../components/Icon";
import SkillGroupEditor, { type SkillReq } from "../components/SkillGroupEditor";
import RequirementVisibilityPicker, { type VisibilityChoice } from "../components/RequirementVisibilityPicker";
import "../styles/pages.css";
import "../styles/dashboard.css";

function ClientCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [clients, setClients] = useState<string[]>([]);

    useEffect(() => {
        // Deduplicate company names by slug, with high-priority names overwriting low-priority ones.
        // This ensures "Cohere Health" (from requirements) beats "cohere health" (from API cache).
        const dedupeBySlug = (lowPriority: string[], highPriority: string[] = []): string[] => {
            const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const slugToName = new Map<string, string>();
            for (const n of lowPriority) slugToName.set(toSlug(n), n);
            for (const n of highPriority) slugToName.set(toSlug(n), n);
            return [...slugToName.values()].sort();
        };

        api.get("/clients/my-companies")
            .then(({ companies, all_access }: { companies: string[]; all_access: boolean }) => {
                if (all_access) {
                    // Super admin: merge assigned list with all existing requirement companies.
                    // Requirements names take precedence (proper casing) over API cache names.
                    api.get("/requirements")
                        .then((reqs: any[]) => {
                            const reqNames = (reqs || []).map((r: any) => r.company_name).filter(Boolean) as string[];
                            setClients(dedupeBySlug(companies, reqNames));
                        })
                        .catch(() => setClients(dedupeBySlug(companies)));
                } else {
                    setClients(dedupeBySlug(companies));
                }
            })
            .catch(() => {
                api.get("/requirements")
                    .then((reqs: any[]) => {
                        const names = (reqs || []).map((r: any) => r.company_name).filter(Boolean) as string[];
                        setClients(dedupeBySlug(names));
                    })
                    .catch(() => { });
            });
    }, []);

    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
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

const MODE_OF_WORK_OPTIONS = [
    "Remote",
    "On-site",
    "Hybrid",
];

const INITIAL_FORM = {
    company_name: "",
    requirement_name: "",
    jd: "",
    special_instructions: "",
    requirement_type: "",
    role_type: "",
    location: "",
    notice_period: "",
    years_of_experience: "",
    max_years_experience: "",
    mode_of_work: "",
    client_spoc_name: "",
    sla_hours_to_first_submission: "48",
    no_of_positions: "",
    budget_range: "",
    assessment_required: false,
};

type ParsedJdPreview = {
    jd_text: string;
    all_skills?: string[];
    must_have_skills?: string[];
    good_to_have_skills?: string[];
    important_information?: Array<{ label: string; any_of: string[] }>;
    company_name?: string;
    requirement_name?: string;
    requirement_type?: string;
    role_type?: string;
    location?: string;
    notice_period?: string;
    years_of_experience?: string;
    mode_of_work?: string;
};

const SKILL_PREFERENCE_OPTIONS = [
    "Strongly required",
    "Good working knowledge",
    "Basics enough",
];

const SKILL_PREFERENCE_HEADER = "Skill Preferences:";

// Assessment question - same shape the per-requirement assessment editor uses,
// so the collected questions can be saved via /assessment-config after create.
type Question = {
    id: string; type: "voice" | "text"; category?: string; prompt: string;
    hint?: string; required?: boolean; min_seconds?: number; max_seconds?: number;
    max_words?: number; skills?: string[];
};

const qCard: React.CSSProperties = {
    border: "1px solid var(--twd-line2)", borderRadius: 14, padding: "1.1rem 1.25rem",
    marginBottom: 14, background: "var(--twd-surface2)",
};
const qInput: React.CSSProperties = {
    border: "1px solid var(--twd-line)", borderRadius: 10, padding: "9px 12px",
    background: "var(--twd-surface)", color: "var(--twd-ink)",
    fontSize: 14, fontFamily: "inherit", lineHeight: 1.5,
};

const STEPS = ["Job Description", "Client & Job Info", "Candidate & Budget", "Skills", "Questions"];

const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function RequirementCreate() {
    useDocumentTitle("Create Requirement");
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [parsingJd, setParsingJd] = useState(false);
    const [jdFile, setJdFile] = useState<File | null>(null);
    const [parsedJd, setParsedJd] = useState<ParsedJdPreview | null>(null);
    const [activeSkill, setActiveSkill] = useState<string | null>(null);
    const [skillPreferences, setSkillPreferences] = useState<Record<string, string>>({});
    const [step, setStep] = useState(0);
    // Confidentiality lives outside `form` because visible_to is a string[], and the
    // generic `update()` helper is typed for the flat string/boolean form fields.
    // Starts unset on purpose: choosing an audience is mandatory, so there is no
    // default that could be accepted by simply clicking past the step.
    const [visibility, setVisibility] = useState<VisibilityChoice>("");
    const [visibleTo, setVisibleTo] = useState<string[]>([]);
    const [visibilityInvalid, setVisibilityInvalid] = useState(false);

    // Canonical grouped skill structure the recruiter edits at creation. Each row
    // is a single skill or a group (members; any-one-member match suffices). Tier
    // is chosen per row. This is what gets sent + drives resume analysis.
    const [skillReqs, setSkillReqs] = useState<SkillReq[]>([]);

    // Assessment questions collected in the wizard's last step; saved to the
    // requirement's assessment-config right after creation.
    const [questions, setQuestions] = useState<Question[]>([]);

    const addQuestion = (type: "voice" | "text") =>
        setQuestions((qs) => [...qs, {
            id: `q_custom_${Date.now()}`, type, category: "custom", prompt: "", hint: "", required: true,
            ...(type === "voice" ? { min_seconds: 0, max_seconds: 120 } : { max_words: 200 }),
        }]);
    const updateQ = (i: number, patch: Partial<Question>) =>
        setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
    const removeQ = (i: number) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));
    const moveQ = (i: number, dir: -1 | 1) =>
        setQuestions((qs) => {
            const j = i + dir;
            if (j < 0 || j >= qs.length) return qs;
            const next = [...qs];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });

    // Seed from the full JD skill list so every parsed skill is present to tier &
    // group. Skills the parser marked good-to-have default to that tier; the rest
    // default to Mandatory. The recruiter then re-tiers / groups as needed.
    const seedSkillReqs = (all?: string[], must?: string[], good?: string[]) => {
        const goodSet = new Set((good || []).map((s) => (s || "").toLowerCase().trim()));
        const base = (all && all.length) ? all : [...(must || []), ...(good || [])];
        const seen = new Set<string>();
        const rows: SkillReq[] = [];
        base.forEach((s) => {
            const k = (s || "").toLowerCase().trim();
            if (s && s.trim() && !seen.has(k)) {
                seen.add(k);
                rows.push({ label: s.trim(), tier: goodSet.has(k) ? "good" : "must", members: [] });
            }
        });
        setSkillReqs(rows);
    };
    const [form, setForm] = useState(() => ({
        ...INITIAL_FORM,
        company_name: searchParams.get("client") || "",
    }));
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [editingSpecialInstructions, setEditingSpecialInstructions] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const update = (field: string, value: string | boolean) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const buildSpecialInstructions = (manualText: string, preferences: Record<string, string>) => {
        const lines = Object.entries(preferences).map(([skill, preference]) => `- ${skill}: ${preference}`);
        if (!lines.length) return manualText;
        const prefsBlock = `${SKILL_PREFERENCE_HEADER}\n${lines.join("\n")}`;
        const manual = manualText.trim();
        return manual ? `${manual}\n\n${prefsBlock}` : prefsBlock;
    };

    const extractManualInstructions = (value: string) => {
        const marker = `\n\n${SKILL_PREFERENCE_HEADER}\n`;
        const markerIndex = value.indexOf(marker);
        if (markerIndex >= 0) return value.slice(0, markerIndex);
        if (value.startsWith(`${SKILL_PREFERENCE_HEADER}\n`)) return "";
        const inlineMarkerIndex = value.indexOf(`${SKILL_PREFERENCE_HEADER}\n`);
        if (inlineMarkerIndex >= 0) return value.slice(0, inlineMarkerIndex).trimEnd();
        return value;
    };

    const specialInstructionsValue = buildSpecialInstructions(
        form.special_instructions,
        skillPreferences
    );

    const handleJdFileChange = async (file: File | null) => {
        setError("");
        setParsedJd(null);
        setActiveSkill(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);

        if (!file) {
            setJdFile(null);
            setSkillPreferences({});
            return;
        }

        setJdFile(file);
        if (file.type === "application/pdf") {
            setPreviewUrl(URL.createObjectURL(file));
        }

        setParsingJd(true);
        try {
            const payload = new FormData();
            payload.append("jd_file", file);
            const parsed = await api.post("/requirements/parse-jd-file", payload);
            applyParsedJd(parsed);
        } catch (err: any) {
            setError(err.detail || "Failed to parse JD file");
        } finally {
            setParsingJd(false);
        }
    };

    // Shared prefill: apply a parsed JD (from file OR pasted text) to the form,
    // prune stale skill preferences and seed the editable skills list.
    const applyParsedJd = (parsed: ParsedJdPreview) => {
        setParsedJd(parsed);
        setForm((prev) => ({
            ...prev,
            company_name: parsed.company_name || prev.company_name,
            requirement_name: parsed.requirement_name || prev.requirement_name,
            requirement_type: parsed.requirement_type || prev.requirement_type,
            role_type: parsed.role_type || prev.role_type,
            location: parsed.location || prev.location,
            notice_period: parsed.notice_period || prev.notice_period,
            years_of_experience: parsed.years_of_experience || prev.years_of_experience,
            mode_of_work: parsed.mode_of_work || prev.mode_of_work,
            jd: parsed.jd_text || prev.jd,
        }));

        const parsedSkills = new Set(parsed?.all_skills || []);
        setSkillPreferences((prev) =>
            Object.fromEntries(
                Object.entries(prev).filter(([skill]) => parsedSkills.has(skill))
            )
        );
        // Seed the editable skills list from the full parsed skill list.
        seedSkillReqs(parsed?.all_skills, parsed?.must_have_skills, parsed?.good_to_have_skills);
    };

    // Parse a manually pasted JD (mirrors the file-upload flow via /parse-jd-text).
    const handleParseText = async () => {
        const text = form.jd.trim();
        if (!text || parsingJd) return;
        setError("");
        setParsingJd(true);
        try {
            const parsed = await api.post("/requirements/parse-jd-text", { jd_text: text });
            applyParsedJd(parsed);
        } catch (err: any) {
            setError(err.detail || "Failed to parse JD text");
        } finally {
            setParsingJd(false);
        }
    };

    const applySkillPreference = (skill: string, preference: string) => {
        setSkillPreferences((prev) => ({ ...prev, [skill]: preference }));
        setActiveSkill(null);
    };

    // Persist skills + questions to the new requirement's assessment config.
    // Returns false when the save fails so the caller can fall back to the editor.
    const saveAssessmentConfig = async (reqId: string) => {
        if (!skillReqs.length && !questions.length) return true;
        try {
            const skills = skillReqs.map((r) => ({
                skill: r.label,
                requirement: r.tier === "good" ? "Good to have" : "Mandatory",
                members: r.members,
            }));
            await api.put(`/requirements/${reqId}/assessment-config`, { skills, questions });
            return true;
        } catch {
            return false;
        }
    };

    const finishCreate = async (created: any) => {
        queryClient.invalidateQueries({ queryKey: ["requirements"] });
        queryClient.invalidateQueries({ queryKey: ["my-companies"] });
        const cfgSaved = await saveAssessmentConfig(created.id);
        if (form.assessment_required && (!cfgSaved || questions.length === 0)) {
            navigate(`/requirements/${created.id}/assessment/edit?onboarding=1`);
        } else {
            navigate(`/requirements/${created.id}`);
        }
    };

    // Step navigation with forward validation: you can't move past the
    // Client & Job Info step until its mandatory fields are filled. Backward
    // navigation is always allowed. Values (typed or auto-filled from the
    // parsed JD) live in parent state, so they persist across steps.
    const goToStep = (target: number) => {
        setError("");
        if (target > step && target > 1 && (!form.company_name.trim() || !form.requirement_name.trim())) {
            setError("Please fill Company Name and Requirement Name before continuing.");
            setStep(1);
            return;
        }
        // Visibility lives on this step and has no safe default - make the choice
        // explicit rather than letting a requirement default to workspace-wide.
        if (target > step && target > 1 && !visibility) {
            setError("Please choose who can see this requirement before continuing.");
            setVisibilityInvalid(true);
            setStep(1);
            return;
        }
        setStep(Math.max(0, Math.min(STEPS.length - 1, target)));
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        // Enter inside an input on an earlier step advances instead of creating.
        if (step < STEPS.length - 1) {
            goToStep(step + 1);
            return;
        }
        setError("");

        if (!form.company_name || !form.requirement_name) {
            setError("Company Name and Requirement Name are required.");
            setStep(1);
            return;
        }
        if (!visibility) {
            setError("Please choose who can see this requirement.");
            setVisibilityInvalid(true);
            setStep(1);
            return;
        }
        setLoading(true);

        try {
            if (jdFile) {
                const payload = new FormData();
                payload.append("company_name", form.company_name);
                payload.append("requirement_name", form.requirement_name);
                payload.append("special_instructions", specialInstructionsValue || "");
                payload.append("requirement_type", form.requirement_type || "");
                payload.append("role_type", form.role_type || "");
                payload.append("client_spoc_name", form.client_spoc_name || "");
                payload.append("sla_hours_to_first_submission", form.sla_hours_to_first_submission || "48");
                payload.append("location", form.location || "");
                payload.append("notice_period", form.notice_period || "");
                payload.append("years_of_experience", form.years_of_experience || "");
                payload.append("max_years_experience", form.max_years_experience || "");
                payload.append("mode_of_work", form.mode_of_work || "");
                if (form.no_of_positions) payload.append("no_of_positions", form.no_of_positions);
                payload.append("budget_range", form.budget_range || "");
                payload.append("visibility", visibility);
                if (visibility === "RESTRICTED" && visibleTo.length) {
                    payload.append("visible_to_json", JSON.stringify(visibleTo));
                }
                payload.append("assessment_required", String(form.assessment_required));
                payload.append("jd_file", jdFile);
                if (parsedJd?.all_skills?.length) {
                    payload.append("all_skills_json", JSON.stringify(parsedJd.all_skills));
                }
                if (skillReqs.length) {
                    payload.append("skill_requirements_json", JSON.stringify(skillReqs));
                }
                const created = await api.post("/requirements/from-file", payload);
                await finishCreate(created);
            } else {
                const payload = {
                    ...form,
                    jd: form.jd || null,
                    special_instructions: specialInstructionsValue || null,
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
                    visibility,
                    visible_to: visibility === "RESTRICTED" ? visibleTo : [],
                    skill_requirements: skillReqs,
                };
                const created = await api.post("/requirements", payload);
                await finishCreate(created);
            }
        } catch (err: any) {
            setError(err.detail || "Failed to create requirement");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="twd-scope">
            <div className="twd-head twd-head--tight twd-rise">
                <div>
                    <h1 className="twd-title"><span className="twd-title--accent">Create</span> Requirement</h1>
                    {/* <p className="twd-sub">Add a new hiring requirement</p> */}
                </div>
            </div>

            {/* Stepper */}
            <div className="twd-steps twd-rise" style={{ animationDelay: "0.05s" }}>
                {STEPS.map((label, i) => (
                    <button
                        key={label}
                        type="button"
                        className="twd-step"
                        data-state={i === step ? "active" : i < step ? "done" : "todo"}
                        onClick={() => goToStep(i)}
                        aria-current={i === step ? "step" : undefined}
                    >
                        <span className="twd-step-dot">
                            {i < step ? <Icon name="check" size={15} /> : i + 1}
                        </span>
                        <span className="twd-step-label">{label}</span>
                    </button>
                ))}
            </div>

            {error && <div className="form-error" style={{ marginBottom: "1rem" }}>{error}</div>}

            <div className="requirement-create-layout">
                <form
                    className="dash-form requirement-create-form"
                    onSubmit={handleSubmit}
                    onKeyDown={(e) => {
                        // No submit button exists (see the wizard nav below), so implicit
                        // submission never fires. Keep Enter-in-an-input advancing the step,
                        // but never let it create the requirement - that needs a real click.
                        const el = e.target as HTMLElement;
                        if (e.key !== "Enter" || el.tagName === "TEXTAREA" || el.tagName === "BUTTON") return;
                        e.preventDefault();
                        if (step < STEPS.length - 1) goToStep(step + 1);
                    }}
                >

                    {/* ── Step 1: Job Description ── */}
                    {step === 0 && (
                        <div className="form-section form-section--full">
                            <div className="form-section-title">Job Description</div>
                            <div className="jd-card-grid">
                                <div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".pdf,.doc,.docx,.txt,.rtf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/rtf"
                                        style={{ display: "none" }}
                                        onChange={(e) => void handleJdFileChange(e.target.files?.[0] || null)}
                                    />
                                    <div className="jd-dropzone" onClick={() => !parsingJd && fileInputRef.current?.click()}>
                                        <span style={{ color: "var(--text-secondary)", display: "inline-flex" }}><Icon name="document" size={26} /></span>
                                        {jdFile ? (
                                            <>
                                                <span style={{ fontWeight: 600, color: "var(--fg-primary)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{jdFile.name}</span>
                                                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                                    Click to change
                                                    {previewUrl && (
                                                        <>
                                                            {" · "}
                                                            <span style={{ color: "var(--twd-red-text)", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setShowPreview(true); }}>Preview</span>
                                                        </>
                                                    )}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <strong style={{ fontSize: 14, color: "var(--fg-primary)" }}>Drop your JD file here</strong>
                                                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Supports PDF, DOCX, TXT (Max 10MB)</span>
                                            </>
                                        )}
                                    </div>
                                    {parsingJd && jdFile && (
                                        <div className="jd-parse-status" style={{ marginTop: 8 }}>Analyzing JD and extracting tech stack...</div>
                                    )}
                                </div>
                                <div className="jd-or">OR</div>
                                <div>
                                    <textarea
                                        placeholder="Paste the complete job description here..."
                                        value={form.jd}
                                        onChange={(e) => update("jd", e.target.value)}
                                        style={{
                                            width: "100%", minHeight: 150,
                                            padding: "0.75rem", borderRadius: "8px",
                                            border: "1px solid var(--border-subtle)",
                                            background: "var(--bg-primary)", color: "var(--fg-primary)",
                                            fontFamily: "inherit", resize: "vertical",
                                        }}
                                    />
                                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 8 }}>
                                        {parsingJd && !jdFile && (
                                            <span className="jd-parse-status" style={{ margin: 0 }}>Analyzing JD and extracting tech stack...</span>
                                        )}
                                        <button
                                            type="button"
                                            className="twd-btn twd-btn-ghost twd-btn-sm"
                                            onClick={handleParseText}
                                            disabled={!form.jd.trim() || parsingJd}
                                            title="Extract company, role, skills and other fields from the pasted text"
                                        >
                                            <Icon name="sparkle" size={13} /> {parsingJd && !jdFile ? "Parsing…" : "Parse text"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Step 2: Client & Job Info ── */}
                    {step === 1 && (
                        <div className="form-sections-grid">
                            <div className="form-section">
                                <div className="form-section-title">Client &amp; Requirement Info</div>
                                <div className="form-group">
                                    <label>Company Name *</label>
                                    <ClientCombobox
                                        value={form.company_name}
                                        onChange={(v) => update("company_name", v)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Requirement Name *</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Senior Backend Architect"
                                        value={form.requirement_name}
                                        onChange={(e) => update("requirement_name", e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Client SPOC Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Sarah Jenkins"
                                        value={form.client_spoc_name}
                                        onChange={(e) => update("client_spoc_name", e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="form-section">
                                <div className="form-section-title">Job Specifics</div>
                                <div className="form-group">
                                    <label>Requirement Type</label>
                                    <select
                                        value={form.requirement_type}
                                        onChange={(e) => update("requirement_type", e.target.value)}
                                    >
                                        <option value="">Select type</option>
                                        {REQUIREMENT_TYPE_SUGGESTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Role Type</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Individual Contributor"
                                            value={form.role_type}
                                            onChange={(e) => update("role_type", e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Mode of Work</label>
                                        <select
                                            value={form.mode_of_work}
                                            onChange={(e) => update("mode_of_work", e.target.value)}
                                        >
                                            <option value="">Select Mode</option>
                                            {MODE_OF_WORK_OPTIONS.map((mode) => (
                                                <option key={mode} value={mode}>{mode}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Location</label>
                                    <input
                                        type="text"
                                        placeholder="City, State or Country"
                                        value={form.location}
                                        onChange={(e) => update("location", e.target.value)}
                                    />
                                </div>
                            </div>

                            <RequirementVisibilityPicker
                                visibility={visibility}
                                visibleTo={visibleTo}
                                invalid={visibilityInvalid}
                                onChange={({ visibility: v, visible_to }) => {
                                    setVisibility(v);
                                    setVisibleTo(visible_to);
                                    if (v) setVisibilityInvalid(false);
                                }}
                            />
                        </div>
                    )}

                    {/* ── Step 3: Candidate & Budget ── */}
                    {step === 2 && (
                        <div className="form-sections-grid">
                            <div className="form-section">
                                <div className="form-section-title">Candidate Specifications</div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Min Experience (Yrs)</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 5"
                                            value={form.years_of_experience}
                                            onChange={(e) => update("years_of_experience", e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Max Experience (Yrs)</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 10"
                                            value={form.max_years_experience}
                                            onChange={(e) => update("max_years_experience", e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Notice Period</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 30 Days"
                                            value={form.notice_period}
                                            onChange={(e) => update("notice_period", e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>No. of Positions</label>
                                        <input
                                            type="number"
                                            min={1}
                                            step={1}
                                            placeholder="1"
                                            value={form.no_of_positions}
                                            onChange={(e) => update("no_of_positions", e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="form-section">
                                <div className="form-section-title">Budget &amp; Timeline</div>
                                <div className="form-group">
                                    <label>Budget Range</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 15–25 LPA"
                                        value={form.budget_range}
                                        onChange={(e) => update("budget_range", e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>SLA to First Submission (Hours)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={form.sla_hours_to_first_submission}
                                        onChange={(e) => update("sla_hours_to_first_submission", e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="form-section form-section--full">
                                <div className="form-group">
                                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                                        <input
                                            type="checkbox"
                                            checked={form.assessment_required}
                                            onChange={(e) => update("assessment_required", e.target.checked)}
                                            style={{ width: 16, height: 16 }}
                                        />
                                        Require candidate summary report before submission
                                    </label>
                                    <span className="requirement-side-note">
                                        When on, a candidate cannot be submitted to the client until they have
                                        completed the self-assessment (link or recruiter fill-on-behalf).
                                    </span>
                                </div>

                                <div className="form-group">
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                                        <label style={{ margin: 0 }}>Special Instructions</label>
                                        {!editingSpecialInstructions ? (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                style={{ fontSize: 12, padding: "2px 10px" }}
                                                onClick={() => setEditingSpecialInstructions(true)}
                                            >
                                                <Icon name="edit" size={13} /> Edit
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                style={{ fontSize: 12, padding: "2px 10px", color: "var(--accent)" }}
                                                onClick={() => setEditingSpecialInstructions(false)}
                                            >
                                                Done
                                            </button>
                                        )}
                                    </div>
                                    {editingSpecialInstructions ? (
                                        <textarea
                                            placeholder="Any special notes for recruiters..."
                                            value={specialInstructionsValue}
                                            onChange={(e) =>
                                                update("special_instructions", extractManualInstructions(e.target.value))
                                            }
                                            rows={5}
                                            autoFocus
                                        />
                                    ) : specialInstructionsValue ? (
                                        <div
                                            style={{
                                                padding: "0.6rem 0.85rem", fontSize: 13,
                                                border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
                                                background: "var(--bg-secondary)", whiteSpace: "pre-wrap",
                                                color: "var(--text-primary)", cursor: "pointer", minHeight: 60,
                                            }}
                                            onClick={() => setEditingSpecialInstructions(true)}
                                            title="Click to edit"
                                        >
                                            {specialInstructionsValue}
                                        </div>
                                    ) : (
                                        <div
                                            style={{
                                                padding: "0.6rem 0.85rem", fontSize: 13,
                                                border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-sm)",
                                                color: "var(--text-muted)", cursor: "pointer", minHeight: 60,
                                                display: "flex", alignItems: "center",
                                            }}
                                            onClick={() => setEditingSpecialInstructions(true)}
                                        >
                                            Click to add special instructions for recruiters…
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Step 4: Skills ── */}
                    {step === 3 && (
                        <div className="form-section form-section--full">
                            <div className="form-section-title">Required Skills</div>
                            <span className="requirement-side-note">
                                Click chips to select, move between <strong>Mandatory / Good-to-have</strong>, or <strong>Group</strong>
                                related skills (met if the candidate has <strong>any one</strong>). Drag a chip to move or group it, or add new skills with the bar above.
                                These also become the skills the candidate self-rates in the assessment.
                            </span>
                            <SkillGroupEditor value={skillReqs} onChange={setSkillReqs} suggestions={parsedJd?.all_skills || []} />
                        </div>
                    )}

                    {/* ── Step 5: Assessment Questions ── */}
                    {step === 4 && (
                        <div className="form-section form-section--full">
                            <div className="form-section-title">Assessment Questions</div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
                                <div style={{ fontSize: 13, color: "var(--twd-soft)" }}>
                                    Questions the candidate answers in the self-assessment. Toggle <strong>Required</strong> to make one optional.
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button type="button" className="twd-btn twd-btn-ghost twd-btn-sm" onClick={() => addQuestion("voice")}>+ Audio</button>
                                    <button type="button" className="twd-btn twd-btn-ghost twd-btn-sm" onClick={() => addQuestion("text")}>+ Text</button>
                                </div>
                            </div>

                            {questions.length === 0 && (
                                <div style={{ fontSize: 13, color: "var(--twd-faint)", padding: "1.5rem", textAlign: "center", border: "1px dashed var(--twd-line)", borderRadius: 12 }}>
                                    No questions yet - add an audio or text question above. You can also skip this and set them up later from the requirement's Assessment menu.
                                </div>
                            )}

                            {questions.map((q, i) => (
                                <div key={q.id} style={qCard}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                                        <span style={{
                                            fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
                                            padding: "3px 9px", borderRadius: 999,
                                            background: q.type === "voice" ? "rgba(37,99,235,0.1)" : "var(--twd-green-bg)",
                                            color: q.type === "voice" ? "#2563eb" : "var(--twd-green)",
                                        }}>{q.type === "voice" ? "Audio" : "Text"}</span>
                                        <span style={{ fontSize: 12, color: "var(--twd-faint)" }}>Q{i + 1}</span>

                                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                                            {(() => {
                                                const on = q.required !== false;
                                                return (
                                                    <button type="button" onClick={() => updateQ(i, { required: !on })} title="Toggle required"
                                                        style={{
                                                            display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
                                                            border: "1px solid var(--twd-line)", background: "transparent",
                                                            borderRadius: 999, padding: "3px 6px 3px 10px", fontSize: 12, fontWeight: 600,
                                                            fontFamily: "inherit",
                                                            color: on ? "var(--twd-green)" : "var(--twd-faint)",
                                                        }}>
                                                        {on ? "Required" : "Optional"}
                                                        <span style={{
                                                            width: 30, height: 16, borderRadius: 999, position: "relative", flexShrink: 0,
                                                            background: on ? "var(--twd-green)" : "var(--twd-line)", transition: "background 0.15s",
                                                        }}>
                                                            <span style={{
                                                                position: "absolute", top: 2, left: on ? 16 : 2, width: 12, height: 12,
                                                                borderRadius: "50%", background: "#fff", transition: "left 0.15s",
                                                            }} />
                                                        </span>
                                                    </button>
                                                );
                                            })()}
                                            <button type="button" className="twd-icon-btn" style={{ width: 28, minHeight: 28 }} title="Move up" disabled={i === 0} onClick={() => moveQ(i, -1)}>↑</button>
                                            <button type="button" className="twd-icon-btn" style={{ width: 28, minHeight: 28 }} title="Move down" disabled={i === questions.length - 1} onClick={() => moveQ(i, 1)}>↓</button>
                                            <button type="button" className="twd-icon-btn twd-icon-btn--danger" style={{ width: 28, minHeight: 28 }} title="Remove" onClick={() => removeQ(i)}><Icon name="x" size={13} /></button>
                                        </div>
                                    </div>

                                    <textarea value={q.prompt} placeholder="Question prompt (what the candidate sees)…" rows={3}
                                        onChange={(e) => updateQ(i, { prompt: e.target.value })}
                                        style={{ ...qInput, width: "100%", resize: "vertical", marginBottom: 8, boxSizing: "border-box", minHeight: 76 }} />
                                    <input value={q.hint || ""} placeholder="Hint (optional)"
                                        onChange={(e) => updateQ(i, { hint: e.target.value })}
                                        style={{ ...qInput, width: "100%", marginBottom: 8, boxSizing: "border-box", color: "var(--twd-soft)" }} />

                                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--twd-soft)" }}>
                                            Type
                                            <select value={q.type} onChange={(e) => updateQ(i, { type: e.target.value as any })}
                                                style={{ ...qInput, padding: "5px 8px" }}>
                                                <option value="voice">Audio</option>
                                                <option value="text">Text</option>
                                            </select>
                                        </label>
                                        {q.type === "voice" ? (
                                            <>
                                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--twd-soft)" }}>
                                                    Min secs
                                                    <input type="number" min={0} value={q.min_seconds ?? 0} onChange={(e) => updateQ(i, { min_seconds: parseInt(e.target.value) || 0 })}
                                                        style={{ ...qInput, width: 70, padding: "5px 8px" }} />
                                                </label>
                                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--twd-soft)" }}>
                                                    Max secs
                                                    <input type="number" min={1} value={q.max_seconds ?? 120} onChange={(e) => updateQ(i, { max_seconds: parseInt(e.target.value) || 120 })}
                                                        style={{ ...qInput, width: 70, padding: "5px 8px" }} />
                                                </label>
                                            </>
                                        ) : (
                                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--twd-soft)" }}>
                                                Max words
                                                <input type="number" min={1} value={q.max_words ?? 200} onChange={(e) => updateQ(i, { max_words: parseInt(e.target.value) || 200 })}
                                                    style={{ ...qInput, width: 80, padding: "5px 8px" }} />
                                            </label>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Wizard navigation ── */}
                    <div className="form-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <button
                            type="button"
                            className="twd-btn twd-btn-ghost"
                            onClick={() => {
                                // Came from a client page (?client=…) → return to that client.
                                const fromClient = searchParams.get("client");
                                navigate(fromClient ? `/dashboard/${toSlug(fromClient)}` : "/dashboard");
                            }}
                        >
                            Cancel
                        </button>
                        <div style={{ display: "flex", gap: 10 }}>
                            {step > 0 && (
                                <button
                                    type="button"
                                    className="twd-btn twd-btn-ghost"
                                    onClick={() => setStep((s) => s - 1)}
                                >
                                    <Icon name="chevron-left" size={14} /> Back
                                </button>
                            )}
                            {/* Both are type="button" with distinct keys. A submit-typed
                                button here would fire on the very click that advances to
                                the last step: React swaps the type during the state update,
                                before the browser runs the click's activation behavior, so
                                "Next" would submit the form and create the requirement. */}
                            {step < STEPS.length - 1 ? (
                                <button
                                    key="wizard-next"
                                    type="button"
                                    className="twd-btn twd-btn-primary"
                                    onClick={() => goToStep(step + 1)}
                                >
                                    Next <Icon name="chevron-right" size={14} />
                                </button>
                            ) : (
                                <button
                                    key="wizard-create"
                                    type="button"
                                    className="twd-btn twd-btn-primary"
                                    disabled={loading}
                                    onClick={() => handleSubmit()}
                                >
                                    {loading ? "Creating..." : "Create Requirement"}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>

            {/* PDF Preview Modal */}
            {showPreview && previewUrl && (
                <div className="modal-overlay" onClick={() => setShowPreview(false)}>
                    <div
                        className="modal-box"
                        style={{ width: "80vw", maxWidth: "900px", height: "85vh", display: "flex", flexDirection: "column" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>{jdFile?.name}</span>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPreview(false)}>Close</button>
                        </div>
                        <object
                            data={previewUrl}
                            type="application/pdf"
                            style={{ flex: 1, border: "none", borderRadius: "8px", width: "100%", minHeight: 0 }}
                        >
                            <div style={{ padding: "2rem", textAlign: "center" }}>
                                <p>PDF preview not available in this browser.</p>
                                <a href={previewUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                                    Open in new tab
                                </a>
                            </div>
                        </object>
                    </div>
                </div>
            )}

            {/* Skill Preference Modal */}
            {activeSkill && (
                <div className="modal-overlay" onClick={() => setActiveSkill(null)}>
                    <div className="modal-box skill-pref-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-title">Set Requirement Level</div>
                        <p className="text-sm text-muted" style={{ marginBottom: "0.75rem" }}>
                            {activeSkill}
                        </p>
                        <div className="skill-pref-options">
                            {SKILL_PREFERENCE_OPTIONS.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    className={`btn ${skillPreferences[activeSkill] === option ? "btn-primary" : "btn-ghost"}`}
                                    onClick={() => applySkillPreference(activeSkill, option)}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
