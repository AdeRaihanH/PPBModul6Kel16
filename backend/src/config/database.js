// ponytail: single shared pg.Pool, backend-only. Direct Neon string + sslmode=require.
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL belum diatur. Periksa backend/.env");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

pool.on("error", (error) => {
  console.error("Database pool error:", error.message);
});
