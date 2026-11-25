import "dotenv/config";
import { connectDB, disconnectDB } from "../utils/db";
import { ADMIN_ROLES, AdminRole, AdminUser } from "../models/admin/AdminUser.model";
import { hashPassword } from "../utils/adminAuth";

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function run() {
  const email = (getArg("--email") || process.env.ADMIN_SEED_EMAIL || "").trim().toLowerCase();
  const password = getArg("--password") || process.env.ADMIN_SEED_PASSWORD || "";
  const name = (getArg("--name") || process.env.ADMIN_SEED_NAME || "ACS Super Admin").trim();
  const roleInput = (getArg("--role") || process.env.ADMIN_SEED_ROLE || "super_admin") as AdminRole;
  const role: AdminRole = ADMIN_ROLES.includes(roleInput) ? roleInput : "super_admin";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Usage: npm run seed:admin -- --email admin@advancecorporatesecurity.com --password <min-8-chars> [--name \"Admin Name\"] [--role super_admin]");
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error("Error: Password must be at least 8 characters.");
    process.exit(1);
  }

  await connectDB();

  const passwordHash = await hashPassword(password);
  const user = await AdminUser.findOneAndUpdate(
    { email },
    {
      $set: {
        name,
        email,
        passwordHash,
        role,
        isActive: true,
        failedLoginAttempts: 0,
        lockUntil: null,
      },
      $inc: { tokenVersion: 1 },
    },
    { upsert: true, new: true }
  );

  console.log(`✅ Admin user ready in MongoDB: ${user.email} (role: ${user.role}, id: ${user._id})`);
  await disconnectDB();
}

run().catch(async (err) => {
  console.error("❌ Failed to seed admin user:", err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
