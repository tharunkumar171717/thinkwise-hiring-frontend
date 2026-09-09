import { useEffect, useState, useRef } from "react";
import { api } from "../services/api";
import "../styles/pages.css";
import { fmtDate } from "../utils/dateUtils";

type EducationRequired = {
  degrees?: string[];
  strict?: boolean;
  raw?: string;
} | string | null;

type JD = {
  _id: string;
  job_role: string;
  experience: {
    overall_years: string;
    hands_on_years: string;
    other_experience_details?: string;
  };
  education_required?: EducationRequired;
  domain?: string;
  tech_skills?: string[];
  soft_skills?: string[];
  domain_skills?: string[];
  must_have_skills: string[];
  good_to_have_skills: string[];
  all_skills: string[];
  additional_fields?: Record<string, any>;
  created_at: string;
};

type Candidate = {
  id: string;
  Name?: string | null;
  experience_label?: string | null;
  Skills?: string[];
};

type MatchResult = {
  matched_must_have_skills: string[];
  missing_must_have_skills: string[];
  matched_good_to_have_skills: string[];
  missing_good_to_have_skills: string[];
  candidate_skills: string[];
  experience_match: {
    required: string;
    candidate_has: string;
    meets_requirement: boolean;
  };
  overall_score: number;
  match_summary: string;
  recommendation: string;
};

// ── Skill selector: categorized skills with Must-Have / Good-to-Have toggles ──

type SkillTag = "must" | "good" | "none";

