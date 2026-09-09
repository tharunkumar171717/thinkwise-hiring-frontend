import { useEffect, useRef, useState } from "react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useParams, useNavigate, useLocation } from "../lib/router";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import StatusBadge from "../components/StatusBadge";
import { fmtTs } from "../utils/dateUtils";
import { STATUS_LABEL_SHORT } from "../utils/statusUtils";

import { useJdViewer } from "../context/JdViewerContext";
import ProfilesGrid from "../components/ProfilesGrid";
import AssessmentsPanel from "../components/AssessmentsPanel";
import { AssessmentLinkModal } from "../components/AssessmentActions";
import { ShortlistScheduleModal } from "../components/ShortlistScheduleModal";
import TimelineDrawer from "../components/TimelineDrawer";
import KebabMenu, { type MenuNode } from "../components/KebabMenu";
import Icon from "../components/Icon";
import AssignRecruitersDrawer from "../components/AssignRecruitersDrawer";
import RequestAssignmentDialog from "../components/RequestAssignmentDialog";
import RolloverDialog from "../components/RolloverDialog";
import RequirementHistory from "../components/RequirementHistory";
import "../styles/pages.css";
import "../styles/dashboard.css";

// "assessments" has a render branch but no tab entry — it is reached
// programmatically, not from the pill. Carried over from the pre-Next.js app.
type MainTab = "submissions" | "profiles" | "assessments" | "history";

// Shared by all three PillNav call sites (condensed / JD-open / full) so a tab
// added here can't go missing from one responsive variant.
const MAIN_TABS = [
    { key: "profiles", label: "Profiles" },
    { key: "submissions", label: "Submissions" },
    { key: "history", label: "History" },
];

function PillNav({ tabs, active, onSelect, compact }: {
    tabs: { key: string; label: string }[];
    active: string;
    onSelect: (key: string) => void;
    compact?: boolean;
}) {
    const idx = Math.max(0, tabs.findIndex(t => t.key === active));
    const pct = 100 / tabs.length;
    return (
        <div style={{
            position: "relative", display: "grid",
            gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
            background: "var(--twd-surface2)", borderRadius: "12px",
            padding: "4px", border: "1px solid var(--twd-line)",
        }}>
            <div style={{
                position: "absolute", top: "4px", bottom: "4px",
                width: `calc(${pct}% - 4px)`, borderRadius: "9px",
                background: "var(--twd-red)",
                boxShadow: "0 4px 12px -4px var(--twd-red)",
                transform: `translateX(calc(${idx * 100}% + ${idx * 4}px))`,
                transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
                pointerEvents: "none",
            }} />
            {tabs.map(t => {
                const isActive = t.key === active;
                return (
                    <button key={t.key} onClick={() => onSelect(t.key)} style={{
                        position: "relative", zIndex: 1,
                        padding: compact ? "5px 14px" : "7px 18px", borderRadius: "9px",
                        border: "none", cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: compact ? "12.5px" : "13px",
                        fontWeight: 600,
                        background: "transparent",
                        color: isActive ? "#fff" : "var(--twd-soft)",
                        transition: "color 0.22s ease",
                        whiteSpace: "nowrap", textAlign: "center",
                    }}>{t.label}</button>
                );
            })}
        </div>
    );
}

interface Requirement {
    id: string;
    req_id: string;
    requirement_name: string;
    company_name?: string | null;
    job_role?: string | null;
    jd: string | null;
    evaluation_dimensions?: Array<Record<string, any>>;
    important_information?: Array<{ label: string; any_of: string[] }>;
    additional_fields?: Record<string, any> | null;
    must_have_skills?: string[] | null;
    good_to_have_skills?: string[] | null;
    all_skills?: string[] | null;
    skill_requirements?: Array<{ label: string; tier: "must" | "good"; members: string[] }> | null;
    special_instructions: string | null;
    requirement_type: string | null;
    role_type: string | null;
    client_spoc_name: string | null;
    location: string | null;
    notice_period: string | null;
    years_of_experience: string | null;
    max_years_experience: string | null;
    mode_of_work: string | null;
    no_of_positions?: number | null;
    budget_range?: string | null;
    visibility?: string | null;
    visible_to?: string[] | null;
    sla_hours_to_first_submission?: number | null;
    sla_timezone?: string | null;
    sla_status?: string | null;
    sla_breached?: boolean | null;
    sla_deadline_ist?: string | null;
    first_submission_at_ist?: string | null;
    time_to_first_submission_hours?: number | null;
    sla_remaining_hours?: number | null;
    status: string;
    created_at: string;
    updated_at?: string | null;
    assigned_recruiters?: string[];
}

interface Application {
    id: string;
    candidate_id: string;
    requirement_id: string;
    recruiter_id: string;
    status: string;
    dynamic_status?: string | null;
    dynamic_timeline?: any[];
    client_shortlisted?: boolean | null;
    offer_status?: string | null;
    recruiter_comments: string | null;
    ai_score: number | null;
    sent_at: string;
    rejection_reason: string | null;
    source: string | null;
    candidate_name: string | null;
    recruiter_name: string | null;
}

const SUB_PAGE_SIZE = 10;

function npColor(notice?: string | null): string {
    if (!notice) return "var(--text-secondary)";
    const l = notice.toLowerCase();
    if (l.includes("immediate") || l.includes("serving") || l === "0") return "#16a34a";
    const n = parseInt(l);
    if (!isNaN(n)) { if (n <= 15) return "#16a34a"; if (n <= 60) return "#d97706"; return "#dc2626"; }
    return "var(--text-secondary)";
}

