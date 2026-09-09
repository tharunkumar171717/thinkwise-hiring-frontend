import { useParams } from "../lib/router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import RequirementDetail from "./RequirementDetail";
import "../styles/dashboard.css";

const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Pretty requirement URL rooted in My Requirements:
 * /my-requirements/:reqSlug → resolves the slug to the requirement id and
 * renders the regular requirement detail view.
 */
export default function MyReqSlugView() {
    const { reqSlug } = useParams<{ reqSlug: string }>();

    const { data: requirements = [], isLoading } = useQuery<any[]>({
        queryKey: ["requirements"],
        queryFn: () => api.get("/requirements").then((r: any) => r || []),
        staleTime: 30 * 1000,
    });

    if (isLoading) {
        return (
            <div className="twd-scope">
                <div className="twd-loading">Loading…</div>
            </div>
        );
    }

    const req = requirements.find((r: any) => toSlug(r.requirement_name || "") === reqSlug && r.status !== "DELETED") || requirements.find((r: any) => toSlug(r.requirement_name || "") === reqSlug);
    if (!req) {
        return (
            <div className="twd-scope">
                <div className="twd-empty">Requirement not found.</div>
            </div>
        );
    }

    return <RequirementDetail key={String(req.id)} reqId={String(req.id)} />;
}
