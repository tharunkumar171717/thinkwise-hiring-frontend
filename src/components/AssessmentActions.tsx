import { useEffect, useState } from "react";
import { api } from "../services/api";
import Icon from "./Icon";
import "../styles/dashboard.css";

/**
 * Assessment link primitives, consumed by the requirement-header overflow menu.
 *
 *  - useAssessmentLink() loads/generates the shared unified link (one link for
 *    every channel - the form asks candidates how they found the role and
 *    collects a resume for every source except Recruiter).
 *  - AssessmentLinkModal shows that link with copy + regenerate.
 *
 * "Fill on Behalf" and "Edit Assessment" are plain navigations owned by the
 * menu itself, so they no longer live here.
 */

export function useAssessmentLink(requirementId: string) {
    const [link, setLink] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);

    // Load any link already generated for this requirement so it persists and
    // stays visible across reloads - once generated, a link sticks around.
    useEffect(() => {
        let alive = true;
        api.get(`/requirements/${requirementId}/assessment-links`)
            .then((rows: any[]) => {
                if (!alive) return;
                const active = (rows || []).filter((r) => r.status === "active");
                setLink(active.find((r) => r.mode === "unified")?.url);
            })
            .catch(() => { });
        return () => { alive = false; };
    }, [requirementId]);

    const ensureLink = async () => {
        if (link) return;
        setBusy(true);
        try {
            const l = await api.post(`/requirements/${requirementId}/assessment-link`, { mode: "unified" });
            setLink(l.url);
        } finally { setBusy(false); }
    };

    const regenerate = async () => {
        if (!window.confirm("Regenerate this link? The current link will stop working.")) return;
        setBusy(true);
        try {
            const l = await api.post(`/requirements/${requirementId}/assessment-link`, { mode: "unified", regenerate: true });
            setLink(l.url);
        } finally { setBusy(false); }
    };

    return { link, busy, ensureLink, regenerate };
}

export function AssessmentLinkModal({ requirementId, open, onClose }: { requirementId: string; open: boolean; onClose: () => void }) {
    const { link, busy, ensureLink, regenerate } = useAssessmentLink(requirementId);

    // Generate a link the first time the modal is opened, if none exists yet.
    useEffect(() => {
        if (open) void ensureLink();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, requirementId]);

    if (!open) return null;

    return (
        <div className="twd-vars twd-overlay" role="dialog" aria-modal="true" aria-label="Assessment link" onClick={onClose}>
            <div className="twd-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
                <div className="twd-modal-head">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 className="twd-modal-title" style={{ marginTop: 0 }}>Assessment link</h2>
                    </div>
                    <button type="button" className="twd-close" onClick={onClose} aria-label="Close">
                        <Icon name="x" size={15} />
                    </button>
                </div>
                <div className="twd-modal-body">
                    <CopyRow url={link} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
                        <div style={{ fontSize: 12, color: "var(--twd-soft)", lineHeight: 1.55 }}>
                            One link for every channel - the form asks candidates how they found the
                            role (LinkedIn Jobs, Job Posting, Recruiter, Public Post) and collects a
                            resume for every source except Recruiter.
                        </div>
                        {link && (
                            <button className="twd-btn twd-btn-ghost twd-btn-sm" style={{ flexShrink: 0 }} disabled={busy} onClick={regenerate}>
                                <Icon name="refresh" size={13} /> {busy ? "…" : "Regenerate"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function CopyRow({ url }: { url?: string }) {
    const [copied, setCopied] = useState(false);
    if (!url) return <div style={{ fontSize: 13, color: "var(--twd-faint)" }}>Generating…</div>;
    const dynamicUrl = url.includes("/assess/") ? `${window.location.origin}/assess/${url.split("/assess/")[1]}` : url;
    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input readOnly className="twd-input" value={dynamicUrl} onFocus={(e) => e.target.select()}
                style={{ flex: 1, fontSize: 12.5 }} />
            <button
                className={`twd-btn twd-btn-sm ${copied ? "twd-btn-ok" : "twd-btn-primary"}`}
                onClick={() => { navigator.clipboard.writeText(dynamicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            >
                {copied ? <><Icon name="check" size={13} /> Copied</> : "Copy"}
            </button>
        </div>
    );
}
