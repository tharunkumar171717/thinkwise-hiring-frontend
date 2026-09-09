import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useNavigate, useSearchParams } from "../lib/router";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import Icon from "../components/Icon";
import "../styles/pages.css";
import "../styles/dashboard.css";
import { toUtcDate, fmtTs, fmtDate } from "../utils/dateUtils";

const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Requirement = {
  id: string;
  req_id: string;
  requirement_name: string;
  assigned_recruiters?: string[];
};

// ── Shared search-bar styles (kept high-contrast so text is clearly visible) ──
const SEARCH_LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-secondary)",
  marginBottom: "0.35rem",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const SEARCH_FIELD: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  height: 38,
  border: "1px solid var(--border-subtle)",
  borderRadius: "8px",
  background: "var(--bg-input)",
  padding: "0 0.7rem",
};
const SEARCH_INPUT: React.CSSProperties = {
  border: "none",
  outline: "none",
  background: "transparent",
  fontSize: 14,
  color: "var(--text-primary)",
  width: "100%",
  height: "100%",
};
const SEARCH_CLEAR: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--text-secondary)",
  padding: 0,
  lineHeight: 1,
  fontSize: 18,
  flexShrink: 0,
};
const SEARCH_HINT: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-secondary)",
  marginTop: "0.3rem",
  lineHeight: 1.4,
};

function PaginationBar({
  page,
  totalPages,
  total,
  onGo,
  actions,
  top,
}: {
  page: number;
  totalPages: number;
  total: number;
  onGo: (p: number) => void;
  actions?: React.ReactNode;
  top?: boolean;
}) {
  if (totalPages <= 1 && total === 0) return null;
  const clamped = Math.min(page, totalPages || 1);
  const pageBtnStyle = (disabled: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 6,
    border: disabled ? "1px solid var(--border-subtle)" : "none",
    background: disabled ? "var(--bg-secondary)" : "var(--accent-gradient)",
    cursor: disabled ? "default" : "pointer",
    color: disabled ? "var(--text-muted)" : "#ffffff",
    fontSize: 16,
    lineHeight: 1,
    opacity: disabled ? 0.4 : 1,
    userSelect: "none",
    paddingBottom: 2,
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.65rem 1rem",
        borderTop: top ? "none" : "1px solid var(--border-subtle)",
        borderBottom: top ? "1px solid var(--border-subtle)" : "none",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: top ? "1rem" : 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        {actions}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <span
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {total} profiles
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <button
            style={pageBtnStyle(clamped <= 1)}
            onClick={() => clamped > 1 && onGo(1)}
            title="First page"
          >
            «
          </button>
          <button
            style={pageBtnStyle(clamped <= 1)}
            onClick={() => clamped > 1 && onGo(clamped - 1)}
            title="Previous page"
          >
            ‹
          </button>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-secondary)",
              minWidth: 52,
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            {clamped} / {totalPages}
          </span>
          <button
            style={pageBtnStyle(clamped >= totalPages)}
            onClick={() => clamped < totalPages && onGo(clamped + 1)}
            title="Next page"
          >
            ›
          </button>
          <button
            style={pageBtnStyle(clamped >= totalPages)}
            onClick={() => clamped < totalPages && onGo(totalPages)}
            title="Last page"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}

type Candidate = {
  id: string;
  Name?: string | null;
  Email?: string | null;
  PhoneNumber?: string | null;
  Skills?: string[] | null;
  Experience?: Array<{
    Position?: string;
    Company?: string;
    Years?: string;
  }> | null;
  experience_label?: string | null;
  resume_filename?: string | null;
  resume_updated_at?: string | null;
  created_at: string;
  structured_with_ai?: boolean | null;
  // Ownership - the same fields the Profiles tab and the approval flow read.
  owner_name?: string | null;
  owner_active?: boolean | null;
  ownership_expires_at?: string | null;
};

/** Owned only while the window is open AND the owner's account is still active. */
function isOwned(c: Candidate): boolean {
  if (!c.owner_name || c.owner_active === false) return false;
  if (!c.ownership_expires_at) return false;
  return new Date(c.ownership_expires_at).getTime() > Date.now();
}

function getDisplayRole(c: Candidate): string | null {
  if (Array.isArray(c.Experience) && c.Experience.length > 0) {
    return c.Experience[0].Position || null;
  }
  return null;
}

