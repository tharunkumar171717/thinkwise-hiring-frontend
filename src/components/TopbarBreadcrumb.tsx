import { Link, useLocation, useSearchParams } from "../lib/router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import Icon from "./Icon";

function toSlug(s: string) {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/* Known top-level sections (matches sidebar labels) */
const SECTION_LABELS: Record<string, string> = {
    dashboard: "Dashboard",
    "my-requirements": "My Requirements",
    "my-submissions": "My Submissions",
    "email-resumes": "Resumes from Email",
    "linkedin-search": "LinkedIn Search",
    "talent-pool": "Talent Pool",
    "assignment-requests": "Assignment Requests",
    analytics: "Analytics",
    "eod-reports": "EOD Reports",
    team: "Team",
    clients: "Clients",
    requirements: "Requirements",
    tracker: "Tracker",
    "test-tools": "Test Tools",
};

function prettify(slug: string) {
    return slug
        .split("-")
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

/** Label for an /assessment/:action tail. */
function asmtLabel(action?: string) {
    return action === "edit" ? "Assessment Editor" : action === "fill" ? "Fill Assessment" : "Assessment";
}

interface Crumb {
    label: string;
    to?: string; // clickable when set (i.e. not the current page)
    state?: unknown; // navigation state to carry along (keeps origin context alive)
}

/**
 * URL-driven breadcrumb for the topbar.
 * /dashboard                     → Dashboard
 * /dashboard/:client             → Dashboard → Client
 * /dashboard/:client/:req        → Dashboard → Client → Requirement
 * any other page                 → its section label
 */
export default function TopbarBreadcrumb() {
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const segs = location.pathname.split("/").filter(Boolean);
    const isDashboard = segs[0] === "dashboard";
    const isReqDetail = segs[0] === "requirements" && !!segs[1] && segs[1] !== "new";
    const isMyReqDeep = segs[0] === "my-requirements" && segs.length > 1;
    const isAnalyticsReq = segs[0] === "analytics" && segs[1] === "requirements" && !!segs[2];
    const newReqClient = segs[0] === "requirements" && segs[1] === "new" ? searchParams.get("client") : null;

    // Reuses the app-wide ["requirements"] cache to resolve slugs/ids to their
    // canonical names (e.g. "ctrls" → "CtrlS"); only fetches on deep paths.
    const { data: requirements = [] } = useQuery<any[]>({
        queryKey: ["requirements"],
        queryFn: () => api.get("/requirements").then((r: any) => r || []),
        staleTime: 30 * 1000,
        enabled: (isDashboard && segs.length > 1) || isReqDetail || isMyReqDeep || isAnalyticsReq || !!newReqClient,
    });

    if (segs.length === 0) return null;

    const crumbs: Crumb[] = [];

    if (isDashboard) {
        const fromMyReqs = (location as any).state?.from === "/my-requirements";
        if (fromMyReqs && segs[2]) {
            // Reached via My Requirements → root the trail there.
            const reqMatch = requirements.find(
                (r: any) => toSlug(r.company_name || "") === segs[1] && toSlug(r.requirement_name || "") === segs[2]
            );
            crumbs.push({ label: "My Requirements", to: "/my-requirements" });
            crumbs.push({
                label: reqMatch?.requirement_name || prettify(segs[2]),
                to: segs[3] ? `/dashboard/${segs[1]}/${segs[2]}` : undefined,
                state: { from: "/my-requirements" },
            });
            if (segs[3] === "assessment") crumbs.push({ label: asmtLabel(segs[4]) });
            else if (segs[3]) crumbs.push({ label: prettify(segs[3]) });
        } else {
            crumbs.push({ label: "Dashboard", to: segs.length > 1 ? "/dashboard" : undefined });

            const clientSlug = segs[1];
            if (clientSlug) {
                const clientMatch = requirements.find((r: any) => toSlug(r.company_name || "") === clientSlug);
                crumbs.push({
                    label: clientMatch?.company_name || prettify(clientSlug),
                    to: segs[2] ? `/dashboard/${clientSlug}` : undefined,
                });
            }

            const reqSlug = segs[2];
            if (reqSlug) {
                const reqMatch = requirements.find(
                    (r: any) => toSlug(r.company_name || "") === clientSlug && toSlug(r.requirement_name || "") === reqSlug
                );
                crumbs.push({
                    label: reqMatch?.requirement_name || prettify(reqSlug),
                    to: segs[3] ? `/dashboard/${clientSlug}/${reqSlug}` : undefined,
                });
            }

            if (segs[3] === "assessment") crumbs.push({ label: asmtLabel(segs[4]) });
            else if (segs[3]) crumbs.push({ label: prettify(segs[3]) });
        }
    } else if (segs[0] === "requirements") {
        if (segs[1] === "new") {
            if (newReqClient) {
                // Creating under a specific client → mirror the client's path.
                const slug = toSlug(newReqClient);
                const clientMatch = requirements.find((r: any) => toSlug(r.company_name || "") === slug);
                crumbs.push({ label: "Dashboard", to: "/dashboard" });
                crumbs.push({ label: clientMatch?.company_name || newReqClient, to: `/dashboard/${slug}` });
                crumbs.push({ label: "New Requirement" });
            } else {
                crumbs.push({ label: "Dashboard", to: "/dashboard" });
                crumbs.push({ label: "New Requirement" });
            }
        } else if (segs[1]) {
            // /requirements/:id[/profiles/:cid | /edit | /submit | /assessment/…]
            const reqId = segs[1];
            const reqMatch = requirements.find((r: any) => String(r.id) === reqId);
            const hasTail = !!segs[2];
            // When navigation carried a dashboard origin (e.g. Full View opened
            // from /dashboard/:client/:req), mirror that path instead of
            // rooting the trail in My Requirements.
            const from = (location as any).state?.from as string | undefined;
            const fromDashSegs = from && /^\/dashboard\/[^/]+/.test(from) ? from.split("/").filter(Boolean) : null;
            if (fromDashSegs) {
                const clientSlug = fromDashSegs[1];
                const clientMatch = requirements.find((r: any) => toSlug(r.company_name || "") === clientSlug);
                crumbs.push({ label: "Dashboard", to: "/dashboard" });
                crumbs.push({ label: clientMatch?.company_name || prettify(clientSlug), to: `/dashboard/${clientSlug}` });
                crumbs.push({
                    label: reqMatch?.requirement_name || "Requirement",
                    to: hasTail ? from : undefined,
                });
            } else {
                crumbs.push({ label: "My Requirements", to: "/my-requirements" });
                crumbs.push({
                    label: reqMatch?.requirement_name || "Requirement",
                    to: hasTail ? `/requirements/${reqId}` : undefined,
                });
            }
            if (hasTail) {
                const tail = segs[2] === "profiles" ? "Candidate"
                    : segs[2] === "edit" ? "Edit"
                        : segs[2] === "submit" ? "Submit Candidate"
                            : segs[2] === "assessment" ? (segs[3] === "edit" ? "Assessment Editor" : segs[3] === "fill" ? "Fill Assessment" : "Assessment")
                                : prettify(segs[2]);
                crumbs.push({ label: tail });
            }
        } else {
            crumbs.push({ label: "Requirements" });
        }
    } else if (segs[0] === "talent-pool" && segs[1]) {
        // /talent-pool/:candidateSlug (or legacy uuid)
        const isUuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segs[1]);
        crumbs.push({ label: "Talent Pool", to: "/talent-pool" });
        crumbs.push({ label: isUuid ? "Candidate" : prettify(segs[1]) });
    } else if (segs[0] === "analytics" && segs[1] === "requirements" && segs[2]) {
        // /analytics/requirements/:reqSlug - requirement opened from the tracker
        const reqMatch = requirements.find((r: any) => toSlug(r.requirement_name || "") === segs[2]);
        crumbs.push({ label: "Analytics", to: "/analytics/overview" });
        crumbs.push({ label: "Requirements", to: "/analytics/tracker" });
        crumbs.push({
            label: reqMatch?.requirement_name || prettify(segs[2]),
            to: segs[3] === "assessment" ? `/analytics/requirements/${segs[2]}` : undefined,
        });
        if (segs[3] === "assessment") crumbs.push({ label: asmtLabel(segs[4]) });
    } else if (segs[0] === "analytics" && segs[1]) {
        // /analytics/:tab - mirror the in-page tab in the trail
        crumbs.push({ label: "Analytics", to: "/analytics/overview" });
        crumbs.push({ label: segs[1] === "tracker" ? "Requirements" : prettify(segs[1]) });
    } else if (isMyReqDeep) {
        // /my-requirements/:reqSlug[/:candidateSlug] - origin lives in the path
        const reqMatch = requirements.find((r: any) => toSlug(r.requirement_name || "") === segs[1]);
        crumbs.push({ label: "My Requirements", to: "/my-requirements" });
        crumbs.push({
            label: reqMatch?.requirement_name || prettify(segs[1]),
            to: segs[2] ? `/my-requirements/${segs[1]}` : undefined,
        });
        if (segs[2] === "assessment") crumbs.push({ label: asmtLabel(segs[3]) });
        else if (segs[2]) crumbs.push({ label: prettify(segs[2]) });
    } else {
        crumbs.push({ label: SECTION_LABELS[segs[0]] || prettify(segs[0]) });
    }

    return (
        <nav className="topbar-crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
                <span key={`${c.label}-${i}`} style={{ display: "contents" }}>
                    {i > 0 && (
                        <span className="topbar-crumb-sep" aria-hidden="true">
                            <Icon name="chevron-right" size={13} />
                        </span>
                    )}
                    {c.to ? (
                        <Link to={c.to} state={c.state} className="topbar-crumb">{c.label}</Link>
                    ) : (
                        <span className="topbar-crumb topbar-crumb--current" aria-current="page">{c.label}</span>
                    )}
                </span>
            ))}
        </nav>
    );
}
