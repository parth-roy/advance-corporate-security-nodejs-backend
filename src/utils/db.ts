import mongoose from "mongoose";
import { Job } from "../models/Job.model";
import { ANSH_FURNITURE_JOBS } from "../data/anshJobsSeed";

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not defined in environment variables");
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log("✅ MongoDB connected:", mongoose.connection.host);

    // Auto-seed active jobs if collection has no active jobs
    try {
      const activeCount = await Job.countDocuments({ status: "active" });
      if (activeCount === 0) {
        console.log("🌱 Database has no active jobs. Seeding Ansh Furniture LLP requirements...");
        for (const jobData of ANSH_FURNITURE_JOBS) {
          const { _id, ...rest } = jobData as any;
          await Job.create({
            ...rest,
            createdAt: new Date(),
            status: "active",
          });
        }
        console.log("✅ Successfully seeded 11 requirements (22 vacancies) to MongoDB.");
      }
    } catch (seedErr) {
      console.warn("⚠️ Job auto-seed check skipped:", (seedErr as Error).message);
    }

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB disconnected. Reconnecting...");
      isConnected = false;
    });

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err.message);
    });
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    throw err;
  }
}

export async function disconnectDB(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  console.log("MongoDB disconnected.");
}
