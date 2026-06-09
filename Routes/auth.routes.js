import express from "express";
import { registerUser } from "../Controllers/auth.controllers.js";

const router = express.Router();

router.post("/register", registerUser);

export default router;
