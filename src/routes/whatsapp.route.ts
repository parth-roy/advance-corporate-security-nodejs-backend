import { Router, Request, Response, NextFunction } from "express";
import { appendWhatsAppMessage } from "../utils/googleSheets";

export const whatsappRouter = Router();

whatsappRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      name,
      fullName,
      phone,
      contactNumber,
      intent,
      service,
      deploymentLocation,
      location,
      headcount,
      guardsCount,
      manCount,
      organization,
      premises,
      supportOrg,
      city,
      source,
    } = req.body;

    const cleanName = (name || fullName || "").trim();
    const cleanPhone = (phone || contactNumber || "").trim();
    const cleanIntent = (intent || "SECURITY").trim();
    const cleanService = (service || "General").trim();
    const cleanLocation = (deploymentLocation || location || city || "Pan-India").trim();
    const cleanHeadcount = (headcount || guardsCount || manCount || "").trim();
    const cleanOrg = (organization || premises || supportOrg || "").trim();
    const cleanCity = (city || "").trim();

    // Respond immediately (< 50ms) so client is never blocked
    res.status(200).json({
      success: true,
      message: "WhatsApp intent logged successfully",
      data: {
        name: cleanName,
        phone: cleanPhone,
        intent: cleanIntent,
        service: cleanService,
        deploymentLocation: cleanLocation,
      },
    });

    // Fire-and-forget sync to Google Sheets "WhatsApp Messages" tab
    appendWhatsAppMessage({
      name: cleanName,
      phone: cleanPhone,
      intent: cleanIntent as any,
      service: cleanService,
      deploymentLocation: cleanLocation,
      headcount: cleanHeadcount,
      organization: cleanOrg,
      city: cleanCity,
      source: source || "website_whatsapp_modal",
    }).catch((err) => {
      console.error("[WhatsApp Route] Google Sheets log error:", err);
    });
  } catch (err) {
    next(err);
  }
});
