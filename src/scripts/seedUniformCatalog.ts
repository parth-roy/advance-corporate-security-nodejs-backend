import "dotenv/config";
import { connectDB, disconnectDB } from "../utils/db";
import { ensureUniformCatalogSeeded } from "../data/uniformCatalogSeed";

async function run() {
  await connectDB();
  const seeded = await ensureUniformCatalogSeeded();
  if (!seeded) {
    console.log("ℹ️ Uniform catalog already contains valid catalog items; no changes made.");
  }
  await disconnectDB();
}

run().catch(async (err) => {
  console.error("❌ Failed to seed uniform catalog:", err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