function SkillSelector({ jd, onUpdated }: { jd: JD; onUpdated: (updated: JD) => void }) {
  const initialMust = new Set(jd.must_have_skills || []);
  const initialGood = new Set(jd.good_to_have_skills || []);

  const [tags, setTags] = useState<Record<string, SkillTag>>(() => {
    const t: Record<string, SkillTag> = {};
    const all = [
      ...(jd.tech_skills || []),
      ...(jd.soft_skills || []),
      ...(jd.domain_skills || []),
      ...(jd.all_skills || []),
    ];
    for (const s of all) {
      if (initialMust.has(s)) t[s] = "must";
      else if (initialGood.has(s)) t[s] = "good";
      else t[s] = "none";
    }
    return t;
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const cycleTag = (skill: string) => {
    setTags((prev) => {
      const cur = prev[skill] || "none";
      const next: SkillTag = cur === "none" ? "must" : cur === "must" ? "good" : "none";
      return { ...prev, [skill]: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const must_have_skills = Object.keys(tags).filter((s) => tags[s] === "must");
      const good_to_have_skills = Object.keys(tags).filter((s) => tags[s] === "good");
      const updated = await api.patch(`/jd/${jd._id}/skills`, {
        must_have_skills,
        good_to_have_skills,
      });
      onUpdated(updated);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (err) {
      // surface via parent in future; for now keep silent
      console.error("Failed to save skill selections", err);
    } finally {
      setSaving(false);
    }
  };

  const renderBucket = (title: string, skills: string[]) => {
    if (!skills.length) return null;
    return (
      <div style={{ marginTop: "1.25rem" }}>
        <div className="section-title">{title}</div>
        <div className="jd-skill-chips" style={{ marginTop: "0.5rem", flexWrap: "wrap", gap: "0.4rem" }}>
          {skills.map((s) => {
            const tag = tags[s] || "none";
            const baseStyle: React.CSSProperties = { cursor: "pointer", userSelect: "none" };
            const cls =
              tag === "must" ? "suggestion-chip is-active"
                : tag === "good" ? "suggestion-chip"
                  : "suggestion-chip";
            const extraStyle: React.CSSProperties =
              tag === "must" ? { borderColor: "var(--success)", color: "var(--success)" }
                : tag === "good" ? { borderColor: "var(--warning, #f59e0b)", color: "var(--warning, #f59e0b)" }
                  : { opacity: 0.7 };
            const prefix = tag === "must" ? "★ " : tag === "good" ? "○ " : "";
            return (
              <span
                key={s}
                className={cls}
                style={{ ...baseStyle, ...extraStyle }}
                onClick={() => cycleTag(s)}
                title="Click to cycle: Unselected → Must-Have → Good-to-Have → Unselected"
              >
                {prefix}{s}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  // Build final categorized lists, deduped
  const seen = new Set<string>();
  const dedupe = (arr?: string[]) => (arr || []).filter((s) => {
    if (!s || seen.has(s.toLowerCase())) return false;
    seen.add(s.toLowerCase());
    return true;
  });
  const tech = dedupe(jd.tech_skills);
  const soft = dedupe(jd.soft_skills);
  const domain = dedupe(jd.domain_skills);
  // Anything in all_skills/must/good that wasn't in the categorized buckets
  const remaining = dedupe([...(jd.all_skills || []), ...(jd.must_have_skills || []), ...(jd.good_to_have_skills || [])]);

  const mustCount = Object.values(tags).filter((t) => t === "must").length;
  const goodCount = Object.values(tags).filter((t) => t === "good").length;

  return (
    <div style={{ marginTop: "1.5rem", padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div className="section-title" style={{ marginBottom: "0.2rem" }}>Mark Required Skills</div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Click a skill to cycle: <strong>Unselected → Must-Have (★) → Good-to-Have (○) → Unselected</strong>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <span className="text-xs" style={{ color: "var(--success)" }}>★ {mustCount} must</span>
          <span className="text-xs" style={{ color: "var(--warning, #f59e0b)" }}>○ {goodCount} good</span>
          <button className="btn btn-primary btn-sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          {savedAt && <span style={{ fontSize: "12px", color: "var(--success)" }}>✓ Saved</span>}
        </div>
      </div>

      {renderBucket("Tech Skills", tech)}
      {renderBucket("Soft Skills", soft)}
      {renderBucket("Domain Skills", domain)}
      {renderBucket("Other", remaining)}

      {tech.length === 0 && soft.length === 0 && domain.length === 0 && remaining.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-secondary)", marginTop: "0.75rem" }}>
          No skills extracted from this JD.
        </p>
      )}
    </div>
  );
}

export default function JDScreening() {
  const [jds, setJds] = useState<JD[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedJD, setSelectedJD] = useState<string>("");
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [matchResults, setMatchResults] = useState<Array<{ candidate_id: string; match_result?: MatchResult; error?: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");
  const [jdInputMode, setJdInputMode] = useState<"file" | "text">("file");
  const [jdText, setJdText] = useState("");
  const [viewingJD, setViewingJD] = useState<JD | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadJDs();
    loadCandidates();
  }, []);

  const loadJDs = async () => {
    try {
      const data = await api.get("/jd/list");
      setJds(data || []);
    } catch (err: any) {
      setError(err.detail || "Failed to load job descriptions");
    }
  };

  const loadCandidates = async () => {
    try {
      const data = await api.get("/candidates?limit=200");
      setCandidates(data?.items || []);
    } catch (err: any) {
      setError(err.detail || "Failed to load candidates");
    }
  };

  const handleJDUpload = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (jdInputMode === "file") {
      const file = fileInputRef.current?.files?.[0];
      if (!file) {
        setError("Please select a JD file");
        return;
      }

      setUploading(true);
      setError("");
      try {
        const formData = new FormData();
        formData.append("file", file);
        await api.post("/jd/upload", formData);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await loadJDs();
      } catch (err: any) {
        setError(err.detail || "Failed to upload JD");
      } finally {
        setUploading(false);
      }
    } else {
      if (!jdText.trim()) {
        setError("Please paste JD text ");
        return;
      }

      setUploading(true);
      setError("");
      try {
        const blob = new Blob([jdText], { type: "text/plain" });
        const formData = new FormData();
        formData.append("file", blob, "pasted-jd.txt");
        await api.post("/jd/upload", formData);
        setJdText("");
        await loadJDs();
      } catch (err: any) {
        setError(err.detail || "Failed to upload JD");
      } finally {
        setUploading(false);
      }
    }
  };

  const handleMatch = async () => {
    if (!selectedJD || selectedCandidates.length === 0) {
      setError("Please select JD and at least one candidate");
      return;
    }

    setMatching(true);
    setError("");
    setMatchResults([]);
    try {
      const result = await api.post("/match/bulk", {
        candidate_ids: selectedCandidates,
        jd_id: selectedJD
      });
      setMatchResults(result.results || []);
    } catch (err: any) {
      setError(err.detail || "Failed to match");
    } finally {
      setMatching(false);
    }
  };

  const handleDeleteJD = async (jdId: string) => {
    if (!window.confirm("Are you sure you want to delete this job description?")) return;

    try {
      await api.delete(`/jd/${jdId}`);
      if (selectedJD === jdId) setSelectedJD("");
      await loadJDs();
    } catch (err: any) {
      setError(err.detail || "Failed to delete JD");
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "var(--success)";
    if (score >= 60) return "var(--warning)";
    return "var(--danger)";
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>JD Screening</h1>
          <p className="page-header-sub">Upload job descriptions and match with candidates</p>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: "1rem" }}>{error}</div>}

      {/* Upload JD Section */}
      <form className="card" style={{ marginBottom: "1.5rem" }} onSubmit={handleJDUpload}>
        <div className="card-title">Upload Job Description</div>

        <div className="jd-mode-toggle" style={{ marginBottom: "1rem" }}>
          <button
            type="button"
            className={`jd-mode-btn ${jdInputMode === "file" ? "is-active" : ""}`}
            onClick={() => setJdInputMode("file")}
          >
            Upload File
          </button>
          <button
            type="button"
            className={`jd-mode-btn ${jdInputMode === "text" ? "is-active" : ""}`}
            onClick={() => setJdInputMode("text")}
          >
            Paste Text
          </button>
        </div>

        {jdInputMode === "file" ? (
          <div className="talent-upload-row">
            <input ref={fileInputRef} type="file" accept=".txt,.pdf,.doc,.docx" />
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? "Uploading..." : "Upload JD"}
            </button>
          </div>
        ) : (
          <div>
            <textarea
              placeholder="Paste job description here..."
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={8}
              style={{
                width: "100%",
                padding: "0.65rem 0.85rem",
                background: "var(--bg-input)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-sm)",
                resize: "vertical",
                marginBottom: "0.75rem"
              }}
            />
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? "Processing..." : "Submit JD"}
            </button>
          </div>
        )}
      </form>

      {/* JD Management List */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">Manage Job Descriptions</div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Job Role</th>
                <th>Experience</th>
                <th>Skills</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jds.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
                    No Job Descriptions uploaded yet.
                  </td>
                </tr>
              ) : (
                jds.map((jd) => (
                  <tr key={jd._id}>
                    <td style={{ verticalAlign: "top" }}>
                      <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>{jd.job_role}</div>
                      <div className="text-secondary text-xs">{fmtDate(jd.created_at)}</div>
                    </td>
                    <td className="text-sm" style={{ verticalAlign: "top" }}>
                      {jd.experience.overall_years || "Not Mentioned"}
                    </td>
                    <td style={{ verticalAlign: "top", width: "40%" }}>
                      <div className="jd-skill-chips" style={{ flexWrap: "wrap", gap: "0.35rem" }}>
                        {jd.must_have_skills.slice(0, 3).map(skill => (
                          <span key={skill} className="suggestion-chip is-active" style={{ fontSize: "0.65rem", padding: "0.1rem 0.4rem" }}>{skill}</span>
                        ))}
                        {jd.must_have_skills.length > 3 && (
                          <span className="text-xs" style={{ color: "var(--text-secondary)", alignSelf: "center" }}>+{jd.must_have_skills.length - 3} more</span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setViewingJD(jd)}
                          title="Peek Details"
                        >
                          {"\u{1F441}"}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDeleteJD(jd._id)}
                          style={{ color: "var(--danger)" }}
                          title="Delete"
                        >
                          {"\u{1F5D1}"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matching Section */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="card-title">Match Candidates with JD</div>
        <div className="form-group" style={{ marginBottom: "1rem" }}>
          <label>Select Job Description</label>
          <select
            value={selectedJD}
            onChange={(e) => setSelectedJD(e.target.value)}
            style={{
              padding: "0.65rem 0.85rem",
              background: "var(--bg-input)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: "var(--font-size-base)",
            }}
          >
            <option value="">-- Select JD --</option>
            {jds.map((jd) => (
              <option key={jd._id} value={jd._id}>
                {jd.job_role} ({jd.experience.overall_years})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: "1rem" }}>
          <label>Select Candidates* ({selectedCandidates.length} selected)</label>
          <div style={{
            maxHeight: "200px",
            overflowY: "auto",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "0.5rem"
          }}>
            {candidates.map((c) => (
              <label key={c.id} style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: "0.75rem",
                padding: "0.5rem 0.75rem",
                margin: 0,
                cursor: "pointer",
                borderRadius: "var(--radius-sm)",
                transition: "background 0.15s",
                width: "100%"
              }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-secondary)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <input
                  type="checkbox"
                  style={{ margin: 0, flexShrink: 0, width: "16px", height: "16px", cursor: "pointer", position: "relative", top: "0" }}
                  checked={selectedCandidates.includes(c.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedCandidates([...selectedCandidates, c.id]);
                    } else {
                      setSelectedCandidates(selectedCandidates.filter(id => id !== c.id));
                    }
                  }}
                />
                <span style={{ fontSize: "var(--font-size-sm)", userSelect: "none", lineHeight: "1", display: "flex", alignItems: "center", paddingTop: "2px" }}>
                  {c.Name || "Unknown"} ({c.experience_label || "-"})
                </span>
              </label>
            ))}
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleMatch}
          disabled={matching || !selectedJD || selectedCandidates.length === 0}
        >
          {matching ? "Matching..." : `Match & Score (${selectedCandidates.length})`}
        </button>
      </div>

      {/* Match Results */}
      {matchResults.length > 0 && (
        <div>
          {matchResults.map((result) => {
            const candidate = candidates.find(c => c.id === result.candidate_id);
            const matchResult = result.match_result;

            if (result.error) {
              return (
                <div key={result.candidate_id} className="card" style={{ marginBottom: "1rem", borderColor: "var(--danger)" }}>
                  <div className="card-title">{candidate?.Name || result.candidate_id}</div>
                  <div style={{ color: "var(--danger)", fontSize: "var(--font-size-sm)" }}>
                    Error: {result.error}
                  </div>
                </div>
              );
            }

            if (!matchResult) return null;

            return (
              <div key={result.candidate_id} className="card" style={{ marginBottom: "1rem" }}>
                <div className="card-title">{candidate?.Name || result.candidate_id}</div>

                {/* Overall Score */}
                <div style={{ marginBottom: "1.5rem", textAlign: "center" }}>
                  <div style={{ fontSize: "3rem", fontWeight: 800, color: getScoreColor(matchResult.overall_score) }}>
                    {matchResult.overall_score}%
                  </div>
                  <div style={{ fontSize: "1.1rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                    {matchResult.recommendation}
                  </div>
                </div>

                {/* Skills Match */}
                <div className="stats-row" style={{ marginBottom: "1.5rem" }}>
                  <div className="stat-box">
                    <div className="stat-box-value" style={{ color: "var(--success)" }}>
                      {matchResult.matched_must_have_skills.length}
                    </div>
                    <div className="stat-box-label">Must-Have Matched</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-box-value" style={{ color: "var(--danger)" }}>
                      {matchResult.missing_must_have_skills.length}
                    </div>
                    <div className="stat-box-label">Must-Have Missing</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-box-value" style={{ color: "var(--success)" }}>
                      {matchResult.matched_good_to_have_skills.length}
                    </div>
                    <div className="stat-box-label">Good-to-Have Matched</div>
                  </div>
                </div>

                {/* Detailed Skills */}
                <div style={{ marginBottom: "1rem" }}>
                  <strong className="text-sm">Matched Must-Have Skills</strong>
                  <div className="jd-skill-chips" style={{ marginTop: "0.4rem" }}>
                    {matchResult.matched_must_have_skills.length ? (
                      matchResult.matched_must_have_skills.map((skill) => (
                        <span key={skill} className="suggestion-chip is-active">{skill}</span>
                      ))
                    ) : (
                      <span className="jd-skill-empty">None</span>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <strong className="text-sm">Missing Must-Have Skills</strong>
                  <div className="jd-skill-chips" style={{ marginTop: "0.4rem" }}>
                    {matchResult.missing_must_have_skills.length ? (
                      matchResult.missing_must_have_skills.map((skill) => (
                        <span key={skill} className="suggestion-chip" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{skill}</span>
                      ))
                    ) : (
                      <span className="jd-skill-empty">None</span>
                    )}
                  </div>
                </div>

                {/* Experience Match */}
                <div style={{ marginTop: "1.5rem", padding: "1rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                  <strong className="text-sm">Experience Match</strong>
                  <p className="text-sm" style={{ marginTop: "0.5rem", color: "var(--text-secondary)" }}>
                    Required: <strong>{matchResult.experience_match.required}</strong> |
                    Candidate: <strong>{matchResult.experience_match.candidate_has}</strong> |
                    <span style={{ color: matchResult.experience_match.meets_requirement ? "var(--success)" : "var(--danger)" }}>
                      {matchResult.experience_match.meets_requirement ? " ✓ Meets" : " ✗ Does Not Meet"}
                    </span>
                  </p>
                </div>

                {/* Summary */}
                <div style={{ marginTop: "1.5rem" }}>
                  <strong className="text-sm">Match Summary</strong>
                  <p className="text-sm" style={{ marginTop: "0.5rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                    {matchResult.match_summary}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* JD Detail Modal */}
      {viewingJD && (
        <div className="modal-overlay" onClick={() => setViewingJD(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "700px" }}>
            <div className="modal-header">
              <h2 className="modal-title">{viewingJD.job_role}</h2>
              <button className="modal-close" onClick={() => setViewingJD(null)}>&times;</button>
            </div>

            <div className="modal-body">
              <div className="candidate-details-grid">
                <div className="detail-item">
                  <div className="detail-label">Overall Experience</div>
                  <div className="detail-value">{viewingJD.experience.overall_years}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Hands-on Experience</div>
                  <div className="detail-value">{viewingJD.experience.hands_on_years}</div>
                </div>
              </div>

              {(() => {
                const ed = viewingJD.education_required;
                const degrees = (ed && typeof ed === "object" && Array.isArray(ed.degrees)) ? ed.degrees : [];
                const strict = !!(ed && typeof ed === "object" && ed.strict);
                const rawText = (ed && typeof ed === "object") ? (ed.raw || "") : (typeof ed === "string" ? ed : "");
                if (degrees.length === 0 && !rawText) return null;
                return (
                  <>
                    <div className="section-title" style={{ marginTop: "1.5rem" }}>
                      Education {strict && <span style={{ fontSize: "11px", color: "var(--danger)", marginLeft: "0.5rem" }}>(Strict)</span>}
                    </div>
                    {degrees.length > 0 && (
                      <div className="jd-skill-chips" style={{ marginTop: "0.5rem" }}>
                        {degrees.map(d => (
                          <span key={d} className="suggestion-chip is-active">{d}</span>
                        ))}
                      </div>
                    )}
                    {rawText && <p className="text-sm" style={{ color: "var(--text-secondary)", marginTop: "0.4rem" }}>{rawText}</p>}
                  </>
                );
              })()}

              {viewingJD.domain && (
                <>
                  <div className="section-title" style={{ marginTop: "1.5rem" }}>Domain</div>
                  <span className="suggestion-chip is-active" style={{ marginTop: "0.5rem", display: "inline-block" }}>{viewingJD.domain}</span>
                </>
              )}

              {/* Categorized skills with Must-Have / Good-to-Have toggle */}
              <SkillSelector jd={viewingJD} onUpdated={(updated) => {
                setViewingJD(updated);
                setJds((prev) => prev.map((j) => j._id === updated._id ? updated : j));
              }} />

              {viewingJD.additional_fields && Object.keys(viewingJD.additional_fields).length > 0 && (
                <>
                  <div className="section-title" style={{ marginTop: "1.5rem" }}>Additional Details</div>
                  <div className="candidate-details-grid" style={{ marginTop: "0.5rem" }}>
                    {Object.entries(viewingJD.additional_fields).map(([key, value]) => (
                      <div key={key} className="detail-item">
                        <div className="detail-label" style={{ textTransform: "capitalize" }}>{key.replace(/_/g, " ")}</div>
                        <div className="detail-value">{String(value)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewingJD(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
