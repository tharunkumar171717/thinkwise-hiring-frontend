import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "../lib/router";
import { api } from "../services/api";
import SkillGroupEditor, { type SkillReq } from "../components/SkillGroupEditor";
import Icon from "../components/Icon";
import "../styles/dashboard.css";

/**
 * Per-requirement assessment editor (Skills | Questions).
 * - Skills: reuses the shared chip-based SkillGroupEditor (tier + grouping),
 *   so it matches requirement creation. Saved back as {skill, requirement, members}.
 * - Questions: clean cards - type, required toggle, prompt, hint, limits.
 *   Add/edit/remove freely.
 */

type Question = {
  id: string; type: "voice" | "text"; category?: string; prompt: string;
  hint?: string; required?: boolean; min_seconds?: number; max_seconds?: number;
  max_words?: number; skills?: string[];
};

const card: React.CSSProperties = {
  border: "1px solid var(--twd-line2)", borderRadius: 14, padding: "1.1rem 1.25rem",
  marginBottom: 14, background: "var(--twd-surface2)",
};
const inputBase: React.CSSProperties = {
  border: "1px solid var(--twd-line)", borderRadius: 10, padding: "9px 12px",
  background: "var(--twd-surface)", color: "var(--twd-ink)",
  fontSize: 14, fontFamily: "inherit", lineHeight: 1.5,
};

