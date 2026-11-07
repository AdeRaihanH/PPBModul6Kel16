import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import readingsRoutes from "./routes/readingsRoutes.js";
import thresholdsRoutes from "./routes/thresholdsRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import { migrate } from "./config/migrate.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "32kb" }));

app.use("/api/health", healthRoutes);
app.use("/api/readings", readingsRoutes);
app.use("/api/thresholds", thresholdsRoutes);

// Unknown routes answer in JSON, like every other endpoint. Express's default
// HTML page would be shown verbatim by the app's error banner.
app.use((req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` });
});

// One error handler for everything, so a malformed body or an unexpected throw
// still produces { error } instead of an HTML stack trace. Express identifies
// body-parser failures by the `type` property.
app.use((error, _req, res, _next) => {
  const isClientError =
    error?.type === "entity.parse.failed" ||
    error?.type === "entity.too.large" ||
    error?.status === 400 ||
    error?.statusCode === 400;

  if (isClientError) {
    const message =
      error?.type === "entity.parse.failed"
        ? "Request body is not valid JSON"
        : error?.type === "entity.too.large"
          ? "Request body is too large"
          : (error?.message ?? "Bad request");
    return res.status(400).json({ error: message });
  }

  console.error("Unhandled error:", error?.message ?? error);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 5002;

// Bring the schema up to date before accepting traffic, but never block on it:
// if the database is down the API still answers, and /api/health says so.
migrate()
  .catch((error) => console.error("Migration skipped:", error.message))
  .finally(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Backend server running on port ${port}`);
    });
  });
