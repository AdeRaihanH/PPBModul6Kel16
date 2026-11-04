import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import readingsRoutes from "./routes/readingsRoutes.js";
import thresholdsRoutes from "./routes/thresholdsRoutes.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/readings", readingsRoutes);
app.use("/api/thresholds", thresholdsRoutes);

const port = process.env.PORT || 5002;
app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on port ${port}`);
});