export default function AssessmentEditor({ reqId, backTo }: { reqId?: string; backTo?: string } = {}) {
  const routeParams = useParams<{ id: string }>();
  const id = reqId || routeParams.id;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isOnboarding = params.get("onboarding") === "1";
  const back = backTo || `/requirements/${id}`;

  const [tab, setTab] = useState<"skills" | "questions">("skills");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleTitle, setRoleTitle] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [skillReqs, setSkillReqs] = useState<SkillReq[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    (async () => {
      const cfg = await api.get(`/requirements/${id}/assessment-config`);
      setRoleTitle(cfg.role_title || "");
      setSuggestions([...(cfg.parsed_must_have || []), ...(cfg.parsed_good_to_have || [])]);
      setSkillReqs((cfg.skills || []).map((s: any) => ({
        label: s.skill,
        tier: (s.requirement || "Mandatory").toLowerCase().startsWith("good") ? "good" : "must",
        members: s.members || [],
      })));
      setQuestions((cfg.questions || []).map((q: any) => ({ ...q, required: q.required !== false })));
      setLoading(false);
    })();
  }, [id]);

  const save = async () => {
    setSaving(true);
    try {
      const skills = skillReqs.map((r) => ({
        skill: r.label,
        requirement: r.tier === "good" ? "Good to have" : "Mandatory",
        members: r.members,
      }));
      await api.put(`/requirements/${id}/assessment-config`, { skills, questions });
      navigate(back);
    } finally { setSaving(false); }
  };

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

  if (loading) {
    return (
      <div className="twd-scope">
        <div className="twd-loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="twd-scope">
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <header className="twd-head twd-head--tight twd-rise" style={{ alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="twd-title twd-title--sm"><span className="twd-title--accent">Assessment</span> Setup</h1>
            {roleTitle && <p className="twd-sub">{roleTitle}</p>}
          </div>
        </header>

        {isOnboarding && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            fontSize: 13.5, color: "var(--twd-soft)", background: "var(--twd-surface)",
            border: "1px solid var(--twd-line2)", borderRadius: 14, padding: "12px 16px", marginBottom: 18,
          }}>
            <span style={{ color: "var(--twd-amber)", display: "inline-flex", marginTop: 1 }}><Icon name="info" size={16} /></span>
            This requirement needs a candidate summary report - set up its assessment before submitting candidates.
          </div>
        )}

        {/* Stepper: 1 Skills → 2 Questions */}
        <div className="twd-steps">
          {(["skills", "questions"] as const).map((t, idx) => {
            const currIdx = tab === "skills" ? 0 : 1;
            return (
              <button
                key={t}
                type="button"
                className="twd-step"
                data-state={tab === t ? "active" : idx < currIdx ? "done" : "todo"}
                onClick={() => setTab(t)}
                aria-current={tab === t ? "step" : undefined}
              >
                <span className="twd-step-dot">
                  {idx < currIdx ? <Icon name="check" size={15} /> : idx + 1}
                </span>
                <span className="twd-step-label">
                  {t === "skills" ? "Skills" : `Questions (${questions.length})`}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ padding: "1.5rem", borderRadius: 16, border: "1px solid var(--twd-line2)", background: "var(--twd-surface)" }}>
          {tab === "skills" ? (
            <div>
              <div style={{ fontSize: 13, color: "var(--twd-soft)", marginBottom: 12 }}>
                Skills the candidate self-rates (1–5). Set the tier and group related skills under one label -
                the candidate rates the group once.
              </div>
              <SkillGroupEditor value={skillReqs} onChange={setSkillReqs} suggestions={suggestions} />
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: "var(--twd-soft)" }}>
                  Questions the candidate answers. Toggle <strong>Required</strong> to make one optional.
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="twd-btn twd-btn-ghost twd-btn-sm" onClick={() => addQuestion("voice")}>
                    <Icon name="mic" size={13} /> Audio
                  </button>
                  <button type="button" className="twd-btn twd-btn-ghost twd-btn-sm" onClick={() => addQuestion("text")}>
                    <Icon name="edit" size={13} /> Text
                  </button>
                </div>
              </div>

              {questions.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--twd-faint)", padding: "1.5rem", textAlign: "center", border: "1px dashed var(--twd-line)", borderRadius: 12 }}>
                  No questions yet - add an audio or text question above.
                </div>
              )}

              {questions.map((q, i) => (
                <div key={q.id} style={card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
                      padding: "3px 9px", borderRadius: 999,
                      background: q.type === "voice" ? "rgba(37,99,235,0.1)" : "var(--twd-green-bg)",
                      color: q.type === "voice" ? "#2563eb" : "var(--twd-green)",
                    }}>{q.type === "voice" ? "Audio" : "Text"}</span>
                    <span style={{ fontSize: 12, color: "var(--twd-faint)" }}>Q{i + 1}</span>

                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                      {/* Required switch */}
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
                    style={{ ...inputBase, width: "100%", resize: "vertical", marginBottom: 8, boxSizing: "border-box", minHeight: 76 }} />
                  <input value={q.hint || ""} placeholder="Hint (optional)"
                    onChange={(e) => updateQ(i, { hint: e.target.value })}
                    style={{ ...inputBase, width: "100%", marginBottom: 8, boxSizing: "border-box", color: "var(--twd-soft)" }} />

                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--twd-soft)" }}>
                      Type
                      <select value={q.type} onChange={(e) => updateQ(i, { type: e.target.value as any })}
                        style={{ ...inputBase, padding: "5px 8px" }}>
                        <option value="voice">Audio</option>
                        <option value="text">Text</option>
                      </select>
                    </label>
                    {q.type === "voice" ? (
                      <>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--twd-soft)" }}>
                          Min secs
                          <input type="number" min={0} value={q.min_seconds ?? 0} onChange={(e) => updateQ(i, { min_seconds: parseInt(e.target.value) || 0 })}
                            style={{ ...inputBase, width: 70, padding: "5px 8px" }} />
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--twd-soft)" }}>
                          Max secs
                          <input type="number" min={1} value={q.max_seconds ?? 120} onChange={(e) => updateQ(i, { max_seconds: parseInt(e.target.value) || 120 })}
                            style={{ ...inputBase, width: 70, padding: "5px 8px" }} />
                        </label>
                      </>
                    ) : (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--twd-soft)" }}>
                        Max words
                        <input type="number" min={1} value={q.max_words ?? 200} onChange={(e) => updateQ(i, { max_words: parseInt(e.target.value) || 200 })}
                          style={{ ...inputBase, width: 80, padding: "5px 8px" }} />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer navigation (stepper flow: Skills → Questions → Save) */}
        <div style={{
          background: "var(--twd-surface)", border: "1px solid var(--twd-line2)",
          padding: "14px 20px", margin: "20px 0 0", borderRadius: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <button className="twd-btn twd-btn-ghost" onClick={() => navigate(back)} disabled={saving}>
            Cancel
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            {tab === "questions" && (
              <button className="twd-btn twd-btn-ghost" onClick={() => setTab("skills")} disabled={saving}>
                <Icon name="chevron-left" size={14} /> Back
              </button>
            )}
            {tab === "skills" ? (
              <button className="twd-btn twd-btn-primary" onClick={() => setTab("questions")}>
                Next: Questions <Icon name="chevron-right" size={14} />
              </button>
            ) : (
              <button className="twd-btn twd-btn-primary" onClick={save} disabled={saving}>
                <Icon name="check" size={15} /> {saving ? "Saving…" : isOnboarding ? "Save & finish" : "Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
