import { AdminBillingRuleProfile } from "../models/admin/AdminFinance.model";
import {
  DEFAULT_BILLING_RULE_CONFIG,
  IBillingRuleConfig,
} from "../services/billingCalculation.service";

export interface BillingRuleTemplateDef extends IBillingRuleConfig {
  profileCode: string;
  profileName: string;
  siteMatchKeywords: string[];
  subUnit?: string;
  notes: string;
}

function makeBillTpl(
  profileCode: string,
  profileName: string,
  siteMatchKeywords: string[],
  overrides: Partial<IBillingRuleConfig>,
  notes: string,
  subUnit = ""
): BillingRuleTemplateDef {
  return {
    ...DEFAULT_BILLING_RULE_CONFIG,
    ...overrides,
    profileCode,
    profileName,
    siteMatchKeywords,
    subUnit,
    notes,
  };
}

/**
 * All pre-configured Site Billing Rule Profiles extracted from:
 * INVOICE..OCT-26.xlsx & MSME OCT-26 BILL.xlsx
 */
export const ACS_BILLING_RULE_TEMPLATES: BillingRuleTemplateDef[] = [
  makeBillTpl(
    "STANDARD_INTRA",
    "ACS Standard Intra-State Tax Invoice (18% CGST+SGST)",
    ["DEFAULT"],
    {
      archetype: "ALL_INCLUSIVE_RATE",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998533",
    },
    "Default intra-state West Bengal (19) 9% CGST + 9% SGST billing template."
  ),
  makeBillTpl(
    "BHELL",
    "BHEL Employees Housing (All-Inclusive ₹604.29/day)",
    ["BHEL", "BHELL"],
    {
      archetype: "ALL_INCLUSIVE_RATE",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998533",
      totalRoundMode: "EXACT_PAISE",
      gstRoundMode: "EXACT_PAISE",
    },
    "BHEL Type 1: All-inclusive ₹604.29 × total duties (incl. relievers) + 9% CGST + 9% SGST."
  ),
  makeBillTpl(
    "HED",
    "HED Unit (RCM 0% GST All-Inclusive)",
    ["HED"],
    {
      archetype: "ALL_INCLUSIVE_RATE",
      gstMode: "RCM",
      sacCode: "998533",
    },
    "HED Type 1 under RCM: All-inclusive rates (636 / 750) with 0% GST on invoice (client RCM)."
  ),
  makeBillTpl(
    "TSL_TRSL",
    "Titagarh Rail / TSL (RCM 0% GST All-Inclusive)",
    ["TSL", "TRSL", "TITAGARH"],
    {
      archetype: "ALL_INCLUSIVE_RATE",
      gstMode: "RCM",
      sacCode: "998533",
    },
    "TSL Type 1 under RCM: 530.75 SG & 589.99 SS × duties with 0% GST (Reverse Charge)."
  ),
  makeBillTpl(
    "MSME_SS",
    "MSME Tool Room — Security Supervisor (RCM)",
    ["MSME S.S", "MSME SS", "MSME SUPERVISOR"],
    {
      archetype: "ALL_INCLUSIVE_RATE",
      gstMode: "RCM",
      sacCode: "998533",
    },
    "MSME S.S (Bill #26): Tender 15923.50/26 = ₹612.45/day × days under RCM.",
    "S.S"
  ),
  makeBillTpl(
    "MSME_SG",
    "MSME Tool Room — Security Guard (RCM GST-Stripped /1.18)",
    ["MSME", "MSME S.G", "MSME TOOL", "CTTC"],
    {
      archetype: "ALL_INCLUSIVE_RATE",
      gstMode: "RCM",
      sacCode: "998533",
      stripGstFromTenderRate: true,
      tenderTaxPct: 18,
    },
    "MSME S.G (Bill #27): Strips 18% GST from GeM tender rate (514.29 / 1.18 = 435.84) under RCM.",
    "S.G"
  ),
  makeBillTpl(
    "CBDT_INV",
    "CBDT Medinipur (Day Rate + Statutory + 3.2627% SC)",
    ["CBDT", "MEDINIPUR"],
    {
      archetype: "DAY_RATE_STATUTORY_MARKUP",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998533",
      epfEmployerPct: 12,
      edliPct: 0.5,
      pfAdminPct: 0.5,
      esiEmployerPct: 3.25,
      serviceChargePct: 3.2627,
      includeFactoryActNote: true,
    },
    "CBDT Type 2: Base 556 + 13% EPF/EDLI/Admin + 3.25% ESI = 646.35/day + 3.2627% SC + 18% GST + Factory Act note."
  ),
  makeBillTpl(
    "CULTURE_INV",
    "Culture Barasat (Day Rate + EPF/ESI + 8.33% Bonus)",
    ["CULTURE", "BARASAT CULTURE"],
    {
      archetype: "DAY_RATE_STATUTORY_MARKUP",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998533",
      epfEmployerPct: 12,
      edliPct: 0.5,
      pfAdminPct: 0.5,
      esiEmployerPct: 3.25,
      bonusPct: 8.33,
      serviceChargePct: 0.001,
      gstRoundMode: "EXACT_PAISE",
    },
    "Culture Barasat Type 2: Base 406 + 13% EPF + 3.25% ESI + 8.33% Bonus + 0.001% SC + 18% GST."
  ),
  makeBillTpl(
    "CSTRI_INV",
    "CSTRI Malda (Day Rate + Fixed ₹75 PF + 3.25% ESI + SC)",
    ["CSTRI", "MALDA"],
    {
      archetype: "DAY_RATE_STATUTORY_MARKUP",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998533",
      pfFixedPerDay: 75,
      edliPct: 0,
      pfAdminPct: 0,
      esiEmployerPct: 3.25,
      serviceChargePct: 3.2627,
      includeFactoryActNote: true,
    },
    "CSTRI Type 2: Base 794 + ₹75 fixed PF/day + 3.25% ESI + 3.2627% SC + 18% GST + Factory Act note."
  ),
  makeBillTpl(
    "BANGDUBI_CHEF",
    "Bangdubi Army — Chef (SAC 998519)",
    ["BANGDUBI CHEF", "BEGDUBI CHEF"],
    {
      archetype: "DAY_RATE_STATUTORY_MARKUP",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998519",
      pfFixedPerDay: 75,
      esiEmployerPct: 3.25,
      serviceChargePct: 3.2627,
      gstRoundMode: "EXACT_PAISE",
    },
    "Bangdubi Split Bill #18 (Chef): 781 + ₹75 PF + 25.38 ESI + 3.2627% SC + 18% GST.",
    "Chef"
  ),
  makeBillTpl(
    "BANGDUBI_HK",
    "Bangdubi Army — Housekeeping (SAC 998525)",
    ["BANGDUBI", "BEGDUBI"],
    {
      archetype: "DAY_RATE_STATUTORY_MARKUP",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998525",
      pfFixedPerDay: 75,
      esiEmployerPct: 3.25,
      serviceChargePct: 3.2627,
      gstRoundMode: "EXACT_PAISE",
    },
    "Bangdubi Split Bill #19 (HK): 693 + ₹75 PF + 22.52 ESI + 3.2627% SC + 18% GST.",
    "Housekeeping"
  ),
  makeBillTpl(
    "ICAR_INV",
    "ICAR — HK & Skilled (Incl. OT Hrs / 8)",
    ["ICAR"],
    {
      archetype: "DAY_RATE_STATUTORY_MARKUP",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998525",
      pfFixedPerDay: 75,
      esiEmployerPct: 3.25,
      serviceChargePct: 3.2627,
    },
    "ICAR Split Bills (#16 HK / #17 Skilled): Duties + OT_Hrs/8 with Statutory + 3.2627% SC + 18% GST."
  ),
  makeBillTpl(
    "FSSAI_INV",
    "FSSAI (ROUND Subtotal + ROUNDUP 9% CGST / 9% SGST)",
    ["FSSAI"],
    {
      archetype: "MONTHLY_POOL_STATUTORY",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998533",
      epfEmployerPct: 12,
      edliPct: 0.5,
      pfAdminPct: 0.5,
      esiEmployerPct: 3.25,
      bonusPct: 8.33,
      serviceChargePct: 3.2627,
      subtotalRoundMode: "ROUND",
      gstRoundMode: "ROUNDUP",
      totalRoundMode: "ROUND",
    },
    "FSSAI Type 3: Pool statutory with ROUND subtotal & ROUNDUP(9%) CGST/SGST."
  ),
  makeBillTpl(
    "RFI_INV",
    "Rifle Factory Ishapore (Exact Paise + 3.262712% SC)",
    ["RIFLE", "RFI", "ISHAPORE"],
    {
      archetype: "MONTHLY_POOL_STATUTORY",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998533",
      epfEmployerPct: 12,
      edliPct: 0.5,
      pfAdminPct: 0.5,
      esiEmployerPct: 3.25,
      bonusPct: 8.33,
      serviceChargePct: 3.262712,
      subtotalRoundMode: "EXACT_PAISE",
      gstRoundMode: "EXACT_PAISE",
      totalRoundMode: "EXACT_PAISE",
    },
    "RFI Type 3: Monthly pool (Normal + NH duties) + 13% PF + 3.25% ESI + 3.262712% SC + 18% GST in exact paise."
  ),
  makeBillTpl(
    "ERTL_INV",
    "ERTL Salt Lake (Headcount × 15000 × 13% PF Pool)",
    ["ERTL"],
    {
      archetype: "MONTHLY_POOL_STATUTORY",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998533",
      epfEmployerPct: 12,
      edliPct: 0.5,
      pfAdminPct: 0.5,
      poolEpfMode: "HEADCOUNT_15000",
      poolEsiMode: "EXEMPT",
      serviceChargePct: 3.262,
    },
    "ERTL Type 3: Pool EPF = Headcount × ₹15,000 × 13%, ESI exempt, 3.262% SC + 18% GST."
  ),
  makeBillTpl(
    "NSSO_INV",
    "NSSO (25k PF Cap, 21k ESI Cap + 3.262712% SC)",
    ["NSSO"],
    {
      archetype: "MONTHLY_POOL_STATUTORY",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998533",
      epfEmployerPct: 12,
      edliPct: 0.5,
      pfAdminPct: 0.5,
      poolEpfMode: "CAPPED_25000_PER_WORKER",
      esiEmployerPct: 3.25,
      poolEsiMode: "CAPPED_21000_PER_WORKER",
      serviceChargePct: 3.262712,
    },
    "NSSO Type 3: Worker ₹25k PF cap, ₹21k ESI cap, 3.262712% SC + 18% GST."
  ),
  makeBillTpl(
    "NIELIT_BIHAR",
    "NIELIT Bihta, Patna (Inter-State IGST 18% + 3.85% SC)",
    ["NIELIT", "NIELD", "PATNA", "BIHTA"],
    {
      archetype: "MONTHLY_POOL_STATUTORY",
      gstMode: "INTER_IGST",
      sacCode: "998533",
      epfEmployerPct: 12,
      edliPct: 0.5,
      pfAdminPct: 0.5,
      esiEmployerPct: 3.25,
      serviceChargePct: 3.85,
      gstRoundMode: "EXACT_PAISE",
    },
    "NIELIT Type 3 (State Code 10 Bihar): 3.85% Service Charge + 18% Inter-State IGST."
  ),
  makeBillTpl(
    "PHE_WORKS",
    "PHE Govt Works (-0.02% Deduct + 18% GST + 1% Cess)",
    ["PHE", "PHED"],
    {
      archetype: "GOVT_WORKS_DEDUCT_CESS",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998533",
      govtDeductionPct: 0.02,
      cessPct: 1,
      gstRoundMode: "EXACT_PAISE",
      totalRoundMode: "ROUND",
    },
    "PHE Type 4 (Multi-Month Supported): (Days × ₹686) - 0.02% Deduction + CGST 9% + SGST 9% + 1% Cess."
  ),
  makeBillTpl(
    "SOHAM_RCM",
    "Soham Factory (Service Charge 8% Only @ RCM 0%)",
    ["SOHAM", "MVCC", "WIRE MILL"],
    {
      archetype: "SERVICE_CHARGE_ONLY",
      gstMode: "RCM",
      sacCode: "998519",
      serviceChargePct: 8,
      totalRoundMode: "ROUND",
    },
    "SOHAM Type 5: Client pays wages directly; ACS invoices TotalWages × 8% under RCM (0% GST)."
  ),
  makeBillTpl(
    "RAMKRISHNA_NONGST",
    "Ramkrishna Multispeciality Hospital (Non-GST 0%)",
    ["RAMKRISHNA", "RKM"],
    {
      archetype: "ALL_INCLUSIVE_RATE",
      gstMode: "NON_GST",
      sacCode: "998533",
    },
    "Healthcare/Exempt institution billed at 0% Non-GST."
  ),
];

