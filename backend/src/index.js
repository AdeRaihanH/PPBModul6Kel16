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
app.use(express.json());

app.use("/api/health", healthRoutes);
app.use("/api/readings", readingsRoutes);
app.use("/api/thresholds", thresholdsRoutes);

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
