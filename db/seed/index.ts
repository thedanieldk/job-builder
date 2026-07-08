import { db } from "@/db"; // Adjust the import path if your db/index.ts is elsewhere
import { jobs } from "../schema/jobs-schema"; // Import the Drizzle schema definition

/**
 * An array of sample job objects to be inserted into the database.
 * Note: We don't specify 'id', 'created_at', or 'updated_at' as they
 * are handled automatically by the database/Drizzle schema defaults.
 */
const seedJobs = [
  {
    company: "Acme Robotics",
    industry: "Robotics",
    salary: "$120k - $150k",
    location: "Remote",
    contact: "Jane Doe (Recruiter)",
    applied: true,
    status: "Interviewing" as const,
    website: "https://acmerobotics.example.com",
    notes: "Second round scheduled next week, prep system design.",
    jobLink: "https://acmerobotics.example.com/careers/123",
  },
  {
    company: "Northwind Health",
    industry: "Healthcare",
    salary: "$95k - $110k",
    location: "Seattle, WA",
    contact: null,
    applied: true,
    status: "Applied" as const,
    website: "https://northwindhealth.example.com",
    notes: null,
    jobLink: "https://northwindhealth.example.com/jobs/456",
  },
  {
    company: "Fintra",
    industry: "Fintech",
    salary: null,
    location: "New York, NY",
    contact: "hiring@fintra.example.com",
    applied: false,
    status: "Not Applied" as const,
    website: "https://fintra.example.com",
    notes: "Found via LinkedIn, looks like a strong match.",
    jobLink: null,
  },
  {
    company: "Cobalt Analytics",
    industry: "Data/Analytics",
    salary: "$130k",
    location: "Remote",
    contact: null,
    applied: true,
    status: "Rejected" as const,
    website: null,
    notes: "Rejected after final round, ask for feedback.",
    jobLink: "https://cobaltanalytics.example.com/careers/789",
  },
  {
    company: "Lumen Software",
    industry: "SaaS",
    salary: "$110k - $140k",
    location: "Austin, TX",
    contact: "recruiting@lumen.example.com",
    applied: true,
    status: "Ghosted" as const,
    website: "https://lumen.example.com",
    notes: "No response in 3 weeks after final interview.",
    jobLink: "https://lumen.example.com/jobs/321",
  },
  {
    company: "Brightside Media",
    industry: "Media/Entertainment",
    salary: "$100k",
    location: "Los Angeles, CA",
    contact: null,
    applied: true,
    status: "Offer" as const,
    website: "https://brightsidemedia.example.com",
    notes: "Offer received, negotiating start date.",
    jobLink: "https://brightsidemedia.example.com/careers/55",
  },
  {
    company: "Pinecrest Logistics",
    industry: "Logistics",
    salary: null,
    location: "Chicago, IL",
    contact: "Tom Alvarez (Hiring Manager)",
    applied: false,
    status: "Not Applied" as const,
    website: null,
    notes: "Referral from a former coworker.",
    jobLink: "https://pinecrestlogistics.example.com/jobs/9",
  },
  {
    company: "Vertex Biotech",
    industry: "Biotech",
    salary: "$140k - $160k",
    location: "Boston, MA",
    contact: null,
    applied: true,
    status: "Interviewing" as const,
    website: "https://vertexbiotech.example.com",
    notes: "Take-home assignment due Friday.",
    jobLink: "https://vertexbiotech.example.com/careers/202",
  },
];

/**
 * Asynchronous function to perform the database seeding operation.
 */
async function seed() {
  try {
    console.log("🌱 Starting database seeding...");

    // Optional: Delete all existing jobs before inserting new ones.
    // This makes the script idempotent (safe to run multiple times).
    // Use with caution, especially outside of development!
    console.log("🗑️ Clearing existing data from 'jobs' table...");
    await db.delete(jobs);

    // Insert the array of seed jobs into the 'jobs' table.
    console.log("📥 Inserting seed data into 'jobs' table...");
    await db.insert(jobs).values(seedJobs);

    console.log("✅ Database seeding completed successfully!");

  } catch (error) {
    // Catch and log any errors during the seeding process.
    console.error("❌ Error during database seeding:", error);
    // Optionally re-throw the error to indicate script failure
    throw error;
  } finally {
    // IMPORTANT: Close the database connection pool when the script is done.
    // Standalone scripts need to explicitly close connections.
    console.log("🚪 Closing database connection...");
    // Access the underlying client (syntax might depend on exact driver setup)
    // For the `postgres` library, it's typically .$client.end()
    await db.$client.end();
    console.log("🔌 Database connection closed.");
  }
}

// Immediately invoke the seed function when the script is run.
seed();
