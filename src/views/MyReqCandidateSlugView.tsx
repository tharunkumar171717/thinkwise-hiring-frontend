import { useParams } from "../lib/router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import ProfileFullView from "./ProfileFullView";
import "../styles/dashboard.css";

const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Pretty candidate URL rooted in My Requirements:
 * /my-requirements/:reqSlug/:candidateSlug → resolves both slugs and renders
 * the regular candidate full view.
 */
export default function MyReqCandidateSlugView() {
    const { reqSlug, candidateSlug } = useParams<{ reqSlug: string; candidateSlug: string }>();

    const { data: requirements = [], isLoading: loadingReqs } = useQuery<any[]>({
        queryKey: ["requirements"],
        queryFn: () => api.get("/requirements").then((r: any) => r || []),
        staleTime: 30 * 1000,
    });

    const req = requirements.find((r: any) => toSlug(r.requirement_name || "") === reqSlug && r.status !== "DELETED") || requirements.find((r: any) => toSlug(r.requirement_name || "") === reqSlug);

    const { data: profiles = [], isLoading: loadingProfiles } = useQuery<any[]>({
        queryKey: ["req-profiles", req?.id],
        // endpoint returns { profiles: [...] }
        queryFn: () => api.get(`/requirements/${req!.id}/profiles`).then((r: any) => r?.profiles ?? (Array.isArray(r) ? r : [])),
        enabled: !!req?.id,
        staleTime: 30 * 1000,
    });

    if (loadingReqs || (req && loadingProfiles)) {
        return (
            <div className="twd-scope">
                <div className="twd-loading">Loading…</div>
            </div>
        );
    }

    if (!req) {
        return (
            <div className="twd-scope">
                <div className="twd-empty">Requirement not found.</div>
            </div>
        );
    }

    const profile = profiles.find((p: any) => {
        const name = p.candidate?.Name || p.deterministic_scoring_analysis?.candidate_name || "";
        return toSlug(name) === candidateSlug;
    });

    if (!profile) {
        return (
            <div className="twd-scope">
                <div className="twd-empty">Candidate not found in this requirement.</div>
            </div>
        );
    }

    return <ProfileFullView reqId={String(req.id)} candidateId={String(profile.candidate_uuid)} />;
}
