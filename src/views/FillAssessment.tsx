import { useEffect, useState } from "react";
import { useNavigate, useParams } from "../lib/router";
import { api, API_BASE, getToken } from "../services/api";
import Icon from "../components/Icon";
import "../styles/dashboard.css";

type Question = { id: string; type: "voice" | "text"; prompt: string; hint?: string; max_seconds?: number; max_words?: number; required?: boolean };
type SkillRow = { skill: string; requirement: string; members?: string[] };

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid var(--twd-line)", borderRadius: 10,
  background: "var(--twd-surface)", color: "var(--twd-ink)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
  transition: "border-color 0.2s, box-shadow 0.2s",
};

// City-token match: "Hyderabad" == "Hyderabad, India" == "Hyderabad / Telangana".
function cityToken(s: string): string {
  return (s || "").trim().toLowerCase().split(/[,/]/)[0].trim();
}
function sameCity(a: string, b: string): boolean {
  const ca = cityToken(a), cb = cityToken(b);
  if (!ca || !cb) return false;
  return ca === cb || a.toLowerCase().includes(cb) || b.toLowerCase().includes(ca);
}

// Module-scope so inputs keep their identity across renders (defining these inside
// the component remounts every input on each keystroke → cursor/focus loss).
function Field({ label, required, error, children }: { label: string; required?: boolean; error?: boolean; children: any }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--twd-soft)", marginBottom: 4 }}>
        {label}{required && <span style={{ color: "var(--twd-red-text)" }}> *</span>}
      </label>
      <div style={{ position: "relative" }}>
        {children}
        {error && <div style={{ fontSize: 11, color: "var(--twd-red-text)", marginTop: 4 }}>This field is required</div>}
      </div>
    </div>
  );
}
function FormGrid({ children }: { children: any }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 16 }}>{children}</div>;
}

