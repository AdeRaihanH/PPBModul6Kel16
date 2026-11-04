import express from "express";
import { ThresholdsController } from "../controllers/thresholdsController.js";

const router = express.Router();

router.get("/", ThresholdsController.list);
router.post("/", ThresholdsController.create);
router.get("/latest", ThresholdsController.latest);

export default router;
