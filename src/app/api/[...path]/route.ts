import type { NextRequest } from "next/server";

/**
 * Proxies /api/* to the FastAPI backend, replicating the old Vite dev proxy:
 *  - strips the /api prefix (preserving the rest of the path verbatim,
 *    including trailing slashes)
 *  - rewrites backend redirect Location headers back under /api so the
 *    browser never talks to the backend origin directly
 */
const TARGET = process.env.API_PROXY_TARGET || "http://localhost:4002";

async function proxy(req: NextRequest) {
    const url = new URL(req.url);
    const backendPath = url.pathname.replace(/^\/api/, "") || "/";
    const targetUrl = `${TARGET}${backendPath}${url.search}`;

    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("connection");

    const hasBody = req.method !== "GET" && req.method !== "HEAD";

    const res = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: hasBody ? req.body : undefined,
        redirect: "manual",
        // Required by undici when streaming a request body
        // @ts-expect-error duplex is not in the fetch types yet
        duplex: hasBody ? "half" : undefined,
    });

    const resHeaders = new Headers(res.headers);
    const loc = resHeaders.get("location");
    if (loc) {
        try {
            const u = new URL(loc);
            resHeaders.set("location", "/api" + u.pathname + u.search + u.hash);
        } catch {
            if (loc.startsWith("/") && !loc.startsWith("/api")) {
                resHeaders.set("location", "/api" + loc);
            }
        }
    }
    // fetch already decoded the body; drop stale encoding/length headers
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");
    resHeaders.delete("transfer-encoding");

    return new Response(res.status === 204 || res.status === 304 ? null : res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
    });
}

export {
    proxy as GET,
    proxy as POST,
    proxy as PUT,
    proxy as PATCH,
    proxy as DELETE,
    proxy as OPTIONS,
    proxy as HEAD,
};
