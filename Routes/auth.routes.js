import express from "express";
import { registerUser, loginUser, logoutUser, forgotPassword, googleMockLogin } from "../Controllers/auth.controllers.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.post("/forgot-password", forgotPassword);
router.post("/google-mock", googleMockLogin);

export default router;
