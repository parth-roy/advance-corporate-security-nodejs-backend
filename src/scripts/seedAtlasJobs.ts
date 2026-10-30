// src/scripts/seedAtlasJobs.ts
import "dotenv/config";
import mongoose from "mongoose";
import { Job } from "../models/Job.model";
import { ANSH_FURNITURE_JOBS } from "../data/anshJobsSeed";

async function seed() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not found in .env");
    process.exit(1);
  }

  console.log("Connecting to MongoDB Atlas...");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log("✅ Connected to MongoDB Atlas:", mongoose.connection.host);

  // 1. Remove old mock jobs if any
  const deleteResult = await Job.deleteMany({
    title: {
      $in: [
        "Commercial Security Supervisor",
        "Armed Guard (Ex-Servicemen / CAPF)",
        "Corporate Housekeeping Team Lead",
        "Senior Security Supervisor",
        "Armed Security Guard (Ex-Servicemen)",
      ],
    },
  });
  console.log(`Removed ${deleteResult.deletedCount} legacy mock jobs.`);

  // 2. Upsert each of the 11 Ansh Furniture jobs
  for (const jobData of ANSH_FURNITURE_JOBS) {
    const { _id, ...rest } = jobData as any;
    const upserted = await Job.findOneAndUpdate(
      { title: rest.title, city: rest.city },
      {
        $set: {
          ...rest,
          salaryMin: 0,
          salaryMax: 0,
          isSalaryNegotiable: true,
          salaryText: "To be discussed during the interview based on proven experience & machine expertise",
          createdAt: new Date(),
          status: "active",
        },
        $unset: {
          salaryBreakdown: 1,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    console.log(`✅ Seeded/Upserted: ${upserted?.title} [ID: ${upserted?._id}]`);
  }

  const totalCount = await Job.countDocuments({ status: "active" });
  console.log(`\n🎉 Total active jobs now in DB: ${totalCount}`);

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
}

seed().catch((err) => {
  console.error("❌ Seeding error:", err);
  process.exit(1);
});
