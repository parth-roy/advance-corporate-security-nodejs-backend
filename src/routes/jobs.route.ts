import { Router, Request, Response, NextFunction } from "express";
import { Job } from "../models/Job.model";
import { JobApplication } from "../models/JobApplication.model";
import { sendMail, buildEmailHtml } from "../utils/mailer";
import { appendToGoogleSheet } from "../utils/googleSheets";

export const jobsRouter = Router();

// Fallback seed jobs to ensure UI always renders active jobs gracefully
const SEED_JOBS = [
  {
    _id: "seed-job-1",
    title: "Senior Security Supervisor",
    category: "Security & Safety",
    vacancy: "5 Vacancies",
    jobType: "Full-time",
    isContractual: false,
    workLocationType: "Field Job",
    city: "Kolkata",
    locality: "Salt Lake Sector V",
    salaryMin: 22000,
    salaryMax: 28000,
    hasIncentives: true,
    incentivesText: "₹2,500 Monthly Attendance & Night Shift Bonus",
    salaryBreakdown: {
      basePay: 20000,
      pfDeduction: 1800,
      esicDeduction: 150,
      incentivesAmount: 2500,
      estimatedGross: 24350,
    },
    benefits: ["Health Insurance", "PF", "Meal / Food", "Free Uniform & Shoes", "Medical Benefits"],
    shift: "Rotational",
    workingDays: "6 Days Working",
    requiresDeposit: false,
    gender: "Any",
    qualification: "12th Pass",
    expMin: 2,
    expMax: 5,
    skills: ["CCTV Monitoring", "Fire Safety", "Access Control", "Team Management"],
    assetsNeeded: ["Bike / Two-Wheeler", "Smartphone"],
    documentsRequired: ["Aadhaar Card", "PAN Card", "Two-Wheeler Driving License", "Bank Passbook"],
    description: "Advance Corporate Security is hiring experienced Security Supervisors to oversee physical guarding, access control, and 24x7 gate security operations across premier IT parks in Salt Lake Sector V.",
    status: "active",
    createdAt: new Date(),
  },
  {
    _id: "seed-job-2",
    title: "Armed Security Guard (Ex-Servicemen)",
    category: "Security & Safety",
    vacancy: "2 Vacancies",
    jobType: "Full-time",
    isContractual: true,
    workLocationType: "Work from Office",
    city: "Barrackpore",
    locality: "Station Road Industrial Belt",
    salaryMin: 26000,
    salaryMax: 34000,
    hasIncentives: true,
    incentivesText: "₹3,000 High-Value Escort & Overtime Allowance",
    salaryBreakdown: {
      basePay: 24000,
      pfDeduction: 1800,
      esicDeduction: 180,
      incentivesAmount: 3000,
      estimatedGross: 28820,
    },
    benefits: ["PF", "Health Insurance", "Free Accommodation", "Uniform & Gear"],
    shift: "Day",
    workingDays: "6 Days Working",
    requiresDeposit: false,
    gender: "Male",
    qualification: "10th Pass",
    expMin: 3,
    expMax: 8,
    skills: ["Valid Gun License", "Weapon Handling", "Cash-in-Transit Protection"],
    assetsNeeded: ["Valid Firearms / Gun"],
    documentsRequired: ["Aadhaar Card", "PAN Card", "Gun License", "Discharge Book / Ex-Servicemen Certificate"],
    description: "Urgent opening for licensed Armed Security Guards (Retd. Army, Navy, Air Force, or BSF/CISF) for high-value banking and cash-transit protection.",
    status: "active",
    createdAt: new Date(),
  },
  {
    _id: "seed-job-3",
    title: "Corporate Housekeeping Team Lead",
    category: "Facility Management",
    vacancy: "10 Vacancies",
    jobType: "Full-time",
    isContractual: false,
    workLocationType: "Work from Office",
    city: "Kolkata",
    locality: "New Town Financial Hub",
    salaryMin: 16000,
    salaryMax: 20000,
    hasIncentives: false,
    salaryBreakdown: {
      basePay: 15500,
      pfDeduction: 1800,
      esicDeduction: 120,
      incentivesAmount: 0,
      estimatedGross: 15500,
    },
    benefits: ["PF", "ESIC Medical", "Free Uniform", "Paid Leave"],
    shift: "Day",
    workingDays: "6 Days Working",
    requiresDeposit: false,
    gender: "Any",
    qualification: "10th Pass",
    expMin: 1,
    expMax: 3,
    skills: ["Deep Cleaning", "Floor Machine Scrubbing", "Chemical Handling (Diversey/Taski)"],
    assetsNeeded: [],
    documentsRequired: ["Aadhaar Card", "PAN Card", "Bank Account Passbook"],
    description: "Immediate requirement for Corporate Housekeeping Executives to manage mechanized cleaning and hygiene standards across multi-national corporate offices.",
    status: "active",
    createdAt: new Date(),
  },
];

