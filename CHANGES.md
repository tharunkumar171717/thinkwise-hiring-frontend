# What changed: "Post in Website"

Feature added on top of the original `thinkwise-hiring-frontend-main`.
**6 files: 3 new, 3 modified.** Everything is additive - no existing behaviour
was altered or removed.

A full unified diff against the original is in `post-to-website.patch`
(apply/inspect with `git apply --stat post-to-website.patch` or just read it).

## The flow

1. Requirement detail page gets a **Post in Website** button.
2. It opens `/requirements/:id/post-to-website` - the job description, fully
   editable before publishing.
3. **Post to Website** sends it to the careers site via an API.

## New files

| File | Lines | What it is |
|---|---|---|
| `src/views/PostToWebsite.tsx` | 380 | The editable posting page |
| `src/app/api/website/job-postings/route.ts` | 120 | The publish endpoint |
| `src/app/(protected)/requirements/[id]/post-to-website/page.tsx` | 5 | Route wrapper |

## Modified files - exactly where to look

### `src/views/RequirementDetail.tsx` (2 insertions, ~16 lines)

Search the file for `Post in Website` - it appears twice:

- **~line 634**, inside `condensedMenuItems` - the entry shown in the hamburger
  menu after the header collapses on scroll.
- **~line 833**, in the header actions JSX, right after the *Assign Recruiters*
  button - the visible header button.

Both are gated on `effectiveAdmin && req?.status !== "DELETED"`, matching the
gating already used by *Assign Recruiters* directly above them.

### `src/services/api.ts` (~16 lines, appended at the end)

Adds `websiteJobPostingApi.publish()` and the `PublishedPosting` type. Nothing
above it was touched.

### `README.md`

New env vars (`WEBSITE_JOBS_API_URL`, `WEBSITE_JOBS_API_KEY`,
`WEBSITE_JOBS_BASE_URL`), a "Posting a requirement to the website" section, and
one line in Architecture explaining the new route's placement.

## Two design decisions worth knowing

**The publish endpoint is a Next.js route, not the FastAPI proxy.** A static
segment beats the `[...path]` catch-all, so `/api/website/job-postings` is
handled server-side instead of being forwarded to FastAPI. The reason: the
website is a separate system with its own API key, and that key must never ship
to the browser. The handler also drops the caller's app token before forwarding,
so the website only ever sees its own credential.

**Two fields are withheld from the draft.** `special_instructions` is internal
recruiter guidance and is never published. The budget range is only sent when
*Show salary range on the public posting* is ticked.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

With `WEBSITE_JOBS_API_URL` unset the publish is **simulated**: nothing is sent
anywhere and the UI says so in a red banner - it never fakes a success.
Set that env var to point at a real endpoint to actually publish.

## Verified

`tsc --noEmit` clean, `eslint` clean on the new files, `npm run build` passes
with both API routes registered. The endpoint was tested against a stand-in
website API across four paths: success, validation error (400), unreachable host
(502), and unconfigured (`simulated: true`).

## Not done

Published state isn't persisted - the result lives in the page for that session
only. Persisting it needs a backend field, which isn't in this repo.
