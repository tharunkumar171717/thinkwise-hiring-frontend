import { useParams, Navigate, useLocation } from "../lib/router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import RequirementDetail from "./RequirementDetail";

function toSlug(s: string) {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function ClientRequirementDetail() {
    const { clientSlug, reqSlug } = useParams<{ clientSlug: string; reqSlug: string }>();
    const location = useLocation();
    const reqIdFromState = (location.state as any)?.reqId as string | undefined;

    // If the caller passed the req ID via navigation state, use it directly.
    // This is the fast path for in-app navigation (e.g. Analytics TrackerTab click).
    if (reqIdFromState) {
        return <RequirementDetail reqId={reqIdFromState} />;
    }

    // Fallback: resolve slugs from the requirements list (e.g. direct URL access).
    return <SlugResolver clientSlug={clientSlug} reqSlug={reqSlug} />;
}

function SlugResolver({ clientSlug, reqSlug }: { clientSlug?: string; reqSlug?: string }) {
    const { data: requirements = [], isLoading } = useQuery<any[]>({
        queryKey: ["requirements"],
        queryFn: () => api.get("/requirements").then((r: any) => r || []),
        staleTime: 30 * 1000,
    });

    if (isLoading) return <div className="page-loading">Loading…</div>;

    const req = requirements.find(
        (r: any) =>
            toSlug(r.company_name || "") === clientSlug &&
            toSlug(r.requirement_name || "") === reqSlug &&
            r.status !== "DELETED"
    ) || requirements.find(
        (r: any) =>
            toSlug(r.company_name || "") === clientSlug &&
            toSlug(r.requirement_name || "") === reqSlug,
    );

    if (!req) return <Navigate to={`/dashboard/${clientSlug || ""}`} replace />;

    return <RequirementDetail reqId={req.id} />;
}
