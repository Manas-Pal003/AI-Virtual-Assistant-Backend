import express from "express";
import isAuth from "../Middleware/isAuth.js";
import { askAssistant } from "../Controllers/assistant.controllers.js";

const router = express.Router();

router.post("/ask", isAuth, askAssistant);

export default router;