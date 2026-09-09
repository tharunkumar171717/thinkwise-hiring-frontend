import { useEffect, useRef, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useParams, useNavigate } from "../lib/router";
import { API_BASE, api, getToken } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Icon from "../components/Icon";
import "../styles/pages.css";
import "../styles/dashboard.css";
import { fmtDate, fmtTs } from "../utils/dateUtils";
import { STATUS_LABEL, formatStatus, statusTone } from "../utils/statusUtils";

type CommentEntry = {
  id: string | null;
  author_id: string | null;
  author_name?: string | null;
  comment: string;
  context_type?: string | null;
  requirement_name?: string | null;
  created_at: string;
};

type ExperienceEntry = {
  Position?: string;
  Company?: string;
  Years?: string;
  Skills?: string[];
  duration?: string | null;
};

type EducationEntry = {
  Degree?: string;
  University?: string;
  Year?: string;
};

type Candidate = {
  id: string;
  Name?: string | null;
  Email?: string | null;
  PhoneNumber?: string | null;
  LinkedIn?: string | null;
  Skills?: string[] | null;
  Experience?: ExperienceEntry[] | null;
  Education?: EducationEntry[] | null;
  Certifications?: any[] | null;
  PersonalDetails?: Record<string, any> | null;
  resume_filename?: string | null;
  resume_content_type?: string | null;
  resume_updated_at?: string | null;
  updated_at?: string | null;
  created_at: string;
  structured_with_ai?: boolean | null;
  experience_label?: string | null;
  current_ctc?: number | null;
  expected_ctc?: number | null;
  notice_period?: string | null;
  comments?: CommentEntry[] | null;
  owner_name?: string | null;
  owner_active?: boolean | null;
  ownership_expires_at?: string | null;
};

const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sectionCard: React.CSSProperties = {
  marginBottom: "1.25rem", padding: "1.1rem 1.35rem",
  background: "var(--twd-surface)", borderRadius: 16, border: "1px solid var(--twd-line2)",
};

const fieldLabel: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--twd-faint)", marginBottom: 6,
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="twd-section-label" style={{ margin: "0 0 0.75rem" }}>{children}</h2>;
}

