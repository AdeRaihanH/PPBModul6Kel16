import express from "express";
import { pool } from "../config/database.js";

const router = express.Router();

// Cheap liveness + database reachability. The app polls this to tell the truth
// about the pipeline: "sensor feed is fine but the database is down" is a very
// different problem from "no data arriving", and the UI should not conflate them.
router.get("/", async (_req, res) => {
  const startedAt = process.hrtime.bigint();

  try {
    await pool.query("SELECT 1");
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    res.json({
      status: "ok",
      uptimeSec: Math.round(process.uptime()),
      db: { ok: true, latencyMs: Math.round(latencyMs * 10) / 10 },
    });
  } catch (error) {
    // Still HTTP 200: the API itself is answering, it is the dependency that is
    // unhealthy. Reporting 5xx here would make the client treat a known,
    // described condition as a transport failure.
    res.json({
      status: "degraded",
      uptimeSec: Math.round(process.uptime()),
      db: { ok: false, latencyMs: null, error: error.message },
    });
  }
});

export default router;