export default function FillAssessment({ reqId, backTo }: { reqId?: string; backTo?: string } = {}) {
  const routeParams = useParams<{ id: string }>();
  const id = reqId || routeParams.id;
  const navigate = useNavigate();
  const back = backTo || `/requirements/${id}`;

  const [tab, setTab] = useState<"details" | "skills" | "questions">("details");
  const [config, setConfig] = useState<{ questions: Question[]; skills: SkillRow[]; role_title?: string; job_location?: string } | null>(null);

  const [identity, setIdentity] = useState({ name: "", email: "", phone: "" });
  const [form, setForm] = useState<any>({ present_company: "", current_ctc: "", expected_ctc: "", notice_period: "", current_location: "", preferred_location: "", open_to_relocation: false, relocation_reason: "" });
  const jobLoc = (config?.job_location || "").trim();
  const curLoc = (form.current_location || "").trim();
  const needsRelocation = !!jobLoc && !!curLoc && !sameCity(jobLoc, curLoc);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [selectedMember, setSelectedMember] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [audio, setAudio] = useState<Record<string, File>>({});
  const [resume, setResume] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  // Optional: link this fill to an EXISTING candidate (avoids creating a duplicate).
  const [linked, setLinked] = useState<{ id: string; name: string } | null>(null);
  const [candQuery, setCandQuery] = useState("");
  const [candResults, setCandResults] = useState<any[]>([]);
  const [candLoading, setCandLoading] = useState(false);

  useEffect(() => {
    api.get(`/requirements/${id}/assessment/form-config`).then(setConfig).catch(() => setError("Failed to load assessment configuration."));
  }, [id]);

  useEffect(() => {
    if (linked) { setCandResults([]); setCandLoading(false); return; }
    const q = candQuery.trim();
    if (q.length < 2) { setCandResults([]); setCandLoading(false); return; }
    setCandLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/candidates?name=${encodeURIComponent(q)}&limit=8`);
        setCandResults(res?.items || []);
      } catch { setCandResults([]); } finally { setCandLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [candQuery, linked]);

  const pickCandidate = (c: any) => {
    setLinked({ id: c.id, name: c.Name || c.name || "Candidate" });
    setIdentity({ name: c.Name || c.name || "", email: c.Email || c.email || "", phone: c.PhoneNumber || c.phone || "" });
    setCandResults([]);
    setCandQuery("");
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError("");
    // TODO(security): Ensure backend performs server-side virus scanning and magic-byte validation on uploaded audio/resume files before permanent storage.
    try {
      const fd = new FormData();
      fd.append("payload", JSON.stringify({
        identity,
        form: { ...form, skill_self_ratings: config.skills.map((s) => ({ skill: s.skill, requirement: s.requirement, members: s.members || [], selected: selectedMember[s.skill] || null, rating: ratings[s.skill] ?? null })) },
        text_answers: Object.entries(texts).map(([question_id, text]) => ({ question_id, text })),
      }));
      for (const [qid, file] of Object.entries(audio)) {
        fd.append("audio_question_ids", qid);
        fd.append("audio_files", file);
      }
      if (resume) fd.append("resume_file", resume);
      if (linked) fd.append("candidate_id", linked.id);

      const token = getToken();
      const res = await fetch(`${API_BASE}/requirements/${id}/assessment/recruiter-fill`, {
        method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || "Failed to submit assessment.");
      navigate(back);
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <div className="twd-scope">
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <div style={{ height: 28, width: 240, background: "var(--twd-line2)", borderRadius: 6, marginBottom: 24 }} />
          <div style={{ height: 44, width: "100%", background: "var(--twd-line2)", borderRadius: 10, marginBottom: 24 }} />
          <div style={{ height: 400, width: "100%", background: "var(--twd-surface)", border: "1px solid var(--twd-line2)", borderRadius: 16 }} />
        </div>
      </div>
    );
  }

  const skillsDone = config.skills.length === 0 || config.skills.every(
    (s) => (s.requirement || "").toLowerCase().startsWith("good") || ratings[s.skill]);
  const detailsDone = !!(identity.name && identity.email && identity.phone && form.present_company && form.current_ctc && form.expected_ctc && form.notice_period && form.current_location);
  const questionsDone = config.questions.length === 0 || config.questions.every(
    (q) => q.required === false || (q.type === "text" ? !!texts[q.id]?.trim() : !!audio[q.id]));

  const TABS: { key: "details" | "skills" | "questions"; label: string; done: boolean }[] = [
    { key: "details", label: "Details", done: detailsDone },
    { key: "skills", label: `Skills (${config.skills.length})`, done: skillsDone },
    { key: "questions", label: `Questions (${config.questions.length})`, done: questionsDone },
  ];

  const currStepIndex = TABS.findIndex((t) => t.key === tab);

  // Central navigation: moving FORWARD requires the Details step to be
  // complete (same rule whether via Next or clicking a stepper circle).
  const goToTab = (target: "details" | "skills" | "questions") => {
    const order = ["details", "skills", "questions"] as const;
    if (order.indexOf(target) > order.indexOf(tab) && !detailsDone) {
      setShowErrors(true);
      setTab("details");
      return;
    }
    setShowErrors(false);
    setError("");
    setTab(target);
  };

  const handleNext = () => {
    if (tab === "details") goToTab("skills");
    else if (tab === "skills") goToTab("questions");
  };

  const handlePrev = () => {
    if (tab === "questions") goToTab("skills");
    else if (tab === "skills") goToTab("details");
  };

  const getRatingLabel = (val: number) => {
    switch (val) {
      case 1: return "1/5 - Novice";
      case 2: return "2/5 - Basic";
      case 3: return "3/5 - Intermediate";
      case 4: return "4/5 - Advanced";
      case 5: return "5/5 - Expert";
      default: return "Not rated";
    }
  };

  return (
    <div className="twd-scope">
      <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div className="twd-head twd-head--tight twd-rise" style={{ alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h1 className="twd-title twd-title--sm"><span className="twd-title--accent">Fill Assessment</span> on Behalf</h1>
              <span className="twd-pill twd-pill--neutral">
                Step {currStepIndex + 1} of 3: {TABS[currStepIndex].label.split(" (")[0]}
              </span>
            </div>
            {config.role_title && <p className="twd-sub">{config.role_title}</p>}
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 12, background: "var(--twd-red-bg)", color: "var(--twd-red-text)", border: "1px solid color-mix(in srgb, var(--twd-red) 35%, transparent)", fontSize: 13.5, fontWeight: 500, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss"
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 2, display: "inline-flex", flexShrink: 0 }}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
        {showErrors && !detailsDone && tab === "details" && (
          <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 12, background: "var(--twd-amber-bg)", color: "var(--twd-amber)", border: "1px solid color-mix(in srgb, var(--twd-amber) 35%, transparent)", fontSize: 13.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="warning" size={16} />
            <span style={{ flex: 1 }}>Please complete all mandatory details marked with an asterisk (*) before proceeding.</span>
            <button type="button" onClick={() => setShowErrors(false)} aria-label="Dismiss"
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 2, display: "inline-flex", flexShrink: 0 }}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        {/* Stepper (position-based: connectors stay filled for every step you've passed) */}
        <div className="twd-steps">
          {TABS.map((t, idx) => (
            <button
              key={t.key}
              type="button"
              className="twd-step"
              data-state={idx === currStepIndex ? "active" : idx < currStepIndex ? "done" : "todo"}
              onClick={() => goToTab(t.key)}
              aria-current={tab === t.key ? "step" : undefined}
            >
              <span className="twd-step-dot">
                {idx < currStepIndex ? <Icon name="check" size={15} /> : idx + 1}
              </span>
              <span className="twd-step-label">{t.label}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: "1.5rem", borderRadius: 16, border: "1px solid var(--twd-line2)", background: "var(--twd-surface)" }}>
          {tab === "details" && (
            <div>
              {/* Link to an existing candidate (prevents duplicates) */}
              <div style={{ marginBottom: 24, padding: "16px 20px", border: "1px solid var(--twd-line2)", borderRadius: 14, background: "var(--twd-surface2)" }}>
                <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--twd-faint)", display: "block", marginBottom: 10 }}>Link to existing candidate profile (optional)</label>
                {linked ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: "var(--twd-surface)", padding: "12px 16px", borderRadius: 12, border: "1px solid color-mix(in srgb, var(--twd-green) 40%, transparent)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--twd-green-bg)", color: "var(--twd-green)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="user" size={17} />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{linked.name}</div>
                        <div style={{ fontSize: 12, color: "var(--twd-green)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                          <Icon name="check" size={12} /> Active ATS profile linked successfully
                        </div>
                      </div>
                    </div>
                    <button type="button" className="twd-btn twd-btn-ghost twd-btn-sm" onClick={() => setLinked(null)}>Unlink / Change</button>
                  </div>
                ) : (
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "relative" }}>
                      <input value={candQuery} onChange={(e) => setCandQuery(e.target.value)} placeholder="Search candidates by name…" style={{ ...inp, paddingRight: 36 }} />
                      {candLoading && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--twd-faint)" }}>…</span>}
                    </div>
                    {candResults.length > 0 && (
                      <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 6px)", zIndex: 30, background: "var(--twd-surface)", border: "1px solid var(--twd-line)", borderRadius: 12, boxShadow: "0 16px 40px -16px var(--twd-shadow-lg)", maxHeight: 260, overflowY: "auto" }}>
                        {candResults.map((c) => (
                          <div key={c.id} onClick={() => pickCandidate(c)} style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--twd-line2)", display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--twd-red-bg)", color: "var(--twd-red-text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Icon name="user" size={14} />
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.Name || c.name || "-"}</div>
                              <div style={{ fontSize: 12, color: "var(--twd-faint)" }}>{c.Email || c.email || ""}{c.PhoneNumber ? ` · ${c.PhoneNumber}` : ""}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: "var(--twd-faint)", marginTop: 6 }}>Leave empty to create a new candidate from the details below.</div>
                  </div>
                )}
              </div>

              <FormGrid>
                <Field label="Full name" required error={showErrors && !identity.name}><input style={inp} value={identity.name} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} /></Field>
                <Field label="Email" required error={showErrors && !identity.email}><input style={inp} type="email" value={identity.email} onChange={(e) => setIdentity({ ...identity, email: e.target.value })} /></Field>
              </FormGrid>
              <FormGrid>
                <Field label="Phone" required error={showErrors && !identity.phone}><input style={inp} value={identity.phone} onChange={(e) => setIdentity({ ...identity, phone: e.target.value })} /></Field>
                <Field label="Current company" required error={showErrors && !form.present_company}><input style={inp} value={form.present_company} onChange={(e) => setForm({ ...form, present_company: e.target.value })} /></Field>
              </FormGrid>
              <FormGrid>
                <Field label="Current CTC" required error={showErrors && !form.current_ctc}><input style={inp} value={form.current_ctc} onChange={(e) => setForm({ ...form, current_ctc: e.target.value })} /></Field>
                <Field label="Expected CTC" required error={showErrors && !form.expected_ctc}><input style={inp} value={form.expected_ctc} onChange={(e) => setForm({ ...form, expected_ctc: e.target.value })} /></Field>
              </FormGrid>
              <FormGrid>
                <Field label="Notice period" required error={showErrors && !form.notice_period}><input style={inp} value={form.notice_period} onChange={(e) => setForm({ ...form, notice_period: e.target.value })} /></Field>
                <Field label="Current location" required error={showErrors && !form.current_location}><input style={inp} value={form.current_location} onChange={(e) => setForm({ ...form, current_location: e.target.value })} /></Field>
              </FormGrid>

              {needsRelocation && (
                <FormGrid>
                  <Field label="Preferred location"><input style={inp} value={form.preferred_location} onChange={(e) => setForm({ ...form, preferred_location: e.target.value })} /></Field>
                </FormGrid>
              )}
              {needsRelocation && (
                <div style={{ marginBottom: 20, padding: "14px 18px", border: "1px solid var(--twd-line)", borderRadius: 14, background: "var(--twd-surface2)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.open_to_relocation} onChange={(e) => setForm({ ...form, open_to_relocation: e.target.checked })} style={{ width: 18, height: 18, accentColor: "var(--twd-red)" }} />
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Icon name="pin" size={15} /> This role is based in <strong>{jobLoc}</strong>. Is the candidate willing to relocate there?
                    </span>
                  </label>
                  {form.open_to_relocation && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--twd-line2)" }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--twd-soft)", marginBottom: 6 }}>Strongest reason to relocate to {jobLoc}</label>
                      <textarea rows={2} value={form.relocation_reason} onChange={(e) => setForm({ ...form, relocation_reason: e.target.value })} style={{ ...inp, resize: "vertical" }} placeholder="e.g. Family resides there, previously worked in this city..." />
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--twd-soft)", marginBottom: 6 }}>Resume (optional - pulled from ATS if the candidate already exists)</label>
                <div style={{ position: "relative", border: "2px dashed var(--twd-line)", borderRadius: 14, padding: "20px", textAlign: "center", background: "var(--twd-surface2)", cursor: "pointer" }}>
                  <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] || null)}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
                  <div style={{ color: "var(--twd-faint)", marginBottom: 8, display: "flex", justifyContent: "center" }}><Icon name="document" size={26} /></div>
                  {resume ? (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--twd-surface)", padding: "6px 14px", borderRadius: 999, border: "1px solid var(--twd-line)" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--twd-red-text)" }}>{resume.name}</span>
                      <span style={{ fontSize: 11, color: "var(--twd-faint)" }}>({Math.round(resume.size / 1024)} KB)</span>
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setResume(null); }} style={{ background: "none", border: "none", color: "var(--twd-red-text)", cursor: "pointer", fontWeight: 700, padding: "0 4px", display: "inline-flex" }} aria-label="Remove resume"><Icon name="x" size={13} /></button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>Click to browse or drag and drop resume here</div>
                      <div style={{ fontSize: 12, color: "var(--twd-faint)", marginTop: 4 }}>Supports PDF, DOC, DOCX up to 10MB</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "skills" && (
            <div>
              <div style={{ fontSize: 13.5, color: "var(--twd-soft)", marginBottom: 20 }}>Rate the candidate 1–5 on each skill (grouped skills count if they know any one member).</div>
              {config.skills.length === 0 ? (
                <div style={{ fontSize: 14, color: "var(--twd-faint)", padding: "2rem", textAlign: "center", background: "var(--twd-surface2)", borderRadius: 12 }}>No skills configured for this assessment.</div>
              ) : config.skills.map((s) => {
                const currRate = ratings[s.skill] || 0;
                const isGoodToHave = s.requirement?.toLowerCase().startsWith("good");

                return (
                  <div key={s.skill} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--twd-line2)" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{s.skill}</span>
                        <span className={`twd-pill ${isGoodToHave ? "twd-pill--neutral" : "twd-pill--red"}`}>
                          {s.requirement}
                        </span>
                        {isGoodToHave && <span style={{ fontSize: 12, color: "var(--twd-faint)" }}>· optional</span>}
                      </div>
                      {s.members && s.members.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 11, color: "var(--twd-faint)", marginBottom: 6 }}>Any one counts - rate the group, or select the specific tool used:</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {s.members.map((m) => {
                              const sel = selectedMember[s.skill] === m;
                              return (
                                <button key={m} type="button"
                                  onClick={() => setSelectedMember((p) => ({ ...p, [s.skill]: sel ? "" : m }))}
                                  style={{
                                    fontSize: 12, borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit",
                                    border: `1px solid ${sel ? "#d9a441" : "var(--twd-line)"}`,
                                    background: sel ? "var(--twd-amber-bg)" : "var(--twd-surface2)",
                                    color: sel ? "var(--twd-amber)" : "var(--twd-soft)", fontWeight: sel ? 600 : 500,
                                    transition: "all 0.2s",
                                  }}>
                                  {sel ? "✓ " : ""}{m}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                      <div style={{ display: "flex", gap: 2 }}>
                        {[1, 2, 3, 4, 5].map((n) => {
                          const filled = n <= currRate;
                          return (
                            <button key={n} type="button"
                              onClick={() => setRatings({ ...ratings, [s.skill]: n })}
                              title={`${n}/5`}
                              style={{
                                border: "none", background: "transparent", cursor: "pointer", padding: 2,
                                transition: "transform 0.15s ease-in-out",
                              }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "#d9a441" : "none"} stroke={filled ? "#d9a441" : "var(--twd-line)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "all 0.15s ease-in-out" }}>
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            </button>
                          );
                        })}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: currRate > 0 ? "#d9a441" : "var(--twd-faint)", width: 110, textAlign: "right" }}>
                        {getRatingLabel(currRate)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "questions" && (
            <div>
              {config.questions.length === 0 ? (
                <div style={{ fontSize: 14, color: "var(--twd-faint)", padding: "2rem", textAlign: "center", background: "var(--twd-surface2)", borderRadius: 12 }}>No questions configured for this assessment.</div>
              ) : config.questions.map((q, i) => (
                <div key={q.id} style={{ marginBottom: 20, padding: 20, background: "var(--twd-surface2)", borderRadius: 14, border: "1px solid var(--twd-line2)" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: q.hint ? 6 : 14, display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ background: "var(--twd-red)", color: "#fff", padding: "2px 8px", borderRadius: 6, fontSize: 13, flexShrink: 0 }}>Q{i + 1}</span>
                    <span style={{ flex: 1 }}>{q.prompt}{q.required !== false && <span style={{ color: "var(--twd-red-text)" }}> *</span>}</span>
                  </div>
                  {q.hint && (
                    <div style={{ fontSize: 13, color: "var(--twd-faint)", marginBottom: 14, paddingLeft: 38, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="info" size={13} /> {q.hint}
                    </div>
                  )}
                  <div style={{ paddingLeft: 38 }}>
                    {q.type === "text" ? (
                      <textarea rows={4} value={texts[q.id] || ""} onChange={(e) => setTexts({ ...texts, [q.id]: e.target.value })}
                        placeholder="Enter the candidate's answer here…" style={{ ...inp, resize: "vertical" }} />
                    ) : (
                      <div style={{ border: "2px dashed var(--twd-line)", borderRadius: 14, padding: "20px", textAlign: "center", background: "var(--twd-surface)", position: "relative" }}>
                        <input type="file" accept="audio/*"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) setAudio((s) => ({ ...s, [q.id]: f })); }}
                          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
                        <div style={{ color: "var(--twd-faint)", marginBottom: 8, display: "flex", justifyContent: "center" }}><Icon name="mic" size={26} /></div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>Upload the candidate's audio recording{q.max_seconds ? ` (≈ ${q.max_seconds}s)` : ""}</div>
                        <div style={{ fontSize: 12, color: "var(--twd-faint)", marginTop: 4 }}>Supports MP3, WAV, M4A, OGG up to 25MB</div>
                        {audio[q.id] && (
                          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--twd-line2)" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--twd-green)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                              <Icon name="check" size={14} /> {audio[q.id].name} ({Math.round(audio[q.id].size / 1024)} KB)
                            </div>
                            <audio controls src={URL.createObjectURL(audio[q.id])} style={{ width: "100%", marginTop: 12, borderRadius: 8 }} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Save / Wizard Navigation Bar (sits at the end of the form) */}
        <div style={{
          background: "var(--twd-surface)",
          border: "1px solid var(--twd-line2)", padding: "14px 20px",
          margin: "20px 0 0 0", display: "flex", justifyContent: "space-between", alignItems: "center",
          borderRadius: 16,
        }}>
          <div>
            {tab === "details" ? (
              <button className="twd-btn twd-btn-ghost" onClick={() => navigate(back)} disabled={saving}>Cancel</button>
            ) : (
              <button className="twd-btn twd-btn-ghost" onClick={handlePrev} disabled={saving}>
                <Icon name="chevron-left" size={14} /> Previous
              </button>
            )}
          </div>
          <div>
            {tab === "questions" ? (
              <button className="twd-btn twd-btn-primary" onClick={save} disabled={saving}>
                {saving ? "Submitting…" : <>Submit Assessment <Icon name="check" size={14} /></>}
              </button>
            ) : (
              <button className="twd-btn twd-btn-primary" onClick={handleNext} disabled={saving}>
                Next: {tab === "details" ? "Skills" : "Questions"} <Icon name="chevron-right" size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
