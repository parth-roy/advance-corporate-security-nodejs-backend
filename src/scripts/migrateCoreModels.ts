import "dotenv/config";
import { connectDB, disconnectDB } from "../utils/db";
import { migrateCoreSitesAndEmployees } from "../services/adminCoreMigration.service";

async function run() {
  await connectDB();
  const summary = await migrateCoreSitesAndEmployees();
  console.log("Core migration completed:", summary);
  await disconnectDB();
}

run().catch(async (err) => {
  console.error("Core migration failed:", err);
  await disconnectDB();
  process.exit(1);
});
