import mongoose from "mongoose";
import dns from "dns";

// Fix Node.js DNS resolution issues (ECONNREFUSED) for MongoDB SRV records on some networks/OS
try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (err) {
    console.warn("Warning: Could not set DNS servers for MongoDB connection:", err);
}

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log("Database Connected");
    } catch (error) {
        console.error("Error while connecting database:", error);
    }
}

export default connectDB;

