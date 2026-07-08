import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// load environment variables from .env.local (like our database connection string)
config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;

// fail fast if the database url is missing so we don't connect to nothing
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// create the postgres client we'll use to talk to the database
// prepare: false is recommended for connection poolers like Supabase's
const client = postgres(connectionString, { prepare: false });

// wrap the client with drizzle so we can use its query builder throughout the app
export const db = drizzle(client);
