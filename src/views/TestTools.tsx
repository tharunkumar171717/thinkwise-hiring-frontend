import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";

interface User { id: string; name?: string; email: string; role: string; }
interface CandidateRow {
    candidate_id: string;
    candidate_name: string;
    candidate_email: string;
    owner_id: string | null;
    owner_name: string | null;
}
interface UploadItem { filename: string; status: string; message?: string; candidate_id?: string; }

export default function TestTools() {
    const [users, setUsers] = useState<User[]>([]);

    // ── Bulk upload state ────────────────────────────────────────────────
    const [uploadOwner, setUploadOwner] = useState("");
    const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<{ owner: string; created: number; duplicates: number; failed: number; items: UploadItem[] } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Candidate owner state ────────────────────────────────────────────
    const [candidates, setCandidates] = useState<CandidateRow[]>([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    const [candNewOwner, setCandNewOwner] = useState<Record<string, string>>({});
    const [candSaving, setCandSaving] = useState<Record<string, boolean>>({});
    const [candResults, setCandResults] = useState<Record<string, string>>({});

    useEffect(() => {
        api.get("/test-tools/users").then(setUsers).catch(() => { });
        loadCandidates();
    }, []);

    const loadCandidates = () => {
        setLoadingCandidates(true);
        api.get("/test-tools/candidates")
            .then(rows => setCandidates(rows || []))
            .catch(() => { })
            .finally(() => setLoadingCandidates(false));
    };

    const userName = (u: User) => u.name || u.email;

    const handleUpload = async () => {
        if (!uploadOwner) { alert("Select a recruiter first."); return; }
        if (!selectedFiles || selectedFiles.length === 0) { alert("Select at least one resume file."); return; }
        setUploading(true);
        setUploadResult(null);
        try {
            const form = new FormData();
            form.append("owner_id", uploadOwner);
            for (let i = 0; i < selectedFiles.length; i++) {
                form.append("resume_files", selectedFiles[i]);
            }
            const res = await api.post("/test-tools/bulk-upload", form);
            setUploadResult(res);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setSelectedFiles(null);
            loadCandidates();
        } catch (e: any) {
            alert(e?.detail || e?.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleSetCandidateOwner = async (candidateId: string) => {
        const newOwnerId = candNewOwner[candidateId];
        if (!newOwnerId) { alert("Pick a new owner first."); return; }
        setCandSaving(s => ({ ...s, [candidateId]: true }));
        try {
            const res = await api.post("/test-tools/candidates/set-owner", {
                candidate_id: candidateId,
                new_owner_id: newOwnerId,
            });
            setCandResults(r => ({ ...r, [candidateId]: `Done - ${res.new_owner}` }));
            setCandidates(prev => prev.map(c =>
                c.candidate_id === candidateId
                    ? { ...c, owner_id: newOwnerId, owner_name: res.new_owner }
                    : c
            ));
        } catch (e: any) {
            setCandResults(r => ({ ...r, [candidateId]: `Error: ${e?.detail || e?.message}` }));
        } finally {
            setCandSaving(s => ({ ...s, [candidateId]: false }));
        }
    };

    const statusColor = (s: string) => s === "created" ? "#16a34a" : s === "duplicate" ? "#d97706" : "#dc2626";

    return (
        <div style={{ padding: "2rem", maxWidth: 1100 }}>
            <div style={{ marginBottom: "1.5rem" }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dev Tools</h1>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0.35rem 0 0" }}>
                    Bulk upload resumes and assign ownership. Admin-only.
                </p>
            </div>

            {/* ── Section 1: Bulk Upload ── */}
            <div className="card" style={{ marginBottom: "1.5rem" }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: "1rem" }}>Bulk Upload Resumes</div>

                {/* Step 1: pick recruiter */}
                <div style={{ marginBottom: "1rem" }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                        1. Select Recruiter (will be set as owner / sourced-by)
                    </label>
                    <select
                        value={uploadOwner}
                        onChange={e => setUploadOwner(e.target.value)}
                        style={{ padding: "0.55rem 0.85rem", fontSize: 13, width: "100%", maxWidth: 420, border: "1px solid var(--border-subtle)", borderRadius: 6, background: "var(--bg-input)", color: "var(--text-primary)" }}
                    >
                        <option value="">- choose recruiter -</option>
                        {users.map(u => <option key={u.id} value={u.id}>{userName(u)} ({u.role})</option>)}
                    </select>
                </div>

                {/* Step 2: pick files */}
                <div style={{ marginBottom: "1rem" }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                        2. Select Resume Files (PDF / Word / TXT)
                    </label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={e => setSelectedFiles(e.target.files)}
                        style={{ display: "none" }}
                    />
                    <div
                        onClick={() => !uploading && fileInputRef.current?.click()}
                        style={{
                            border: "2px dashed var(--border-subtle)", borderRadius: 10, padding: "1.25rem",
                            textAlign: "center", cursor: uploading ? "default" : "pointer",
                            background: "var(--bg-secondary)",
                        }}
                    >
                        {selectedFiles && selectedFiles.length > 0
                            ? <div><strong>{selectedFiles.length} file{selectedFiles.length > 1 ? "s" : ""} selected</strong><div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Click to change</div></div>
                            : <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Click to select resume files</div>
                        }
                    </div>
                </div>

                {/* Step 3: upload */}
                <button
                    className="btn btn-primary"
                    onClick={handleUpload}
                    disabled={uploading || !uploadOwner || !selectedFiles?.length}
                >
                    {uploading ? "Uploading…" : `Upload ${selectedFiles?.length ? `${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""}` : "Resumes"}`}
                </button>

                {/* Results */}
                {uploadResult && (
                    <div style={{ marginTop: "1.25rem" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: "0.5rem" }}>
                            Uploaded for <span style={{ color: "var(--primary)" }}>{uploadResult.owner}</span>
                            {" - "}
                            <span style={{ color: "#16a34a" }}>{uploadResult.created} created</span>
                            {uploadResult.duplicates > 0 && <>, <span style={{ color: "#d97706" }}>{uploadResult.duplicates} duplicate{uploadResult.duplicates > 1 ? "s" : ""}</span></>}
                            {uploadResult.failed > 0 && <>, <span style={{ color: "#dc2626" }}>{uploadResult.failed} failed</span></>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
                            {uploadResult.items.map((item, i) => (
                                <div key={i} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
                                    <span style={{ fontWeight: 600, color: statusColor(item.status), minWidth: 70 }}>{item.status}</span>
                                    <span style={{ color: "var(--text-primary)" }}>{item.filename}</span>
                                    {item.message && <span style={{ color: "var(--text-secondary)" }}>- {item.message}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Section 2: Set Owner on Existing Candidates ── */}
            <div className="card">
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: "0.75rem" }}>
                    Set / Fix Owner on Existing Candidates
                    {loadingCandidates && <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-secondary)", marginLeft: 8 }}>Loading…</span>}
                    {!loadingCandidates && <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-secondary)", marginLeft: 8 }}>{candidates.length} candidates</span>}
                </div>
                {candidates.length > 0 && (
                    <div className="data-table-wrap" style={{ marginTop: 0 }}>
                        <table className="data-table" style={{ tableLayout: "fixed", width: "100%" }}>
                            <colgroup>
                                <col style={{ width: "24%" }} /><col style={{ width: "18%" }} />
                                <col style={{ width: "24%" }} /><col style={{ width: "16%" }} /><col style={{ width: "18%" }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>Candidate</th><th>Current Owner</th>
                                    <th>New Owner</th><th>Action</th><th>Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {candidates.map(c => (
                                    <tr key={c.candidate_id}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{c.candidate_name}</div>
                                            {c.candidate_email && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{c.candidate_email}</div>}
                                        </td>
                                        <td className="text-sm">
                                            {c.owner_name
                                                ? <span style={{ color: "var(--text-primary)" }}>{c.owner_name}</span>
                                                : <span style={{ color: "var(--text-muted)" }}>-</span>}
                                        </td>
                                        <td>
                                            <select
                                                value={candNewOwner[c.candidate_id] || ""}
                                                onChange={e => setCandNewOwner(s => ({ ...s, [c.candidate_id]: e.target.value }))}
                                                style={{ padding: "0.3rem 0.5rem", fontSize: 12, border: "1px solid var(--border-subtle)", borderRadius: 4, background: "var(--bg-input)", color: "var(--text-primary)", width: "100%" }}
                                            >
                                                <option value="">- pick -</option>
                                                {users.map(u => <option key={u.id} value={u.id}>{userName(u)}</option>)}
                                            </select>
                                        </td>
                                        <td>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => handleSetCandidateOwner(c.candidate_id)}
                                                disabled={candSaving[c.candidate_id] || !candNewOwner[c.candidate_id]}
                                            >
                                                {candSaving[c.candidate_id] ? "…" : "Set"}
                                            </button>
                                        </td>
                                        <td style={{ fontSize: 11, color: (candResults[c.candidate_id] || "").startsWith("Error") ? "#dc2626" : "#16a34a" }}>
                                            {candResults[c.candidate_id] || ""}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