// ─── POST /api/jobs (Create a New Job Post) ───────────────────
jobsRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      title,
      category,
      vacancy,
      jobType,
      isContractual,
      workLocationType,
      city,
      locality,
      salaryMin,
      salaryMax,
      hasIncentives,
      incentivesText,
      salaryBreakdown,
      benefits,
      shift,
      workingDays,
      requiresDeposit,
      depositDetails,
      gender,
      qualification,
      expMin,
      expMax,
      skills,
      assetsNeeded,
      documentsRequired,
      description,
    } = req.body;

    if (!title || !category || !city || !description) {
      res.status(400).json({
        success: false,
        message: "Required fields: title, category, city, description",
      });
      return;
    }

    const job = new Job({
      title: title.trim(),
      category: category.trim(),
      vacancy: vacancy || "1 Vacancy",
      jobType: jobType || "Full-time",
      isContractual: Boolean(isContractual),
      workLocationType: workLocationType || "Work from Office",
      city: city.trim(),
      locality: locality?.trim() || "",
      salaryMin: Number(salaryMin) || 12000,
      salaryMax: Number(salaryMax) || 18000,
      hasIncentives: Boolean(hasIncentives),
      incentivesText: incentivesText?.trim() || "",
      salaryBreakdown: salaryBreakdown || {},
      benefits: Array.isArray(benefits) ? benefits : [],
      shift: shift || "Day",
      workingDays: workingDays?.trim() || "6 Days Working",
      requiresDeposit: Boolean(requiresDeposit),
      depositDetails: depositDetails?.trim() || "",
      gender: gender || "Any",
      qualification: qualification?.trim() || "10th Pass",
      expMin: Number(expMin) || 0,
      expMax: Number(expMax) || 2,
      skills: Array.isArray(skills) ? skills : [],
      assetsNeeded: Array.isArray(assetsNeeded) ? assetsNeeded : [],
      documentsRequired: Array.isArray(documentsRequired) ? documentsRequired : [],
      description: description.trim(),
      status: "active",
      postedByIp: req.ip || req.socket?.remoteAddress,
    });

    await job.save();

    // Instant Response to Client (< 200ms)
    res.status(201).json({
      success: true,
      message: "Job posted successfully and published to Careers page.",
      data: { id: job._id, title: job.title },
    });

    // Background Async Tasks (Google Sheet + Email)
    const recipientEmail = process.env.CONTACT_EMAIL || "advancedcorporatesecurityj@gmail.com";
    const adminHtml = buildEmailHtml(
      "New Job Opening Posted",
      `
      <p><strong>Posted At:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;width:35%;">Job Title</td><td style="padding:8px;border:1px solid #e5e7eb;">${job.title}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Category</td><td style="padding:8px;border:1px solid #e5e7eb;">${job.category}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Location</td><td style="padding:8px;border:1px solid #e5e7eb;">${job.locality ? job.locality + ", " : ""}${job.city} (${job.workLocationType})</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Vacancies</td><td style="padding:8px;border:1px solid #e5e7eb;">${job.vacancy}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Salary Range</td><td style="padding:8px;border:1px solid #e5e7eb;">₹${job.salaryMin.toLocaleString()} - ₹${job.salaryMax.toLocaleString()} / month</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Shift & Days</td><td style="padding:8px;border:1px solid #e5e7eb;">${job.shift} Shift | ${job.workingDays}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Qualification & Exp</td><td style="padding:8px;border:1px solid #e5e7eb;">${job.qualification} | ${job.expMin}-${job.expMax} Years</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">DB Record ID</td><td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;font-size:12px;">${job._id}</td></tr>
      </table>
      `
    );

    Promise.allSettled([
      appendToGoogleSheet({
        type: "job_post",
        id: job._id.toString(),
        jobTitle: job.title,
        jobCategory: job.category,
        vacancy: String(job.vacancy),
        jobType: job.jobType,
        isContractual: job.isContractual,
        workLocationType: job.workLocationType,
        city: job.city,
        locality: job.locality || "",
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        incentives: job.incentivesText || "None",
        benefits: (job.benefits || []).join(", "),
        shift: job.shift,
        workingDays: job.workingDays,
        requiresDeposit: job.requiresDeposit,
        depositDetails: job.depositDetails || "",
        gender: job.gender,
        qualification: job.qualification,
        experience: `${job.expMin} to ${job.expMax} Years`,
        skills: (job.skills || []).join(", "),
        assetsNeeded: (job.assetsNeeded || []).join(", "),
        documentsRequired: (job.documentsRequired || []).join(", "),
        description: job.description,
        source: req.headers.referer || "ACS Web Portal",
      }),
      sendMail({
        to: recipientEmail,
        subject: `[ACS New Job] ${job.title} — ${job.city}`,
        html: adminHtml,
      }),
    ]).catch((err) => console.error("[Job Post Route] Async task error:", err));
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/jobs (List All Active Jobs) ──────────────────────
jobsRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { city, category, jobType } = req.query;
    const filter: Record<string, any> = { status: "active" };

    if (city && typeof city === "string" && city !== "All") {
      filter.city = new RegExp(city.trim(), "i");
    }
    if (category && typeof category === "string" && category !== "All") {
      filter.category = new RegExp(category.trim(), "i");
    }
    if (jobType && typeof jobType === "string" && jobType !== "All") {
      filter.jobType = jobType.trim();
    }

    const dbJobs = await Job.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // If database has jobs, return them. Otherwise return seed jobs for immediate display!
    const jobsToReturn = dbJobs && dbJobs.length > 0 ? dbJobs : SEED_JOBS;

    res.json({
      success: true,
      count: jobsToReturn.length,
      data: jobsToReturn,
    });
  } catch (err) {
    // If DB is offline, fail gracefully with seed jobs
    res.json({
      success: true,
      count: SEED_JOBS.length,
      data: SEED_JOBS,
    });
  }
});

