import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { sendMail, buildEmailHtml } from "../utils/mailer";
import { Inquiry, LIFECYCLE_STAGES, LifecycleStage } from "../models/Inquiry.model";
import { appendToGoogleSheet } from "../utils/googleSheets";

export const inquiryRouter = Router();

// Helper to generate uppercase random code
function generateCode(prefix: string, length = 5): string {
  const currentYear = new Date().getFullYear();
  const randomPart = Math.random().toString(36).substring(2, 2 + length).toUpperCase();
  return `${prefix}-${currentYear}-${randomPart}`;
}

// Helper to derive stable client ID from organization/email
function generateClientId(organization?: string, email?: string): string {
  const base = (organization || email || "CORP").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const hash = Math.abs(
    (organization || email || "ACS").split("").reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
  )
    .toString(16)
    .toUpperCase()
    .slice(0, 4);
  return `CLI-${base || "ACS"}-${hash}`;
}

// ─── POST /api/inquiries (Enterprise Intake) ───────────────────
inquiryRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      name,
      organization,
      email,
      phone,
      service,
      city,
      siteType,
      manpowerCount,
      duration,
      message,
      leadId,
      numberOfPosts,
      shiftCoverage,
      startDate,
      statutoryResponsibility,
      operatingModel,
      assignedOwner,
      ownerDesk,
      ownerEmail,
      slaTarget,
      utm_source,
      utmSource,
      utm_medium,
      utmMedium,
      utm_campaign,
      utmCampaign,
      landing_url,
      landingUrl,
    } = req.body;

    // Validation
    if (!name || !email || !phone || !service) {
      res.status(400).json({
        success: false,
        message: "Required fields: name, email, phone, service",
      });
      return;
    }

    const currentYear = new Date().getFullYear();
    const effectiveLeadId = leadId?.trim() || generateCode("ACS", 5);
    const opportunityId = generateCode("OPP", 5);
    const clientId = generateClientId(organization, email);
    const citySlug = (city || "WB").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "KOL";
    const branchId = `BRN-${citySlug}-01`;

    // SLA Deadline calculation
    const isImmediate =
      (startDate && startDate.toLowerCase().indexOf("immediate") !== -1) ||
      (duration && duration.toLowerCase().indexOf("immediate") !== -1);
    const slaHours = isImmediate ? 4 : 24;
    const followUpDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    const recipientEmail = process.env.CONTACT_EMAIL || "advancedcorporatesecurityj@gmail.com";

    // ─── Save to MongoDB Atlas ───────────────────────────────
    const inquiry = new Inquiry({
      leadId: effectiveLeadId,
      clientId,
      branchId,
      opportunityId,
      name: name.trim(),
      organization: organization?.trim() || undefined,
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      service: service.trim(),
      city: city?.trim() || undefined,
      siteType: siteType?.trim() || undefined,
      numberOfPosts: numberOfPosts?.trim() || undefined,
      shiftCoverage: shiftCoverage?.trim() || undefined,
      startDate: startDate?.trim() || undefined,
      manpowerCount: manpowerCount ? Number(manpowerCount) : undefined,
      duration: duration?.trim() || undefined,
      message: message?.trim() || undefined,
      stage: "lead",
      status: "lead",
      assignedOwner: assignedOwner?.trim() || "Debabrata Sen",
      ownerDesk: ownerDesk?.trim() || "Eastern Industrial Operations Desk",
      ownerEmail: ownerEmail?.trim() || "enterprise.east@advancecorporatesecurity.com",
      slaTarget: slaTarget?.trim() || (isImmediate ? "Within 4 Hours (Priority Rapid Mobilisation SLA)" : "Within 24 Hours (Standard Enterprise SLA)"),
      followUpDeadline,
      isSlaBreached: false,
      stageHistory: [
        {
          stage: "lead",
          enteredAt: new Date(),
          changedBy: "web_intake_system",
          notes: "Inbound opportunity generated from web procurement portal",
        },
      ],
      statutoryResponsibility: statutoryResponsibility?.trim() || undefined,
      operatingModel: operatingModel || undefined,
      utmSource: (utm_source || utmSource)?.trim() || undefined,
      utmMedium: (utm_medium || utmMedium)?.trim() || undefined,
      utmCampaign: (utm_campaign || utmCampaign)?.trim() || undefined,
      landingUrl: (landing_url || landingUrl)?.trim() || undefined,
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    await inquiry.save();

    // ─── 2. Instant Response to Client (< 200ms) ───────────
    res.status(200).json({
      success: true,
      message: "Procurement inquiry received. Assigned account officer notified.",
      data: {
        id: inquiry._id,
        leadId: effectiveLeadId,
        opportunityId,
        clientId,
        branchId,
        stage: inquiry.stage,
        assignedOwner: inquiry.assignedOwner,
        ownerDesk: inquiry.ownerDesk,
        slaTarget: inquiry.slaTarget,
        followUpDeadline: inquiry.followUpDeadline,
      },
    });

    const adminHtml = buildEmailHtml(
      `New Enterprise Lead [${effectiveLeadId}]: ${organization || name}`,
      `
      <p><strong>Submitted at:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
      <p><strong>Lead Reference ID:</strong> <code style="font-size:14px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;">${effectiveLeadId}</code></p>
      <p><strong>Stable Opportunity ID:</strong> <code>${opportunityId}</code> | <strong>Client ID:</strong> <code>${clientId}</code></p>
      <p><strong>Assigned Account Desk:</strong> <strong>${inquiry.assignedOwner}</strong> (${inquiry.ownerDesk}) — <em>${inquiry.slaTarget}</em></p>
      <p><strong>Follow-Up Deadline:</strong> <strong>${followUpDeadline.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</strong></p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;width:35%;">Name</td><td style="padding:8px;border:1px solid #e5e7eb;">${name}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Organization</td><td style="padding:8px;border:1px solid #e5e7eb;">${organization || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Email</td><td style="padding:8px;border:1px solid #e5e7eb;"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Phone</td><td style="padding:8px;border:1px solid #e5e7eb;"><a href="tel:${phone}">${phone}</a></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Service Required</td><td style="padding:8px;border:1px solid #e5e7eb;">${service}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Site / Facility Type</td><td style="padding:8px;border:1px solid #e5e7eb;">${siteType || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">City / Location</td><td style="padding:8px;border:1px solid #e5e7eb;">${city || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Number of Posts</td><td style="padding:8px;border:1px solid #e5e7eb;">${numberOfPosts || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Shift Coverage</td><td style="padding:8px;border:1px solid #e5e7eb;">${shiftCoverage || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Target Start Date</td><td style="padding:8px;border:1px solid #e5e7eb;">${startDate || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Message / Scope</td><td style="padding:8px;border:1px solid #e5e7eb;">${message?.replace(/\n/g, "<br>") || "—"}</td></tr>
      </table>
      `
    );

    // ─── 3. Background Async Tasks (Google Sheet + Email) ───
    Promise.allSettled([
      appendToGoogleSheet({
        type: "inquiry",
        id: effectiveLeadId,
        opportunityId,
        clientId,
        name: name.trim(),
        organization: organization?.trim() || "",
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        service: service.trim(),
        city: city?.trim() || "",
        siteType: siteType?.trim() || "",
        numberOfPosts: numberOfPosts?.trim() || "",
        shiftCoverage: shiftCoverage?.trim() || "",
        manpowerCount: manpowerCount ? Number(manpowerCount) : undefined,
        startDate: startDate?.trim() || "",
        duration: duration?.trim() || "",
        message: message?.trim() || "",
        stage: "lead",
        assignedOwner: inquiry.assignedOwner,
        followUpDeadline: followUpDeadline.toISOString(),
        source: (landing_url || landingUrl || req.headers.referer || "website"),
      }),

      sendMail({
        to: recipientEmail,
        subject: `[ACS Enterprise Lead] ${effectiveLeadId} — ${organization || name} — ${city || "Location TBD"}`,
        html: adminHtml,
        replyTo: email,
      }),
    ]).catch((bgErr) => {
      console.error("[Inquiry Route] Background tasks error:", bgErr);
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/inquiries/pipeline (Aggregated Enterprise CRM Pipeline) ─
inquiryRouter.get("/pipeline", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const allInquiries = await Inquiry.find().select(
      "leadId opportunityId clientId organization name stage assignedOwner contractValueMonthlyINR contractValueAnnualINR followUpDeadline createdAt updatedAt isSlaBreached"
    );

    const now = new Date();
    const stageCounts: Record<string, { count: number; totalMonthlyValueINR: number }> = {};
    LIFECYCLE_STAGES.forEach((st) => {
      stageCounts[st] = { count: 0, totalMonthlyValueINR: 0 };
    });

    let totalActiveDeals = 0;
    let totalPipelineMonthlyINR = 0;
    let totalWonARR_INR = 0;
    let totalSlaBreached = 0;

    allInquiries.forEach((item) => {
      const currentStage = item.stage || "lead";
      const monthlyVal = item.contractValueMonthlyINR || 0;
      const annualVal = item.contractValueAnnualINR || monthlyVal * 12;

      if (stageCounts[currentStage]) {
        stageCounts[currentStage].count += 1;
        stageCounts[currentStage].totalMonthlyValueINR += monthlyVal;
      }

      if (currentStage !== "contract_lost") {
        totalActiveDeals += 1;
        totalPipelineMonthlyINR += monthlyVal;
      }

      if (currentStage === "contract_won" || currentStage === "active_deployment") {
        totalWonARR_INR += annualVal;
      }

      if (item.followUpDeadline && item.followUpDeadline < now && currentStage === "lead") {
        totalSlaBreached += 1;
      }
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalInquiries: allInquiries.length,
          totalActiveDeals,
          totalPipelineMonthlyINR,
          totalWonARR_INR,
          totalSlaBreached,
        },
        pipelineStages: stageCounts,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/inquiries/:id/stage (Lifecycle Stage Transition) ─────
inquiryRouter.patch("/:id/stage", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Inquiry / Opportunity not found" });
      return;
    }
    const {
      targetStage,
      changedBy = "operations_manager",
      notes,
      contractValueMonthlyINR,
      paymentCreditDays,
      headcountDeployed,
      assignedSupervisor,
      lostReason,
    } = req.body;

    if (!targetStage || LIFECYCLE_STAGES.indexOf(targetStage as LifecycleStage) === -1) {
      res.status(400).json({
        success: false,
        message: `Invalid stage. Must be one of: ${LIFECYCLE_STAGES.join(", ")}`,
      });
      return;
    }

    const inquiry = await Inquiry.findById(id);
    if (!inquiry) {
      res.status(404).json({ success: false, message: "Inquiry / Opportunity not found" });
      return;
    }

    // Gate Validations
    if (targetStage === "contract_won") {
      if (!contractValueMonthlyINR && !inquiry.contractValueMonthlyINR) {
        res.status(400).json({
          success: false,
          message: "Transition to 'contract_won' requires contractValueMonthlyINR.",
        });
        return;
      }
      if (!inquiry.contractId) {
        inquiry.contractId = generateCode("CON", 4);
      }
    }

    if (targetStage === "contract_lost" && !lostReason) {
      res.status(400).json({
        success: false,
        message: "Transition to 'contract_lost' requires a documented lostReason.",
      });
      return;
    }

    if ((targetStage === "mobilisation" || targetStage === "active_deployment") && !inquiry.deploymentId) {
      inquiry.deploymentId = generateCode("DEP", 4);
    }

    // Apply Commercial Updates if provided
    if (contractValueMonthlyINR !== undefined) {
      inquiry.contractValueMonthlyINR = Number(contractValueMonthlyINR);
      inquiry.contractValueAnnualINR = Number(contractValueMonthlyINR) * 12;
    }
    if (paymentCreditDays !== undefined) {
      inquiry.paymentCreditDays = Number(paymentCreditDays);
    }
    if (headcountDeployed !== undefined) {
      inquiry.headcountDeployed = Number(headcountDeployed);
    }
    if (assignedSupervisor !== undefined) {
      inquiry.assignedSupervisor = assignedSupervisor.trim();
    }
    if (lostReason !== undefined) {
      inquiry.lostReason = lostReason.trim();
    }

    // Record stage history
    inquiry.stageHistory.push({
      stage: targetStage as LifecycleStage,
      enteredAt: new Date(),
      changedBy: changedBy.trim(),
      notes: notes?.trim() || `Moved to ${targetStage}`,
    });

    inquiry.stage = targetStage as LifecycleStage;
    inquiry.status = targetStage;
    await inquiry.save();

    res.json({
      success: true,
      message: `Opportunity successfully moved to stage: ${targetStage}`,
      data: {
        id: inquiry._id,
        leadId: inquiry.leadId,
        opportunityId: inquiry.opportunityId,
        contractId: inquiry.contractId,
        deploymentId: inquiry.deploymentId,
        stage: inquiry.stage,
        stageHistory: inquiry.stageHistory,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/inquiries/:id (Detailed Single Opportunity) ────────────
inquiryRouter.get("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Inquiry not found" });
      return;
    }
    const inquiry = await Inquiry.findById(id);
    if (!inquiry) {
      res.status(404).json({ success: false, message: "Inquiry not found" });
      return;
    }
    res.json({ success: true, data: inquiry });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/inquiries (List with filtering) ────────────────────────
inquiryRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { stage, assignedOwner, limit = 100 } = req.query;
    const filter: Record<string, any> = {};
    if (stage) filter.stage = stage;
    if (assignedOwner) filter.assignedOwner = assignedOwner;

    const inquiries = await Inquiry.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .select("-__v");

    res.json({ success: true, count: inquiries.length, data: inquiries });
  } catch (err) {
    next(err);
  }
});
