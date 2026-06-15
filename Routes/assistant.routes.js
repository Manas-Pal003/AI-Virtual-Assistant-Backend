import express from "express";
import isAuth from "../Middleware/isAuth.js";
import { askAssistant, cancelShutdown } from "../Controllers/assistant.controllers.js";

const router = express.Router();

router.post("/ask", isAuth, askAssistant);
router.post("/cancel-shutdown", isAuth, cancelShutdown);

export default router;