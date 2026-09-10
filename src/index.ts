import "dotenv/config";
import app from "./app";
import { connectDB, disconnectDB } from "./utils/db";

const PORT = parseInt(process.env.PORT || "4000", 10);
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  // ─── Connect to MongoDB Atlas first ───────────────────────
  await connectDB();

  // ─── Start HTTP Server ────────────────────────────────────
  const server = app.listen(PORT, HOST, () => {
    console.log(`\n🚀 ACS Backend API running on http://${HOST}:${PORT}`);
    console.log(`   Environment : ${process.env.NODE_ENV || "development"}`);
    console.log(`   Health check: http://${HOST}:${PORT}/health\n`);
  });

  // ─── Graceful Shutdown ────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      console.log("Server + DB closed.");
      process.exit(0);
    });

    // Force exit after 15 seconds
    setTimeout(() => {
      console.error("Forced exit after timeout.");
      process.exit(1);
    }, 15000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
