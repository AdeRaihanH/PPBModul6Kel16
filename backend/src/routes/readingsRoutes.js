import express from "express";
import { ReadingsController } from "../controllers/readingsController.js";

const router = express.Router();

router.get("/", ReadingsController.list);
router.post("/", ReadingsController.create);
router.get("/latest", ReadingsController.latest);

export default router;
