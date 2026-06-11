import express from "express";
import isAuth from "../Middleware/isAuth.js";
import { upload } from "../Middleware/multer.js";
import {
  getUserData,
  customizeAssistant,
} from "../Controllers/user.controllers.js";

const router = express.Router();

router.get("/me", isAuth, getUserData);

router.post(
  "/customize",
  isAuth,
  upload.single("assistantImage"),
  customizeAssistant
);

export default router;