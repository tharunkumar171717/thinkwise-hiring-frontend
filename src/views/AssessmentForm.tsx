import { useEffect, useRef, useState } from "react";
import { useParams } from "../lib/router";
import { API_BASE } from "../services/api";

/**
 * Public, token-scoped candidate self-assessment form (/assess/:token).
 *
 * No auth - uses raw fetch (not apiFetch, which would redirect to /login on 401).
 * Audio answers are held in-browser as Blobs and persisted only on submit
 * (per spec: "save the audio to the database only after submission").
 */

type Question = {
  id: string;
  type: "voice" | "text";
  category: string;
  prompt: string;
  hint?: string;
  required?: boolean;
  min_seconds?: number;
  max_seconds?: number;
  max_words?: number;
  skills?: string[];
};
type SkillRow = { skill: string; requirement: string; members?: string[] };
type FormConfig = {
  token: string;
  mode: string;
  ask_source?: boolean;
  collect_resume: boolean;
  role_title?: string;
  client_name?: string;
  job_location?: string;
  questions: Question[];
  skills: SkillRow[];
  prefill?: { name?: string; email?: string };
};

const COLORS = {
  navy: "#1f2a52",
  gold: "#d9a441",
  bg: "#f4f5f8",
  line: "#e2e5ec",
  text: "#2c3242",
  sub: "#6b7280",
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

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "linkedin_jobs", label: "LinkedIn Jobs" },
  { value: "job_posting", label: "Job Posting" },
  { value: "recruiter", label: "Recruiter" },
  { value: "public_post", label: "Public Post" },
];

const REASON_COPY: Record<string, string> = {
  not_found: "This assessment link is invalid.",
  expired: "This assessment link has expired. Please contact your recruiter.",
  disabled: "This assessment link is no longer active.",
};

