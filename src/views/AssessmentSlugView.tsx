import { useParams, useLocation } from "../lib/router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import AssessmentEditor from "./AssessmentEditor";
import FillAssessment from "./FillAssessment";
import "../styles/dashboard.css";

const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Pretty assessment routes that keep their origin context in the URL:
 *   /dashboard/:clientSlug/:reqSlug/assessment/:action
 *   /my-requirements/:reqSlug/assessment/:action
 *   /analytics/requirements/:reqSlug/assessment/:action
 * Resolves the slug(s) to the requirement id and renders the editor / fill view,
 * so the route path and breadcrumb depth don't switch to the raw /requirements
 * path. `action` is "edit" (editor) or "fill" (fill on behalf).
 */
export default function AssessmentSlugView() {
    const { clientSlug, reqSlug, action } = useParams<{ clientSlug?: string; reqSlug: string; action: string }>();
    const location = useLocation();
    // The requirement's base path = current path minus the /assessment/:action tail.
    const backTo = location.pathname.replace(/\/assessment\/[^/]+\/?$/, "");

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

    const req = requirements.find((r: any) =>
        toSlug(r.requirement_name || "") === reqSlug &&
        (!clientSlug || toSlug(r.company_name || "") === clientSlug) &&
        r.status !== "DELETED"
    ) || requirements.find((r: any) =>
        toSlug(r.requirement_name || "") === reqSlug &&
        (!clientSlug || toSlug(r.company_name || "") === clientSlug)
    );
    if (!req) {
        return (
            <div className="twd-scope">
                <div className="twd-empty">Requirement not found.</div>
            </div>
        );
    }

    return action === "fill"
        ? <FillAssessment key={String(req.id)} reqId={String(req.id)} backTo={backTo} />
        : <AssessmentEditor key={String(req.id)} reqId={String(req.id)} backTo={backTo} />;
}
