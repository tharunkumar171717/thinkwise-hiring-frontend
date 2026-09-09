/**
 * Right-side drawer that previews a candidate's resume.
 *
 * Reuses the existing `GET /candidates/{id}/resume` endpoint. <embed>/<iframe> don't
 * send Authorization headers, so we fetch the binary in JS, wrap it in a Blob URL,
 * and feed that to the embed. The blob URL is revoked when the drawer closes / the
 * candidate changes.
 */
import { useEffect, useState } from "react";
import { API_BASE, getToken } from "../services/api";
import { useSideDrawer } from "../context/SideDrawerContext";

interface ResumeDrawerProps {
    candidateId: string;
    candidateName?: string;
}

export default function ResumeDrawer({ candidateId, candidateName }: ResumeDrawerProps) {
    const drawer = useSideDrawer();
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [mime, setMime] = useState<string>("application/pdf");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        let cancelled = false;
        let createdUrl: string | null = null;

        async function load() {
            setLoading(true);
            setError(null);
            setBlobUrl(null);
            try {
                const token = await getToken();
                const res = await fetch(`${API_BASE}/candidates/${candidateId}/resume`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (!res.ok) {
                    if (res.status === 401) throw new Error("Session expired");
                    if (res.status === 404) throw new Error("Resume file not found on this candidate");
                    throw new Error(`Failed to load resume (HTTP ${res.status})`);
                }
                const blob = await res.blob();
                if (cancelled) return;
                const contentType = res.headers.get("Content-Type") || "application/pdf";
                setMime(contentType);
                createdUrl = URL.createObjectURL(blob);
                setBlobUrl(createdUrl);
            } catch (e: any) {
                if (!cancelled) setError(e?.message || "Failed to load resume");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();
        return () => {
            cancelled = true;
            if (createdUrl) URL.revokeObjectURL(createdUrl);
        };
    }, [candidateId]);

    const isPdf = mime.includes("pdf");

    return (
        <>
        <div
            onClick={drawer.close}
            style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.18)" }}
        />
        <aside
            style={{
                position: "fixed", top: 0, right: 0, bottom: 0,
                width: "min(45vw, 720px)",
                background: "var(--bg-primary)",
                borderLeft: "1px solid var(--border-subtle)",
                boxShadow: "-4px 0 16px rgba(0,0,0,0.08)",
                zIndex: 1000,
                display: "flex", flexDirection: "column",
            }}
        >
            <header style={{ padding: "0.85rem 1.1rem", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {candidateName || "Resume"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{mime}</div>
                </div>
                {blobUrl && (
                    <a
                        className="btn btn-ghost btn-sm"
                        href={blobUrl}
                        download={candidateName ? `${candidateName}.${isPdf ? "pdf" : "bin"}` : "resume"}
                        title="Download the resume"
                    >Download</a>
                )}
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={drawer.close}
                    title="Close"
                    style={{ padding: "4px 8px" }}
                >✕</button>
            </header>

            <div style={{ flex: 1, overflow: "hidden", background: "var(--bg-secondary)" }}>
                {loading && (
                    <div style={{ padding: "1rem", fontSize: 13, color: "var(--text-secondary)" }}>Loading resume…</div>
                )}
                {error && (
                    <div style={{ padding: "1rem", fontSize: 13, color: "#dc2626" }}>{error}</div>
                )}
                {!loading && !error && blobUrl && (
                    isPdf ? (
                        <iframe
                            src={blobUrl}
                            title="Resume preview"
                            style={{ width: "100%", height: "100%", border: "none" }}
                        />
                    ) : (
                        <div style={{ padding: "1rem", fontSize: 13, color: "var(--text-secondary)" }}>
                            Inline preview is only supported for PDFs. <a href={blobUrl} download style={{ color: "var(--accent)" }}>Download to view</a>.
                        </div>
                    )
                )}
            </div>
        </aside>
        </>
    );
}
