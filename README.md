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
- `src/app/api/[...path]/route.ts` - proxies `/api/*` to the FastAPI backend (default `http://localhost:4002`), stripping the `/api` prefix and rewriting redirect `Location` headers, exactly like the old Vite dev proxy. Works in dev **and** production.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `API_PROXY_TARGET` | `http://localhost:4002` | Backend URL the `/api` proxy forwards to (server-side) |
| `NEXT_PUBLIC_API_BASE` | `/api` | API base the browser code calls (was `VITE_API_BASE`) |

