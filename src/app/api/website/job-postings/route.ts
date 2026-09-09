import type { NextRequest } from "next/server";

/**
 * Publishes an edited job posting to the public careers website.
 *
 * This sits *beside* the /api/[...path] catch-all proxy (a static segment wins
 * over a catch-all in the App Router), so it is deliberately NOT forwarded to
 * the FastAPI backend: the website is a separate system with its own API key,
 * and that key must never reach the browser. The client posts the draft here,
 * this handler adds the credential server-side and forwards it on.
 *
 * Env:
 *   WEBSITE_JOBS_API_URL  Website endpoint that creates a job posting.
 *                         Unset -> the publish is simulated (see below).
 *   WEBSITE_JOBS_API_KEY  Bearer token sent to that endpoint.
 *   WEBSITE_JOBS_BASE_URL Public site root, used to build the posting URL when
 *                         the website's response doesn't carry one.
 */
const WEBSITE_API_URL = process.env.WEBSITE_JOBS_API_URL || "";
const WEBSITE_API_KEY = process.env.WEBSITE_JOBS_API_KEY || "";
const WEBSITE_BASE_URL = process.env.WEBSITE_JOBS_BASE_URL || "https://thinkwise.example.com";

export interface JobPostingPayload {
    requirement_id: string;
    req_id?: string | null;
    title: string;
    company?: string | null;
    location?: string | null;
    employment_type?: string | null;
    work_mode?: string | null;
    experience?: string | null;
    openings?: number | null;
    salary_range?: string | null;   // omitted by the editor when "show salary" is off
    skills?: string[];
    description: string;
    apply_email?: string | null;
}

const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function bad(detail: string, status = 400) {
    return Response.json({ detail }, { status });
}

export async function POST(req: NextRequest) {
    let body: JobPostingPayload;
    try {
        body = await req.json();
    } catch {
        return bad("Request body must be JSON");
    }

    if (!body?.requirement_id) return bad("requirement_id is required");
    if (!body?.title?.trim()) return bad("Job title is required");
    if (!body?.description?.trim()) return bad("Job description is required");

    const posting = {
        ...body,
        title: body.title.trim(),
        description: body.description.trim(),
        skills: (body.skills || []).map(s => s.trim()).filter(Boolean),
    };

    // No website configured: report a simulated publish rather than a fake
    // success. The UI renders `simulated` as a warning, never as "it's live".
    if (!WEBSITE_API_URL) {
        const id = `sim_${posting.requirement_id}`;
        return Response.json({
            id,
            url: `${WEBSITE_BASE_URL}/careers/${slugify(posting.title)}-${posting.requirement_id.slice(0, 8)}`,
            published_at: new Date().toISOString(),
            simulated: true,
            detail: "WEBSITE_JOBS_API_URL is not configured - the posting was not sent anywhere.",
        });
    }

    let res: Response;
    try {
        res = await fetch(WEBSITE_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // The caller's app token is intentionally dropped here - the
                // website is a third party and gets only its own credential.
                ...(WEBSITE_API_KEY ? { Authorization: `Bearer ${WEBSITE_API_KEY}` } : {}),
            },
            body: JSON.stringify(posting),
        });
    } catch (err: unknown) {
        return bad(`Could not reach the website: ${err instanceof Error ? err.message : String(err)}`, 502);
    }

    const raw = await res.text().catch(() => "");
    let data: Record<string, unknown> = {};
    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        data = { detail: raw.slice(0, 300) };
    }

    if (!res.ok) {
        const detail = typeof data.detail === "string" && data.detail
            ? data.detail
            : `Website rejected the posting (HTTP ${res.status})`;
        return Response.json({ detail }, { status: res.status });
    }

    const id = String(data.id ?? data.posting_id ?? "");
    const url = typeof data.url === "string" && data.url
        ? data.url
        : `${WEBSITE_BASE_URL}/careers/${slugify(posting.title)}${id ? `-${id}` : ""}`;

    return Response.json({
        id,
        url,
        published_at: typeof data.published_at === "string" ? data.published_at : new Date().toISOString(),
        simulated: false,
    });
}
