import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "../lib/router";
import { api } from "../services/api";

/**
 * Assessments tab inside RequirementDetail - the results list only. Link
 * generation and fill-on-behalf live in the requirement header
 * (AssessmentActions); editing skills/questions is a separate editor page.
 */

type Row = {
  id: string;
  candidate_id?: string;
  candidate_name?: string;
  filled_by: string;
  mode: string;
  assessment_status: string;
  submitted_at?: string;
};

// A public_open link is the job-posting link (candidate applies + uploads
// resume themselves), as opposed to a recruiter-shared private link or a
// recruiter fill-on-behalf.
const isJobPosting = (r: Row) => r.mode === "public_open";

export default function AssessmentsPanel({ requirementId }: { requirementId: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobPostingOnly, setJobPostingOnly] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await api.get(`/requirements/${requirementId}/assessments`));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener("assessment-updated", h);
    return () => window.removeEventListener("assessment-updated", h);
  }, [requirementId]);

  const jobPostingCount = useMemo(() => rows.filter(isJobPosting).length, [rows]);
  const visible = jobPostingOnly ? rows.filter(isJobPosting) : rows;

  return (
    <div className="data-table-wrap">
      {/* Filters */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0.25rem 0.75rem", flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={jobPostingOnly}
            onChange={(e) => setJobPostingOnly(e.target.checked)}
            style={{ width: 15, height: 15 }}
          />
          Job posting profiles only
          <span style={{ fontSize: 11, fontWeight: 700, color: "#166534", background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 999, padding: "0 7px" }}>
            {jobPostingCount}
          </span>
        </label>
      </div>

      {loading ? (
        <div className="table-empty">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="table-empty">
          {jobPostingOnly
            ? "No job-posting submissions yet."
            : <>No assessments yet. Use <strong>Assessment Link</strong> or <strong>Fill on Behalf</strong> in the header above.</>}
        </div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Candidate</th><th>Filled by</th><th>Source</th><th>Report</th><th>Submitted</th></tr></thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} style={{ cursor: r.candidate_id ? "pointer" : "default" }}
                onClick={() => r.candidate_id && navigate(`/requirements/${requirementId}/profiles/${r.candidate_id}`)}>
                <td>
                  <span>{r.candidate_name || "-"}</span>
                  {isJobPosting(r) && <JobPostingTag />}
                </td>
                <td style={{ textTransform: "capitalize" }}>{r.filled_by}</td>
                <td><SourceTag mode={r.mode} /></td>
                <td><StatusChip status={r.assessment_status} /></td>
                <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function JobPostingTag() {
  return (
    <span
      title="Candidate applied themselves through the public job-posting link"
      style={{
        marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
        background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", whiteSpace: "nowrap",
      }}
    >
      Submitted via job posting
    </span>
  );
}

function SourceTag({ mode }: { mode: string }) {
  const cfg = mode === "public_open"
    ? { label: "Job posting", bg: "#dcfce7", color: "#166534", border: "#bbf7d0" }
    : mode === "recruiter_fill"
      ? { label: "Recruiter", bg: "#fef3c7", color: "#92400e", border: "#fde68a" }
      : { label: "Private link", bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 4, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = { pending: "#f59e0b", processing: "#2563eb", done: "#16a34a", failed: "#dc2626" };
  return <span style={{ fontSize: 11, fontWeight: 700, color: map[status] || "var(--text-secondary)", textTransform: "uppercase" }}>{status}</span>;
}
