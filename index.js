import express from "express";
import dotenv from "dotenv";
import connectDB from "./Config/Db.js";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRouter from "./Routes/auth.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRouter);

app.listen(PORT, () => {
    connectDB();
    console.log(`Server is running on port ${PORT}`);
});