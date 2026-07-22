// Seeds (or updates) your reusable cover letter paragraphs. Separate from
// db/seed/index.ts on purpose - that script wipes and reseeds the whole
// "jobs" table with placeholder data, and running that against your real,
// in-use jobs would be destructive. This script only ever touches the
// "cover_letter_snippets" table.
//
// Run with: npx tsx db/seed/cover-letter-snippets.ts
// (or npx bun db/seed/cover-letter-snippets.ts, matching db/seed/index.ts)

import { db } from "@/db"
import { coverLetterSnippets } from "../schema/cover-letter-snippets-schema"

// Each snippet is one reusable paragraph, tagged with the themes/keywords
// that describe it. The AI generator reads the tags (not just the content)
// to decide which snippets are the best fit for a given job description.
const snippets = [
  {
    slug: "oracle-enterprise",
    tags: [
      "enterprise",
      "CRM",
      "B2B",
      "SaaS",
      "data-driven",
      "metrics",
      "UX",
      "product management",
      "Oracle",
      "Eloqua",
      "marketing",
    ],
    content:
      "The majority of my product experience has been at Oracle where I led data driven features at enterprise scale and also worked extensively with the UX team for Oracle's CRM software, Eloqua. I've led a team to build out a bot detection service that detected on average 30% of tracked email metrics as bot activity per client, built the foundation for the send time optimization feature for clients to improve email conversion rates, and was one of the PMs leading the full CRM interface redesign, working closely with user researchers and UX/UI designers to modernize our tech stack. Through these projects, I grew my intuition at defining the right metrics and making calls that were validated by data.",
  },
  {
    slug: "solhealth-healthcare",
    tags: [
      "healthcare",
      "telehealth",
      "startup",
      "patient",
      "booking",
      "conversion",
      "EHR",
      "Zocdoc",
      "workflows",
    ],
    content:
      "More recently, I've been working as a software engineer at Solhealth, a pre-seed telehealth startup in NYC, where I've been directly working with their custom EHR system. I automated their client booking flow from Zocdoc into Solhealth's custom EHR system and redesigned the therapist to patient matching flow, which improved conversion rates by 10%. That work showed me how much falls apart when the systems supporting a patient aren't connected.",
  },
  {
    slug: "solhealth-clinical",
    tags: [
      "healthcare",
      "EHR",
      "clinical workflows",
      "care delivery",
      "provider",
      "clinical infrastructure",
      "telehealth",
    ],
    content:
      "More recently, I've been working as a software engineer at Solhealth, a pre-seed telehealth startup in NYC, where I've been directly working with their custom EHR system. I automated their client booking flow from Zocdoc into Solhealth's custom EHR system and redesigned the therapist to patient matching flow, which improved conversion rates by 10%. That work showed me how much falls apart when the systems supporting a patient aren't connected, and how much leverage there is in getting clinical workflows right at the infrastructure level.",
  },
  {
    slug: "consumer-product",
    tags: [
      "consumer",
      "mobile",
      "B2C",
      "adoption",
      "UX",
      "iOS",
      "app",
      "user experience",
      "behavior change",
      "3i.ai",
      "sleep app",
    ],
    content:
      "On the consumer side, I've had extensive experience on two projects. At 3i.ai, I owned the roadmap for a video calling feature inside the Pivo Pod mobile app, working with a cross-functional team to improve feature adoption by 25% by making the experience clearer and less frictional. Outside of work, I built an iOS sleep tracking app in SwiftUI with an on-device ML sleep classifier, screen blocking capability with the Apple Family Controls integration, and a personalized sleep program. Building consumer products, even small ones, taught me to care obsessively about the tiniest details and how it could impact consumers at scale.",
  },
  {
    slug: "growth-conversion",
    tags: [
      "growth",
      "conversion",
      "adoption",
      "funnel",
      "experimentation",
      "activation",
      "3i.ai",
      "Oracle",
      "send time optimization",
      "bot detection",
    ],
    content:
      "At 3i.ai, I owned the roadmap for a video calling feature inside the Pivo Pod mobile app and improved feature adoption by 25% by identifying where users were dropping off and reducing friction in the core experience. That same instinct for conversion and activation carried through my time at Oracle, where I built the foundation for a send time optimization feature and led a bot detection service that cut false engagement signals by ~30% per client, giving our customers cleaner data to act on.",
  },
  {
    slug: "ai-ml",
    tags: [
      "AI",
      "ML",
      "LLMs",
      "machine learning",
      "artificial intelligence",
      "prompt engineering",
      "on-device",
      "technical",
      "AI-first",
    ],
    content:
      "I've used AI tools on a daily basis as I've built products, from working with LLMs and prompt engineering to shipping an on-device ML classifier in the form of an iOS sleep app I built from scratch. I'm not just interested in AI as a product feature; I've seen firsthand how much it changes what a small team can ship and how fast they can move.",
  },
]

async function seedSnippets() {
  try {
    console.log("🌱 Seeding cover letter snippets...")

    for (const snippet of snippets) {
      // Insert, or update in place if a snippet with this slug already
      // exists - this makes the script safe to re-run after you tweak a
      // paragraph's wording or tags, instead of piling up duplicates.
      await db
        .insert(coverLetterSnippets)
        .values(snippet)
        .onConflictDoUpdate({
          target: coverLetterSnippets.slug,
          set: {
            tags: snippet.tags,
            content: snippet.content,
          },
        })
      console.log(`  ✅ ${snippet.slug}`)
    }

    console.log("✅ Snippet seeding completed successfully!")
  } catch (error) {
    console.error("❌ Error during snippet seeding:", error)
    throw error
  } finally {
    console.log("🚪 Closing database connection...")
    await db.$client.end()
    console.log("🔌 Database connection closed.")
  }
}

seedSnippets()