export default function TalentPool() {
  useDocumentTitle("Talent Pool");
  const { isAdmin, isRecruiter, user } = useAuth();
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>(
    [],
  );
  const [uploading, setUploading] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [nameInput, setNameInput] = useState(
    () => searchParams.get("name") || "",
  );
  const [skillsInput, setSkillsInput] = useState(
    () => searchParams.get("skills") || "",
  );
  const [roleInput, setRoleInput] = useState(
    () => searchParams.get("role") || "",
  );
  const [expMin, setExpMin] = useState(() => searchParams.get("expMin") || "");
  const [expMax, setExpMax] = useState(() => searchParams.get("expMax") || "");
  const [sourceInput, setSourceInput] = useState(() => searchParams.get("source") || "all");
  const [ownedByInput, setOwnedByInput] = useState<string[]>(() => {
    const p = searchParams.get("ownedBy");
    return p ? p.split(",") : [];
  });
  const [ownedByDropdownOpen, setOwnedByDropdownOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(() =>
    Boolean(
      searchParams.get("name") ||
      searchParams.get("skills") ||
      searchParams.get("role") ||
      searchParams.get("expMin") ||
      searchParams.get("expMax") ||
      (searchParams.get("source") && searchParams.get("source") !== "all") ||
      searchParams.get("ownedBy")
    ),
  );

  // Keep URL in sync whenever filters change (replace so back-button isn't spammed).
  useEffect(() => {
    const p = new URLSearchParams();
    if (nameInput) p.set("name", nameInput);
    if (skillsInput) p.set("skills", skillsInput);
    if (roleInput) p.set("role", roleInput);
    if (expMin) p.set("expMin", expMin);
    if (expMax) p.set("expMax", expMax);
    if (sourceInput && sourceInput !== "all") p.set("source", sourceInput);
    if (ownedByInput.length > 0) p.set("ownedBy", ownedByInput.join(","));
    setSearchParams(p, { replace: true });
  }, [nameInput, skillsInput, roleInput, expMin, expMax, sourceInput, ownedByInput]); // eslint-disable-line react-hooks/exhaustive-deps
  type DuplicateDetail = {
    filename: string;
    message: string;
    candidate_id?: string;
  };
  const [skippedFiles, setSkippedFiles] = useState<DuplicateDetail[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Send to requirement
  const [sendModal, setSendModal] = useState(false);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [sendReqId, setSendReqId] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  // Post-upload scan picker: which requirements to score the new candidates against
  const [scanPicker, setScanPicker] = useState<{
    candidateIds: string[];
  } | null>(null);
  const [scanReqs, setScanReqs] = useState<Requirement[]>([]);
  const [scanReqIds, setScanReqIds] = useState<string[]>([]);
  const [startingScan, setStartingScan] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Resume viewer modal
  const [resumeModal, setResumeModal] = useState<{ url: string, filename: string, type: string } | null>(null);
  const [fetchingResumeFor, setFetchingResumeFor] = useState<string | null>(null);

  // Edit-details modal - lets recruiters fill in fields the resume parser missed.
  type EditForm = {
    Name: string;
    Email: string;
    PhoneNumber: string;
    current_role: string;
    current_company: string;
    location: string;
    experience_label: string;
    current_ctc: string;
    expected_ctc: string;
    notice_period: string;
  };
  const emptyEdit: EditForm = {
    Name: "",
    Email: "",
    PhoneNumber: "",
    current_role: "",
    current_company: "",
    location: "",
    experience_label: "",
    current_ctc: "",
    expected_ctc: "",
    notice_period: "",
  };
  const [editCandidate, setEditCandidate] = useState<Candidate | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEdit);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  const openEditModal = (c: Candidate) => {
    const a = c as any;
    const firstExp =
      Array.isArray(c.Experience) && c.Experience.length ? c.Experience[0] : {};
    setEditForm({
      Name: c.Name || "",
      Email: c.Email || "",
      PhoneNumber: c.PhoneNumber || "",
      current_role: a.current_role || firstExp?.Position || "",
      current_company: a.current_company || firstExp?.Company || "",
      location: a.location || "",
      experience_label: c.experience_label || "",
      current_ctc: a.current_ctc != null ? String(a.current_ctc) : "",
      expected_ctc: a.expected_ctc != null ? String(a.expected_ctc) : "",
      notice_period: a.notice_period || "",
    });
    setEditErr(null);
    setEditCandidate(c);
  };

  const handleSaveEdit = async () => {
    if (!editCandidate) return;
    // Only send non-empty fields, so leaving a box blank never wipes existing data.
    const body: Record<string, any> = {};
    const setStr = (k: keyof EditForm) => {
      const v = editForm[k].trim();
      if (v) body[k] = v;
    };
    (
      [
        "Name",
        "Email",
        "PhoneNumber",
        "current_role",
        "current_company",
        "location",
        "experience_label",
        "notice_period",
      ] as (keyof EditForm)[]
    ).forEach(setStr);
    if (editForm.current_ctc.trim())
      body.current_ctc = parseFloat(editForm.current_ctc);
    if (editForm.expected_ctc.trim())
      body.expected_ctc = parseFloat(editForm.expected_ctc);
    if (Object.keys(body).length === 0) {
      setEditErr("Nothing to save - fill in at least one field.");
      return;
    }
    setSavingEdit(true);
    setEditErr(null);
    try {
      await api.patch(`/candidates/${editCandidate.id}`, body);
      setNotice("Candidate details updated.");
      setEditCandidate(null);
      await loadCandidates();
    } catch (e: any) {
      setEditErr(e?.detail || e?.message || "Failed to update candidate");
    } finally {
      setSavingEdit(false);
    }
  };

  // Comments modal
  type CommentEntry = {
    comment: string;
    date: string;
    author_name?: string;
    requirement_name?: string;
    requirement_uuid?: string;
  };
  type ProfileRef = {
    requirement_uuid: string;
    requirement_name: string;
    req_id?: string;
  };
  const [commentsCandidate, setCommentsCandidate] = useState<Candidate | null>(
    null,
  );
  const [commentsList, setCommentsList] = useState<CommentEntry[]>([]);
  const [commentProfiles, setCommentProfiles] = useState<ProfileRef[]>([]);
  const [commentReqId, setCommentReqId] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [commentErr, setCommentErr] = useState<string | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);

  // ── Server-side pagination + filtering ───────────────────────────────────
  // The talent pool is no longer downloaded whole; the backend filters and
  // returns one page at a time ({items, total, skip, limit}).
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const buildQuery = (pageNum: number) => {
    const p = new URLSearchParams();
    p.set("skip", String((pageNum - 1) * PAGE_SIZE));
    p.set("limit", String(PAGE_SIZE));
    if (nameInput.trim()) p.set("name", nameInput.trim());
    if (skillsInput.trim()) p.set("skills", skillsInput.trim());
    if (roleInput.trim()) p.set("role", roleInput.trim());
    if (expMin) p.set("exp_min", expMin);
    if (expMax) p.set("exp_max", expMax);
    if (sourceInput && sourceInput !== "all") p.set("source", sourceInput);
    if (ownedByInput.length > 0) p.set("owned_by", ownedByInput.join(","));
    return p.toString();
  };

  const loadCandidates = async (pageNum: number = page) => {
    try {
      const data = await api.get(`/candidates?${buildQuery(pageNum)}`);
      setCandidates(data?.items || []);
      setTotal(data?.total || 0);
    } catch {
      // silent refresh during upload
    }
  };

  const refreshAll = async (pageNum: number = page) => {
    setError("");
    setNotice("");
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 8000);
    try {
      const data = await api.get(`/candidates?${buildQuery(pageNum)}`);
      setCandidates(data?.items || []);
      setTotal(data?.total || 0);
    } catch (err: any) {
      setError(err.detail || "Failed to load talent pool");
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  // Filters changed → debounce, reset to page 1, refetch from the server.
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      api.get("/users/recruiters").then((res) => setUsers(res || [])).catch(() => { });
      void refreshAll(1);
      return;
    }
    const t = setTimeout(() => {
      setPage(1);
      void refreshAll(1);
    }, 400);
    return () => clearTimeout(t);
  }, [nameInput, skillsInput, roleInput, expMin, expMax, sourceInput, ownedByInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToPage = (pageNum: number) => {
    setPage(pageNum);
    void refreshAll(pageNum);
  };
  const handleBulkUpload = async (files: FileList) => {
    if (!files || files.length === 0) {
      setError("Please select at least one file to upload.");
      return;
    }

    setUploading(true);
    setError("");
    setNotice("");
    setSkippedFiles([]);

    let createdCount = 0,
      duplicateCount = 0,
      failedCount = 0,
      aiFailedCount = 0;
    const skipped: DuplicateDetail[] = [];
    const failedDetails: string[] = [];
    const createdIds: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress({
        current: i + 1,
        total: files.length,
        fileName: file.name,
      });
      try {
        const formData = new FormData();
        formData.append("resume_files", file);
        const res = await api.post("/candidates/bulk-upload", formData);
        createdCount += res.created_count || 0;
        duplicateCount += res.duplicate_count || 0;
        failedCount += res.failed_count || 0;
        aiFailedCount += res.ai_failed_count || 0;
        if (res.items) {
          for (const item of res.items) {
            if (item.status === "created" && item.candidate_id)
              createdIds.push(String(item.candidate_id));
            if (item.status === "duplicate")
              skipped.push({
                filename: item.filename,
                message: item.message || "",
                candidate_id: item.candidate_id
                  ? String(item.candidate_id)
                  : undefined,
              });
            if (item.status === "failed")
              failedDetails.push(
                `${item.filename}: ${item.message || "unknown error"}`,
              );
          }
        }
        if (res.created_count > 0) await loadCandidates();
      } catch (err: any) {
        failedCount += 1;
        failedDetails.push(
          `${file.name}: ${err?.detail || err?.message || "upload failed"}`,
        );
      }
    }
    setSkippedFiles(skipped);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadProgress(null);
    setUploading(false);

    const parts = [];
    if (createdCount) parts.push(`${createdCount} uploaded`);
    if (aiFailedCount)
      parts.push(
        `${aiFailedCount} saved as raw text only (AI structuring failed)`,
      );
    if (duplicateCount)
      parts.push(
        `${duplicateCount} duplicate${duplicateCount > 1 ? "s" : ""} skipped`,
      );
    if (failedCount) parts.push(`${failedCount} failed`);
    setNotice(parts.join(", ") || "Upload complete.");
    if (failedDetails.length) setError(failedDetails.slice(0, 5).join(" • "));

    // Ask the user which requirements the new candidates should be scored against
    // (replaces the old automatic scan of every open requirement).
    if (createdIds.length > 0) {
      try {
        const reqs: Requirement[] = await api.get("/requirements");
        setScanReqs(
          reqs.filter(
            (r) => !["DELETED", "CLOSED"].includes((r as any).status),
          ),
        );
      } catch {
        setScanReqs([]);
      }
      setScanReqIds([]);
      setScanError(null);
      setScanPicker({ candidateIds: createdIds });
    }
  };

  const toggleScanReq = (id: string) => {
    setScanReqIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleStartScan = async () => {
    if (!scanPicker || !scanReqIds.length) return;
    setStartingScan(true);
    setScanError(null);
    try {
      await api.post("/candidates/scan-against", {
        candidate_ids: scanPicker.candidateIds,
        requirement_ids: scanReqIds,
      });
      setNotice(
        `Scan queued: ${scanPicker.candidateIds.length} new candidate${scanPicker.candidateIds.length !== 1 ? "s" : ""} against ${scanReqIds.length} requirement${scanReqIds.length !== 1 ? "s" : ""}. Matches appear on each requirement's Profiles tab once AI processing finishes.`,
      );
      setScanPicker(null);
    } catch (err: any) {
      setScanError(err?.detail || err?.message || "Failed to start scan");
    } finally {
      setStartingScan(false);
    }
  };

  // Re-queue every candidate whose AI parse failed (they otherwise stay unparsed
  // and aren't name-searchable). Admin-only.
  const handleReparseFailed = async () => {
    if (!isAdmin || reparsing) return;
    setReparsing(true);
    try {
      const res = await api.post("/candidates/reparse-failed", {});
      const n = res?.requeued ?? 0;
      setNotice(
        n > 0
          ? `Re-queued ${n} failed profile${n !== 1 ? "s" : ""} for parsing - details fill in as each finishes.`
          : "No failed profiles to reparse.",
      );
      await refreshAll();
    } catch (err: any) {
      setNotice(err?.detail || err?.message || "Failed to reparse profiles.");
    } finally {
      setReparsing(false);
    }
  };

  const toggleCandidateSelection = (id: string) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAllCandidates = () => {
    if (filteredCandidates.every((c) => selectedIdSet.has(c.id))) {
      setSelectedCandidateIds((prev) =>
        prev.filter((id) => !filteredCandidates.some((c) => c.id === id)),
      );
      return;
    }
    setSelectedCandidateIds((prev) =>
      Array.from(new Set([...prev, ...filteredCandidates.map((c) => c.id)])),
    );
  };

  const handleDeleteCandidate = async (candidate: Candidate) => {
    if (!isAdmin) return;
    setConfirmDialog({
      message: `Delete resume for "${candidate.Name || "this candidate"}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setDeleting(true);
        setError("");
        setNotice("");
        try {
          const result = await api.delete(`/candidates/${candidate.id}`);
          setSelectedCandidateIds((prev) =>
            prev.filter((id) => id !== candidate.id),
          );
          setNotice(result?.message || "Candidate deleted successfully");
          await loadCandidates();
        } catch (err: any) {
          setError(err.detail || "Failed to delete candidate");
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const handleDeleteSelectedCandidates = async () => {
    if (!isAdmin || !selectedCandidateIds.length) return;
    setConfirmDialog({
      message: `Delete ${selectedCandidateIds.length} selected resume${selectedCandidateIds.length > 1 ? "s" : ""}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setDeleting(true);
        setError("");
        setNotice("");
        try {
          const result = await api.post("/candidates/bulk-delete", {
            candidate_ids: selectedCandidateIds,
          });
          const notFoundCount = (result?.not_found_ids || []).length;
          setNotice(
            `${result?.message || "Bulk delete completed"}${notFoundCount ? ` (${notFoundCount} already removed)` : ""}`,
          );
          setSelectedCandidateIds([]);
          await loadCandidates();
        } catch (err: any) {
          setError(err.detail || "Failed to delete selected candidates");
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const openCommentsModal = async (candidate: Candidate) => {
    setCommentsCandidate(candidate);
    setCommentDraft("");
    setCommentErr(null);
    setCommentReqId("talent_pool");
    setCommentsList([]);
    setCommentProfiles([]);
    setLoadingComments(true);
    try {
      const data = await api.get(
        `/candidates/${candidate.id}/profile-comments`,
      );
      setCommentsList(data.comments || []);
      setCommentProfiles(data.profiles || []);
      if ((data.profiles || []).length === 1)
        setCommentReqId(data.profiles[0].requirement_uuid);
    } catch {
      setCommentsList([]);
      setCommentProfiles([]);
    } finally {
      setLoadingComments(false);
    }
  };

  const handlePostComment = async () => {
    if (!commentsCandidate || !commentDraft.trim()) return;
    setPostingComment(true);
    setCommentErr(null);
    try {
      if (commentReqId && commentReqId !== "talent_pool") {
        await api.post(
          `/requirements/${commentReqId}/profiles/${commentsCandidate.id}/comments`,
          {
            comment: commentDraft.trim(),
          },
        );
      } else {
        await api.post(`/candidates/${commentsCandidate.id}/profile-comments`, {
          comment: commentDraft.trim(),
        });
      }
      setCommentDraft("");
      const data = await api.get(
        `/candidates/${commentsCandidate.id}/profile-comments`,
      );
      setCommentsList(data.comments || []);
      setCommentProfiles(data.profiles || []);
    } catch (e: any) {
      setCommentErr(e?.detail || e?.message || "Failed to post comment");
    } finally {
      setPostingComment(false);
    }
  };

  const openSendModal = async () => {
    setSendResult(null);
    setSendReqId("");
    try {
      const reqs: Requirement[] = await api.get("/requirements");
      const mine = isAdmin
        ? reqs.filter((r) => !["DELETED", "CLOSED"].includes((r as any).status))
        : reqs.filter(
          (r) =>
            !["DELETED", "CLOSED"].includes((r as any).status) &&
            (r.assigned_recruiters || []).includes(user?.id || ""),
        );
      setRequirements(mine);
    } catch {
      setRequirements([]);
    }
    setSendModal(true);
  };

  const handleSendToRequirement = async () => {
    if (!sendReqId || !selectedCandidateIds.length) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await api.post(
        `/requirements/${sendReqId}/profiles/add-from-pool`,
        {
          candidate_ids: selectedCandidateIds,
        },
      );
      setSendResult(
        `${res.added} of ${res.total} profile${res.total !== 1 ? "s" : ""} added to the Profiles tab successfully.`,
      );
    } catch (err: any) {
      setSendResult(`Error: ${err?.detail || err?.message || "Send failed"}`);
    } finally {
      setSending(false);
    }
  };

  // Filtering happens server-side now - the page IS the filtered result.
  const filteredCandidates = candidates;

  const sourceFilterDropdown = (() => {
    const tags = [
      { key: "assessment", label: "Assessment" },
      { key: "manual", label: "Manual" },
      { key: "bulk", label: "Bulk" },
      { key: "linkedin", label: "LinkedIn" },
      { key: "email", label: "Email" },
      { key: "others", label: "Others" },
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <label style={SEARCH_LABEL}>Source</label>
        <select
          value={sourceInput}
          onChange={(e) => setSourceInput(e.target.value)}
          style={{
            ...SEARCH_INPUT,
            height: 38,
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            background: "var(--bg-input)",
            outline: "none",
            cursor: "pointer",
            width: "100%",
            color: "var(--text-primary)",
          }}
        >
          <option value="all" style={{ background: "var(--twd-paper)", color: "var(--twd-ink)" }}>All Sources</option>
          {tags.map(t => (
            <option key={t.key} value={t.key} style={{ background: "var(--twd-paper)", color: "var(--twd-ink)" }}>{t.label}</option>
          ))}
        </select>
      </div>
    );
  })();

  const ownerFilterDropdown = (() => {
    const ownerMap = new Map<string, string>();
    users.forEach(u => {
      const name = u.name || u.email || "Unknown";
      ownerMap.set(u.id, name);
    });
    const options = Array.from(ownerMap.entries()).map(([key, label]) => ({ key, label }));
    options.unshift({ key: "none", label: "None" });
    if (options.length === 1) return null;

    let buttonLabel = "All Owners";
    if (ownedByInput.length > 0) {
      if (ownedByInput.length === 1) {
        buttonLabel = ownerMap.get(ownedByInput[0]) || ownedByInput[0];
      } else {
        buttonLabel = `${ownedByInput.length} selected`;
      }
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
        <label style={SEARCH_LABEL}>Owned By</label>
        <button
          type="button"
          onClick={() => setOwnedByDropdownOpen(s => !s)}
          style={{
            ...SEARCH_INPUT,
            height: 38,
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            background: "var(--bg-input)",
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0 10px",
            color: ownedByInput.length > 0 ? "var(--text-primary)" : "var(--text-secondary)"
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{buttonLabel}</span>
          <Icon name={ownedByDropdownOpen ? "chevron-up" : "chevron-down"} size={14} />
        </button>

        {ownedByDropdownOpen && (
          <div style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 220,
            overflowY: "auto",
            background: "var(--bg-primary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            padding: "8px 10px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}>
            {options.map(o => (
              <label key={o.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: 13, color: "var(--text-primary)", cursor: "pointer", width: "100%" }}>
                <input
                  type="checkbox"
                  checked={ownedByInput.includes(o.key)}
                  onChange={(e) => {
                    if (e.target.checked) setOwnedByInput(prev => [...prev, o.key]);
                    else setOwnedByInput(prev => prev.filter(k => k !== o.key));
                  }}
                  style={{ accentColor: "var(--twd-red)" }}
                />
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  })();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selectedIdSet = useMemo(
    () => new Set(selectedCandidateIds),
    [selectedCandidateIds],
  );

  return (
    <div className="twd-scope">
      <div className="twd-head twd-head--tight twd-rise" style={{ position: "relative", zIndex: 50 }}>
        <div>
          <h1 className="twd-title"><span className="twd-title--accent">Talent</span> Pool</h1>
          <p className="twd-sub">
            {total} profile{total !== 1 ? "s" : ""}
            {totalPages > 1 && ` · page ${page} of ${totalPages}`}
          </p>
        </div>
        <div className="twd-head-actions">
          <div style={{ position: "relative", display: "flex" }}>
            <button
              className="twd-icon-btn"
              style={{ width: 40, minHeight: 40 }}
              onClick={() => setShowFilters((s) => !s)}
              title={showFilters ? "Hide Filters" : "Show Filters"}
              aria-label={showFilters ? "Hide Filters" : "Show Filters"}
            >
              <Icon name="filter" size={17} />
            </button>
            {showFilters && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  marginTop: 8,
                  right: 0,
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: "var(--shadow-lg)",
                  zIndex: 50,
                  width: 480,
                  maxWidth: "90vw",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                {/* Candidate name / email */}
                <div>
                  <label style={SEARCH_LABEL}>Candidate Name</label>
                  <div style={SEARCH_FIELD}>
                    <Icon name="search" size={15} />
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Search by name or email"
                      style={SEARCH_INPUT}
                    />
                    {nameInput && (
                      <button onClick={() => setNameInput("")} style={SEARCH_CLEAR}>
                        ×
                      </button>
                    )}
                  </div>
                  <div style={SEARCH_HINT}>
                    Matches name or email across all candidates
                  </div>
                </div>

                {/* Skills */}
                <div>
                  <label style={SEARCH_LABEL}>Skills / Keywords</label>
                  <div style={SEARCH_FIELD}>
                    <Icon name="search" size={15} />
                    <input
                      type="text"
                      value={skillsInput}
                      onChange={(e) => setSkillsInput(e.target.value)}
                      placeholder="Java, React, AWS"
                      style={SEARCH_INPUT}
                    />
                    {skillsInput && (
                      <button onClick={() => setSkillsInput("")} style={SEARCH_CLEAR}>
                        ×
                      </button>
                    )}
                  </div>
                  <div style={SEARCH_HINT}>Comma = OR &nbsp;·&nbsp; Space = AND</div>
                </div>

                {/* Role */}
                <div>
                  <label style={SEARCH_LABEL}>Role / Designation</label>
                  <div style={SEARCH_FIELD}>
                    <input
                      type="text"
                      value={roleInput}
                      onChange={(e) => setRoleInput(e.target.value)}
                      placeholder="e.g. Full Stack Developer"
                      style={SEARCH_INPUT}
                    />
                    {roleInput && (
                      <button onClick={() => setRoleInput("")} style={SEARCH_CLEAR}>
                        ×
                      </button>
                    )}
                  </div>
                  <div style={SEARCH_HINT}>Partial match on job title</div>
                </div>

                {/* Experience */}
                <div>
                  <label style={SEARCH_LABEL}>Experience (yrs)</label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      height: 38,
                    }}
                  >
                    <input
                      type="number"
                      value={expMin}
                      onChange={(e) => setExpMin(e.target.value)}
                      placeholder="Min"
                      min={0}
                      style={{
                        width: "68px",
                        height: "100%",
                        padding: "0 0.55rem",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "8px",
                        background: "var(--bg-input)",
                        color: "var(--text-primary)",
                        fontSize: 14,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    <span
                      style={{
                        color: "var(--text-secondary)",
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      to
                    </span>
                    <input
                      type="number"
                      value={expMax}
                      onChange={(e) => setExpMax(e.target.value)}
                      placeholder="Max"
                      min={0}
                      style={{
                        width: "68px",
                        height: "100%",
                        padding: "0 0.55rem",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "8px",
                        background: "var(--bg-input)",
                        color: "var(--text-primary)",
                        fontSize: 14,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div style={SEARCH_HINT}>Total years of experience</div>
                </div>

                {/* Source Filter Dropdown */}
                {sourceFilterDropdown}

                {/* Owned By Filter */}
                {ownerFilterDropdown}

                {/* Clear button */}
                <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ height: 38, whiteSpace: "nowrap" }}
                    onClick={() => {
                      setNameInput("");
                      setSkillsInput("");
                      setRoleInput("");
                      setExpMin("");
                      setExpMax("");
                      setSourceInput("all");
                      setOwnedByInput([]);
                      setSearchParams({}, { replace: true });
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            )}
          </div>
          {isAdmin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files;
                  if (f && f.length) void handleBulkUpload(f);
                }}
              />
              <button
                className="twd-btn twd-btn-primary"
                disabled={uploading}
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                <Icon name="document" size={15} />
                {uploading ? "Uploading…" : "Upload Resumes"}
              </button>
              <button
                className="twd-btn twd-btn-ghost"
                disabled={reparsing}
                onClick={handleReparseFailed}
                title="Re-queue profiles whose AI parsing failed so they get parsed and become searchable"
              >
                <Icon name="refresh" size={14} />
                {reparsing ? "Reparsing…" : "Reparse Failed"}
              </button>
            </>
          )}
          <button className="twd-btn twd-btn-ghost" onClick={() => void refreshAll()}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={total}
        onGo={goToPage}
        top={true}
        actions={
          filteredCandidates.length > 0 && isRecruiter ? (
            <label
              className="talent-select-toggle"
              style={{ margin: 0, padding: 0 }}
            >
              <input
                type="checkbox"
                checked={filteredCandidates.every((c) =>
                  selectedIdSet.has(c.id),
                )}
                onChange={toggleSelectAllCandidates}
                disabled={deleting}
              />
              <span style={{ fontWeight: 600 }}>Select All</span>
            </label>
          ) : null
        }
      />

      {uploadProgress && (
        <div
          className="card"
          style={{ marginBottom: "1rem", padding: "0.85rem 1.1rem" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              marginBottom: "0.4rem",
            }}
          >
            <span>
              Uploading: <em>{uploadProgress.fileName}</em>
            </span>
            <span>
              {uploadProgress.current} / {uploadProgress.total}
            </span>
          </div>
          <div
            style={{
              height: "6px",
              background: "var(--border-subtle)",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                background: "var(--primary)",
                borderRadius: "4px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="form-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {notice && (
        <div
          className="form-success"
          style={{ marginBottom: skippedFiles.length > 0 ? "0.5rem" : "1rem" }}
        >
          {notice}
        </div>
      )}
      {skippedFiles.length > 0 && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "12px 16px",
            background:
              "color-mix(in srgb, var(--warning, #f59e0b) 8%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--warning, #f59e0b) 30%, transparent)",
            borderRadius: "10px",
            fontSize: "13px",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "6px" }}>
            {skippedFiles.length} duplicate{skippedFiles.length > 1 ? "s" : ""}{" "}
            skipped - already in talent pool:
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "5px",
            }}
          >
            {skippedFiles.map((f, i) => (
              <li
                key={i}
                style={{
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                  {f.filename}
                </span>
                {f.message && (
                  <span style={{ color: "var(--text-tertiary, #9ca3af)" }}>
                    - {f.message}
                  </span>
                )}
                {f.candidate_id && (
                  <button
                    onClick={() => navigate(`/talent-pool/${f.candidate_id}`)}
                    style={{
                      background: "none",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 4,
                      padding: "1px 8px",
                      fontSize: 11,
                      cursor: "pointer",
                      color: "var(--primary, #2563eb)",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    View →
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="loading-spinner">Loading talent pool...</div>
      ) : !candidates.length ? (
        <div className="data-table-wrap">
          <div className="table-empty">
            <div className="table-empty-icon">No data</div>No candidates
            uploaded yet.
          </div>
        </div>
      ) : !filteredCandidates.length ? (
        <div className="data-table-wrap">
          <div className="table-empty">
            <div className="table-empty-icon">No data</div>No candidates match
            the selected role.
          </div>
        </div>
      ) : (
        <div className="talent-grid">
          {filteredCandidates.map((candidate) => {
            const displayRole = getDisplayRole(candidate);
            // Pretty name URL; falls back to the uuid when there's no usable name.
            const candUrl = `/talent-pool/${toSlug(candidate.Name || "") || candidate.id}`;
            return (
              <div key={candidate.id} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <a href={candUrl}>
                  <div
                    className={`talent-card ${selectedIdSet.has(candidate.id) ? "talent-card--selected" : ""}`}
                    style={{ flex: 1, width: "100%", cursor: "pointer" }}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button, label, input')) return;
                      if (e.ctrlKey || e.metaKey) {
                        window.open(candUrl, "_blank");
                      } else {
                        navigate(candUrl);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (e.ctrlKey || e.metaKey) {
                          window.open(candUrl, "_blank");
                        } else {
                          navigate(candUrl);
                        }
                      }
                    }}
                  >
                    <div className="talent-card-actions">
                      <label
                        className="talent-select-toggle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIdSet.has(candidate.id)}
                          onChange={() => toggleCandidateSelection(candidate.id)}
                          aria-label={`Select ${candidate.Name}`}
                        />
                        <span>Select</span>
                      </label>
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{
                            width: 28,
                            height: 28,
                            padding: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          title="Comments"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void openCommentsModal(candidate);
                          }}
                        >
                          <Icon name="message-square" size={16} />
                        </button>
                        {isRecruiter && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{
                              width: 28,
                              height: 28,
                              padding: 0,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title="Edit details (fill in anything the resume parser missed)"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openEditModal(candidate);
                            }}
                          >
                            <Icon name="edit" size={16} />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Delete"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void handleDeleteCandidate(candidate);
                            }}
                            disabled={deleting}
                            style={{
                              color: "var(--danger)",
                              width: 28,
                              height: 28,
                              padding: 0,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="talent-card-top" style={{ marginBottom: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <strong className="talent-name" style={{ lineHeight: 1 }}>
                          {candidate.Name || "Unknown Candidate"}
                        </strong>
                      </div>
                    </div>
                    {displayRole && (
                      <div className="talent-role" style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>{displayRole}</div>
                    )}
                    <div className="talent-meta-row" style={{ marginTop: "0.4rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      {(() => {
                        let expText = candidate.experience_label || "-";
                        expText = expText.replace(/yrs?/i, 'Y').replace(/mos?/i, 'M').replace(/\s+/g, ' ').trim();

                        const ch = (candidate as any).source_channel as string | undefined;
                        const label = ch === "email" ? "Email" : ch === "bulk" ? "Bulk" : ch === "manual" ? "Manual" : ch === "via_linkedin" ? "via LinkedIn" : ch === "via_email" ? "via Email" : ch === "linkedin_jobs" ? "LinkedIn Jobs" : ch === "job_posting" ? "Job Posting" : ch === "recruiter" ? "Recruiter" : ch === "public_post" ? "Public Post" : ch === "assessment" ? "Assessment" : null;

                        return (
                          <>
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              background: "var(--bg-secondary)",
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "var(--text-secondary)",
                            }}>
                              {expText}
                            </span>
                            {label && (
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                background: ch === "manual" ? "var(--twd-green-bg, #dcfce7)"
                                  : (ch === "via_linkedin" || ch === "linkedin") ? "#e0f2fe"
                                    : ch === "assessment" ? "#fef3c7"
                                      : ch === "bulk" ? "#f3e8ff"
                                        : (ch === "email" || ch === "via_email") ? "#ffedd5"
                                          : "var(--bg-secondary)",
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 600,
                                color: ch === "manual" ? "var(--twd-green, #166534)"
                                  : (ch === "via_linkedin" || ch === "linkedin") ? "#0369a1"
                                    : ch === "assessment" ? "#92400e"
                                      : ch === "bulk" ? "#6b21a8"
                                        : (ch === "email" || ch === "via_email") ? "#c2410c"
                                          : "var(--text-secondary)",
                              }}>
                                {label}
                              </span>
                            )}
                          </>
                        );
                      })()}

                      {candidate.resume_filename && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{
                            fontSize: "11px",
                            padding: "3px 6px",
                            height: "auto",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            border: "1px solid var(--border-subtle)"
                          }}
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFetchingResumeFor(candidate.id);
                            try {
                              const { API_BASE, getToken } = await import("../services/api");
                              const token = await getToken();
                              const res = await fetch(`${API_BASE}/candidates/${candidate.id}/resume`, {
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                              });
                              if (!res.ok) throw new Error("Failed to load resume");
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              setResumeModal({ url, filename: candidate.resume_filename || "Resume", type: blob.type });
                            } catch (err) {
                              console.error("Could not view resume", err);
                              alert("Failed to load resume.");
                            } finally {
                              setFetchingResumeFor(null);
                            }
                          }}
                          title={candidate.resume_filename}
                          disabled={fetchingResumeFor === candidate.id}
                        >
                          <Icon name="document" size={12} /> {fetchingResumeFor === candidate.id ? "Loading..." : "Resume"}
                        </button>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        marginTop: "0.4rem",
                      }}
                    >
                      {isOwned(candidate) ? (
                        <>
                          Owned by <strong>{candidate.owner_name}</strong>
                          {candidate.ownership_expires_at && (
                            <> · until {fmtDate(candidate.ownership_expires_at)}</>
                          )}
                        </>
                      ) : (
                        <span
                          style={{
                            fontStyle: "italic",
                            color: "var(--text-muted)",
                          }}
                        >
                          Not owned yet - first to edit claims it
                        </span>
                      )}
                    </div>
                    {candidate.resume_filename && (
                      <div style={{ marginTop: "0.6rem" }}>
                        {(() => {
                          const dateStr =
                            candidate.resume_updated_at || candidate.created_at;
                          if (!dateStr) return null;
                          const uploaded = toUtcDate(dateStr);
                          const diffDays = Math.floor(
                            (Date.now() - uploaded.getTime()) / 86400000,
                          );
                          const diffMonths = diffDays / 30;
                          const isOld = diffMonths >= 2;
                          const label =
                            diffDays < 1
                              ? "Today"
                              : diffDays < 30
                                ? `${diffDays}d ago`
                                : `${Math.floor(diffMonths)}mo ago`;
                          return (
                            <div
                              style={{
                                fontSize: 10,
                                color: isOld ? "#b45309" : "var(--text-muted)",
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                flexWrap: "wrap",
                              }}
                              title={fmtTs(dateStr)}
                            >
                              {isOld && <span>⚠</span>}
                              <span>Last updated: {fmtTs(dateStr)}</span>
                              <span style={{ opacity: 0.8 }}>({label})</span>
                              {isOld && (
                                <span style={{ opacity: 0.8 }}>
                                  · may be outdated
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div></a>
              </div>
            );
          })}
        </div>
      )}

      {confirmDialog && (
        <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div
            className="modal-box"
            style={{ maxWidth: "420px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">Confirm Delete</div>
            <p
              className="text-sm"
              style={{
                margin: "0.75rem 0 1.25rem",
                color: "var(--text-secondary)",
              }}
            >
              {confirmDialog.message}
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmDialog(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: "var(--danger, #e53e3e)" }}
                onClick={() => void confirmDialog.onConfirm()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {commentsCandidate && (
        <div
          className="modal-overlay"
          onClick={() => setCommentsCandidate(null)}
        >
          <div
            className="modal-box"
            style={{ maxWidth: "540px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">
              Comments - {commentsCandidate.Name || "Candidate"}
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  display: "block",
                  marginBottom: "0.4rem",
                }}
              >
                Post a comment
              </label>
              <select
                value={commentReqId}
                onChange={(e) => setCommentReqId(e.target.value)}
                style={{
                  width: "100%",
                  marginBottom: "0.5rem",
                  padding: "0.5rem 0.75rem",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                <option value="talent_pool">Talent Pool (general note)</option>
                {commentProfiles.map((p) => (
                  <option key={p.requirement_uuid} value={p.requirement_uuid}>
                    {p.requirement_name}
                  </option>
                ))}
              </select>
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Write a comment…"
                rows={3}
                style={{
                  width: "100%",
                  resize: "vertical",
                  padding: "0.5rem 0.75rem",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "var(--font-size-sm)",
                  boxSizing: "border-box",
                }}
              />
              {commentErr && (
                <div className="form-error" style={{ marginTop: "0.3rem" }}>
                  {commentErr}
                </div>
              )}
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: "0.4rem" }}
                disabled={!commentDraft.trim() || postingComment}
                onClick={() => void handlePostComment()}
              >
                {postingComment ? "Posting…" : "Post Comment"}
              </button>
            </div>

            <div
              style={{
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: "0.75rem",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                }}
              >
                {loadingComments
                  ? "Loading…"
                  : `${commentsList.length} comment${commentsList.length !== 1 ? "s" : ""}`}
              </div>
              {commentsList.length === 0 && !loadingComments && (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  No comments yet.
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.65rem",
                  maxHeight: "280px",
                  overflowY: "auto",
                }}
              >
                {commentsList.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--bg-secondary)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.6rem 0.75rem",
                    }}
                  >
                    <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                      {c.comment}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        marginTop: "0.25rem",
                        display: "flex",
                        gap: "0.4rem",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        {c.author_name || "Unknown"}
                      </span>
                      <span>·</span>
                      <span>{fmtTs(c.date)}</span>
                      {c.requirement_name && (
                        <>
                          <span>·</span>
                          <span
                            style={{
                              background: "var(--bg-card)",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: 4,
                              padding: "0px 6px",
                              fontSize: 10,
                            }}
                          >
                            {c.requirement_name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: "1rem" }}>
              <button
                className="btn btn-ghost"
                onClick={() => setCommentsCandidate(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {editCandidate && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!savingEdit) setEditCandidate(null);
          }}
        >
          <div
            className="modal-box"
            style={{ maxWidth: "560px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">Edit Candidate Details</div>
            <p
              className="text-sm"
              style={{
                margin: "0.4rem 0 1rem",
                color: "var(--text-secondary)",
              }}
            >
              Fill in anything the resume parser missed. Blank fields are left
              unchanged.
            </p>
            {(() => {
              const labelStyle: React.CSSProperties = {
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: 4,
              };
              const inputStyle: React.CSSProperties = {
                width: "100%",
                padding: "0.5rem 0.65rem",
                background: "var(--bg-input)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: 14,
                boxSizing: "border-box",
              };
              // Plain function (not a component) so the <input> element identity stays
              // stable across renders - a nested component would remount and drop focus.
              const fld = (
                k: keyof EditForm,
                lbl: string,
                ph: string,
                type = "text",
                full = false,
              ) => (
                <div
                  key={k}
                  style={full ? { gridColumn: "1 / -1" } : undefined}
                >
                  <label style={labelStyle}>{lbl}</label>
                  <input
                    type={type}
                    value={editForm[k]}
                    placeholder={ph}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, [k]: e.target.value }))
                    }
                    style={inputStyle}
                  />
                </div>
              );
              return (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  {fld("Name", "Name", "Candidate name", "text", true)}
                  {fld("Email", "Email", "name@example.com")}
                  {fld("PhoneNumber", "Phone", "+91…")}
                  {fld("current_role", "Current Role", "e.g. Data Architect")}
                  {fld("current_company", "Current Company", "e.g. Bridgewest")}
                  {fld("location", "Location", "e.g. Hyderabad")}
                  {fld(
                    "experience_label",
                    "Total Experience",
                    "e.g. 8 yrs 3 mos",
                  )}
                  {fld("current_ctc", "Current CTC (LPA)", "e.g. 12", "number")}
                  {fld(
                    "expected_ctc",
                    "Expected CTC (LPA)",
                    "e.g. 18",
                    "number",
                  )}
                  {fld(
                    "notice_period",
                    "Notice Period",
                    "e.g. 30 days",
                    "text",
                    true,
                  )}
                </div>
              );
            })()}
            {editErr && (
              <div
                style={{ fontSize: 13, marginTop: "0.75rem", color: "#dc2626" }}
              >
                {editErr}
              </div>
            )}
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setEditCandidate(null)}
                disabled={savingEdit}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void handleSaveEdit()}
                disabled={savingEdit}
              >
                {savingEdit ? "Saving…" : "Save Details"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sendModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!sending) setSendModal(false);
          }}
        >
          <div
            className="modal-box"
            style={{ maxWidth: "480px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">Send to Requirement</div>
            <p
              className="text-sm"
              style={{
                margin: "0.5rem 0 1rem",
                color: "var(--text-secondary)",
              }}
            >
              {selectedCandidateIds.length} candidate
              {selectedCandidateIds.length !== 1 ? "s" : ""} will be scored and
              added to the Profiles tab for review before submission.
            </p>
            {requirements.length === 0 ? (
              <div
                className="text-sm"
                style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}
              >
                No open requirements assigned to you.
              </div>
            ) : (
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label>Select Requirement</label>
                <select
                  value={sendReqId}
                  onChange={(e) => setSendReqId(e.target.value)}
                  style={{
                    padding: "0.65rem 0.85rem",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    fontSize: "var(--font-size-base)",
                    width: "100%",
                  }}
                >
                  <option value="">Choose…</option>
                  {requirements.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.req_id} - {r.requirement_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {sendResult && (
              <div
                style={{
                  fontSize: 13,
                  marginBottom: "0.75rem",
                  color: sendResult.startsWith("Error") ? "#dc2626" : "#16a34a",
                }}
              >
                {sendResult}
              </div>
            )}
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setSendModal(false)}
                disabled={sending}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void handleSendToRequirement()}
                disabled={!sendReqId || sending || requirements.length === 0}
              >
                {sending ? "Sending…" : "Send Profiles"}
              </button>
            </div>
          </div>
        </div>
      )}

      {scanPicker && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!startingScan) setScanPicker(null);
          }}
        >
          <div
            className="modal-box"
            style={{ maxWidth: "520px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">Scan New Candidates?</div>
            <p
              className="text-sm"
              style={{
                margin: "0.5rem 0 1rem",
                color: "var(--text-secondary)",
              }}
            >
              {scanPicker.candidateIds.length} new resume
              {scanPicker.candidateIds.length !== 1 ? "s" : ""} uploaded. Select
              the requirements to score them against - matching candidates are
              added to those requirements' Profiles tabs automatically (scoring
              starts after AI processing of the resumes finishes).
            </p>
            {scanReqs.length === 0 ? (
              <div
                className="text-sm"
                style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}
              >
                No open requirements found.
              </div>
            ) : (
              <div
                style={{
                  maxHeight: 260,
                  overflowY: "auto",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.5rem 0.75rem",
                  marginBottom: "1rem",
                }}
              >
                {scanReqs.map((r) => (
                  <label
                    key={r.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.55rem",
                      padding: "0.35rem 0",
                      cursor: "pointer",
                      fontSize: 14,
                      color: "var(--text-primary)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={scanReqIds.includes(r.id)}
                      onChange={() => toggleScanReq(r.id)}
                      disabled={startingScan}
                    />
                    <span>
                      {r.req_id} - {r.requirement_name}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {scanError && (
              <div
                style={{
                  fontSize: 13,
                  marginBottom: "0.75rem",
                  color: "#dc2626",
                }}
              >
                {scanError}
              </div>
            )}
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setScanPicker(null)}
                disabled={startingScan}
              >
                Skip
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void handleStartScan()}
                disabled={
                  !scanReqIds.length || startingScan || scanReqs.length === 0
                }
              >
                {startingScan
                  ? "Starting…"
                  : `Scan Against ${scanReqIds.length || ""} Requirement${scanReqIds.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCandidateIds.length > 0 && isRecruiter && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-surface, #ffffff)",
            boxShadow:
              "0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)",
            padding: "0.6rem 1rem",
            borderRadius: "99px",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            zIndex: 100,
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
            }}
          >
            {selectedCandidateIds.length} selected
          </div>
          <div
            style={{ width: 1, height: 20, background: "var(--border-subtle)" }}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={sending}
            onClick={() => void openSendModal()}
            style={{ borderRadius: 99, padding: "0.4rem 1rem" }}
          >
            Send to Requirement
          </button>
          {isAdmin && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void handleDeleteSelectedCandidates()}
              disabled={deleting}
              style={{ color: "var(--danger)", borderRadius: 99 }}
            >
              {deleting ? "Deleting..." : `Delete Selected`}
            </button>
          )}
        </div>
      )}

      {!loading && candidates.length > 0 && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={total}
          onGo={goToPage}
          actions={
            filteredCandidates.length > 0 && isRecruiter ? (
              <label
                className="talent-select-toggle"
                style={{ margin: 0, padding: 0 }}
              >
                <input
                  type="checkbox"
                  checked={filteredCandidates.every((c) =>
                    selectedIdSet.has(c.id),
                  )}
                  onChange={toggleSelectAllCandidates}
                  disabled={deleting}
                />
                <span style={{ fontWeight: 600 }}>Select All</span>
              </label>
            ) : null
          }
        />
      )}

      {resumeModal && (
        <div className="modal-overlay" onClick={() => setResumeModal(null)}>
          <div
            className="modal-box"
            style={{ maxWidth: "800px", width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resumeModal.filename}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setResumeModal(null)}>Close</button>
            </div>
            <div style={{ marginTop: "1rem" }}>
              {(() => {
                const isViewable = resumeModal.filename.toLowerCase().endsWith(".pdf") ||
                  resumeModal.filename.toLowerCase().match(/\.(jpe?g|png|gif|webp)$/) ||
                  resumeModal.type === "application/pdf" ||
                  resumeModal.type.startsWith("image/");

                if (isViewable) {
                  return <iframe src={resumeModal.url} style={{ width: "100%", height: "70vh", border: "none", display: "block", borderRadius: "var(--radius-sm)" }} title={resumeModal.filename} />;
                }

                return (
                  <div style={{ padding: "4rem 1rem", textAlign: "center", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-subtle)" }}>
                    <Icon name="document" size={48} style={{ color: "var(--text-muted)", marginBottom: "1rem" }} />
                    <h3 style={{ marginBottom: "0.5rem" }}>Preview not available</h3>
                    <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
                      This file format cannot be viewed directly in the browser.<br />Please download it to view the contents.
                    </p>
                    <a
                      href={resumeModal.url}
                      download={resumeModal.filename}
                      className="btn btn-primary"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}
                    >
                      <Icon name="document" size={16} /> Download File
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
