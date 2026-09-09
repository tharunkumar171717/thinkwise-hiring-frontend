# Thinkwise Hiring Desk - Frontend (Next.js)

The frontend is a Next.js (App Router) application. It was migrated from Vite + react-router with zero functional changes; the FastAPI backend is unchanged and is consumed the same way as before.

## Getting started

```bash
npm install
npm run dev        # dev server on http://localhost:5173
```

The dev port stays at **5173** so the backend's existing CORS/APP_URL config keeps working.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start dev server on port 5173 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build on port 5173 |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright e2e tests (starts the dev server automatically) |

## Architecture

- `src/app/` - Next.js App Router routes. Each `page.tsx` is a thin client-only wrapper around the real page component.
- `src/views/` - the page components (previously `src/pages/`; renamed because Next.js reserves `pages/`).
- `src/components/`, `src/context/`, `src/hooks/`, `src/services/`, `src/utils/` - unchanged from the original app.
- `src/lib/router.tsx` - react-router-dom compatibility layer over `next/navigation` (`Link`, `NavLink`, `Navigate`, `useNavigate`, `useParams`, `useSearchParams`, `useLocation`). Existing components use the same API they always did.
- `src/lib/clientPage.tsx` - wraps pages with `dynamic(..., { ssr: false })`. The app is intentionally client-rendered only, matching the original SPA's runtime behavior exactly.
- `src/app/api/website/job-postings/route.ts` - server-side publish endpoint for the careers website. A static segment wins over the `[...path]` catch-all, so this one route is **not** proxied to FastAPI: the website is a separate system and its API key is added here rather than in the browser.
- `src/app/api/[...path]/route.ts` - proxies `/api/*` to the FastAPI backend (default `http://localhost:4002`), stripping the `/api` prefix and rewriting redirect `Location` headers, exactly like the old Vite dev proxy. Works in dev **and** production.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `API_PROXY_TARGET` | `http://localhost:4002` | Backend URL the `/api` proxy forwards to (server-side) |
| `NEXT_PUBLIC_API_BASE` | `/api` | API base the browser code calls (was `VITE_API_BASE`) |
| `WEBSITE_JOBS_API_URL` | _(unset)_ | Careers-website endpoint that creates a job posting. **Unset - the publish is simulated:** nothing is sent and the UI says so in red. |
| `WEBSITE_JOBS_API_KEY` | _(unset)_ | Bearer token sent to that endpoint (server-side only - never reaches the browser) |
| `WEBSITE_JOBS_BASE_URL` | `https://thinkwise.example.com` | Public site root, used to build the posting URL when the website's response has none |

## Posting a requirement to the website

A requirement's detail page has a **Post in Website** button (admins / client managers, on non-deleted
requirements). It opens `/requirements/:id/post-to-website`, which drafts a public job posting from the
requirement - title, company, location, employment type, work mode, experience, openings, skills, and the
JD body - and lets you edit every field before publishing. A requirement with no `jd` text still gets a
readable draft assembled from its structured fields.

Two things are deliberately withheld from the draft: `special_instructions` (internal recruiter guidance)
is never sent, and the budget range is only sent when *Show salary range on the public posting* is ticked.

**Post to Website** sends the edited draft to `POST /api/website/job-postings`, which forwards it to
`WEBSITE_JOBS_API_URL` with the website's own credential. Editing here never modifies the requirement
itself. The page then shows the live posting URL, or a red banner when the publish was simulated or the
website rejected it.

Outgoing body:

```json
{
  "requirement_id": "…", "req_id": "TW042",
  "title": "…", "company": "…", "location": "…",
  "employment_type": "Full Time", "work_mode": "Hybrid",
  "experience": "5 - 8 years", "openings": 2,
  "salary_range": null,
  "skills": ["React", "TypeScript"],
  "description": "…", "apply_email": null
}
```

The website is expected to reply with `{ "id": "…", "url": "…", "published_at": "…" }`; a missing `url`
is derived from `WEBSITE_JOBS_BASE_URL` and the returned id.

