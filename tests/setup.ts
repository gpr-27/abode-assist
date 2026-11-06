import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
// Integration tests fire many queries concurrently. postgres.js pipelines them, which hangs on
// Supabase's transaction pooler (port 6543); the session pooler (5432) handles it. Prefer it here.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else if (process.env.DIRECT_DATABASE_URL) process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL;
