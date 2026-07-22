# AI-Generated Cover Letters — Design Plan

Goal: click "Generate with AI" in the existing Cover Letter drawer, and get a
draft written by Claude that blends your reusable paragraph templates with
the specific job's details — streamed straight into the textarea so you can
edit before saving.

This is a design doc, not a build. Nothing here is implemented yet.

## 1. Why this shape

This is a single "generate text from context" task — not multi-step, not a
tool-calling agent. One `POST /v1/messages` request per generation, with the
job details and your template snippets stuffed into the prompt, is enough.
No agent loop, no vector database, no embeddings — those are the first
things to *cut* if this ever feels over-engineered.

## 2. Data model additions

### `db/schema/cover-letter-snippets-schema.ts` (new)

A reusable paragraph library, separate from the `jobs` table. One row per
template chunk (an opening hook, a "why I'm a fit for PM roles" paragraph,
a closing, etc.).

```ts
export const cover_letter_snippets = pgTable("cover_letter_snippets", {
  id: serial("id").primaryKey(),
  // short human label so you can find it later, e.g. "GTM opening - metrics-driven"
  label: text("label").notNull(),
  // the actual paragraph text
  content: text("content").notNull(),
  // optional: which job category this fits best ("Product Manager" / "GTM
  // Engineering" / "Other" / null for "fits anything") - lets generation
  // filter down to relevant snippets instead of sending all of them
  category: jobCategoryEnum("category"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
```

Reuses the existing `jobCategoryEnum` from `jobs-schema.ts` so a snippet can
be tagged to the same Product Manager / GTM Engineering / Other buckets the
jobs table already uses.

### Loading your existing chunks

Once you hand over your paragraph templates, the fastest path is a one-off
seed script (same pattern as `db/seed/index.ts` if that already exists) that
inserts them directly — not a UI. A management UI is a phase-2 nice-to-have,
not required to ship the generator.

## 3. Prompt construction

Server-side only (see §5). Given a `jobId`:

1. Fetch the job row (title, company, industry, location, notes).
2. Fetch snippets where `category` matches the job's category, or is null
   (fits-anything). If that query returns nothing, fall back to all
   snippets — better to over-supply context than generate from nothing.
3. Build one user message with the job details and the candidate snippets,
   clearly delimited so Claude doesn't blend them together:

```
<job>
Title: Senior Product Manager
Company: Acme Corp
Industry: Fintech
Location: Remote
Notes: Referred by a former coworker; team owns the payments platform.
</job>

<snippets>
[GTM opening - metrics-driven]
"In my last role I..."

[PM closing - collaborative tone]
"I'd welcome the chance to..."
</snippets>

Write a cover letter for this job using the snippets above as raw
material - adapt and blend them naturally, don't paste them verbatim.
Reference the company and role specifically. 3-4 paragraphs, ~350-450
words, no placeholder brackets left in the output.
```

4. System prompt sets the fixed instructions (tone, length, "don't
   fabricate experience not present in the snippets," "output only the
   letter body — no date/address block, no signature").

Keeping the system prompt fixed and putting job-specific content in the user
turn means it's eligible for prompt caching later if generation volume ever
grows enough to matter — not needed on day one.

## 4. Model choice and parameters

- **Model:** `claude-opus-4-8` by default. This is a short, low-stakes text
  generation task, so `claude-sonnet-5` (cheaper, faster, still strong at
  writing) is a very reasonable alternative if you'd rather optimize for
  cost per generation — your call, not a silent downgrade.
- **Thinking:** not needed here. Writing a cover letter from supplied
  material isn't a reasoning-heavy task, so skip `thinking` entirely
  (equivalent to `{type: "disabled"}` on Opus, or just omit it).
- **`output_config.effort`:** leave at the default (`high`) initially; step
  down to `medium` if generations feel slow for no quality benefit.
- **`max_tokens`:** ~2048 is generous headroom for a ~450-word letter.
- **Streaming:** yes — stream the response and pipe deltas into the
  textarea as they arrive, so it reads like the letter is being typed live
  instead of a multi-second blank-screen wait.

## 5. Where the API call lives

**`app/api/cover-letter/generate/route.ts`** (new Route Handler, not a
Server Action). Streaming a token-by-token response back to a client
component fits Route Handlers more naturally than Server Actions in this
app — same pattern already used for `app/api/cron/poll-jobs/route.ts`.

```
Client (jobs-table.tsx drawer)
  -> POST /api/cover-letter/generate  { jobId }
Server (route.ts)
  -> fetch job + snippets via Drizzle
  -> build prompt
  -> client.messages.stream({ model, max_tokens, system, messages })
  -> pipe text deltas back as the HTTP response body
Client
  -> reads response.body via getReader(), appends chunks to
     coverLetterDraft as they arrive
```

The `ANTHROPIC_API_KEY` lives only in `.env.local` (and Vercel's project env
vars for production) and is read inside the Route Handler — it's never sent
to the browser. Add it as a new key alongside `DATABASE_URL` /
`RAPIDAPI_KEY` / `CRON_SECRET` / `APIFY_KEY`.

## 6. UI changes (Cover Letter drawer)

In `app/jobs/_components/jobs-table.tsx`, inside the existing
`SheetContent` for the cover letter drawer:

- Add a **"Generate with AI"** button next to Save / Download PDF.
- On click: disable the button, clear/replace `coverLetterDraft`, POST to
  the route, stream chunks into `coverLetterDraft` via `setCoverLetterDraft`
  as they arrive (same state that already backs the `Textarea`).
- Re-enable the button when the stream ends or errors.
- On error, reuse the existing `toastMessage` pattern already used for
  failed delete/approve/dismiss actions — don't lose whatever text already
  streamed in.
- Generating doesn't auto-save — you still review and hit Save yourself,
  same as if you'd typed it by hand.

## 7. Error handling

- Network/API errors: typed SDK exceptions (`RateLimitError`,
  `APIConnectionError`, etc.), surfaced as a toast, generation button
  re-enabled.
- Empty/missing snippets: still generate — the prompt just leans more on
  the job details alone. Don't block generation on having a snippet
  library populated.
- No need for retry/backoff logic beyond what the SDK already does
  (`max_retries` defaults to 2) — this is an interactive, user-initiated
  action, not a background job.

## 8. Cost

Negligible for personal use — a single generation is roughly 1-2K tokens
round trip, a few cents at most on Opus pricing, fractions of a cent on
Sonnet. Not worth adding rate limiting or usage tracking for a single-user
app.

## 9. Phasing

**Phase 1 (this plan's scope):**
- `cover_letter_snippets` schema + migration
- Seed your existing paragraph chunks once you hand them over
- Streaming `/api/cover-letter/generate` route
- "Generate with AI" button wired into the existing drawer

**Phase 2 (later, only if wanted):**
- A snippet management UI instead of manual seeding/DB edits
- "Regenerate" button for a second pass
- Length/tone controls in the drawer (short vs. detailed)
- If the snippet library grows large enough that "send everything in the
  prompt" stops being cheap: switch to embedding-based retrieval
  (pgvector + an embeddings call) to select the top-N relevant snippets
  instead of all of them. Not needed at the scale of a personal template
  library.
