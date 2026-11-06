import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
// Tests run against the same connection path as production (DATABASE_URL, Supabase transaction pooler).
// Point TEST_DATABASE_URL at a throwaway database to keep test fixtures off a shared one.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
