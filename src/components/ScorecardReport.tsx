import { useEffect, useState } from "react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { toUtcDate } from "../utils/dateUtils";
type Props = { requirementId: string; candidateId: string; hideWorksheet?: boolean; forceView?: "analysis" };

// Defensive normaliser for the per-pillar Gemini scores: the prompt asks for a
// 0–10 score, but if the model ever returns a 0–100 figure, fold it back to 0–10
// so the "/10" label is always correct. (JD Fit is intentionally left on 0–100.)
function toTen(score: any): string | null {
  const n = typeof score === "number" ? score : parseFloat(score);
  if (n == null || isNaN(n)) return null;
  const v = n > 10 ? n / 10 : n;
  return (Math.round(v * 10) / 10).toString();
}

const RATINGS = {
  behavioral: ["Strong", "Moderate", "Weak"],
  communication: ["Excellent", "Strong", "Good", "Moderate", "Average"],
  fit: ["High", "Medium", "Low"],
  risk: ["None", "Minor", "Major"],
  rec: ["Submit to Client", "Hold", "Reject"],
};
// ── Print styles injected into <head> ─────────────────────────────────────
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 15mm 15mm; }
  
  *, *:before, *:after {
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  
  /* 1. Hide screen view elements completely to reclaim space */
  body *:not(:has(#sc-print-doc)):not(#sc-print-doc):not(#sc-print-doc *) {
    display: none !important;
  }
  
  /* 2. Flatten all layout wrappers to clear sidebar space & fill full-width */
  html, body, body *:has(#sc-print-doc) {
    display: block !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    position: static !important;
    transform: none !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    overflow: visible !important;
  }
  
  /* Ensure all content flows without artificial height/scroll constraints */
  #sc-print-doc {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
  }
  
  /* Guarantee clean breaks without splitting containers */
  .avoid-break { page-break-inside: avoid; break-inside: avoid; }
}
`;

// Headline verdict precedence: recruiter judgment wins over the LLM score, which
// wins over the candidate's self-ratings. Never a blended number - the strongest
// available signal leads and the rest are context.
function precedenceVerdict(verdict: any, sc: any): { value: string; source: string; pending: boolean } {
  const rec = verdict?.recommendation || sc?.verdict?.recommendation;
  if (rec) return { value: rec, source: "Recruiter verdict", pending: false };
  const jd = sc?.kpis?.jd_fit_score;
  if (jd != null) {
    const value = jd >= 75 ? "Strong fit" : jd >= 50 ? "Possible fit" : "Weak fit";
    return { value: `${value} (${jd}/100)`, source: "LLM analysis - pending recruiter review", pending: true };
  }
  const rated = (sc?.skills || []).filter((s: any) => s.self_rating != null);
  if (rated.length) {
    const avg = rated.reduce((a: number, s: any) => a + (s.self_rating || 0), 0) / rated.length;
    return { value: `Self-rated ${avg.toFixed(1)}/5`, source: "Candidate self-assessment - unverified", pending: true };
  }
  return { value: "Pending", source: "No signal yet", pending: true };
}

function vColor(r?: string) {
  if (!r) return "#64748b";
  const l = r.toLowerCase();
  if (l.includes("submit") || l.includes("strong") || l.includes("clear") || l.includes("high")) return "#16a34a";
  if (l.includes("hold") || l.includes("moderate") || l.includes("medium") || l.includes("minor")) return "#d97706";
  return "#dc2626";
}

function fmtCtc(val: any): string {
  if (val == null || val === "") return "-";
  const s = String(val);
  if (s.toLowerCase().includes("lpa")) return s.startsWith("₹") ? s : `₹${s}`;
  return s.startsWith("₹") ? `${s} LPA` : `₹${s} LPA`;
}

// function StarCards({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
//   return (
//     <div className="avoid-break" style={{
//       border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", background: "#fff",
//       display: "flex", justifyContent: "space-between", alignItems: "center",
//       width: "100%", boxSizing: "border-box",
//     }}>
//       <span style={{ fontWeight: 600, fontSize: 11, color: "#1e293b" }}>{label}</span>
//       <Stars n={value} max={max} />
//     </div>
//   );
// }

function Stars({ n, max = 5 }: { n: number; max?: number }) {
  return (
    <span style={{ letterSpacing: 2, fontSize: 13, color: "#d97706" }}>
      {"★".repeat(Math.max(0, Math.min(n, max)))}
      <span style={{ color: "#e2e8f0" }}>{"★".repeat(Math.max(0, max - Math.min(n, max)))}</span>
    </span>
  );
}

// ── Print-only document ───────────────────────────────────────────────────
function PrintDoc({ sc, verdict, ident, candidateName, submittedAt, includeFooter = true, recruiterName = "" }: any) {
  const mandatorySkills = (sc.skills || []).filter((s: any) =>
    (s.requirement || "").toLowerCase() === "mandatory"
  );

  const req = sc.requirement || {};
  const formatDate = (iso?: string) => {
    if (!iso) return "-";
    try { return toUtcDate(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); }
    catch { return iso.slice(0, 10); }
  };

  const H = ({ children }: any) => (
    <div className="avoid-break" style={{
      background: "#f1f5f9", color: "#1e293b", fontWeight: 700, fontSize: 10,
      letterSpacing: 0.5, textTransform: "uppercase" as const,
      padding: "4px 10px", marginTop: 10, marginBottom: 6, borderRadius: 6,
      display: "flex", alignItems: "center", gap: 8,
    }}>{children}</div>
  );

  const verdict_beh = verdict?.behavioral || sc.behavioral || {};
  const verdict_v = verdict || {};

  return (
    <div id="sc-print-doc" style={{ width: "100%", boxSizing: "border-box", fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', fontSize: 11, color: "#1e293b", background: "#fff" }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0f172a", paddingBottom: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "#0f172a" }}>CANDIDATE SCORECARD</span>
        {req.role_title && (
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{req.role_title}</span>
        )}
        <span style={{ fontSize: 10, fontWeight: 700, color: "#0f172a", letterSpacing: 0.5 }}>
          {submittedAt ? `SUBMITTED: ${formatDate(submittedAt).toUpperCase()}` : "CLIENT SCORECARD"}
        </span>
      </div>

      {/* Candidate name */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{candidateName}</div>
      </div>

      {/* Hero KPI Strip */}
      <div style={{ display: "flex", width: "100%", boxSizing: "border-box", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, margin: "8px 0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
        {[
          { val: sc.kpis?.jd_fit_score != null ? `${sc.kpis.jd_fit_score}/100` : "-", label: "JD FIT SCORE", note: "AI screening score" },
          { val: `${sc.kpis?.must_have_met?.met ?? "-"}/${sc.kpis?.must_have_met?.total ?? "-"}`, label: "MUST-HAVE MET", note: "" },
          { val: sc.kpis?.notice_period || "-", label: "NOTICE PERIOD", note: "" },
          { val: sc.kpis?.ctc_vs_benchmark || "-", label: "CTC VS BENCHMARK", note: "" },
        ].map((k, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center" as const, padding: "8px 6px",
            borderRight: i < 3 ? "1px solid #e2e8f0" : "none",
            boxSizing: "border-box",
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{k.val}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: 0.5, marginTop: 4 }}>{k.label}</div>
            {k.note && <div style={{ fontSize: 8, color: "#94a3b8", fontStyle: "italic", marginTop: 2 }}>{k.note}</div>}
          </div>
        ))}
      </div>

      {/* 2-Column Data Overview (Identity vs Compensation/Availability) */}
      <div className="avoid-break" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 10, width: "100%", boxSizing: "border-box" }}>
        {/* Left Column: Identity & Background */}
        <div style={{ width: "100%", boxSizing: "border-box" }}>
          <H>01 · Identity &amp; Background</H>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", width: "100%", boxSizing: "border-box" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 10 }}>
              <tbody>
                {[
                  ["Total Experience", `${ident?.total_experience || sc.identity?.total_experience || "-"}${ident?.relevant_experience || sc.identity?.relevant_experience ? ` total · ${ident?.relevant_experience || sc.identity?.relevant_experience} relevant` : ""}`],
                  ["Current Employer", sc.identity?.current_employer || "-"],
                  ["Education", sc.identity?.education || "-"],
                  ["Current Location", ident?.current_location || sc.identity?.current_location || "-"],
                  ["Submission Date", formatDate(submittedAt)],
                ].map(([k, v], i) => (
                  <tr key={k} style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff", borderBottom: i < 4 ? "1px solid #e2e8f0" : "none" }}>
                    <td style={{ width: 120, padding: "4px 8px", fontWeight: 600, color: "#64748b", boxSizing: "border-box" }}>{k}</td>
                    <td style={{ padding: "4px 8px", color: "#1e293b", fontWeight: 600, boxSizing: "border-box" }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Compensation & Availability */}
        <div style={{ width: "100%", boxSizing: "border-box" }}>
          <H>02 · Compensation &amp; Availability</H>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", width: "100%", boxSizing: "border-box" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 10 }}>
              <tbody>
                {[
                  ["Current CTC", fmtCtc(sc.compensation?.current_ctc)],
                  ["Expected CTC", fmtCtc(sc.compensation?.expected_ctc)],
                  ["Benchmark Range", sc.compensation?.benchmark || "-"],
                  ["Notice Period", sc.availability?.notice_period || "-"],
                  ["Earliest Join", sc.availability?.last_working_day ? formatDate(sc.availability.last_working_day) : "-"],
                  ["Relocation", sc.availability?.open_to_relocation == null ? "-" : sc.availability.open_to_relocation ? "Open" : "Not Required"],
                ].map(([k, v], i) => (
                  <tr key={k} style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff", borderBottom: i < 5 ? "1px solid #e2e8f0" : "none" }}>
                    <td style={{ width: 120, padding: "4px 8px", fontWeight: 600, color: "#64748b", boxSizing: "border-box" }}>{k}</td>
                    <td style={{ padding: "4px 8px", color: k === "Current CTC" || k === "Expected CTC" ? "#0f172a" : "#1e293b", fontWeight: k === "Current CTC" || k === "Expected CTC" ? 700 : 600, boxSizing: "border-box" }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 03 LLM analysis - strengths & gaps from the resume analysis */}
      {((sc.strengths?.length || 0) > 0 || (sc.gaps?.length || 0) > 0) && (
        <div className="avoid-break" style={{ marginTop: 10, width: "100%", boxSizing: "border-box" }}>
          <H>03 · AI Analysis - Strengths &amp; Gaps</H>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", boxSizing: "border-box" }}>
            <div style={{ border: "1px solid #e2e8f0", borderTop: "3px solid #16a34a", borderRadius: 8, padding: "6px 10px", background: "#f8fafc", boxSizing: "border-box" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Strengths</div>
              {(sc.strengths || []).map((s: string, i: number) => (
                <div key={i} style={{ fontSize: 10, color: "#1e293b", lineHeight: 1.45, display: "flex", gap: 5 }}>
                  <span style={{ color: "#16a34a", fontWeight: 700 }}>✓</span><span>{s}</span>
                </div>
              ))}
              {!(sc.strengths || []).length && <div style={{ fontSize: 10, color: "#94a3b8" }}>-</div>}
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderTop: "3px solid #dc2626", borderRadius: 8, padding: "6px 10px", background: "#f8fafc", boxSizing: "border-box" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Gaps</div>
              {(sc.gaps || []).map((s: string, i: number) => (
                <div key={i} style={{ fontSize: 10, color: "#1e293b", lineHeight: 1.45, display: "flex", gap: 5 }}>
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>•</span><span>{s}</span>
                </div>
              ))}
              {!(sc.gaps || []).length && <div style={{ fontSize: 10, color: "#94a3b8" }}>-</div>}
            </div>
          </div>
        </div>
      )}

      {/* 04 Recruiter analysis & verdict - the highest-precedence signal */}
      <div className="avoid-break" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginTop: 12, width: "100%", boxSizing: "border-box" }}>
        <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase", color: "#1e293b", marginBottom: 12 }}>
          04 · Recruiter Analysis &amp; Verdict
        </div>

        {/* Candidate summary - products & tools */}
        {verdict_v.candidate_summary && (
          <div style={{ marginBottom: 10, background: "#fff", padding: "10px 12px", borderRadius: 6, border: "1px solid #e2e8f0", width: "100%", boxSizing: "border-box" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Candidate Summary - Products &amp; Tools</div>
            <div style={{ fontSize: 11, color: "#1e293b", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{verdict_v.candidate_summary}</div>
          </div>
        )}

        {/* Recruiter feedback (~300-400 words) */}
        {verdict_v.recruiter_feedback && (
          <div style={{ marginBottom: 10, background: "#fff", padding: "10px 12px", borderRadius: 6, border: "1px solid #e2e8f0", width: "100%", boxSizing: "border-box" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Recruiter Feedback</div>
            <div style={{ fontSize: 11, color: "#1e293b", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{verdict_v.recruiter_feedback}</div>
          </div>
        )}

        {/* Behavioral signals grid */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Behavioral Signal</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, background: "#fff", padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", width: "100%", boxSizing: "border-box" }}>
            {[
              { label: "Ownership", val: verdict_beh.ownership },
              { label: "Communication", val: verdict_beh.communication },
              { label: "Collaboration", val: verdict_beh.collaboration },
            ].map((b, i) => (
              <div key={i} style={{ boxSizing: "border-box" }}>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{b.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: vColor(b.val), marginTop: 2 }}>{(b.val || "-").toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Verdict grid */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Final Verdict</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, background: "#fff", padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", width: "100%", boxSizing: "border-box" }}>
            {[
              { label: "Overall Fit", val: verdict_v.overall_fit },
              { label: "Risk Flag", val: verdict_v.risk_flag },
              { label: "Recommendation", val: verdict_v.recommendation },
            ].map((v, i) => (
              <div key={i} style={{ boxSizing: "border-box" }}>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{v.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: vColor(v.val), marginTop: 2 }}>{(v.val || "-").toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recruiter Notes */}
        {verdict_v.recruiter_notes && (
          <div style={{ marginTop: 10, background: "#fff", padding: "10px 12px", borderRadius: 6, border: "1px solid #e2e8f0", width: "100%", boxSizing: "border-box" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Recruiter Notes</div>
            <div style={{ fontSize: 11, color: "#1e293b", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{verdict_v.recruiter_notes}</div>
          </div>
        )}
      </div>

      {/* 05 Candidate self-assessment - last on purpose: the least-authoritative signal */}
      {mandatorySkills.length > 0 && (
        <div className="avoid-break" style={{ marginTop: 10, width: "100%", boxSizing: "border-box" }}>
          <H>05 · Candidate Self-Assessment (self-rated 1–5, unverified)</H>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", boxSizing: "border-box" }}>
            {mandatorySkills.map((s: any) => (
              <div key={s.skill} className="avoid-break" style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", boxSizing: "border-box" }}>
                <span style={{ fontWeight: 700, fontSize: 11, color: "#1e293b" }}>{s.skill}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Stars n={s.self_rating || 0} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>({s.self_rating ?? "-"}/5)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer / Signature line */}
      {includeFooter && (
        <div className="avoid-break" style={{
          marginTop: 14, borderTop: "1px solid #e2e8f0", paddingTop: 8,
          display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "#64748b",
          width: "100%", boxSizing: "border-box",
        }}>
          <span>RECRUITER: {recruiterName ? recruiterName.toUpperCase() : "________________________"}</span>
          <span>DATE: {new Date().toLocaleDateString()}</span>
          <span style={{ fontWeight: 700, color: verdict_v.recommendation ? vColor(verdict_v.recommendation) : "#64748b", padding: "4px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4 }}>
            STATUS: {verdict_v.recommendation ? verdict_v.recommendation.toUpperCase() : "PENDING"}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Interactive scorecard (screen) ────────────────────────────────────────
export default function ScorecardReport({ requirementId, candidateId, hideWorksheet, forceView }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verdict, setVerdict] = useState<any>(null);
  const [ident, setIdent] = useState<any>({ name: "", current_employer: "", education: "", total_experience: "", relevant_experience: "", current_location: "" });
  const { isAdmin } = useAuth();
  const [moveOpen, setMoveOpen] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [moveTarget, setMoveTarget] = useState("");
  const [moving, setMoving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [subTab, setSubTab] = useState<"worksheet" | "scorecard" | "analysis">(hideWorksheet ? "scorecard" : "worksheet");
  const [includeFooter, setIncludeFooter] = useState(true);
  const [recruiterName, setRecruiterName] = useState("");

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "sc-print-style";
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
    return () => { document.getElementById("sc-print-style")?.remove(); };
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/requirements/${requirementId}/candidates/${candidateId}/assessment`);
      setData(res);
      if (res?.found) {
        const sc = res.scorecard || {};
        const beh = sc.behavioral || res.response?.scorecard?.behavioral || {};
        const v = sc.verdict || res.response?.scorecard || {};
        setVerdict({
          behavioral: {
            ownership: beh.ownership || "",
            communication: beh.communication || "",
            collaboration: beh.collaboration || "",
          },
          overall_fit: v.overall_fit || "",
          risk_flag: v.risk_flag || "",
          recommendation: v.recommendation || "",
          recruiter_notes: res.response?.scorecard?.recruiter_notes || "",
          candidate_summary: res.response?.scorecard?.candidate_summary || "",
          recruiter_feedback: res.response?.scorecard?.recruiter_feedback || "",
        });
        const id = sc.identity || res.response?.identity || {};
        setIdent({
          name: id.name || res.candidate_name || "",
          current_employer: id.current_employer || "",
          education: id.education || "",
          total_experience: id.total_experience || "",
          relevant_experience: id.relevant_experience || "",
          current_location: id.current_location || sc.availability?.current_location || "",
        });
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [requirementId, candidateId]);

  const relevantMissing = !ident.relevant_experience?.trim();

  const saveVerdict = async () => {
    if (relevantMissing) { alert("Relevant experience is required before saving the report."); return; }
    setSaving(true);
    try {
      const res = await api.patch(`/assessments/${data.response.id}/verdict`, { verdict, identity: ident });
      setData((d: any) => ({ ...d, scorecard: res.scorecard, response: res.response }));
    } finally {
      setSaving(false);
    }
  };

  const openMove = async () => {
    setMoveOpen((o) => !o);
    if (candidates.length === 0) {
      try {
        const res = await api.get(`/requirements/${requirementId}/profiles`);
        setCandidates((res?.profiles || []).filter((p: any) => String(p.candidate_uuid) !== String(candidateId)));
      } catch { /* ignore */ }
    }
  };
  const reanalyze = async () => {
    if (!data?.response?.id || reanalyzing) return;
    setReanalyzing(true);
    try {
      await api.post(`/assessments/${data.response.id}/reanalyze`, {});
      // Poll for the worker to finish, then refresh.
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const res = await api.get(`/requirements/${requirementId}/candidates/${candidateId}/assessment`);
        const st = res?.response?.assessment_status;
        if (st === "done" || st === "failed") { setData(res); break; }
      }
      await load();
    } finally {
      setReanalyzing(false);
    }
  };

  const handlePrint = () => {
    // The browser uses document.title as the PDF title/filename - make it just the
    // candidate's name for the print, then restore.
    const prev = document.title;
    const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    document.title = data?.candidate_name || data?.scorecard?.identity?.name || "Candidate Scorecard";
    window.print();
  };
  const doMove = async () => {
    if (!moveTarget || moving) return;
    setMoving(true);
    try {
      await api.patch(`/assessments/${data.response.id}/reassign`, { candidate_id: moveTarget });
      const target = candidates.find((c) => String(c.candidate_uuid) === String(moveTarget));
      setMoveOpen(false);
      setMoveTarget("");
      alert(`Report moved to ${target?.candidate?.Name || "the selected candidate"}. Open that candidate's Summary Report to view it.`);
      await load(); // this candidate now has no report
    } finally {
      setMoving(false);
    }
  };

  if (loading) return <div style={{ fontSize: 13, padding: "1rem" }}>Loading report…</div>;
  if (!data?.found)
    return (
      <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "1.5rem", textAlign: "center" }}>
        No self-assessment submitted yet. Share the assessment link or fill it on the candidate's behalf
        from the requirement's <strong>Assessments</strong> tab.
      </div>
    );

  const sc = data.scorecard;
  if (forceView === "analysis") {
    return <AnalysisTab data={data} sc={sc} />;
  }

  const audio = data.audio || [];
  const candidateName = data.candidate_name || sc.identity?.name || "Candidate";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", fontSize: 13 }}>
      {/* Row 1: Centered Title */}
      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", textAlign: "center" }}>
        Summary Report
        {sc.requirement?.role_title && (
          <span style={{ fontWeight: 400, fontSize: 14, color: "var(--text-secondary)", marginLeft: 8 }}>
            - {sc.requirement.role_title}
          </span>
        )}
      </div>

      {/* Row 2: Sub-tabs and Dynamic Actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: "1px solid var(--border-subtle)", paddingBottom: 12 }}>
        {/* Segmented Control */}
        {!hideWorksheet ? (
          <div style={{ display: "flex", background: "var(--bg-secondary)", padding: 4, borderRadius: 8, gap: 4 }}>
            <button
              onClick={() => setSubTab("worksheet")}
              style={{
                padding: "5px 14px", borderRadius: 6, border: "none", fontSize: 12, cursor: "pointer",
                fontWeight: subTab === "worksheet" ? 600 : 500,
                background: subTab === "worksheet" ? "var(--bg-primary)" : "transparent",
                color: subTab === "worksheet" ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: subTab === "worksheet" ? "0 2px 4px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              Recruiter Worksheet
            </button>
            <button
              onClick={() => setSubTab("scorecard")}
              style={{
                padding: "5px 14px", borderRadius: 6, border: "none", fontSize: 12, cursor: "pointer",
                fontWeight: subTab === "scorecard" ? 600 : 500,
                background: subTab === "scorecard" ? "var(--bg-primary)" : "transparent",
                color: subTab === "scorecard" ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: subTab === "scorecard" ? "0 2px 4px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              Client Scorecard
            </button>
          </div>
        ) : (
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>Client Scorecard</div>
        )}

        {/* Dynamic Action Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {subTab === "worksheet" ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={reanalyze} disabled={reanalyzing}
                title="Re-run the AI analysis (re-transcribe audio + re-score)">
                {reanalyzing ? "Re-analysing…" : "↻ Re-analyse"}
              </button>
              {isAdmin && (
                <div style={{ position: "relative" }}>
                  <button className="btn btn-ghost btn-sm" onClick={openMove} title="Move this report to the correct candidate">
                    Move report…
                  </button>
                  {moveOpen && (
                    <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50, width: 300, background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 12 }}>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                        Move this report to another candidate in this requirement (the empty duplicate is deleted):
                      </div>
                      <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--border-subtle)", borderRadius: 6, background: "var(--bg-input)", color: "var(--text-primary)" }}>
                        <option value="">Select candidate…</option>
                        {candidates.map((c) => (
                          <option key={c.candidate_uuid} value={c.candidate_uuid}>
                            {c.candidate?.Name || c.deterministic_scoring_analysis?.candidate_name || c.candidate_uuid}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setMoveOpen(false)}>Cancel</button>
                        <button className="btn btn-primary btn-sm" onClick={doMove} disabled={!moveTarget || moving}>{moving ? "Moving…" : "Move"}</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : subTab === "scorecard" ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handlePrint}
              title="Print or save as PDF"
              style={{ display: "flex", alignItems: "center", gap: 5 }}
            >
              ⬇ Download PDF
            </button>
          ) : null}
        </div>
      </div>

      {subTab === "worksheet" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            <Kpi label="JD Fit" value={sc.kpis?.jd_fit_score != null ? `${sc.kpis.jd_fit_score}/100` : "-"} note="AI screening score" />
            <Kpi label="Must-Have Met" value={`${sc.kpis?.must_have_met?.met ?? "-"}/${sc.kpis?.must_have_met?.total ?? "-"}`}
              note={sc.kpis?.must_have_met?.source === "self_reported" ? "self-reported" : "verified"} />
            <Kpi label="Notice" value={sc.kpis?.notice_period || "-"} />
            <Kpi label="CTC vs Bench" value={sc.kpis?.ctc_vs_benchmark || "-"} />
          </div>

          {/* Headline verdict - precedence: recruiter > LLM > self-rating */}
          {(() => {
            const hv = precedenceVerdict(verdict, sc);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--border-subtle)", borderLeft: `4px solid ${hv.pending ? "#d97706" : "#16a34a"}`, borderRadius: 8, padding: "8px 14px", background: "var(--bg-secondary)" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{hv.value}</span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>· {hv.source}</span>
              </div>
            );
          })()}

          {!sc.analysis_available && (
            <div style={{ fontSize: 12, color: "#b45309", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, padding: "6px 10px" }}>
              LLM analysis not yet available - JD-fit & verified skill matches will populate once it runs.
            </div>
          )}

          {/* 01 Identity */}
          <Section title="01 · Identity & role match">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <Editable label="Candidate" value={ident.name} placeholder="Candidate Name"
                onChange={(v) => setIdent({ ...ident, name: v })} />
              <Editable label="Current employer" value={ident.current_employer} placeholder="e.g. Accenture Solutions Pvt Ltd"
                onChange={(v) => setIdent({ ...ident, current_employer: v })} />
              <Editable label="Education" value={ident.education} placeholder="e.g. B.Tech - Computer Science"
                onChange={(v) => setIdent({ ...ident, education: v })} />
              <Editable label="Total experience" value={ident.total_experience} placeholder="e.g. 8 yrs"
                onChange={(v) => setIdent({ ...ident, total_experience: v })} />
              <Editable label="Relevant experience *" value={ident.relevant_experience} placeholder="e.g. 5 yrs (required)"
                required={relevantMissing} onChange={(v) => setIdent({ ...ident, relevant_experience: v })} />
              <Editable label="Current location" value={ident.current_location} placeholder="e.g. Hyderabad"
                onChange={(v) => setIdent({ ...ident, current_location: v })} />
            </div>
          </Section>

          {/* 02/03 Compensation + Availability */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
            <Section title="02 · Compensation">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <KV k="Current CTC" v={sc.compensation?.current_ctc != null ? (String(sc.compensation.current_ctc).toLowerCase().includes("lpa") ? String(sc.compensation.current_ctc) : `${sc.compensation.current_ctc} LPA`) : undefined} />
                <KV k="Expected CTC" v={sc.compensation?.expected_ctc != null ? (String(sc.compensation.expected_ctc).toLowerCase().includes("lpa") ? String(sc.compensation.expected_ctc) : `${sc.compensation.expected_ctc} LPA`) : undefined} />
                <KV k="Benchmark" v={sc.compensation?.benchmark} />
              </div>
            </Section>
            <Section title="03 · Availability & location">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <KV k="Notice" v={sc.availability?.notice_period} />
                <KV k="Location" v={ident.current_location || sc.availability?.current_location} />
                <KV k="Preferred" v={sc.availability?.preferred_location} />
                <KV k="Relocation" v={sc.availability?.open_to_relocation == null ? "-" : sc.availability.open_to_relocation ? "Open" : "Not required"} />
              </div>
            </Section>
          </div>

          {/* 04 LLM analysis - strengths & gaps straight from the resume analysis */}
          {(sc.strengths?.length || sc.gaps?.length) ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
              {sc.strengths?.length > 0 && (
                <Section title="04 · LLM analysis - Strengths" borderTop="4px solid #16a34a">
                  <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                    {sc.strengths.map((s: string, i: number) => (
                      <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ color: "#16a34a", fontWeight: 700 }}>✓</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {sc.gaps?.length > 0 && (
                <Section title="04 · LLM analysis - Gaps" borderTop="4px solid #dc2626">
                  <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                    {sc.gaps.map((s: string, i: number) => (
                      <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ color: "#dc2626", fontWeight: 700 }}>•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          ) : null}

          {/* Audio */}
          {audio.length > 0 && (
            <Section title="Voice answers" collapsible={true} defaultOpen={false}>
              {audio.map((a: any) => (
                <div key={a.question_id} style={{ marginBottom: 16, border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "16px", background: "linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-primary) 100%)", boxShadow: "0 4px 16px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
                    <span style={{ fontSize: 16 }}>🎙️</span>
                    <span>{a.prompt}</span>
                  </div>
                  {a.url ? (
                    <div style={{ marginBottom: a.transcript ? 12 : 0 }}>
                      <audio controls src={a.url} style={{ height: 36, width: "100%" }} />
                    </div>
                  ) : (
                    <em style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: a.transcript ? 12 : 0 }}>Audio unavailable</em>
                  )}
                  {a.transcript && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", maxHeight: 160, overflowY: "auto", padding: "12px 14px", background: "var(--bg-primary)", borderRadius: 8, border: "1px solid var(--border-subtle)", lineHeight: 1.5 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 6, letterSpacing: 0.5 }}>Transcript</div>
                      {a.transcript}
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}

          {/* 05 Recruiter analysis (editable) - highest-precedence signal */}
          <Section title="05 · Recruiter analysis">
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10 }}>
              The recruiter's judgment carries the most weight on this report - above the LLM analysis and the candidate's self-ratings.
            </div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-secondary)", marginBottom: 4 }}>
              Candidate summary - products & tools they have worked on
            </label>
            <textarea placeholder="e.g. Built pricing engine on Java/Spring at Accenture; tools: Kafka, Jenkins, AWS EKS…"
              value={verdict.candidate_summary}
              onChange={(e) => setVerdict({ ...verdict, candidate_summary: e.target.value })}
              style={{ width: "100%", height: 80, padding: "10px 14px", fontSize: 13, fontFamily: "inherit", lineHeight: 1.5, border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--bg-input)", color: "var(--text-primary)", resize: "vertical" as const }} />
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-secondary)", margin: "12px 0 4px" }}>
              Recruiter feedback (300–400 words)
            </label>
            <textarea placeholder="Your assessment of the candidate after screening - 4–5 lines or 300–400 words."
              value={verdict.recruiter_feedback}
              onChange={(e) => setVerdict({ ...verdict, recruiter_feedback: e.target.value })}
              style={{ width: "100%", height: 140, padding: "10px 14px", fontSize: 13, fontFamily: "inherit", lineHeight: 1.5, border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--bg-input)", color: "var(--text-primary)", resize: "vertical" as const }} />
            {(() => {
              const words = verdict.recruiter_feedback?.trim() ? verdict.recruiter_feedback.trim().split(/\s+/).length : 0;
              return (
                <div style={{ fontSize: 11, color: words > 400 ? "#dc2626" : "var(--text-secondary)", textAlign: "right", marginTop: 4 }}>
                  {words}/400 words
                </div>
              );
            })()}
          </Section>

          {/* 06 Behavioral + verdict (editable) */}
          <div style={{ border: "1px solid var(--border-subtle)", borderLeft: "4px solid #2563eb", borderRadius: 10, padding: "1.2rem 1.2rem", background: "var(--bg-primary)", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.3, color: "var(--text-primary)", marginBottom: 2 }}>06 · Behavioral signal & recruiter verdict</div>
            <div style={{ fontSize: 11, fontStyle: "italic" as const, color: "var(--text-secondary)", margin: "0 0 12px", paddingBottom: 8, borderBottom: "1px solid var(--border-subtle)" }}>Derived from recruiter screening + audio - not a technical evaluation</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <Pick label="Ownership" opts={RATINGS.behavioral} value={verdict.behavioral.ownership} onChange={(v) => setVerdict({ ...verdict, behavioral: { ...verdict.behavioral, ownership: v } })} />
              <Pick label="Communication" opts={RATINGS.communication} value={verdict.behavioral.communication} onChange={(v) => setVerdict({ ...verdict, behavioral: { ...verdict.behavioral, communication: v } })} />
              <Pick label="Collaboration" opts={RATINGS.behavioral} value={verdict.behavioral.collaboration} onChange={(v) => setVerdict({ ...verdict, behavioral: { ...verdict.behavioral, collaboration: v } })} />
              <Pick label="Overall fit" opts={RATINGS.fit} value={verdict.overall_fit} onChange={(v) => setVerdict({ ...verdict, overall_fit: v })} />
              <Pick label="Risk flag" opts={RATINGS.risk} value={verdict.risk_flag} onChange={(v) => setVerdict({ ...verdict, risk_flag: v })} />
              <Pick label="Recommendation" opts={RATINGS.rec} value={verdict.recommendation} onChange={(v) => setVerdict({ ...verdict, recommendation: v })} />
            </div>
            <textarea placeholder="Recruiter notes" value={verdict.recruiter_notes}
              onChange={(e) => setVerdict({ ...verdict, recruiter_notes: e.target.value })}
              style={{ width: "100%", height: 100, marginTop: 14, padding: "10px 14px", fontSize: 13, fontFamily: "inherit", lineHeight: 1.5, border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--bg-input)", color: "var(--text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05) inset", resize: "none" as const }} />
          </div>

          {/* 07 Candidate self-assessment - deliberately last: the least-authoritative signal */}
          {(sc.skills || []).filter((s: any) => s.requirement?.toLowerCase() === "mandatory").length > 0 && (
            <Section title="07 · Candidate self-assessment (self-rated 1–5)">
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>
                Candidate's own ratings at submission - unverified; weigh below the recruiter and LLM signals above
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 8 }}>
                {(sc.skills || [])
                  .filter((s: any) => s.requirement?.toLowerCase() === "mandatory")
                  .map((s: any) => {
                    const rating = s.self_rating || 0;
                    const pct = Math.min(100, Math.max(0, (rating / 5) * 100));
                    const color = rating === 5 ? "#16a34a" : rating >= 4 ? "#2563eb" : "#d97706";
                    const bgTint = rating === 5 ? "rgba(22,163,74,0.1)" : rating >= 4 ? "rgba(37,99,235,0.1)" : "rgba(217,119,6,0.1)";
                    return (
                      <div key={s.skill} style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "12px 14px", background: "var(--bg-primary)", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{s.skill}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12, background: bgTint, color: color }}>
                            {s.self_rating ?? "-"} / 5
                          </span>
                        </div>
                        <div style={{ width: "100%", height: 5, background: "var(--bg-secondary)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s ease" }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </Section>
          )}

          {/* Worksheet Save Action */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 4, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
            {relevantMissing && <span style={{ fontSize: 12, fontWeight: 600, color: "#dc2626" }}>Relevant experience is required</span>}
            <button className="btn btn-primary" onClick={saveVerdict} disabled={saving} style={{ padding: "8px 24px", fontSize: 14, fontWeight: 600, borderRadius: 8 }}>
              {saving ? "Saving Worksheet…" : "Save Worksheet"}
            </button>
          </div>
        </div>
      ) : subTab === "scorecard" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Footer Options Control Bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, background: "var(--bg-secondary)", padding: "12px 20px", borderRadius: 10, border: "1px solid var(--border-subtle)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--text-primary)", cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={includeFooter} onChange={(e) => setIncludeFooter(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--primary)" }} />
              Include Signature &amp; Status Footer
            </label>
            {includeFooter && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Recruiter Name:</span>
                <input
                  type="text"
                  value={recruiterName}
                  onChange={(e) => setRecruiterName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  style={{ padding: "6px 12px", border: "1px solid var(--border-subtle)", borderRadius: 6, background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, width: 200 }}
                />
              </div>
            )}
          </div>

          <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "2rem 2.5rem", background: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,0.06)" }}>
            <PrintDoc
              sc={sc}
              verdict={verdict}
              ident={ident}
              candidateName={ident.name || candidateName}
              submittedAt={sc.submitted_at || data.response?.submitted_at}
              includeFooter={includeFooter}
              recruiterName={recruiterName}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────
function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px 12px", textAlign: "center" as const, background: "var(--bg-secondary)" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{label}</div>
      {note && <div style={{ fontSize: 9, color: "var(--text-secondary)" }}>{note}</div>}
    </div>
  );
}
function Section({ title, subtitle, borderTop, collapsible, defaultOpen, children }: { title: string; subtitle?: string; borderTop?: string; collapsible?: boolean; defaultOpen?: boolean; children: any }) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? true);
  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderTop: borderTop || "1px solid var(--border-subtle)", borderRadius: 10, padding: "0.9rem 1rem", background: "var(--bg-primary)" }}>
      <div
        onClick={() => collapsible && setIsOpen(!isOpen)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 700, fontSize: 13, letterSpacing: 0.3, color: "var(--text-primary)", marginBottom: (subtitle && isOpen) ? 2 : (isOpen ? 10 : 0), paddingBottom: isOpen ? 8 : 0, borderBottom: isOpen ? "1px solid var(--border-subtle)" : "none", cursor: collapsible ? "pointer" : "default", userSelect: collapsible ? "none" : "auto" }}
      >
        <span>{title}</span>
        {collapsible && (
          <button style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-secondary)", padding: 0 }}>
            {isOpen ? "▲" : "▼"}
          </button>
        )}
      </div>
      {subtitle && isOpen && <div style={{ fontSize: 11, fontStyle: "italic" as const, color: "var(--text-secondary)", margin: "6px 0 10px" }}>{subtitle}</div>}
      {isOpen && children}
    </div>
  );
}
function KV({ k, v }: { k: string; v?: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "4px 0", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{k}</span>
      <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{v || "-"}</span>
    </div>
  );
}
function Editable({ label, value, placeholder, required, onChange }: { label: string; value: string; placeholder?: string; required?: boolean; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "4px 0", gap: 4, width: "100%" }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "8px 12px", fontSize: 13, fontFamily: "inherit", textAlign: "left" as const, border: `1px solid ${required ? "#dc2626" : "var(--border-subtle)"}`, borderRadius: 8, background: "var(--bg-input)", color: "var(--text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05) inset" }} />
    </div>
  );
}
function Pick({ label, opts, value, onChange }: { label: string; opts: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "8px 12px", fontSize: 13, fontFamily: "inherit", border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--bg-input)", color: "var(--text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05) inset", cursor: "pointer" }}>
        <option value="">-</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function AnalysisTab({ data }: { data: any; sc?: any }) {
  const resp = data?.response || {};
  const summary = resp.summary || {};
  const form = resp.form || {};
  const answers = resp.answers || [];
  const filledBy = resp.filled_by === "recruiter" ? `Recruiter (${data?.filler_recruiter_name || "Assigned Recruiter"})` : "Candidate";

  const formatDate = (iso?: string) => {
    if (!iso) return "-";
    try { return toUtcDate(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }); }
    catch { return iso.slice(0, 16); }
  };

  const getVerdictBadge = (verdict?: string) => {
    if (!verdict) return null;
    const v = verdict.toLowerCase();
    let color = "#64748b";
    let bg = "rgba(100,116,139,0.1)";
    let border = "rgba(100,116,139,0.2)";
    if (["high", "strong", "clear", "supported", "submit"].some(k => v.includes(k))) {
      color = "#16a34a"; bg = "rgba(22,163,74,0.1)"; border = "rgba(22,163,74,0.2)";
    } else if (["moderate", "medium", "partial", "hold", "minor"].some(k => v.includes(k))) {
      color = "#d97706"; bg = "rgba(217,119,6,0.1)"; border = "rgba(217,119,6,0.2)";
    } else if (["low", "weak", "unsupported", "reject", "major"].some(k => v.includes(k))) {
      color = "#dc2626"; bg = "rgba(220,38,38,0.1)"; border = "rgba(220,38,38,0.2)";
    }
    return (
      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, color, background: bg, border: `1px solid ${border}`, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {verdict}
      </span>
    );
  };

  const metrics = [
    { label: "Communication", data: summary.communication },
    { label: "Genuineness", data: summary.genuineness },
    { label: "Fitment", data: summary.fitment },
    { label: "Stability", data: summary.stability },
    { label: "Relocation Interest", data: summary.relocation_interest },
  ].filter(m => m.data);

  // Merge form self ratings and AI cross check
  const selfRatings: any[] = form.skill_self_ratings || [];
  const crossChecks: any[] = summary.skill_cross_check || [];
  const skillMap = new Map<string, any>();
  selfRatings.forEach((r: any) => {
    skillMap.set(r.skill, { skill: r.skill, requirement: r.requirement, rating: r.rating });
  });
  crossChecks.forEach((c: any) => {
    const ex = skillMap.get(c.skill) || { skill: c.skill, requirement: "Mandatory", rating: c.self_rating };
    skillMap.set(c.skill, { ...ex, evidence: c.evidence, note: c.note });
  });
  const combinedSkills = Array.from(skillMap.values());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
      {/* Submission Header Strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, background: "var(--bg-secondary)", padding: "12px 18px", borderRadius: 10, border: "1px solid var(--border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Filled By:</span>
          <strong style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 700 }}>{filledBy}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "var(--text-secondary)" }}>
          {resp.assessment_started_at && <span>Started: <strong>{formatDate(resp.assessment_started_at)}</strong></span>}
          {resp.summary_at && <span>AI Analyzed: <strong>{formatDate(resp.summary_at)}</strong></span>}
        </div>
      </div>

      {/* AI Executive Summary & Red Flags */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <div style={{ border: "1px solid var(--border-subtle)", borderLeft: "4px solid #8b5cf6", borderRadius: 10, padding: "1.2rem 1.2rem", background: "var(--bg-primary)", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.3, color: "var(--text-primary)", marginBottom: 8 }}>AI Executive Summary</div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
            {summary.summary || "No AI executive summary available."}
          </p>
        </div>

        {summary.red_flags && summary.red_flags.length > 0 && (
          <div style={{ border: "1px solid rgba(220,38,38,0.3)", borderLeft: "4px solid #dc2626", borderRadius: 10, padding: "1.2rem 1.2rem", background: "rgba(220,38,38,0.04)", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.3, color: "#991b1b", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <span>⚠️</span> Detected Red Flags
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#991b1b", fontSize: 13, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 6 }}>
              {summary.red_flags.map((rf: string, i: number) => (
                <li key={i}>{rf}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Deep-Dive AI Verification Metrics */}
      {metrics.length > 0 && (
        <Section title="AI Verification Pillars" subtitle="Automated multi-dimensional evaluation derived from candidate answers and resume evidence">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {metrics.map((m, i) => (
              <div key={i} style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "12px 14px", background: "var(--bg-secondary)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</span>
                  {getVerdictBadge(m.data.verdict)}
                </div>
                {m.data.score != null && (
                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>{toTen(m.data.score)}<span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>/10</span></div>
                )}
                {m.data.notes && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, marginTop: "auto", paddingTop: 6, borderTop: "1px solid var(--border-subtle)" }}>
                    {m.data.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Skill Cross-Check vs. Self-Ratings */}
      {combinedSkills.length > 0 && (
        <Section title="Skill Cross-Check &amp; Verification" subtitle="Comparing user self-reported ratings against AI evidence detection">
          <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}>
                  <th style={{ padding: "10px 14px" }}>Skill / Requirement</th>
                  <th style={{ padding: "10px 14px", width: 130 }}>Self-Rating</th>
                  <th style={{ padding: "10px 14px", width: 120 }}>AI Evidence</th>
                  <th style={{ padding: "10px 14px" }}>AI Verification Note</th>
                </tr>
              </thead>
              <tbody style={{ divideY: "1px solid var(--border-subtle)" } as any}>
                {combinedSkills.map((s, i) => (
                  <tr key={s.skill || i} style={{ borderBottom: i < combinedSkills.length - 1 ? "1px solid var(--border-subtle)" : "none", background: i % 2 === 0 ? "var(--bg-primary)" : "var(--bg-secondary)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.skill}</div>
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>{s.requirement}</div>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {s.rating != null ? <Stars n={s.rating} /> : <span style={{ color: "var(--text-secondary)" }}>-</span>}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {getVerdictBadge(s.evidence || "Unknown")}
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      {s.note || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Raw Intake Answers */}
      {answers.length > 0 && (
        <Section title="Raw Intake Responses" subtitle="Original text and audio submissions captured during the assessment" collapsible={true} defaultOpen={false}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {answers.map((a: any, i: number) => {
              const aud = (data?.audio || []).find((ad: any) => ad.question_id === a.question_id || ad.prompt === a.prompt);
              const url = a.url || aud?.url;
              const transcript = a.transcript || aud?.transcript;
              return (
                <div key={i} style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "14px 16px", background: "var(--bg-secondary)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, lineHeight: 1.4 }}>
                    <span style={{ color: "var(--text-secondary)", marginRight: 6 }}>Q{i + 1}.</span> {a.prompt}
                  </div>
                  {a.type === "voice" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {url ? (
                        <audio controls src={url} style={{ height: 36, width: "100%" }} />
                      ) : (
                        <em style={{ fontSize: 12, color: "var(--text-secondary)" }}>Audio unavailable</em>
                      )}
                      {transcript && (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", maxHeight: 160, overflowY: "auto", padding: "10px 14px", background: "var(--bg-primary)", borderRadius: 6, border: "1px solid var(--border-subtle)", lineHeight: 1.5 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 6, letterSpacing: 0.5 }}>Transcript</div>
                          {transcript}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: "var(--text-primary)", padding: "10px 14px", background: "var(--bg-primary)", borderRadius: 6, border: "1px solid var(--border-subtle)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {a.text || "-"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
