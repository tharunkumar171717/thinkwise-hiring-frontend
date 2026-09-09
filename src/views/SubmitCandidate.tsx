import { useRef, useState } from "react";
import { useParams, useNavigate } from "../lib/router";
import { api } from "../services/api";
import Icon from "../components/Icon";
import BackButton from "../components/BackButton";
import "../styles/pages.css";

export default function SubmitCandidate() {
    const { id: reqId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState("");
    const [warning, setWarning] = useState("");
    const [loading, setLoading] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [hovered, setHovered] = useState(false);
    const [form, setForm] = useState({
        name: "",
        email: "",
        mobile: "",
        current_role: "",
        total_experience: "",
        present_ctc: "",
        expected_ctc: "",
        skillset: "",
        recruiter_comments: "",
    });

    const update = (field: string, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setResumeFile(file);
        setError("");
        setWarning("");
        setParsing(true);

        try {
            const formData = new FormData();
            formData.append("resume_file", file);
            const parsed = await api.post("/candidates/parse-resume", formData);
            if (parsed.structured_with_ai === false) {
                setWarning("AI couldn't auto-extract details from this resume - please fill in the fields manually.");
            } else {
                const s = parsed.structured || parsed;
                setForm((prev) => ({
                    ...prev,
                    name: s.name || s.Name || prev.name,
                    email: s.email || s.Email || prev.email,
                    mobile: s.mobile || s.PhoneNumber || prev.mobile,
                    current_role: s.current_role || prev.current_role,
                    total_experience: s.total_experience != null ? String(s.total_experience) : prev.total_experience,
                    skillset: s.skillset || (Array.isArray(s.Skills) ? s.Skills.join(", ") : prev.skillset),
                }));
            }
        } catch (err: any) {
            setWarning(err?.detail || "Couldn't auto-fill from resume. You can still fill in the fields manually.");
        } finally {
            setParsing(false);
        }
    };

    const handleSubmit = async (e: { preventDefault(): void }) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            let candidateId: string | null = null;

            if (resumeFile) {
                // Create fully-parsed candidate from resume
                const formData = new FormData();
                formData.append("resume_file", resumeFile);
                if (form.name) formData.append("name", form.name);
                if (form.email) formData.append("email", form.email);
                if (form.mobile) formData.append("mobile", form.mobile);
                if (form.current_role) formData.append("current_role", form.current_role);
                if (form.total_experience) formData.append("total_experience", form.total_experience);
                if (form.skillset) formData.append("skillset", form.skillset);
                const result = await api.post("/candidates/create-from-resume", formData);
                candidateId = result.candidate_id;
                if (result.structured_with_ai === false) {
                    setWarning("Resume saved, but AI structuring failed - only the raw text was stored. You can re-run AI later from the candidate's page.");
                }
            }

            const payload: any = {
                requirement_id: reqId,
                source: "manual",
                recruiter_comments: form.recruiter_comments || null,
            };

            if (candidateId) {
                payload.candidate_id = candidateId;
            } else {
                payload.name = form.name;
                payload.email = form.email || null;
                payload.mobile = form.mobile || null;
                payload.current_role = form.current_role || null;
                payload.total_experience = form.total_experience ? parseFloat(form.total_experience) : null;
                payload.present_ctc = form.present_ctc ? parseFloat(form.present_ctc) : null;
                payload.expected_ctc = form.expected_ctc ? parseFloat(form.expected_ctc) : null;
                payload.skillset = form.skillset || null;
            }

            await api.post("/applications", payload);
            navigate(`/requirements/${reqId}`);
        } catch (err: any) {
            setError(err.detail || "Failed to submit candidate");
        } finally {
            setLoading(false);
        }
    };

    const row3: React.CSSProperties = {
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "1rem",
    };

    return (
        <div>
            <BackButton />
            <div className="page-header">
                <div>
                    <h1>Submit Candidate</h1>
                    <p className="page-header-sub">Submitting profile against requirement</p>
                </div>
            </div>

            {error && <div className="form-error" style={{ marginBottom: "1rem" }}>{error}</div>}
            {warning && (
                <div style={{
                    marginBottom: "1rem",
                    padding: "0.65rem 0.85rem",
                    background: "rgba(202, 138, 4, 0.10)",
                    border: "1px solid rgba(202, 138, 4, 0.35)",
                    color: "#a16207",
                    borderRadius: "6px",
                    fontSize: "var(--font-size-sm)",
                }}>
                    ⚠️ {warning}
                </div>
            )}

            <form className="dash-form requirement-create-form" onSubmit={handleSubmit}>
                {/* Resume Upload */}
                <div className="form-group">
                    <label>
                        Resume
                        {parsing && <span className="text-muted" style={{ fontWeight: 400, fontSize: "var(--font-size-sm)" }}> - Extracting details...</span>}
                    </label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.txt"
                        style={{ display: "none" }}
                        onChange={handleFileChange}
                    />
                    <div
                        onClick={() => !parsing && fileInputRef.current?.click()}
                        onMouseEnter={() => setHovered(true)}
                        onMouseLeave={() => setHovered(false)}
                        style={{
                            border: `2px dashed ${hovered && !parsing ? "var(--primary)" : "var(--border-subtle)"}`,
                            borderRadius: "10px",
                            padding: "1.25rem",
                            textAlign: "center",
                            cursor: parsing ? "default" : "pointer",
                            transition: "border-color 0.2s",
                            background: "var(--bg-input)",
                            opacity: parsing ? 0.7 : 1,
                        }}
                    >
                        {parsing ? (
                            <div style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}>
                                <Icon name="clock" size={16} /> Extracting candidate details...
                            </div>
                        ) : resumeFile ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><Icon name="document" size={16} /> {resumeFile.name}</span>
                                <span style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>· Click to change</span>
                            </div>
                        ) : (
                            <div>
                                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}>
                                    <Icon name="document" size={16} /> Click to upload resume
                                </div>
                                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "0.25rem" }}>PDF, Word, or TXT · Fields will be auto-filled</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Row 1: Name, Current Role, Mobile */}
                <div style={row3}>
                    <div className="form-group">
                        <label>Candidate Name *</label>
                        <input
                            type="text"
                            placeholder="Full name"
                            value={form.name}
                            onChange={(e) => update("name", e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Current Role</label>
                        <input
                            type="text"
                            placeholder="e.g. Senior Software Engineer"
                            value={form.current_role}
                            onChange={(e) => update("current_role", e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Mobile</label>
                        <input
                            type="text"
                            placeholder="+91 9876543210"
                            value={form.mobile}
                            onChange={(e) => update("mobile", e.target.value)}
                        />
                    </div>
                </div>

                {/* Row 2: Email, Experience, Skillset */}
                <div style={row3}>
                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            placeholder="candidate@email.com"
                            value={form.email}
                            onChange={(e) => update("email", e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Total Experience (years)</label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="e.g. 5.5"
                            value={form.total_experience}
                            onChange={(e) => update("total_experience", e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Skillset</label>
                        <input
                            type="text"
                            placeholder="e.g. Java, Spring Boot, AWS"
                            value={form.skillset}
                            onChange={(e) => update("skillset", e.target.value)}
                        />
                    </div>
                </div>

                {/* Row 3: Present CTC, Expected CTC, (empty or comments inline) */}
                <div style={row3}>
                    <div className="form-group">
                        <label>Present CTC (LPA)</label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="e.g. 12.0"
                            value={form.present_ctc}
                            onChange={(e) => update("present_ctc", e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Expected CTC (LPA)</label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="e.g. 18.0"
                            value={form.expected_ctc}
                            onChange={(e) => update("expected_ctc", e.target.value)}
                        />
                    </div>
                </div>

                <div className="form-group">
                    <label>Recruiter Comments</label>
                    <textarea
                        placeholder="Any notes about this candidate..."
                        value={form.recruiter_comments}
                        onChange={(e) => update("recruiter_comments", e.target.value)}
                        rows={3}
                    />
                </div>

                <div className="form-actions">
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => navigate(`/requirements/${reqId}`)}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading || parsing}
                    >
                        {loading ? "Submitting..." : "Submit Profile"}
                    </button>
                </div>
            </form>
        </div>
    );
}