let billingTplPromise: Promise<void> | null = null;

export async function ensureBillingRuleTemplatesSeeded(): Promise<void> {
  if (!billingTplPromise) {
    billingTplPromise = (async () => {
      try {
        for (const tpl of ACS_BILLING_RULE_TEMPLATES) {
          await AdminBillingRuleProfile.updateOne(
            { profileCode: tpl.profileCode },
            {
              $setOnInsert: {
                ...tpl,
                isTemplate: true,
                isActive: true,
              },
            },
            { upsert: true }
          );
        }
      } catch (err) {
        billingTplPromise = null;
        throw err;
      }
    })();
  }
  return billingTplPromise;
}

export async function resolveBillingRuleForSite(params: {
  siteId?: string | null;
  siteName?: string;
  subUnit?: string;
  ruleProfileId?: string | null;
}) {
  await ensureBillingRuleTemplatesSeeded();

  if (params.ruleProfileId) {
    const direct = await AdminBillingRuleProfile.findById(params.ruleProfileId).lean();
    if (direct) return direct;
  }

  if (params.siteId) {
    const bySite = await AdminBillingRuleProfile.findOne({
      siteId: params.siteId,
      isActive: true,
      ...(params.subUnit ? { subUnit: params.subUnit } : {}),
    }).lean();
    if (bySite) return bySite;
  }

  const all = await AdminBillingRuleProfile.find({ isActive: true }).lean();
  const target = `${params.siteName || ""} ${params.subUnit || ""}`.trim().toLowerCase();
  if (target) {
    let best: (typeof all)[number] | null = null;
    let bestLen = 0;
    for (const r of all) {
      if (r.siteName && r.siteName.trim().toLowerCase() === (params.siteName || "").trim().toLowerCase()) {
        if (!params.subUnit || r.subUnit?.toLowerCase() === params.subUnit.toLowerCase()) {
          return r;
        }
      }
      for (const kw of r.siteMatchKeywords || []) {
        const cleanKw = kw.trim().toLowerCase();
        if (cleanKw && target.includes(cleanKw) && cleanKw.length > bestLen) {
          bestLen = cleanKw.length;
          best = r;
        }
      }
    }
    if (best) return best;
  }

  return (
    all.find((r) => r.profileCode === "STANDARD_INTRA") ??
    all[0] ?? {
      ...DEFAULT_BILLING_RULE_CONFIG,
      profileCode: "STANDARD_INTRA",
      profileName: "ACS Standard Intra-State Tax Invoice",
    }
  );
}