// ─── GET /api/jobs/:id (Get Single Job) ────────────────────────
jobsRouter.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check seed jobs first
    const seed = SEED_JOBS.find((j) => j._id === id);
    if (seed) {
      res.json({ success: true, data: seed });
      return;
    }

    const job = await Job.findById(id).lean();
    if (!job) {
      res.status(404).json({ success: false, message: "Job opening not found" });
      return;
    }

    res.json({ success: true, data: job });
  } catch (err) {
    res.status(404).json({ success: false, message: "Job opening not found" });
  }
});

// ─── POST /api/jobs/:id/apply (Candidate Applies for a Job) ────
jobsRouter.post("/:id/apply", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      applicantName,
      applicantPhone,
      applicantEmail,
      applicantCity,
      applicantExperience,
      applicantQualification,
      message,
      jobTitle,
      jobCity,
    } = req.body;

    if (!applicantName || !applicantPhone || !applicantEmail) {
      res.status(400).json({
        success: false,
        message: "Required fields: applicantName, applicantPhone, applicantEmail",
      });
      return;
    }

    const application = new JobApplication({
      jobId: id,
      jobTitle: jobTitle?.trim() || "Security & Facility Role",
      jobCity: jobCity?.trim() || applicantCity?.trim() || "Pan-India",
      applicantName: applicantName.trim(),
      applicantPhone: applicantPhone.trim(),
      applicantEmail: applicantEmail.trim().toLowerCase(),
      applicantCity: applicantCity?.trim() || "",
      applicantExperience: applicantExperience?.trim() || "Fresher",
      applicantQualification: applicantQualification?.trim() || "10th Pass",
      message: message?.trim() || "",
      ipAddress: req.ip || req.socket?.remoteAddress,
      status: "applied",
    });

    await application.save();

    // Instant response to applicant
    res.status(201).json({
      success: true,
      message: "Application submitted successfully! Our HR team will contact you shortly.",
      data: { applicationId: application._id },
    });

    // Async tasks (Google Sheets + Admin notification email)
    const recipientEmail = process.env.CONTACT_EMAIL || "advancedcorporatesecurityj@gmail.com";
    const adminHtml = buildEmailHtml(
      "New Job Application Received",
      `
      <p><strong>Applied At:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;width:35%;">Job Applied</td><td style="padding:8px;border:1px solid #e5e7eb;">${application.jobTitle} (${application.jobCity})</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Applicant Name</td><td style="padding:8px;border:1px solid #e5e7eb;">${application.applicantName}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Phone Number</td><td style="padding:8px;border:1px solid #e5e7eb;"><a href="tel:${application.applicantPhone}">${application.applicantPhone}</a></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Email Address</td><td style="padding:8px;border:1px solid #e5e7eb;"><a href="mailto:${application.applicantEmail}">${application.applicantEmail}</a></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">City / Location</td><td style="padding:8px;border:1px solid #e5e7eb;">${application.applicantCity || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Experience</td><td style="padding:8px;border:1px solid #e5e7eb;">${application.applicantExperience}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Qualification</td><td style="padding:8px;border:1px solid #e5e7eb;">${application.applicantQualification}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Applicant Note</td><td style="padding:8px;border:1px solid #e5e7eb;">${application.message || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Application ID</td><td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;font-size:12px;">${application._id}</td></tr>
      </table>
      `
    );

    Promise.allSettled([
      appendToGoogleSheet({
        type: "job_application",
        id: application._id.toString(),
        jobId: String(application.jobId || ""),
        jobTitle: application.jobTitle,
        applicantName: application.applicantName,
        applicantPhone: application.applicantPhone,
        applicantEmail: application.applicantEmail,
        applicantCity: application.applicantCity,
        applicantExperience: application.applicantExperience,
        applicantQualification: application.applicantQualification,
        message: application.message || "",
        source: req.headers.referer || "Careers Page",
      }),
      sendMail({
        to: recipientEmail,
        subject: `[Job Application] ${application.jobTitle} — ${application.applicantName}`,
        html: adminHtml,
        replyTo: application.applicantEmail,
      }),
    ]).catch((err) => console.error("[Job Apply Route] Async task error:", err));
  } catch (err) {
    next(err);
  }
});