export default function AssessmentForm() {
  const { token } = useParams<{ token: string }>();
  const [config, setConfig] = useState<FormConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // identity + form state
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [identity, setIdentity] = useState({ name: "", email: "", phone: "" });
  const [form, setForm] = useState({
    source: "",
    present_company: "",
    current_ctc: "",
    expected_ctc: "",
    last_working_day: "",
    notice_period: "",
    current_location: "",
    preferred_location: "",
    open_to_relocation: false,
    relocation_reason: "",
  });
  // Relocation only matters when the candidate's CITY differs from the job's.
  // Match on the city token (text before the first comma/slash), so "Hyderabad"
  // matches "Hyderabad, India".
  const jobLoc = (config?.job_location || "").trim();
  const curLoc = (form.current_location || "").trim();
  const needsRelocation = !!jobLoc && !!curLoc && !sameCity(jobLoc, curLoc);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [selectedMember, setSelectedMember] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [audio, setAudio] = useState<Record<string, Blob>>({});
  const [resume, setResume] = useState<File | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/assess/${token}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setLoadError(body?.detail || "not_found");
          return;
        }
        const data: FormConfig = await res.json();
        setConfig(data);
        if (data.prefill?.name) setIdentity((s) => ({ ...s, name: data.prefill!.name || "" }));
        if (data.prefill?.email) setIdentity((s) => ({ ...s, email: data.prefill!.email || "" }));
      } catch {
        setLoadError("not_found");
      }
    })();
  }, [token]);

  const submit = async () => {
    if (!config) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          identity,
          form: {
            ...form,
            skill_self_ratings: config.skills.map((s) => ({
              skill: s.skill,
              requirement: s.requirement,
              members: s.members || [],
              selected: selectedMember[s.skill] || null,
              rating: ratings[s.skill] ?? null,
            })),
          },
          text_answers: Object.entries(texts).map(([question_id, text]) => ({ question_id, text })),
        })
      );
      for (const [qid, blob] of Object.entries(audio)) {
        fd.append("audio_question_ids", qid);
        fd.append("audio_files", blob, `${qid}.webm`);
      }
      if (resume) fd.append("resume_file", resume);

      const res = await fetch(`${API_BASE}/assess/${token}/submit`, { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body?.detail === "string" ? body.detail : "Submission failed");
      }
      setDone(true);
    } catch (e: any) {
      alert(e?.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) return <Centered>{REASON_COPY[loadError] || REASON_COPY.not_found}</Centered>;
  if (!config) return <Centered>Loading…</Centered>;
  if (done)
    return (
      <Centered>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <h2 style={{ color: "#dc2626", margin: "12px 0 6px" }}>Thank you!</h2>
          <p style={{ color: "#dc2626" }}>
            Your responses have been submitted. Your recruiter will be in touch.
          </p>
        </div>
      </Centered>
    );

  // No question is special-cased by id - every configured question (whichever
  // set produced it: the built-in default, the AI-generated JD questions, or a
  // recruiter's custom edits) renders generically in the Questions step, in the
  // exact order it's stored. This is what makes reordering/required-flags/prompts
  // always reflect correctly, and avoids a question ever being shown twice.
  // Resume: unified links collect one for every source except "recruiter"
  // (the recruiter already has it); legacy links follow their collect_resume flag.
  const wantsResume = config?.ask_source ? form.source !== "recruiter" : !!config?.collect_resume;

  const validateDetails = () => {
    if (!identity.name || !identity.email || !identity.phone) return "Please fill in your name, email, and phone.";
    if (config?.ask_source && !form.source) return "Please select how you heard about this opportunity.";
    if (wantsResume && !resume) return "Please upload your resume.";
    if (!form.present_company || !form.notice_period || !form.current_ctc || !form.expected_ctc || !form.current_location) return "Please fill in all compensation and availability details.";
    if (needsRelocation && form.open_to_relocation && !form.relocation_reason.trim()) return `Please share your reason for relocating to ${jobLoc}.`;
    return null;
  };

  const validateQuestions = () => {
    if (config?.questions) {
      for (const q of config.questions) {
        if (q.required !== false) {
          if (q.type === "text" && (!texts[q.id] || !texts[q.id].trim())) return `Please answer question: ${q.prompt}`;
          if (q.type === "voice" && !audio[q.id]) return `Please record an answer for: ${q.prompt}`;
        }
      }
    }
    return null;
  };

  const validateSkills = () => {
    if (config?.skills && config.skills.length > 0) {
      // Only mandatory skills must be rated; good-to-have are optional.
      const missing = config.skills.some(s =>
        !(s.requirement || "").toLowerCase().startsWith("good") && (!ratings[s.skill] || ratings[s.skill] === 0));
      if (missing) return "Please rate all mandatory skills before proceeding.";
    }
    return null;
  };

  const handleNext = () => {
    let err = null;
    if (step === 0) err = validateDetails();
    if (step === 1) err = validateQuestions();
    if (step === 2) err = validateSkills();

    if (err) {
      alert(err);
      return;
    }
    setStep((s) => (s + 1) as 1 | 2 | 3);
    window.scrollTo(0, 0);
  };

  const handleBack = () => {
    setStep((s) => (s - 1) as 0 | 1 | 2);
    window.scrollTo(0, 0);
  };

  const STEPS = ["Introduction & Details", "Questions", "Skills", "Submit"];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, padding: "24px 12px", fontFamily: "var(--font-family)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Header role={config.role_title} />

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, position: "relative" }}>
          <div style={{ position: "absolute", top: 16, left: 0, right: 0, height: 2, background: COLORS.line, zIndex: 0 }} />
          {STEPS.map((label, i) => {
            const active = i === step;
            const past = i < step;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1, width: 80, fontFamily: "var(--font-secondary)" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
                  background: active || past ? COLORS.navy : "#fff", color: active || past ? "#fff" : COLORS.navy,
                  border: `2px solid ${active || past ? COLORS.navy : COLORS.line}`, fontWeight: 700, fontSize: 14,
                  transition: "all 0.2s ease"
                }}>
                  {past ? "✓" : i + 1}
                </div>
                <div style={{ fontSize: 12, marginTop: 8, fontWeight: active ? 700 : 500, color: active ? COLORS.navy : COLORS.sub, textAlign: "center" }}>
                  {label}
                </div>
              </div>
            );
          })}
        </div>

        {step === 0 && (
          <div className="fade-in">
            <Card title="1. Personal Details">
              <Field label="Full name *">
                <input style={inp} value={identity.name} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} />
              </Field>
              <Row>
                <Field label="Email *">
                  <input style={inp} type="email" value={identity.email} onChange={(e) => setIdentity({ ...identity, email: e.target.value })} />
                </Field>
                <Field label="Phone *">
                  <input style={inp} type="tel" value={identity.phone} onChange={(e) => setIdentity({ ...identity, phone: e.target.value })} />
                </Field>
              </Row>
              {config.ask_source && (
                <Field label="How did you get to know about this opportunity? *">
                  <select
                    style={inp}
                    value={form.source}
                    onChange={(e) => {
                      const source = e.target.value;
                      setForm({ ...form, source });
                      if (source === "recruiter") setResume(null);
                    }}
                  >
                    <option value="">Select…</option>
                    {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
              )}
              {wantsResume && (
                <Field label="Upload your resume (PDF/DOCX) *">
                  <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] || null)} />
                  {resume && <div style={{ fontSize: 13, color: COLORS.navy, marginTop: 4 }}>Selected: {resume.name}</div>}
                </Field>
              )}
              {config.ask_source && form.source === "recruiter" && (
                <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 12 }}>
                  No resume needed - your recruiter will share it with us.
                </div>
              )}
            </Card>

            <Card title="2. Compensation & Availability">
              <Row>
                <Field label="Current company *"><input style={inp} value={form.present_company} onChange={(e) => setForm({ ...form, present_company: e.target.value })} /></Field>
                <Field label="Notice period *"><input style={inp} value={form.notice_period} onChange={(e) => setForm({ ...form, notice_period: e.target.value })} /></Field>
              </Row>
              <Row>
                <Field label="Current CTC *"><input style={inp} value={form.current_ctc} onChange={(e) => setForm({ ...form, current_ctc: e.target.value })} /></Field>
                <Field label="Expected CTC *"><input style={inp} value={form.expected_ctc} onChange={(e) => setForm({ ...form, expected_ctc: e.target.value })} /></Field>
              </Row>
              <Row>
                <Field label="Current location *"><input style={inp} value={form.current_location} onChange={(e) => setForm({ ...form, current_location: e.target.value })} /></Field>
                {needsRelocation && (
                  <Field label="Preferred location"><input style={inp} value={form.preferred_location} onChange={(e) => setForm({ ...form, preferred_location: e.target.value })} /></Field>
                )}
              </Row>
              {needsRelocation && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.line}` }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.text, fontSize: 14 }}>
                    <input type="checkbox" checked={form.open_to_relocation} onChange={(e) => setForm({ ...form, open_to_relocation: e.target.checked })} />
                    <span>This role is in <strong>{jobLoc}</strong>. Would you move there for it?</span>
                  </label>
                  {form.open_to_relocation && (
                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: "block", fontSize: 12, color: COLORS.sub, marginBottom: 4 }}>Your strongest reason to relocate to {jobLoc} *</label>
                      <textarea rows={2} value={form.relocation_reason} onChange={(e) => setForm({ ...form, relocation_reason: e.target.value })} style={{ ...inp, resize: "vertical" }} />
                    </div>
                  )}
                </div>
              )}
            </Card>

          </div>
        )}

        {step === 1 && (
          <div className="fade-in">
            <Card title="Questions" subtitle="Please answer the following assessment questions.">
              {config.questions.length === 0 ? <div style={{ color: COLORS.sub }}>No questions configured.</div> : config.questions.map((q, i, arr) => (
                <div key={q.id} style={{ marginBottom: 24, paddingBottom: 24, borderBottom: i < arr.length - 1 ? `1px solid ${COLORS.line}` : 'none' }}>
                  <div style={{ fontWeight: 600, color: COLORS.text, fontSize: 15 }}>{i + 1}. {q.prompt}{q.required !== false && " *"}</div>
                  {q.hint && <div style={{ fontSize: 13, color: COLORS.sub, marginTop: 4 }}>{q.hint}</div>}
                  {q.type === "text" ? (
                    <TextAnswer value={texts[q.id] || ""} maxWords={q.max_words || 200} onChange={(v) => setTexts({ ...texts, [q.id]: v })} />
                  ) : (
                    <AudioRecorder
                      maxSeconds={q.max_seconds || 240}
                      minSeconds={q.min_seconds || 0}
                      blob={audio[q.id]}
                      onChange={(b) => setAudio((s) => ({ ...s, [q.id]: b }))}
                      onClear={() => setAudio((s) => { const n = { ...s }; delete n[q.id]; return n; })}
                    />
                  )}
                </div>
              ))}
            </Card>
          </div>
        )}

        {step === 2 && (
          <div className="fade-in">
            <Card title="Rate yourself on each skill" subtitle="1 = exposure only · 5 = led / owned it independently *">
              {config.skills.length === 0 ? <div style={{ color: COLORS.sub }}>No specific skills required.</div> : config.skills.map((s) => {
                const isGroup = (s.members?.length || 0) > 0;
                return (
                  <div key={s.skill} style={{ padding: "14px 0", borderBottom: `1px solid ${COLORS.line}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <span style={{ fontWeight: 600, color: COLORS.text }}>{s.skill}</span>
                        <span style={{ marginLeft: 8, fontSize: 11, color: COLORS.sub, textTransform: "uppercase" }}>{s.requirement}</span>
                        {(s.requirement || "").toLowerCase().startsWith("good") && <span style={{ marginLeft: 6, fontSize: 11, color: COLORS.sub }}>· optional</span>}
                      </div>
                      <Stars value={ratings[s.skill] || 0} onChange={(v) => setRatings({ ...ratings, [s.skill]: v })} />
                    </div>
                    {isGroup && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 6 }}>
                          Knowing <strong>any one</strong> of these counts. Rate the group above, or tap the one you actually use:
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {s.members!.map((m) => {
                            const sel = selectedMember[s.skill] === m;
                            return (
                              <button key={m} type="button"
                                onClick={() => setSelectedMember((p) => ({ ...p, [s.skill]: sel ? "" : m }))}
                                style={{
                                  fontSize: 12, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                                  border: `1px solid ${sel ? COLORS.gold : COLORS.line}`,
                                  background: sel ? "#fff7e6" : "#fff", color: COLORS.text, fontWeight: sel ? 600 : 400,
                                }}>
                                {sel ? "✓ " : ""}{m}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          </div>
        )}

        {step === 3 && (
          <div className="fade-in">
            <Card title="Review your submission">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${COLORS.line}`, paddingBottom: 8, marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, margin: 0, color: COLORS.navy }}>Details</h3>
                <button onClick={() => setStep(0)} style={{ background: "transparent", border: "none", color: COLORS.gold, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Edit</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                <ReviewField label="Name" value={identity.name} />
                <ReviewField label="Email" value={identity.email} />
                <ReviewField label="Phone" value={identity.phone} />
                {config.ask_source && <ReviewField label="Source" value={SOURCE_OPTIONS.find((o) => o.value === form.source)?.label || ""} />}
                {wantsResume && <ReviewField label="Resume" value={resume?.name || "Missing"} />}
                <ReviewField label="Current Company" value={form.present_company} />
                <ReviewField label="Notice Period" value={form.notice_period} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${COLORS.line}`, paddingBottom: 8, marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, margin: 0, color: COLORS.navy }}>Questions</h3>
                <button onClick={() => setStep(1)} style={{ background: "transparent", border: "none", color: COLORS.gold, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Edit</button>
              </div>
              <div style={{ marginBottom: 24 }}>
                {config.questions.map((q, i) => {
                  const answered = q.type === "text" ? !!texts[q.id]?.trim() : !!audio[q.id];
                  return (
                    <div key={q.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginRight: 16 }}>{i + 1}. {q.prompt}</span>
                      <span style={{ fontWeight: 600, color: answered ? COLORS.navy : "#c0392b" }}>{answered ? "Answered ✓" : "Missing"}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${COLORS.line}`, paddingBottom: 8, marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, margin: 0, color: COLORS.navy }}>Skills</h3>
                <button onClick={() => setStep(2)} style={{ background: "transparent", border: "none", color: COLORS.gold, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Edit</button>
              </div>
              <div>
                {config.skills.map(s => (
                  <div key={s.skill} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                    <span>{s.skill}</span>
                    <span style={{ fontWeight: 600 }}>{ratings[s.skill] || 0}/5</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          {step > 0 && (
            <button onClick={handleBack} style={{ ...submitBtn, background: "transparent", border: `2px solid ${COLORS.line}`, color: COLORS.text }}>
              Back
            </button>
          )}
          {step < 3 ? (
            <button onClick={handleNext} style={submitBtn}>
              Next step
            </button>
          ) : (
            <button onClick={submit} disabled={submitting} style={submitBtn}>
              {submitting ? "Submitting…" : "Submit assessment"}
            </button>
          )}
        </div>
        {step === 3 && (
          <p style={{ textAlign: "center", fontSize: 12, color: COLORS.sub, marginTop: 12 }}>
            By submitting, you consent to your audio answers being used to assess this application.
          </p>
        )}
      </div>
    </div>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.sub, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.navy, marginTop: 2 }}>{value || "-"}</div>
    </div>
  );
}

// ── Audio recorder (record / stop / delete / re-record; blob kept in-memory) ──
export function AudioRecorder({ maxSeconds, minSeconds = 0, blob, onChange, onClear }: {
  maxSeconds: number; minSeconds?: number; blob?: Blob; onChange: (b: Blob) => void; onClear: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  const stop = () => {
    mediaRef.current?.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
    setRecording(false);
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        onChange(new Blob(chunksRef.current, { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setElapsed(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsed((e) => {
          if (e + 1 >= maxSeconds) { stop(); return maxSeconds; }
          return e + 1;
        });
      }, 1000);
    } catch {
      alert("Microphone access is required to answer this question.");
    }
  };

  const url = blob ? URL.createObjectURL(blob) : null;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const belowMin = elapsed < minSeconds;
  return (
    <div style={{ marginTop: 8, padding: 12, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: "#fafbfc" }}>
      {!blob && !recording && (
        <button onClick={start} style={recBtn}>
          ● Record {minSeconds ? `(${fmt(minSeconds)}–${fmt(maxSeconds)})` : `(max ${fmt(maxSeconds)})`}
        </button>
      )}
      {recording && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button onClick={stop} disabled={belowMin}
            style={{ ...recBtn, background: belowMin ? "#9aa0ad" : "#c0392b", cursor: belowMin ? "not-allowed" : "pointer" }}>
            ■ Stop · {fmt(elapsed)} / {fmt(maxSeconds)}
          </button>
          {belowMin && <span style={{ fontSize: 12, color: COLORS.sub }}>Keep speaking - at least {fmt(minSeconds)} required.</span>}
        </div>
      )}
      {blob && url && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <audio controls src={url} style={{ height: 36 }} />
          <button onClick={onClear} style={{ ...recBtn, background: "transparent", color: "#c0392b", border: "1px solid #c0392b" }}>
            Delete & re-record
          </button>
        </div>
      )}
    </div>
  );
}

function TextAnswer({ value, maxWords, onChange }: { value: string; maxWords: number; onChange: (v: string) => void }) {
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  const over = words > maxWords;
  return (
    <div style={{ marginTop: 8 }}>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4}
        style={{ ...inp, resize: "vertical", borderColor: over ? "#c0392b" : COLORS.line }} />
      <div style={{ fontSize: 12, color: over ? "#c0392b" : COLORS.sub, textAlign: "right" }}>{words}/{maxWords} words</div>
    </div>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)} title={`${n}/5`}
          style={{ cursor: "pointer", border: "none", background: "transparent", fontSize: 22, color: n <= value ? COLORS.gold : "#d4d7df", lineHeight: 1 }}>
          ★
        </button>
      ))}
    </div>
  );
}

// ── Layout atoms ──────────────────────────────────────────────────────────
function Header({ role }: { role?: string }) {
  return (
    <div style={{ background: "#680202ff", color: "#fff", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
      <div style={{ fontSize: 12, letterSpacing: 1, color: COLORS.bg, textTransform: "uppercase" }}>Candidate Assessment</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{role || "Self-Assessment"}</div>
    </div>
  );
}
function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: any }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: COLORS.navy, marginBottom: subtitle ? 2 : 12 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 12 }}>{subtitle}</div>}
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: any }) {
  return (
    <div style={{ flex: 1, marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: COLORS.sub, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
function Row({ children }: { children: any }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>;
}
function Centered({ children }: { children: any }) {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 32, maxWidth: 460, color: COLORS.text }}>{children}</div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: `1px solid ${COLORS.line}`, borderRadius: 8,
  fontSize: 14, color: COLORS.text, boxSizing: "border-box", outline: "none",
};
const recBtn: React.CSSProperties = {
  background: COLORS.navy, color: "#fff", border: "none", borderRadius: 8,
  padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const submitBtn: React.CSSProperties = {
  width: "100%", background: "#2f2b2bff", color: "#ffffff", border: "none", borderRadius: 10,
  padding: "14px", fontSize: 16, fontWeight: 700, cursor: "pointer", "fontFamily": "Cambria",
};
