import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import { contactRouter } from "./routes/contact.route";
import { inquiryRouter } from "./routes/inquiry.route";
import { whatsappRouter } from "./routes/whatsapp.route";
import { jobsRouter } from "./routes/jobs.route";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();

// ─── Security ────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────
const allowedOrigins = [
  "https://advancecorporatesecurity.com",
  "https://www.advancecorporatesecurity.com",
  process.env.FRONTEND_URL || "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
  })
);

// ─── Body Parsing ─────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── Logging ──────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ─── Health Check ─────────────────────────────────────────────
app.get("/health", (_req, res) => {
  const mongoState = ["disconnected", "connected", "connecting", "disconnecting"];
  res.json({
    status: "ok",
    service: "ACS Backend API",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    db: {
      status: mongoState[mongoose.connection.readyState] || "unknown",
      host: mongoose.connection.host || "not connected",
    },
  });
});

// ─── Routes ───────────────────────────────────────────────────
app.use("/api/contact", contactRouter);
app.use("/api/inquiry", inquiryRouter);
app.use("/api/whatsapp-log", whatsappRouter);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api/jobs", jobsRouter);

// ─── 404 Handler ──────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ─── Global Error Handler ─────────────────────────────────────
app.use(errorHandler);

export default app;
