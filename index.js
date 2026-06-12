
import express from "express";
import dotenv from "dotenv";
import connectDB from "./Config/Db.js";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRouter from "./Routes/auth.routes.js";
import userRouter from "./Routes/user.routes.js";
import assistantRouter from "./Routes/assistant.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());


app.use("/public", express.static("public"));

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/assistant", assistantRouter);

connectDB();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});