export default function CandidateDetail() {
  const { candidateId: rawParam } = useParams<{ candidateId: string }>();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();

  // The URL segment can be a uuid (legacy links) or a name slug (pretty URLs).
  // Slugs resolve to an id via the candidate name search endpoint.
  const [cid, setCid] = useState<string | null>(rawParam && UUID_RE.test(rawParam) ? rawParam : null);
  const [resolveError, setResolveError] = useState("");
  useEffect(() => {
    if (!rawParam) return;
    if (UUID_RE.test(rawParam)) { setCid(rawParam); return; }
    setCid(null);
    setResolveError("");
    const q = rawParam.replace(/-/g, " ");
    api.get(`/candidates?name=${encodeURIComponent(q)}&limit=25`)
      .then((res: any) => {
        const items: any[] = res?.items || [];
        const match = items.find((c) => toSlug(c.Name || c.name || "") === rawParam);
        if (match?.id) setCid(String(match.id));
        else setResolveError("Candidate not found.");
      })
      .catch(() => setResolveError("Candidate not found."));
  }, [rawParam]);

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  useDocumentTitle(candidate?.Name || "Candidate");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [resumeBlobUrl, setResumeBlobUrl] = useState<string | null>(null);
  const [resumeContentType, setResumeContentType] = useState<string>("");
  const [deleting, setDeleting] = useState(false);

  // Requirement history
  const [reqHistory, setReqHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Editable fields
  const [currentCtc, setCurrentCtc] = useState<string>("");
  const [expectedCtc, setExpectedCtc] = useState<string>("");
  const [noticePeriod, setNoticePeriod] = useState<string>("");
  const [savingFields, setSavingFields] = useState(false);
  const [fieldsEditing, setFieldsEditing] = useState(false);

  // Comments (unified feed - shared with Talent Pool, Profiles, Analytics)
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  // Replace resume
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [replacingResume, setReplacingResume] = useState(false);
  const [replaceMessage, setReplaceMessage] = useState("");

  const fetchResume = async (id: string) => {
    setResumeLoading(true);
    setResumeError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/candidates/${id}/resume`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load resume");
      const blob = await res.blob();
      setResumeContentType(blob.type || "");
      setResumeBlobUrl(URL.createObjectURL(blob));
    } catch (err: any) {
      setResumeError(err.message || "Could not load resume");
    } finally {
      setResumeLoading(false);
    }
  };

  useEffect(() => {
    if (!cid) return;
    setLoading(true);
    void (async () => {
      try {
        const data = await api.get(`/candidates/${cid}`);
        setCandidate(data);
        void fetchResume(cid);
      } catch (err: any) {
        setError(err.detail || "Failed to load candidate");
      } finally {
        setLoading(false);
      }
    })();
    setHistoryLoading(true);
    api.get(`/candidates/${cid}/requirement-history`)
      .then((data: any[]) => setReqHistory(data || []))
      .catch(() => setReqHistory([]))
      .finally(() => setHistoryLoading(false));
    api.get(`/candidates/${cid}/profile-comments`)
      .then((data: any) => setComments(data.comments || []))
      .catch(() => setComments([]));
  }, [cid]);

  useEffect(() => {
    return () => { if (resumeBlobUrl) URL.revokeObjectURL(resumeBlobUrl); };
  }, [resumeBlobUrl]);

  // Sync editable fields when candidate data loads/updates
  useEffect(() => {
    if (!candidate) return;
    setCurrentCtc(candidate.current_ctc != null ? String(candidate.current_ctc) : "");
    setExpectedCtc(candidate.expected_ctc != null ? String(candidate.expected_ctc) : "");
    setNoticePeriod(candidate.notice_period || "");
    // If data already has values, start in view mode
    const hasData = candidate.current_ctc != null || candidate.expected_ctc != null || !!candidate.notice_period;
    setFieldsEditing(!hasData);
  }, [candidate]);

  const handleSaveFields = async () => {
    if (!candidate) return;
    setSavingFields(true);
    try {
      const payload: any = {
        current_ctc: currentCtc ? parseFloat(currentCtc) : null,
        expected_ctc: expectedCtc ? parseFloat(expectedCtc) : null,
        notice_period: noticePeriod || null,
      };
      const updated = await api.patch(`/candidates/${candidate.id}`, payload);
      setCandidate(updated);
      setFieldsEditing(false);
    } catch (err: any) {
      setError(err.detail || "Failed to update fields");
    } finally {
      setSavingFields(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!candidate) return;
    const text = editingCommentText.trim();
    if (!text) return;
    setSavingComment(true);
    try {
      const data = await api.patch(`/candidates/${candidate.id}/profile-comments/${commentId}`, { comment: text });
      setComments(data.comments || []);
      setEditingCommentId(null);
      setEditingCommentText("");
    } catch (err: any) {
      setError(err.detail || "Failed to edit comment");
    } finally {
      setSavingComment(false);
    }
  };

  const handlePostComment = async () => {
    if (!candidate) return;
    const text = newComment.trim();
    if (!text) return;
    setPostingComment(true);
    try {
      const data = await api.post(`/candidates/${candidate.id}/profile-comments`, { comment: text });
      setComments(data.comments || []);
      setNewComment("");
    } catch (err: any) {
      setError(err.detail || "Failed to post comment");
    } finally {
      setPostingComment(false);
    }
  };

  const handleReplaceResume = async (file: File) => {
    if (!candidate) return;
    setReplacingResume(true);
    setReplaceMessage("");
    try {
      const formData = new FormData();
      formData.append("resume_file", file);
      const updated = await api.post(`/candidates/${candidate.id}/replace-resume`, formData);
      setCandidate(updated);
      // Re-fetch the resume blob to refresh the iframe
      if (resumeBlobUrl) { URL.revokeObjectURL(resumeBlobUrl); setResumeBlobUrl(null); }
      void fetchResume(candidate.id);
      setReplaceMessage(updated.structured_with_ai === false
        ? "Resume replaced - but AI structuring failed; only raw text was saved."
        : "Resume replaced and re-parsed successfully.");
      setTimeout(() => setReplaceMessage(""), 4000);
    } catch (err: any) {
      setError(err.detail || "Failed to replace resume");
    } finally {
      setReplacingResume(false);
      if (replaceFileRef.current) replaceFileRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!candidate || !isAdmin) return;
    if (!window.confirm(`Delete resume for "${candidate.Name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/candidates/${candidate.id}`);
      navigate("/talent-pool");
    } catch (err: any) {
      setError(err.detail || "Failed to delete candidate");
      setDeleting(false);
    }
  };

  if (resolveError) {
    return (
      <div className="twd-scope">
        <div className="twd-empty">{resolveError}</div>
      </div>
    );
  }
  if (!cid || loading) {
    return (
      <div className="twd-scope">
        <div className="twd-loading">Loading candidate...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="twd-scope">
        <div style={{ margin: "1rem 0", padding: "12px 16px", borderRadius: 12, background: "var(--twd-red-bg)", border: "1px solid color-mix(in srgb, var(--twd-red) 35%, transparent)", color: "var(--twd-red-text)", fontSize: 13.5 }}>{error}</div>
      </div>
    );
  }
  if (!candidate) return null;

  const experience: ExperienceEntry[] = Array.isArray(candidate.Experience) ? candidate.Experience : [];

  const totalExp = candidate.experience_label;

  const firstRole = experience.length > 0 ? experience[0].Position : null;

  const isPdf = resumeContentType.includes("pdf")
    || (candidate.resume_filename || "").toLowerCase().endsWith(".pdf");

  const updatedDate = new Date(candidate.resume_updated_at || candidate.updated_at || candidate.created_at);
  const diffDays = Math.floor((new Date().getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30);
  let updatedLabel = "";
  if (diffDays === 0) updatedLabel = "Today";
  else if (diffDays < 30) updatedLabel = `${diffDays}d ago`;
  else updatedLabel = `${diffMonths}mo ago`;
  const isOld = diffDays > 90;

  return (
    <div className="twd-scope">
      <div style={{ maxWidth: 920, margin: "0 auto" }}>

        {/* Header */}
        <div className="twd-head twd-head--tight twd-rise" style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="twd-title twd-title--sm">{candidate.Name || "Unknown Candidate"}</h1>
            {firstRole && <div className="twd-sub">{firstRole}</div>}
            <div className="twd-detail-meta">
              {candidate.Email && <span className="twd-detail-meta-item"><Icon name="mail" size={13} /> {candidate.Email}</span>}
              {candidate.PhoneNumber && <span className="twd-detail-meta-item"><Icon name="user" size={13} /> {candidate.PhoneNumber}</span>}
              {totalExp && <span className="twd-pill twd-pill--red">{totalExp} exp</span>}
              {candidate.owner_name && candidate.owner_active !== false
                && candidate.ownership_expires_at
                && new Date(candidate.ownership_expires_at).getTime() > Date.now() && (
                  <span className="twd-detail-meta-item">
                    <Icon name="briefcase" size={13} /> Owned by <b>{candidate.owner_name}</b>
                    {" "}· until {fmtDate(candidate.ownership_expires_at)}
                  </span>
                )}
              <span className="twd-detail-meta-item" style={{ color: isOld ? "var(--warning)" : "inherit" }}>
                <Icon name={isOld ? "warning" : "clock"} size={13} /> Last updated: {fmtDate(updatedDate.toISOString())} ({updatedLabel})
              </span>
            </div>
          </div>
          <div className="twd-head-actions">
            <input
              ref={replaceFileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleReplaceResume(f); }}
            />
            <button
              className="twd-btn twd-btn-primary"
              onClick={() => replaceFileRef.current?.click()}
              disabled={replacingResume}
            >
              <Icon name="document" size={15} /> {replacingResume ? "Updating..." : "Update Resume"}
            </button>
            {resumeBlobUrl && (
              <a className="twd-btn twd-btn-ghost" href={resumeBlobUrl} download={candidate.resume_filename || "resume"}>Download</a>
            )}
            {isAdmin && (
              <button className="twd-btn twd-btn-ghost" onClick={() => void handleDelete()} disabled={deleting} style={{ color: "var(--twd-red-text)" }}>
                {deleting ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>
        </div>

        {replaceMessage && (
          <div style={{ marginBottom: "1rem", padding: "10px 14px", background: "var(--twd-green-bg)", border: "1px solid color-mix(in srgb, var(--twd-green) 35%, transparent)", color: "var(--twd-green)", borderRadius: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="check" size={14} /> {replaceMessage}
          </div>
        )}

        {/* Recruiter fields */}
        <section style={sectionCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <SectionTitle>Recruiter Notes</SectionTitle>
            {!fieldsEditing && (
              <button className="twd-btn twd-btn-ghost twd-btn-sm" onClick={() => setFieldsEditing(true)}><Icon name="edit" size={13} /> Edit</button>
            )}
          </div>
          {fieldsEditing ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem" }}>
                <div>
                  <label style={fieldLabel}>Current CTC (LPA)</label>
                  <input
                    type="number" step="any" min="0" placeholder="e.g. 12.0"
                    className="twd-input"
                    value={currentCtc} onChange={(e) => setCurrentCtc(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Expected CTC (LPA)</label>
                  <input
                    type="number" step="any" min="0" placeholder="e.g. 18.0"
                    className="twd-input"
                    value={expectedCtc} onChange={(e) => setExpectedCtc(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Notice Period</label>
                  <input
                    type="text" placeholder="e.g. 30 days, Immediate, 2 months"
                    className="twd-input"
                    value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.85rem" }}>
                <button className="twd-btn twd-btn-primary twd-btn-sm" onClick={() => void handleSaveFields()} disabled={savingFields}>
                  {savingFields ? "Saving..." : "Save"}
                </button>
                {(candidate.current_ctc != null || candidate.expected_ctc != null || candidate.notice_period) && (
                  <button className="twd-btn twd-btn-ghost twd-btn-sm" onClick={() => { setFieldsEditing(false); setCurrentCtc(candidate.current_ctc != null ? String(candidate.current_ctc) : ""); setExpectedCtc(candidate.expected_ctc != null ? String(candidate.expected_ctc) : ""); setNoticePeriod(candidate.notice_period || ""); }}>Cancel</button>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.85rem" }}>
              <div>
                <div style={fieldLabel}>Current CTC</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{candidate.current_ctc != null ? `₹${candidate.current_ctc} LPA` : "-"}</div>
              </div>
              <div>
                <div style={fieldLabel}>Expected CTC</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{candidate.expected_ctc != null ? `₹${candidate.expected_ctc} LPA` : "-"}</div>
              </div>
              <div>
                <div style={fieldLabel}>Notice Period</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{candidate.notice_period || "-"}</div>
              </div>
            </div>
          )}
        </section>

        {/* Requirement history */}
        {(historyLoading || reqHistory.length > 0) && (
          <section style={sectionCard}>
            <SectionTitle>
              Requirement History
              {reqHistory.length > 0 && <span style={{ fontWeight: 500, marginLeft: 6 }}>· {reqHistory.length}</span>}
            </SectionTitle>
            {historyLoading ? (
              <div style={{ fontSize: 13, color: "var(--twd-faint)" }}>Loading…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {reqHistory.map((h, i) => {
                  const pst = h.offer_status || h.dynamic_status || h.status;
                  const statusColor = pst ? statusTone(pst).fg : "var(--twd-soft)";
                  const targetUrl = h.company_name && h.requirement_name
                    ? `/dashboard/${toSlug(h.company_name)}/${toSlug(h.requirement_name)}`
                    : `/requirements/${h.requirement_id}`;
                  return (
                    <a href={targetUrl}>
                      <div
                        key={i}
                        onClick={() => navigate(targetUrl)}
                        role="link"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") navigate(targetUrl); }}
                        title="Open requirement"
                        style={{
                          display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.65rem 0.85rem",
                          background: "var(--twd-surface2)", borderRadius: 12, border: "1px solid var(--twd-line2)",
                          flexWrap: "wrap", cursor: "pointer",
                          transition: "border-color 0.15s ease, background-color 0.15s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--twd-line)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--twd-line2)"; }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                            {h.req_id && <span className="twd-mono" style={{ fontSize: 11 }}>{h.req_id}</span>}
                            <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.requirement_name || "-"}</span>
                            {h.req_status && h.req_status !== "OPEN" && (
                              <span className="twd-tag" style={{ fontSize: 10 }}>{h.req_status}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--twd-faint)", marginTop: 2, display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            {h.company_name && <span>{h.company_name}</span>}
                            {h.in_pool && !h.submitted && <span>· In pool</span>}
                            {h.recruiter_name && <span>· {h.recruiter_name}</span>}
                            {h.sent_at && <span>· {fmtDate(h.sent_at)}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
                          {h.ai_score != null && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", fontVariantNumeric: "tabular-nums" }}>AI {h.ai_score}</span>
                          )}
                          {pst ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>{formatStatus(pst)}</span>
                          ) : (
                            <span className="twd-tag" style={{ fontSize: 11 }}>Pool</span>
                          )}
                          <span style={{ display: "inline-flex", color: "var(--twd-faint)" }}><Icon name="chevron-right" size={14} /></span>
                        </div>
                      </div></a>
                  );
                })}
              </div>
            )
            }
          </section>
        )}

        {/* Experience */}
        <section style={sectionCard}>
          <SectionTitle>Experience</SectionTitle>
          {experience.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {experience.map((exp, i) => {
                const yearsStr = exp.Years || "";
                const skills: string[] = Array.isArray(exp.Skills) ? exp.Skills : [];
                return (
                  <div key={i} style={{ padding: "0.9rem 1rem", background: "var(--twd-surface2)", borderRadius: 12, border: "1px solid var(--twd-line2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {exp.Position || "Unknown Role"}
                        </div>
                        <div style={{ marginTop: "0.15rem", fontSize: 13, color: "var(--twd-soft)" }}>{exp.Company || ""}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        {yearsStr && <div style={{ fontSize: 12, color: "var(--twd-faint)" }}>{yearsStr}</div>}
                        {exp.duration && (
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--twd-red-text)", marginTop: 2 }}>{exp.duration}</div>
                        )}
                      </div>
                    </div>
                    {skills.length > 0 && (
                      <div style={{ marginTop: "0.6rem", display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {skills.map((s: string, j: number) => (
                          <span key={j} className="twd-tag">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--twd-faint)", margin: 0 }}>No experience details available.</p>
          )}
        </section>

        {/* All Skills */}
        {(candidate.Skills || []).length > 0 && (
          <section style={sectionCard}>
            <SectionTitle>All Skills</SectionTitle>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(candidate.Skills || []).map((skill: string, i: number) => (
                <span key={i} className="twd-tag">{skill}</span>
              ))}
            </div>
          </section>
        )}

        {/* Education */}
        <section style={sectionCard}>
          <SectionTitle>Education</SectionTitle>
          {Array.isArray(candidate.Education) && candidate.Education.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {candidate.Education.map((e, i) => (
                <div key={i} style={{ padding: "0.65rem 1rem", background: "var(--twd-surface2)", borderRadius: 12, border: "1px solid var(--twd-line2)" }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.Degree || "Degree"}</div>
                  <div style={{ marginTop: "0.1rem", fontSize: 12.5, color: "var(--twd-soft)" }}>
                    {e.University || ""}
                    {e.Year ? ` · ${e.Year}` : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--twd-faint)", margin: 0 }}>No education details available.</p>
          )}
        </section>

        {/* Certifications */}
        {(candidate.Certifications || []).length > 0 && (
          <section style={sectionCard}>
            <SectionTitle>Certifications</SectionTitle>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: 13 }}>
              {(candidate.Certifications || []).map((c: any, i: number) => (
                <li key={i} style={{ listStyleType: "disc" }}>
                  {typeof c === "string" ? c : JSON.stringify(c)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Comments */}
        <section style={sectionCard}>
          <SectionTitle>
            Comments {comments.length > 0 && <span style={{ fontWeight: 500 }}>· {comments.length}</span>}
          </SectionTitle>

          {/* Existing comments (unified: talent pool + all requirements) */}
          {comments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1rem" }}>
              {comments.map((c, i) => (
                <div key={c.id || i} style={{ padding: "0.75rem 1rem", background: "var(--twd-surface2)", borderRadius: 12, border: "1px solid var(--twd-line2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.3rem", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {c.author_name || "Unknown"}
                      {c.requirement_name && (
                        <span className="twd-tag" style={{ marginLeft: "0.5rem", fontWeight: 500 }}>
                          {c.requirement_name}
                        </span>
                      )}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontSize: 11, color: "var(--twd-faint)" }}>{fmtTs(c.created_at)}</span>
                      {editingCommentId !== c.id && !!c.id && c.author_id === user?.id && (
                        <button
                          className="twd-icon-btn"
                          style={{ width: 24, minHeight: 24 }}
                          onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.comment); }}
                          aria-label="Edit comment"
                        ><Icon name="edit" size={11} /></button>
                      )}
                    </div>
                  </div>
                  {editingCommentId === c.id ? (
                    <div style={{ marginTop: "0.3rem" }}>
                      <textarea
                        value={editingCommentText}
                        onChange={(e) => setEditingCommentText(e.target.value)}
                        rows={3}
                        className="twd-input"
                        style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                      />
                      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
                        <button className="twd-btn twd-btn-primary twd-btn-sm" onClick={() => void handleEditComment(c.id!)} disabled={savingComment || !editingCommentText.trim()}>
                          {savingComment ? "Saving..." : "Save"}
                        </button>
                        <button className="twd-btn twd-btn-ghost twd-btn-sm" onClick={() => { setEditingCommentId(null); setEditingCommentText(""); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--twd-soft)", lineHeight: 1.55 }}>{c.comment}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* New comment input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <textarea
              placeholder="Add a comment about this candidate (e.g. interview feedback, screening notes)..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
              className="twd-input"
              style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="twd-btn twd-btn-primary twd-btn-sm" onClick={() => void handlePostComment()} disabled={postingComment || !newComment.trim()}>
                {postingComment ? "Posting..." : "Post Comment"}
              </button>
            </div>
          </div>
        </section>

        {/* ── Resume viewer (below) ── */}
        <section style={sectionCard}>
          <SectionTitle>
            Resume{candidate.resume_filename ? ` · ${candidate.resume_filename}` : ""}
          </SectionTitle>
          <div style={{ border: "1px solid var(--twd-line2)", borderRadius: 12, overflow: "hidden", background: "var(--twd-surface2)", minHeight: 200 }}>
            {resumeLoading ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--twd-faint)", fontSize: 13.5 }}>Loading resume...</div>
            ) : resumeError ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--twd-red-text)", fontSize: 13.5 }}>{resumeError}</div>
            ) : resumeBlobUrl ? (
              isPdf ? (
                <iframe
                  title="Resume"
                  src={resumeBlobUrl}
                  style={{ width: "100%", height: "80vh", minHeight: 600, border: "none", display: "block" }}
                />
              ) : (
                <div style={{ padding: "2rem", textAlign: "center" }}>
                  <div style={{ marginBottom: "0.75rem", color: "var(--twd-faint)" }}><Icon name="document" size={44} /></div>
                  <p style={{ fontSize: 13, color: "var(--twd-faint)", marginBottom: "1rem" }}>Inline preview only supports PDF files.</p>
                  <a className="twd-btn twd-btn-ghost" href={resumeBlobUrl} download={candidate.resume_filename || "resume"}>Download to View</a>
                </div>
              )
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--twd-faint)", fontSize: 13.5 }}>No resume file available.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