function SubmissionDetailModal({ app, prof, isAdmin, onClose }: { app: Application; prof: any; isAdmin: boolean; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const det = prof?.deterministic_scoring_analysis || {};
    const cand = prof?.candidate || {};
    const personal = cand.PersonalDetails || {};
    const mostRecent = (cand.Experience || [])[0] || {};
    const llm = prof?.llm_analysis;

    const currentRole = det.current_role || mostRecent.Position || cand.current_role;
    const currentCompany = det.current_company || mostRecent.Company || cand.current_company;
    const currentCtc = cand.current_ctc ?? cand.present_ctc;
    const expectedCtc = cand.expected_ctc;
    const noticePeriod = cand.notice_period || personal.NoticePeriod;
    const relevantExp = cand.relevant_experience;
    const reasonForChange = cand.reason_for_change;
    const totalExp = cand.experience_label
        || (det.total_experience_years != null ? `${det.total_experience_years} yrs` : undefined);

    const detFlags = (det.flags || []).map((f: any) => ({ ...f, level: f.severity }));
    const llmFlags = llm?.flags || [];
    const flags = [...detFlags, ...llmFlags];

    const Field = ({ label, value }: { label: string; value?: any }) => (
        <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, lineHeight: 1.45 }}>
                {value ?? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>-</span>}
            </div>
        </div>
    );

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.52)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }} onClick={onClose}>
            <div style={{ background: "var(--bg-primary)", borderRadius: 14, boxShadow: "0 24px 80px rgba(0,0,0,0.35)", width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--border-subtle)" }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: "1.1rem 1.4rem", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", flexShrink: 0 }}>
                    <div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2 }}>{app.candidate_name || "-"}</div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3, display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                            <StatusBadge status={app.offer_status || app.dynamic_status || app.status} />
                            <span style={{ color: "var(--text-muted)" }}>·</span>
                            <span>{fmtTs(app.sent_at)}</span>
                            {isAdmin && app.recruiter_name && (<><span style={{ color: "var(--text-muted)" }}>· by</span><span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{app.recruiter_name}</span></>)}
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: 8, cursor: "pointer", fontSize: 18, color: "var(--text-secondary)", lineHeight: 1, padding: "4px 9px", flexShrink: 0, marginTop: 2 }} title="Close (Esc)">×</button>
                </div>
                <div style={{ padding: "1.1rem 1.4rem", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {llm?.overall_score != null && (
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.65rem 0.9rem", background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                            <div style={{ flexShrink: 0 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px" }}>AI Score</div>
                                <div style={{ fontSize: 22, fontWeight: 800, color: "#2563eb", fontFamily: "monospace", lineHeight: 1.1 }}>{llm.overall_score}<span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" }}>/100</span></div>
                            </div>
                            {llm.rating && <span style={{ fontSize: 12, color: "var(--text-secondary)", background: "var(--bg-primary)", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border-subtle)", flexShrink: 0 }}>{llm.rating}</span>}
                            {llm.headline && <div style={{ fontStyle: "italic", color: "var(--text-secondary)", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{llm.headline}"</div>}
                        </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem 1.5rem" }}>
                        <Field label="Current Role" value={currentRole} />
                        <Field label="Current Company" value={currentCompany} />
                        <Field label="Current CTC" value={currentCtc != null ? `${currentCtc} LPA` : undefined} />
                        <Field label="Expected CTC" value={expectedCtc != null ? `${expectedCtc} LPA` : undefined} />
                        <Field label="Notice Period" value={noticePeriod ? <span style={{ color: npColor(noticePeriod), fontWeight: 600 }}>{noticePeriod}</span> : undefined} />
                        <Field label="Total Experience" value={totalExp} />
                    </div>
                    {relevantExp && (
                        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 4 }}>Relevant Experience</div>
                            <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.55 }}>{relevantExp}</div>
                        </div>
                    )}
                    {reasonForChange && (
                        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 4 }}>Reason for Change</div>
                            <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.55 }}>{reasonForChange}</div>
                        </div>
                    )}
                    {app.recruiter_comments && (
                        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 4 }}>Recruiter Comments</div>
                            <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.55 }}>{app.recruiter_comments}</div>
                        </div>
                    )}
                    {app.rejection_reason && (
                        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 4 }}>Rejection Reason</div>
                            <div style={{ fontSize: 13, color: "#dc2626", lineHeight: 1.55 }}>{app.rejection_reason}</div>
                        </div>
                    )}
                    {flags.length > 0 && (
                        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.85rem" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 6 }}>Flags</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                                {
                                    (flags && flags.length > 0) ? (
                                        <table border={0} style={{ borderCollapse: "collapse", width: "100%" }}>
                                            <tbody>
                                                {flags.map((f: any, i: number) => {
                                                    const col = f.level === "green" ? "#16a34a" : f.level === "orange" ? "#ca8a04" : (f.level === "red" || f.level === "warning") ? "#dc2626" : "#6b7280";
                                                    return (
                                                        <tr key={i}>
                                                            <td style={{ width: "20px", verticalAlign: "middle", padding: "6px 8px 6px 0" }}>
                                                                <span style={{ display: "block", width: 8, height: 8, borderRadius: "50%", background: col }} />
                                                            </td>
                                                            <td style={{ color: "var(--text-primary)", fontWeight: 500, minWidth: 80, textTransform: "capitalize" as const, padding: "6px 16px 6px 0", verticalAlign: "middle" }}>{f.type}</td>
                                                            <td style={{ color: "var(--text-secondary)", padding: "6px 0", verticalAlign: "middle" }}>{f.message}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    ) : <></>
                                }
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function RequirementDetail({ reqId: reqIdProp }: { reqId?: string } = {}) {
    const params = useParams<{ id: string }>();
    const id = reqIdProp || params.id;
    const { user, isAdmin, isRecruiter } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    // Keep assessment edit/fill within the current route context (dashboard,
    // my-requirements, analytics) so the URL + breadcrumb depth don't switch to
    // the raw /requirements/:id path. Falls back to the id path when opened there.
    const asmtBase = location.pathname.replace(/\/+$/, "") || `/requirements/${id}`;
    const { openJd, activeReq: jdActiveReq, isOpen: jdOpen } = useJdViewer();
    const [req, setReq] = useState<Requirement | null>(null);

    const { data: myCompaniesData } = useQuery<{ companies: string[]; all_access: boolean }>({
        queryKey: ["my-companies"],
        queryFn: () => api.get("/clients/my-companies").then((r: any) => r || { companies: [], all_access: false }),
        staleTime: 5 * 60 * 1000,
        retry: false,
    });
    const isClientManager = Boolean(
        myCompaniesData?.all_access ||
        (myCompaniesData?.companies || []).some(
            c => c.toLowerCase() === (req?.company_name || "").toLowerCase()
        )
    );
    const effectiveAdmin = isAdmin || isClientManager;
    useDocumentTitle(req?.requirement_name || "Requirement");

    // Assessment link modal (opened from the header overflow menu).
    const [showAssessmentLink, setShowAssessmentLink] = useState(false);

    const [applications, setApplications] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);
    const [_showJd, _setShowJd] = useState(false);

    // Submission detail modal
    const [selectedSub, setSelectedSub] = useState<{ app: Application; prof: any } | null>(null);
    const [subPage, setSubPage] = useState(1);

    // Status change modal
    const [selectedApp, setSelectedApp] = useState<Application | null>(null);
    const [timelineAppId, setTimelineAppId] = useState<string | null>(null);
    const activeTimelineApp = timelineAppId ? applications.find(a => a.id === timelineAppId) : null;
    const [revertingId, setRevertingId] = useState<string | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showAssignDrawer, setShowAssignDrawer] = useState(false);
    const [showRequestDialog, setShowRequestDialog] = useState(false);
    const [showRollover, setShowRollover] = useState(false);
    const [pendingRequestForThisReq, setPendingRequestForThisReq] = useState<boolean>(false);
    const [newReqStatus, setNewReqStatus] = useState("");

    // Profiles list (replaces old recommended/manual split)
    const queryClient = useQueryClient();
    const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
    const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
    const [profileSortKey, setProfileSortKey] = useState<"recent" | "smart">("recent");
    // Filter the profiles grid to specific sources
    const [sourceTagFilter, setSourceTagFilter] = useState<string>("all");
    const {
        data: _profilesResult,
        isLoading: loadingSuggestions,
        refetch: _refetchProfiles,
    } = useQuery({
        queryKey: ["profiles", id],
        queryFn: () => api.get(`/requirements/${id}/profiles`),
        enabled: !!id,
        staleTime: 30 * 1000,
        // While any profile is still being structured by the AI worker, poll so the grid
        // updates (name / role / score fill in) once structuring completes. Stops at 0 pending.
        refetchInterval: (query: any) => {
            const profs: any[] = query?.state?.data?.profiles ?? [];
            const anyPending = profs.some(
                (p) => p?.candidate?.ai_status === "pending" || p?.candidate?.ai_status === "processing"
            );
            return anyPending ? 5000 : false;
        },
    });
    const [jobPostingOnly, setJobPostingOnly] = useState(false);
    const suggestions: any[] = _profilesResult?.profiles ?? [];
    const _jobFiltered = jobPostingOnly ? suggestions.filter((p: any) => p.via_job_posting) : suggestions;
    const filteredSuggestions = sourceTagFilter === "all" ? _jobFiltered : _jobFiltered.filter((p: any) => {
        const tags = p.source_tags && p.source_tags.length > 0 ? p.source_tags : [{ key: "pool", label: "Pool" }];
        return tags.some((t: any) => t.key === sourceTagFilter);
    });
    const fetchProfiles = () => _refetchProfiles();

    // Resume upload state (multi-file)
    const [manualUploading, setManualUploading] = useState(false);
    const [manualUploadStage, setManualUploadStage] = useState<string>("");
    const [manualUploadError, setManualUploadError] = useState<string | null>(null);
    type UploadDuplicate = { filename: string; message: string; candidate_id?: string };
    const [uploadDuplicates, setUploadDuplicates] = useState<UploadDuplicate[]>([]);

    const [mainTab, setMainTab] = useState<MainTab>("profiles");

    // Collapse the header on scroll: full title + tabs row when at the top,
    // compact inline bar (small title + tabs beside actions) once scrolled.
    const [condensed, setCondensed] = useState(false);
    // The actions area crossfades: fade the current controls out (~180ms),
    // then swap to the other set and fade back in. `condensedUI` is what is
    // actually rendered; it lags `condensed` by the fade-out duration.
    const [condensedUI, setCondensedUI] = useState(false);
    const [xfading, setXfading] = useState(false);
    useEffect(() => {
        if (condensed === condensedUI) return;
        setXfading(true);
        const t = setTimeout(() => { setCondensedUI(condensed); setXfading(false); }, 180);
        return () => clearTimeout(t);
    }, [condensed, condensedUI]);
    // Hidden file input so "Upload Resumes" works from the condensed hamburger menu.
    const condensedFileRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const onScroll = () => {
            setCondensed(prev => {
                const y = window.scrollY;
                // hysteresis so the layout doesn't flicker around the threshold
                return prev ? y > 0 : y > 200;
            });
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // Requirement editing now lives on a dedicated full page (/requirements/:id/edit).

    const refreshApplications = async () => {
        if (!id) return;
        try {
            const appData = await api.get(`/applications?requirement_id=${id}`);
            setApplications(appData || []);
        } catch (err) {
            console.error("Failed to load applications:", err);
        }
    };

    const handleRevert = async (app: Application) => {
        if (revertingId === app.id) return;
        setRevertingId(app.id);
        try {
            await api.patch(`/applications/${app.id}/shortlist`, { shortlisted: null });
            await refreshApplications();
        } catch (err: any) {
            alert(err.message || "Failed to revert candidate.");
        } finally {
            setRevertingId(null);
        }
    };

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        api.get(`/requirements/${id}`)
            .then((reqData) => setReq(reqData))
            .catch(() => { })
            .finally(() => setLoading(false));
        api.get(`/applications?requirement_id=${id}`)
            .then((appData) => {
                const apps = appData || [];
                setApplications(apps);
                if (apps.length === 0) setMainTab("profiles");
            })
            .catch(() => { });
    }, [id]);

    // Keep the open JD panel in sync if it's showing this requirement
    useEffect(() => {
        if (req && jdActiveReq && jdActiveReq.id === req.id) {
            openJd(req as any);
        }
    }, [req, jdActiveReq, openJd]);

    useEffect(() => {
        const handleProfileUpdate = (e: any) => {
            const { profile: updatedProfile, jdId } = e.detail;
            if (jdId !== id) return;
            // Patch the cached profile in place - avoids a full refetch for single-row updates
            queryClient.setQueryData(["profiles", id], (old: any) => ({
                ...(old || {}),
                profiles: (old?.profiles ?? []).map((p: any) =>
                    p.candidate_uuid === updatedProfile.candidate_uuid ? updatedProfile : p
                ),
            }));
            void refreshApplications();
        };
        window.addEventListener("tw-profile-updated", handleProfileUpdate as EventListener);
        return () => window.removeEventListener("tw-profile-updated", handleProfileUpdate as EventListener);
    }, [id, queryClient]);

    const refreshPendingRequest = async () => {
        if (!id || !user) return;
        try {
            const rows = await api.get(`/assignment-requests?status=pending&requirement_id=${id}`);
            setPendingRequestForThisReq(Array.isArray(rows) && rows.some((r: any) => r.recruiter_id === user.id));
        } catch {
            setPendingRequestForThisReq(false);
        }
    };
    useEffect(() => { void refreshPendingRequest(); }, [id, user?.id]);

    const handleScanTalentPool = async () => {
        if (!id || generatingSuggestions) return;
        setGeneratingSuggestions(true);
        setSuggestionsError(null);
        try {
            const { job_id } = await api.post(`/requirements/${id}/profiles/scan-talent-pool`, {});
            // Poll for job completion every 3 seconds
            await new Promise<void>((resolve, reject) => {
                const interval = setInterval(async () => {
                    try {
                        const job = await api.get(`/requirements/${id}/scan-jobs/${job_id}`);
                        if (job.status === "done") {
                            clearInterval(interval);
                            resolve();
                        } else if (job.status === "failed") {
                            clearInterval(interval);
                            reject(new Error(job.error || "Scan failed"));
                        }
                    } catch (e) {
                        clearInterval(interval);
                        reject(e);
                    }
                }, 3000);
            });
            await fetchProfiles();
        } catch (err: any) {
            console.error("Talent-pool scan failed:", err);
            setSuggestionsError(err?.detail || err?.message || "Scan failed");
        } finally {
            setGeneratingSuggestions(false);
        }
    };


    // Unified resume upload - multi-file, non-gated. Each file goes through
    // /profiles/upload which stores in talent pool + scores against this req + upserts a profile row.
    const handleUploadResumes = async (files: FileList | null) => {
        if (!id || !files || files.length === 0) return;
        setManualUploading(true);
        setManualUploadError(null);
        setManualUploadStage(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
        setUploadDuplicates([]);
        try {
            const form = new FormData();
            Array.from(files).forEach(f => form.append("resume_files", f));
            const result = await api.post(`/requirements/${id}/profiles/upload`, form);
            const dupes: UploadDuplicate[] = (result.items ?? [])
                .filter((item: any) => item.status === "duplicate")
                .map((item: any) => ({ filename: item.filename, message: item.message || "", candidate_id: item.candidate_id }));
            setUploadDuplicates(dupes);
            const parts = [];
            if (result.uploaded) parts.push(`${result.uploaded} uploaded`);
            if (dupes.length) parts.push(`${dupes.length} duplicate${dupes.length > 1 ? "s" : ""} skipped`);
            if (result.failed) parts.push(`${result.failed} failed`);
            setManualUploadStage(parts.join(", ") || "Upload complete");
            await fetchProfiles();
        } catch (err: any) {
            setManualUploadError(err?.detail || err?.message || "Upload failed");
        } finally {
            setTimeout(() => {
                setManualUploading(false);
                setManualUploadStage("");
            }, 3000);
        }
    };

    // Submit a profile → creates an application + flips status="submitted".
    const handleSubmitProfile = async (profile: any) => {
        if (!id) return;
        const confirm = window.confirm(
            `Submit ${profile.candidate?.Name || "candidate"} to ${req?.requirement_name || "this requirement"}?\n\n` +
            `Sourced by: ${profile.recruiter_name || "-"} (${profile.sourced_by?.source || "-"})\n` +
            `Match score: ${profile.deterministic_scoring_analysis?.display_score ?? "-"}%`
        );
        if (!confirm) return;
        try {
            await api.post(`/requirements/${id}/profiles/${profile.candidate_uuid}/submit`, {});
            await fetchProfiles();
        } catch (err: any) {
            alert(err?.detail || err?.message || "Submit failed");
        }
    };

    // Remove a candidate's profile from this requirement (deletes the profile row +
    // the application if it hasn't progressed in the client pipeline).
    const handleRemoveProfile = async (profile: any) => {
        if (!id) return;
        const name = profile.candidate?.Name || profile.deterministic_scoring_analysis?.candidate_name || "this candidate";
        if (!window.confirm(`Remove ${name} from ${req?.requirement_name || "this requirement"}?\n\nThe candidate stays in the talent pool - only the link to this requirement is removed.`)) return;
        try {
            await api.delete(`/requirements/${id}/profiles/${profile.candidate_uuid}`);
            await fetchProfiles();
        } catch (err: any) {
            alert(err?.detail || err?.message || "Failed to remove profile");
        }
    };

    const handleRemoveApplication = async (app: Application) => {
        try {
            await api.delete(`/applications/${app.id}`);
            setApplications(prev => prev.filter(a => a.id !== app.id));
            // Profile grid refreshes through fetchProfiles to reflect the changed state.
            await fetchProfiles();
        } catch (err: any) {
            alert(err.detail || "Failed to remove submission");
        }
    };

    if (loading) return <div className="loading-spinner">Loading...</div>;
    if (!req) return <div className="loading-spinner">Requirement not found</div>;

    // Overflow (kebab) menu items - order: LinkedIn, Edit, Status, Assessment
    // subsection (Edit Assessment / Assessment Link / Fill on Behalf), Delete.
    const isActive = req?.status !== "DELETED";
    const menuItems: MenuNode[] = [];
    if (isActive) {
        menuItems.push({
            type: "item", label: "LinkedIn Search", icon: <Icon name="linkedin" size={15} />,
            onClick: () => {
                const params = new URLSearchParams();
                if (req.requirement_name) params.set("title", req.requirement_name);
                if (req.all_skills?.length) params.set("keywords", req.all_skills.join(", "));
                navigate(`/linkedin-search?${params.toString()}`);
            },
        });
        if (effectiveAdmin) {
            menuItems.push({ type: "item", label: "Edit", icon: <Icon name="edit" size={15} />, onClick: () => navigate(`/requirements/${id}/edit`) });
            menuItems.push({ type: "item", label: "Status", icon: <Icon name="refresh" size={15} />, onClick: () => { setNewReqStatus(req?.status || ""); setShowStatusModal(true); } });
            menuItems.push({ type: "item", label: "Roll Over", icon: <Icon name="send" size={15} />, onClick: () => setShowRollover(true) });
        }
        if (effectiveAdmin || isRecruiter) {
            menuItems.push({ type: "section", label: "Assessment" });
            if (effectiveAdmin) menuItems.push({ type: "item", indent: true, label: "Edit Assessment", icon: <Icon name="settings" size={15} />, onClick: () => navigate(`${asmtBase}/assessment/edit`) });
            menuItems.push({ type: "item", indent: true, label: "Assessment Link", icon: <Icon name="link" size={15} />, onClick: () => setShowAssessmentLink(true) });
            menuItems.push({ type: "item", indent: true, label: "Fill on Behalf", icon: <Icon name="send" size={15} />, onClick: () => navigate(`${asmtBase}/assessment/fill`) });
        }
        if (effectiveAdmin) {
            menuItems.push({ type: "item", label: "Delete", icon: <Icon name="trash" size={15} />, danger: true, onClick: () => setShowDeleteConfirm(true) });
        }
    } else if (effectiveAdmin) {
        menuItems.push({ type: "item", label: "Restore", icon: <Icon name="refresh" size={15} />, onClick: () => { setNewReqStatus("OPEN"); setShowStatusModal(true); } });
    }

    // Condensed (scrolled) header: header buttons move behind a hamburger menu.
    const condensedMenuItems: MenuNode[] = [
        { type: "item", label: "View JD", icon: <Icon name="document" size={15} />, onClick: () => openJd(req as any) },
        ...(effectiveAdmin && req?.status !== "DELETED" ? [{
            type: "item" as const,
            label: `Assign Recruiters${(req?.assigned_recruiters?.length || 0) > 0 ? ` (${req?.assigned_recruiters?.length})` : ""}`,
            icon: <Icon name="users" size={15} />,
            onClick: () => setShowAssignDrawer(true),
        }] : []),
        ...(effectiveAdmin && req?.status !== "DELETED" ? [{
            type: "item" as const,
            label: "Post in Website",
            icon: <Icon name="external" size={15} />,
            onClick: () => navigate(`/requirements/${id}/post-to-website`),
        }] : []),
        ...(!effectiveAdmin && isRecruiter && req?.status !== "DELETED" && user && !(req?.assigned_recruiters || []).includes(user.id) ? [{
            type: "item" as const,
            label: pendingRequestForThisReq ? "Request Pending" : "Request Assignment",
            icon: <Icon name="send" size={15} />,
            onClick: () => setShowRequestDialog(true),
            disabled: pendingRequestForThisReq,
        }] : []),
        ...(mainTab === "profiles" && (effectiveAdmin || isRecruiter) ? [
            { type: "section" as const, label: "Profiles" },

            {
                type: "item" as const,
                label: generatingSuggestions ? "Scanning…" : "Scan Talent Pool",
                icon: <Icon name="search" size={15} />,
                onClick: handleScanTalentPool,
                disabled: generatingSuggestions,
            },
            {
                type: "item" as const,
                label: manualUploading ? "Uploading…" : "Upload Resumes",
                icon: <Icon name="plus" size={15} />,
                onClick: () => condensedFileRef.current?.click(),
                disabled: manualUploading,
            },
        ] : []),
        ...(menuItems.length > 0 ? [{ type: "divider" as const }, ...menuItems] : []),
    ];

    // Profiles-tab toolbar (count + job-posting toggle + scan + upload). Sits
    // inline beside the tabs pill while the JD panel is open, otherwise on its
    // own row under the pill.
    const profilesToolbar = mainTab === "profiles" ? (
        <>
            <div style={{ fontSize: 13, color: "var(--twd-soft)" }}>
                {loadingSuggestions ? "Loading…" : (() => {
                    const n = filteredSuggestions.length;
                    return `${n} profile${n === 1 ? "" : "s"}${jobPostingOnly ? " · job posting" : ""}${sourceTagFilter !== "all" ? " · filtered" : ""}`;
                })()}
                {manualUploadStage && <span style={{ marginLeft: "0.75rem" }}>{manualUploadStage}</span>}
                {manualUploadError && <span style={{ marginLeft: "0.75rem", color: "var(--twd-red-text)" }}>{manualUploadError}</span>}
                {suggestionsError && <span style={{ marginLeft: "0.75rem", color: "var(--twd-red-text)" }}>{suggestionsError}</span>}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <label
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--twd-soft)", cursor: "pointer", whiteSpace: "nowrap" }}
                    title="Show only candidates who applied via the public job-posting link"
                >
                    <input
                        type="checkbox"
                        checked={jobPostingOnly}
                        onChange={(e) => setJobPostingOnly(e.target.checked)}
                        style={{ width: 14, height: 14, accentColor: "var(--twd-red)" }}
                    />
                    Job posting only
                </label>
                {(() => {
                    const tagMap = new Map<string, string>();
                    suggestions.forEach(p => {
                        const tags = p.source_tags && p.source_tags.length > 0 ? p.source_tags : [{ key: "pool", label: "Pool" }];
                        tags.forEach((t: any) => tagMap.set(t.key, t.label));
                    });
                    const tags = Array.from(tagMap.entries()).map(([key, label]) => ({ key, label }));
                    if (tags.length <= 1) return null;
                    return (
                        <select
                            value={sourceTagFilter}
                            onChange={(e) => setSourceTagFilter(e.target.value)}
                            style={{
                                padding: "0.4rem 0.75rem",
                                borderRadius: "6px",
                                border: "1px solid var(--border-subtle)",
                                background: "var(--bg-input)",
                                color: "var(--text-primary)",
                                fontSize: "13px",
                                cursor: "pointer",
                                outline: "none",
                                height: 32
                            }}
                        >
                            <option value="all">All Sources</option>
                            {tags.map(t => (
                                <option key={t.key} value={t.key}>{t.label}</option>
                            ))}
                        </select>
                    );
                })()}
                <button
                    className="twd-btn twd-btn-ghost twd-btn-sm"
                    onClick={handleScanTalentPool}
                    disabled={generatingSuggestions}
                    title="Run deterministic scoring against the talent pool"
                >{generatingSuggestions ? "Scanning…" : "Scan Talent Pool"}</button>
                <label className="twd-btn twd-btn-primary twd-btn-sm" style={{ cursor: manualUploading ? "not-allowed" : "pointer", opacity: manualUploading ? 0.6 : 1 }}>
                    {manualUploading ? "Uploading…" : "Upload Resumes"}
                    <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.txt"
                        style={{ display: "none" }}
                        disabled={manualUploading}
                        onChange={(e) => {
                            handleUploadResumes(e.target.files);
                            e.target.value = "";
                        }}
                    />
                </label>
            </div>
        </>
    ) : null;

    return (
        <div className="twd-scope">
            <div className="twd-detail-sticky" data-condensed={condensed || undefined}>
            <div className="twd-head twd-head--tight" style={{ position: "relative", zIndex: 10, marginBottom: condensed ? 6 : jdOpen ? 8 : 12 }}>
                <div style={{ minWidth: 0 }}>
                    <h1 className={`twd-title ${condensed || jdOpen ? "twd-title--xs" : "twd-title--sm"}`} style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                        {req.requirement_name}
                        {req.updated_at && (
                            <span className="twd-tag" style={{ verticalAlign: "middle" }}>
                                edited
                            </span>
                        )}
                        {req.visibility === "RESTRICTED" && (
                            <span
                                className="twd-tag"
                                style={{ verticalAlign: "middle", display: "inline-flex", alignItems: "center", gap: 4 }}
                                title="Hidden from everyone except admins, this client's managers, assigned recruiters, and people added to its viewer list"
                            >
                                <Icon name="lock" size={11} />
                                confidential
                            </span>
                        )}
                    </h1>
                    <div className="twd-collapse">
                    <div className="twd-detail-meta">
                        <span className="twd-mono" style={{ fontSize: 13 }}>
                            {req.req_id}
                        </span>
                        <StatusBadge status={req.status} />
                        {req.requirement_type && (
                            <span className="twd-detail-meta-item">
                                <Icon name="briefcase" size={13} />
                                <b>{req.requirement_type.replace(/_/g, " ")}</b>
                            </span>
                        )}
                        {req.sla_deadline_ist && (
                            <span className="twd-detail-meta-item">
                                <Icon name="clock" size={13} />
                                Deadline <b>{fmtTs(req.sla_deadline_ist)}</b>
                            </span>
                        )}
                    </div>
                    </div>
                </div>
                <div
                    className={`twd-head-actions twd-xfade${xfading ? " twd-xfade--out" : ""}`}
                    key={condensedUI ? "condensed" : "full"}
                >
                    {condensedUI && (effectiveAdmin || isRecruiter) && (
                        <div style={{ minWidth: 300 }}>
                            <PillNav
                                compact
                                tabs={MAIN_TABS}
                                active={mainTab}
                                onSelect={(k) => setMainTab(k as MainTab)}
                            />
                        </div>
                    )}
                    {!condensedUI && (
                        <>
                            <button
                                className="twd-btn twd-btn-ghost twd-btn-sm"
                                onClick={() => openJd(req as any)}
                                title="View full job description in side panel"
                            >
                                <Icon name="document" size={15} /> View JD
                            </button>
                            {effectiveAdmin && req?.status !== "DELETED" && (
                                <button
                                    className="twd-btn twd-btn-ghost"
                                    onClick={() => setShowAssignDrawer(true)}
                                    title="Assign recruiters to this requirement"
                                >
                                    <Icon name="users" size={14} />
                                    Assign Recruiters
                                    {(req?.assigned_recruiters?.length || 0) > 0 && (
                                        <span style={{
                                            fontSize: 11, fontWeight: 700,
                                            background: "var(--twd-red-bg)", color: "var(--twd-red-text)",
                                            borderRadius: 999, padding: "1px 7px",
                                        }}>{req.assigned_recruiters?.length}</span>
                                    )}
                                </button>
                            )}
                            {effectiveAdmin && req?.status !== "DELETED" && (
                                <button
                                    className="twd-btn twd-btn-ghost"
                                    onClick={() => navigate(`/requirements/${id}/post-to-website`)}
                                    title="Review the job description and publish it to the careers website"
                                >
                                    <Icon name="external" size={14} />
                                    Post in Website
                                </button>
                            )}
                            {!effectiveAdmin && isRecruiter && req?.status !== "DELETED" && user && !(req?.assigned_recruiters || []).includes(user.id) && (
                                <button
                                    className="twd-btn twd-btn-quiet"
                                    onClick={() => setShowRequestDialog(true)}
                                    disabled={pendingRequestForThisReq}
                                    title={pendingRequestForThisReq ? "Your request is pending admin approval" : "Request to be assigned to this requirement"}
                                >
                                    <Icon name="send" size={14} />
                                    {pendingRequestForThisReq ? "Request Pending" : "Request Assignment"}
                                </button>
                            )}
                        </>
                    )}
                    {condensedUI ? (
                        <KebabMenu icon={<Icon name="menu" size={16} />} ariaLabel="Header actions" items={condensedMenuItems} />
                    ) : (
                        menuItems.length > 0 && <KebabMenu items={menuItems} />
                    )}
                </div>
            </div>

            {(effectiveAdmin || isRecruiter) && (
                <div className="twd-collapse" style={{ margin: "0 0 12px" }}>
                    {jdOpen ? (
                        /* JD panel open → compact pill with the toolbar inline */
                        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                            <div style={{ flex: "0 0 300px", minWidth: 260 }}>
                                <PillNav
                                    compact
                                    tabs={MAIN_TABS}
                                    active={mainTab}
                                    onSelect={(k) => setMainTab(k as MainTab)}
                                />
                            </div>
                            {profilesToolbar}
                        </div>
                    ) : (
                        /* JD panel closed → full-width pill, toolbar on its own row */
                        <>
                            <PillNav
                                tabs={MAIN_TABS}
                                active={mainTab}
                                onSelect={(k) => setMainTab(k as MainTab)}
                            />
                            {profilesToolbar && (
                                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
                                    {profilesToolbar}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            </div>

            {/* hidden input backing the condensed menu's "Upload Resumes" */}
            <input
                ref={condensedFileRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt"
                style={{ display: "none" }}
                onChange={(e) => {
                    handleUploadResumes(e.target.files);
                    e.target.value = "";
                }}
            />

            <AssessmentLinkModal requirementId={id!} open={showAssessmentLink} onClose={() => setShowAssessmentLink(false)} />
            <AssignRecruitersDrawer
                open={showAssignDrawer}
                onClose={() => setShowAssignDrawer(false)}
                jdId={id || ""}
                requirementName={req?.requirement_name}
                initialAssigned={(req?.assigned_recruiters || []).map((u: any) => String(u))}
                onSaved={(newIds) => {
                    setReq((prev: any) => prev ? { ...prev, assigned_recruiters: newIds } : prev);
                    void refreshPendingRequest();
                }}
            />
            <RequestAssignmentDialog
                open={showRequestDialog}
                onClose={() => setShowRequestDialog(false)}
                jdId={id || ""}
                requirementName={req?.requirement_name}
                onSubmitted={() => {
                    setPendingRequestForThisReq(true);
                }}
            />
            <RolloverDialog
                open={showRollover}
                onClose={() => setShowRollover(false)}
                requirementId={id || ""}
                requirementName={req?.requirement_name}
                currentAssigned={(req?.assigned_recruiters || []).map((u: any) => String(u))}
                onRolledOver={(newIds) => {
                    setReq((prev: any) => prev ? { ...prev, assigned_recruiters: newIds, is_rollover: true } : prev);
                }}
            />

            {/* ── Submissions | Profiles pill (all roles) ── */}
            {(effectiveAdmin || isRecruiter) && (
                <div className="detail-section">
                    {mainTab === "submissions" && (() => {
                        const profileByCandidate = Object.fromEntries(
                            suggestions.map(p => [String(p.candidate_uuid), p])
                        );
                        const totalSubPages = Math.max(1, Math.ceil(applications.length / SUB_PAGE_SIZE));
                        const clampedSubPage = Math.min(subPage, totalSubPages);
                        const visibleApps = applications.slice((clampedSubPage - 1) * SUB_PAGE_SIZE, clampedSubPage * SUB_PAGE_SIZE);
                        return applications.length === 0 ? (
                            <div className="data-table-wrap">
                                <div className="table-empty">
                                    <div className="table-empty-icon"><Icon name="user" size={48} /></div>
                                    No submissions yet.
                                </div>
                            </div>
                        ) : (
                            <div className="data-table-wrap">
                                <table className="data-table" style={{ tableLayout: "fixed", width: "100%" }}>
                                    <colgroup>
                                        <col style={{ width: effectiveAdmin ? "30%" : "36%" }} />
                                        <col style={{ width: "15%" }} />
                                        <col style={{ width: effectiveAdmin ? "10%" : "11%" }} />
                                        <col style={{ width: "24%" }} />
                                        <col style={{ width: effectiveAdmin ? "21%" : "14%" }} />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th style={{ fontSize: 12 }}>Candidate</th>
                                            <th style={{ fontSize: 12 }}>Status</th>
                                            <th style={{ fontSize: 12 }}>AI Score</th>
                                            <th style={{ fontSize: 12 }}>Submitted</th>
                                            <th style={{ fontSize: 12 }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleApps.map((app) => {
                                            const prof = profileByCandidate[String(app.candidate_id)];
                                            const isManual = app.source !== "talent_pool";
                                            return (
                                                <tr
                                                    key={app.id}
                                                    onClick={() => setSelectedSub({ app, prof: prof ?? null })}
                                                    style={{ cursor: "pointer" }}
                                                >
                                                    <td style={{ overflow: "hidden", maxWidth: 0 }}>
                                                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, fontSize: 13 }}>{app.candidate_name || "-"}</div>
                                                        <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                                                            {isManual ? "Manual" : "Pool"}
                                                            {app.recruiter_name && <> · {app.recruiter_name}</>}
                                                        </div>
                                                    </td>
                                                    <td><StatusBadge status={app.offer_status || app.dynamic_status || app.status} /></td>
                                                    <td style={{ fontSize: 13 }}>{app.ai_score != null ? <span className="font-mono">{app.ai_score}/100</span> : <span className="text-muted">-</span>}</td>
                                                    <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtTs(app.sent_at)}</td>
                                                    <td onClick={(e) => e.stopPropagation()}>
                                                        {effectiveAdmin && (
                                                            app.dynamic_status === "Rejected" ? (
                                                                <button
                                                                    className="btn btn-ghost btn-sm"
                                                                    style={{ color: "#d97706" }}
                                                                    disabled={revertingId === app.id}
                                                                    onClick={() => handleRevert(app)}
                                                                >{revertingId === app.id ? "Reverting..." : "Revert"}</button>
                                                            ) : app.client_shortlisted ? (
                                                                <button
                                                                    className="btn btn-ghost btn-sm"
                                                                    onClick={() => setTimelineAppId(app.id)}
                                                                >Timeline</button>
                                                            ) : (
                                                                <button
                                                                    className="btn btn-ghost btn-sm"
                                                                    onClick={() => setSelectedApp(app)}
                                                                >Update</button>
                                                            )
                                                        )}
                                                        {app.status === "SENT" && String(app.recruiter_id) === String(user?.id) && (
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                style={{ color: "var(--error, #e53e3e)", padding: "2px 8px" }}
                                                                onClick={() => handleRemoveApplication(app)}
                                                            >Remove</button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {totalSubPages > 1 && (
                                    <div style={{ padding: "0.5rem 1rem", borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{applications.length} submissions</span>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                            <button className="btn btn-primary btn-sm" onClick={() => setSubPage(p => Math.max(1, p - 1))} disabled={clampedSubPage <= 1}>‹</button>
                                            <span style={{ fontSize: 13, color: "var(--text-secondary)", minWidth: 60, textAlign: "center" }}>{clampedSubPage} / {totalSubPages}</span>
                                            <button className="btn btn-primary btn-sm" onClick={() => setSubPage(p => Math.min(totalSubPages, p + 1))} disabled={clampedSubPage >= totalSubPages}>›</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* ── Profiles tab ── */}
                    {mainTab === "profiles" && (
                        <>
                            {uploadDuplicates.length > 0 && (
                                <div style={{ marginBottom: "0.75rem", padding: "10px 14px", background: "color-mix(in srgb, #f59e0b 8%, transparent)", border: "1px solid color-mix(in srgb, #f59e0b 30%, transparent)", borderRadius: "8px", fontSize: "13px" }}>
                                    <div style={{ fontWeight: 600, marginBottom: "5px" }}>{uploadDuplicates.length} duplicate{uploadDuplicates.length > 1 ? "s" : ""} skipped - already in this requirement's pool:</div>
                                    <ul style={{ margin: 0, paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                        {uploadDuplicates.map((d, i) => (
                                            <li key={i} style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{d.filename}</span>
                                                {d.message && <span style={{ color: "var(--text-secondary)" }}>- {d.message}</span>}
                                                {d.candidate_id && (
                                                    <button
                                                        onClick={() => navigate(`/talent-pool/${d.candidate_id}`)}
                                                        style={{ background: "none", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "1px 8px", fontSize: 11, cursor: "pointer", color: "var(--primary, #2563eb)", fontWeight: 600 }}
                                                    >View in pool →</button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <ProfilesGrid
                                profiles={filteredSuggestions}
                                jdId={id!}
                                jobRole={req.job_role ?? req.requirement_name}
                                onSubmit={handleSubmitProfile}
                                onRemove={handleRemoveProfile}
                                currentUserId={user?.id}
                                isAdmin={effectiveAdmin}
                                defaultSortKey={profileSortKey}
                            />
                        </>
                    )}

                    {mainTab === "assessments" && <AssessmentsPanel requirementId={id!} />}

                    {mainTab === "history" && <RequirementHistory requirementId={id!} />}
                </div>
            )}

            {/* Submission detail modal */}
            {selectedSub && (
                <SubmissionDetailModal
                    app={selectedSub.app}
                    prof={selectedSub.prof}
                    isAdmin={effectiveAdmin}
                    onClose={() => setSelectedSub(null)}
                />
            )}

            {/* Status change modal */}
            {selectedApp && (
                <ShortlistScheduleModal
                    app={selectedApp}
                    onClose={() => setSelectedApp(null)}
                    onSuccess={() => {
                        void refreshApplications();
                        setSelectedApp(null);
                    }}
                />
            )}

            {activeTimelineApp && (
                <TimelineDrawer
                    appId={activeTimelineApp.id}
                    candidateName={activeTimelineApp.candidate_name || "Profile"}
                    timeline={activeTimelineApp.dynamic_timeline || []}
                    onClose={() => {
                        setTimelineAppId(null);
                        // We also refresh applications here in case they closed it after some action
                        void refreshApplications();
                    }}
                    onSaved={() => {
                        void refreshApplications();
                    }}
                    onRevertShortlist={() => {
                        setTimelineAppId(null);
                        void refreshApplications();
                    }}
                />
            )}

            {/* Req Status Modal */}
            {showStatusModal && (
                <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
                    <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-title">
                            {req?.status === "DELETED" ? "Restore Requirement" : "Update Requirement Status"}
                        </div>

                        <div className="form-group" style={{ marginTop: "1rem" }}>
                            <label>
                                {req?.status === "DELETED" ? "Select New Status (Required)" : "Status"}
                            </label>
                            <select
                                value={newReqStatus}
                                onChange={(e) => setNewReqStatus(e.target.value)}
                                className="twd-select"
                                style={{ width: "100%" }}
                            >
                                <option value="OPEN">OPEN</option>
                                <option value="ON_HOLD">ON HOLD</option>
                                <option value="CLOSED">CLOSED</option>

                                <option value="ARCHIVED">ARCHIVE</option>
                            </select>
                        </div>

                        <div className="modal-actions">
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowStatusModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={async () => {
                                    try {
                                        const updated = await api.patch(`/requirements/${id}`, { status: newReqStatus });
                                        setReq(updated);
                                        setShowStatusModal(false);
                                        // If restored, maybe show a toast?
                                    } catch (err: any) {
                                        alert(err.message || "Failed to update");
                                    }
                                }}
                            >
                                {req?.status === "DELETED" ? "Confirm Restore" : "Confirm"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {showDeleteConfirm && (
                <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="modal-box" style={{ maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-title">Delete Requirement</div>
                        <p className="text-sm" style={{ margin: "0.75rem 0 1.25rem", color: "var(--text-secondary)" }}>
                            Are you sure you want to delete this requirement? It will be moved to the Deleted tab.
                        </p>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)}>
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                style={{ background: "var(--danger, #e53e3e)" }}
                                onClick={() => {
                                    setShowDeleteConfirm(false);
                                    api.patch(`/requirements/${id}`, { status: "DELETED" })
                                        .then(() => {
                                            // Drop the cached requirement lists so the dashboard
                                            // re-fetches and moves this req out of OPEN into Deleted.
                                            queryClient.invalidateQueries({ queryKey: ["requirements"] });
                                            queryClient.invalidateQueries({ queryKey: ["my-companies"] });
                                            navigate("/dashboard");
                                        })
                                        .catch((err: any) => alert(err.message || "Failed to delete"));
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}