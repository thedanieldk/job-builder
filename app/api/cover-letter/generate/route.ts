// app/api/cover-letter/generate/route.ts
// Given a jobId, asks Claude to draft a cover letter by blending your
// reusable paragraph snippets (see db/schema/cover-letter-snippets-schema.ts)
// with that job's specific details, and streams the letter back token by
// token so it can be typed live into the drawer's textarea. A Route Handler
// (not a Server Action) because streaming a response body back to the
// client fits this shape better than a Server Action's request/response.

import { db } from "@/db"
import { coverLetterSnippets } from "@/db/schema/cover-letter-snippets-schema"
import { jobs } from "@/db/schema/jobs-schema"
import Anthropic from "@anthropic-ai/sdk"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

// Fixed instructions that don't change per-request - tone, length, and
// guardrails against the model inventing experience you don't have.
const SYSTEM_PROMPT = `You write cover letters for a job applicant, using
real paragraphs they've written about their own experience as raw material.

Rules:
- Only use experience that appears in the provided snippets. Never invent
  achievements, employers, or numbers that aren't in the snippets.
- Adapt and blend the snippets to fit the job - don't paste them in verbatim,
  and don't use every snippet if only some are relevant.
- Reference the company and role by name.
- Never use an em dash (—). Rewrite that sentence with a comma, period, or
  parentheses instead.
- 3-4 paragraphs, roughly 350-450 words.
- Output only the letter body. No date/address block, no "Dear Hiring
  Manager" salutation, no signature line - just the paragraphs.`

export async function POST(request: Request) {
  const { jobId, description } = await request.json()

  if (typeof jobId !== "number") {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 })
  }

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId))
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  // The client sends whatever's currently in the drawer's description
  // textarea, even if it hasn't been saved yet - fall back to what's already
  // saved on the job (e.g. a previous generation in the same session).
  const jobDescription: string | null =
    typeof description === "string" && description.trim() !== ""
      ? description
      : job.description

  // Every snippet gets sent - at personal-library scale (a handful of
  // paragraphs) that's a few hundred tokens, cheap enough that it's not
  // worth building tag-matching logic. The tags are still included so Claude
  // can judge relevance itself and skip the ones that don't fit.
  const snippets = await db.select().from(coverLetterSnippets)

  const snippetsBlock = snippets
    .map((s) => `[${s.tags.join(", ")}]\n${s.content}`)
    .join("\n\n")

  const userPrompt = `<job>
Title: ${job.title ?? "Unknown"}
Company: ${job.company}
Industry: ${job.industry ?? "Unknown"}
Location: ${job.location ?? "Unknown"}
Notes: ${job.notes ?? "None"}
</job>

${
  jobDescription
    ? `<job_description>\n${jobDescription}\n</job_description>\n\n`
    : ""
}<snippets>
${snippetsBlock || "(no snippets available - write from the job details alone)"}
</snippets>

Write a cover letter for this job using the snippets above as raw material.${
    jobDescription
      ? " Use the job description to speak directly to what this company is looking for - echo its language and priorities where they genuinely match the candidate's real experience, without fabricating anything not in the snippets."
      : ""
  }`

  const client = new Anthropic({ apiKey: process.env.CLAUDE_KEY })

  const stream = client.messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  })

  // Pipe each text delta straight into the HTTP response body as it arrives,
  // so the client can read it incrementally instead of waiting for the
  // whole letter to finish generating.
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      stream.on("text", (text) => {
        // Belt-and-suspenders on top of the system prompt's "no em dash"
        // rule - models occasionally slip on this instruction, so strip any
        // that make it through instead of relying on the prompt alone.
        const filtered = text.replace(/\s*—\s*/g, ", ")
        controller.enqueue(encoder.encode(filtered))
      })
      stream.on("end", () => controller.close())
      stream.on("error", (err) => controller.error(err))
    },
    cancel() {
      stream.abort()
    },
  })

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
