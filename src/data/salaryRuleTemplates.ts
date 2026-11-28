import { AdminSalaryRuleProfile } from "../models/admin/AdminFinance.model";
import { DEFAULT_SALARY_RULE_CONFIG, ISalaryRuleConfig } from "../services/payrollCalculation.service";

export interface SalaryRuleTemplateDef extends ISalaryRuleConfig {
  profileCode: string;
  profileName: string;
  siteMatchKeywords: string[];
  designationFilter?: string;
  notes: string;
}

function makeTemplate(
  profileCode: string,
  profileName: string,
  siteMatchKeywords: string[],
  overrides: Partial<ISalaryRuleConfig>,
  notes: string,
  designationFilter = ""
): SalaryRuleTemplateDef {
  return {
    ...DEFAULT_SALARY_RULE_CONFIG,
    ...overrides,
    profileCode,
    profileName,
    siteMatchKeywords,
    designationFilter,
    notes,
  };
}

/**
 * All 27+ pre-configured Salary Rule Profiles extracted from:
 * SALARY SHEET FOR THE MONTH OF OCT-26.xlsx (BALARAM..RAMKRISHNA + SOHAM Factory Sheet)
 */
export const ACS_SALARY_RULE_TEMPLATES: SalaryRuleTemplateDef[] = [
  makeTemplate(
    "STANDARD_DEFAULT",
    "ACS Standard Statutory Default",
    ["DEFAULT"],
    {},
    "Standard daily/monthly fallback profile with ₹15,000 EPF cap, ₹21,000 ESI cap & WB PT."
  ),
  makeTemplate(
    "BALARAM_CMOH",
    "Balaram Bose Hosp (CMOH)",
    ["BALARAM"],
    {
      wageBasis: "MONTHLY_DIV_26",
      otMethod: "NONE",
      bonusMode: "IN_GROSS",
      epfVariant: "UNCAPPED_12",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "UNCAPPED_075",
      deductPtFromEmployee: false,
    },
    "CMOH Hospital template: Monthly/26, 8.33% Bonus in Gross, Uncapped 12% PF & 0.75% ESI, PT NOT deducted from employee."
  ),
  makeTemplate(
    "B_N_BOSE_CMOH",
    "B. N. Bose Hosp (CMOH)",
    ["B N BOSE", "BN BOSE", "B.N. BOSE"],
    {
      wageBasis: "MONTHLY_DIV_26",
      otMethod: "NONE",
      bonusMode: "IN_GROSS",
      epfVariant: "UNCAPPED_12",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "UNCAPPED_075",
      deductPtFromEmployee: false,
    },
    "B N Bose CMOH: Monthly/26, Bonus in Gross, Uncapped PF & ESI, PT not deducted from employee."
  ),
  makeTemplate(
    "BARANAGAR_HOSP_CMOH",
    "Baranagar State Gen Hosp (CMOH)",
    ["BARANAGAR"],
    {
      wageBasis: "MONTHLY_DIV_26",
      otMethod: "NONE",
      bonusMode: "NONE",
      epfVariant: "UNCAPPED_12",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "UNCAPPED_075",
      deductPtFromEmployee: false,
    },
    "Baranagar CMOH: Monthly/26, Uncapped 12% PF & 0.75% ESI, PT not deducted from employee."
  ),
  makeTemplate(
    "PANIHATI_CMOH",
    "Panihati State Gen Hosp (CMOH)",
    ["PANIHATI"],
    {
      wageBasis: "MONTHLY_DIV_26",
      otMethod: "NONE",
      bonusMode: "IN_GROSS",
      epfVariant: "UNCAPPED_12",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "UNCAPPED_075",
      deductPtFromEmployee: false,
    },
    "Panihati CMOH: Monthly/26, 8.33% Bonus in Gross, Uncapped PF & ESI, PT not deducted."
  ),
  makeTemplate(
    "BARASAT_CLOSED_CMOH",
    "Barasat Closed / Hospital Unit (CMOH)",
    ["BARASAT CLOSED", "BARASAT HOSP"],
    {
      wageBasis: "MONTHLY_DIV_26",
      otMethod: "NONE",
      bonusMode: "NONE",
      epfVariant: "UNCAPPED_12",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "UNCAPPED_075",
      deductPtFromEmployee: false,
    },
    "Barasat Closed CMOH unit: Monthly/26, Uncapped PF & ESI, PT not deducted."
  ),
  makeTemplate(
    "NTS_CMOH",
    "NTS Unit (CMOH)",
    ["NTS"],
    {
      wageBasis: "MONTHLY_DIV_26",
      otMethod: "NONE",
      bonusMode: "NONE",
      epfVariant: "UNCAPPED_12",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "UNCAPPED_075",
      deductPtFromEmployee: false,
    },
    "NTS CMOH: Monthly/26, Uncapped PF & ESI, PT not deducted from employee."
  ),
  makeTemplate(
    "CBDT_MEDINIPUR",
    "CBDT Medinipur Income Tax",
    ["CBDT", "MEDINIPUR"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "NONE",
      bonusMode: "NONE",
      epfVariant: "UNCAPPED_12",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "UNCAPPED_075",
      deductPtFromEmployee: true,
    },
    "CBDT Medinipur: Daily rate 556, uncapped 12% PF & 0.75% ESI, WB PT deducted."
  ),
  makeTemplate(
    "RIFLE_RFI",
    "Rifle Factory Ishapore (RFI)",
    ["RIFLE", "RFI", "ISHAPORE"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "NONE",
      bonusMode: "IN_GROSS",
      bonusCapType: "WAGE_21000",
      epfVariant: "CAP_25000",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "CAP_21000",
      ptSlabType: "WB_SITE_VARIANT",
      deductPtFromEmployee: true,
    },
    "RIFLE (RFI): Daily rate (840/827), 8.33% Bonus capped at ₹21,000 in Gross, PF capped at ₹25,000, ESI capped at ₹21,000, WB PT deducted."
  ),
  makeTemplate(
    "CSTRI_MALDA",
    "CSTRI Malda",
    ["CSTRI", "MALDA"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "NONE",
      bonusMode: "NONE",
      epfVariant: "CAP_25000",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "CAP_21000",
      ptSlabType: "WB_SITE_VARIANT",
      deductPtFromEmployee: true,
    },
    "CSTRI Malda: Daily rate (794/760), revised ₹25,000 PF cap & ₹21,000 ESI cap, WB PT deducted."
  ),
  makeTemplate(
    "MSME_TOOL",
    "MSME Tool Room (Bonhooghly)",
    ["MSME", "TOOL ROOM", "CTTC"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "FLAT_OT_RATE",
      otFixedRate: 307.69,
      bonusMode: "IN_GROSS",
      bonusWageBase: "PRESENT_WAGES",
      epfVariant: "UNCAPPED_12",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "UNCAPPED_075",
      ptSlabType: "WB_SITE_VARIANT",
      deductPtFromEmployee: true,
      gemChargeMonthly: 400,
    },
    "MSME TOOL: Daily rate (414/338), flat OT ₹307.69/extra day, 8.33% Bonus in Gross, GeM Charge ₹400/26*(P+E)."
  ),
  makeTemplate(
    "GRSE",
    "GRSE (Garden Reach)",
    ["GRSE", "GARDEN REACH"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "DAILY_RATE_OT",
      allowanceMethod: "GRSE_5PCT_CANTEEN",
      grseAllowancePct: 5,
      canteenRatePerDay: 16,
      bonusMode: "NONE",
      epfVariant: "CAP_25000",
      esiVariant: "EXEMPT",
      deductPtFromEmployee: true,
    },
    "GRSE: Daily rate (1094/1111), 5% Allowance, Canteen ₹16/day informational, ₹25,000 EPF cap, ESI exempt, PT deducted."
  ),
  makeTemplate(
    "ERTL",
    "ERTL (Salt Lake)",
    ["ERTL"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "NONE",
      bonusMode: "NONE",
      epfVariant: "CAP_15000",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "EXEMPT",
      deductPtFromEmployee: true,
    },
    "ERTL: Daily rate 981, ₹15,000 EPF cap (max ₹1,800), ESI exempt, WB PT deducted."
  ),
  makeTemplate(
    "ICAR",
    "ICAR (ATARI / CIFRI / NINFET)",
    ["ICAR"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "HOURLY_DOUBLE_OT",
      bonusMode: "NONE",
      epfVariant: "CAP_25000",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "CAP_21000",
      ptSlabType: "WB_SITE_VARIANT",
      deductPtFromEmployee: true,
    },
    "ICAR: Daily rate (627/827), OT hours paid double ((Rate/8)*Hrs*2), ₹25,000 PF cap, ₹21,000 ESI cap, PT deducted."
  ),
  makeTemplate(
    "FSSAI",
    "FSSAI (Kolkata & BO Guwahati)",
    ["FSSAI"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "NONE",
      bonusMode: "OUTSIDE_GROSS",
      bonusCapType: "NONE",
      epfVariant: "UNCAPPED_12",
      epfWageBase: "GROSS",
      esiVariant: "UNCAPPED_075",
      ptSlabType: "WB_SITE_VARIANT",
      deductPtFromEmployee: true,
    },
    "FSSAI: Daily rate (1008 SG / 827 HK), 8.33% Bonus on Enhance shown OUTSIDE Gross, uncapped 12% PF & 0.75% ESI, PT deducted."
  ),
  makeTemplate(
    "TRSL_TITAGARH",
    "TRSL Titagarh (Titagarh Rail)",
    ["TRSL-TITAGARH", "TRSL TITAGARH", "TITAGARH", "TSL"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "HOURLY_SINGLE_MERGE",
      bonusMode: "NONE",
      epfVariant: "CAP_DAYS_26",
      esiVariant: "CAP_DAYS_30",
      deductPtFromEmployee: true,
    },
    "TRSL-TITAGARH: OT hours/8 merged into effective days, PF capped at 26*Rate, ESI capped at 30*Rate, PT deducted."
  ),
  makeTemplate(
    "TRSL_HINDMOTOR",
    "TRSL Hindmotor",
    ["TRSL-HINDMOTOR", "TRSL HINDMOTOR", "HINDMOTOR"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "SHIFT_RATIO_OT",
      shiftRatioNumerator: 3,
      shiftRatioDenominator: 8,
      bonusMode: "NONE",
      epfVariant: "CAP_DAYS_26",
      esiVariant: "CAP_DAYS_30",
      deductPtFromEmployee: true,
    },
    "TRSL-HINDMOTOR: Shift OT ratio (3/8 or 3/11) extra days, PF capped at 26*Rate, ESI capped at 30*Rate."
  ),
  makeTemplate(
    "BHEL",
    "BHEL Employees Housing",
    ["BHEL"],
    {
      wageBasis: "MONTHLY_DIV_30",
      otMethod: "NONE",
      allowanceMethod: "BHEL_ENHANCED",
      bhelEnhancedMonthly: 3908,
      bonusMode: "NONE",
      epfVariant: "CAP_25000",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "CAP_21000",
      ptSlabType: "WB_SITE_VARIANT",
      deductPtFromEmployee: true,
    },
    "BHEL: Monthly/30 (supports 32 days), Enhanced Allowance (2287+1621)/30*Days, PF cap ₹25k, ESI cap ₹21k, PT deducted."
  ),
  makeTemplate(
    "NSSO",
    "NSSO Unit",
    ["NSSO"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "NONE",
      bonusMode: "NONE",
      epfVariant: "CAP_25000",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "CAP_21000",
      ptSlabType: "WB_SITE_VARIANT",
      deductPtFromEmployee: true,
    },
    "NSSO: Daily rate 1024, ₹25,000 EPF cap, ₹21,000 ESI cap, WB PT deducted."
  ),
  makeTemplate(
    "CULTURE_BARASAT",
    "Culture Barasat",
    ["CULTURE", "BARASAT CULTURE"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "NONE",
      bonusMode: "OUTSIDE_GROSS",
      epfVariant: "FIXED_DAILY_399_26",
      esiVariant: "FIXED_DAILY_399_26",
      ptSlabType: "WB_SITE_VARIANT",
      deductPtFromEmployee: true,
    },
    "CULTURE BARASAT: Daily rate 406, Bonus outside Gross, statutory base MIN(399*Days, 399*26) for 12% PF & 0.75% ESI, PT deducted."
  ),
  makeTemplate(
    "NIELD",
    "NIELIT / NIELD",
    ["NIELIT", "NIELD"],
    {
      wageBasis: "MONTHLY_DIV_CALENDAR",
      otMethod: "NONE",
      bonusMode: "NONE",
      epfVariant: "CAP_25000",
      epfWageBase: "PRESENT_WAGES",
      esiVariant: "CAP_21000",
      ptSlabType: "WB_SITE_VARIANT",
      deductPtFromEmployee: true,
    },
    "NIELD/NIELIT: Monthly/Calendar days (10919.55/daysInMonth), ₹25k PF cap, ₹21k ESI cap, PT deducted."
  ),
  makeTemplate(
    "BEGDUBI",
    "Begdubi / Bangdubi Army Unit",
    ["BEGDUBI", "BANGDUBI"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "NONE",
      bonusMode: "NONE",
      epfVariant: "EMPLOYER_RATIO_DAYS",
      esiVariant: "UNCAPPED_075",
      epfWageBase: "PRESENT_WAGES",
      ptSlabType: "WB_SITE_VARIANT",
      deductPtFromEmployee: true,
      adminChargeMonthly: 3223,
    },
    "BEGDUBI: Daily rate (781/693), EPF (75/13*12)*PresentDays, uncapped 0.75% ESI, Admin Charge ₹3223/26*Days."
  ),
  makeTemplate(
    "PHE_MPDY",
    "PHE MPDY & Madhabpur",
    ["PHE MPDY", "PHE MADHABPUR", "MADHABPUR", "PHE", "PHED"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "DAILY_RATE_OT",
      bonusMode: "IN_GROSS",
      bonusCapType: "DAYS_26",
      epfVariant: "CAP_FULL_MONTH",
      esiVariant: "CAP_FULL_MONTH",
      deductPtFromEmployee: false,
    },
    "PHE MPDY/Madhabpur: Daily rate 487, Extra*Rate, Bonus capped at 26 days in Gross, PF/ESI capped at daysInMonth*Rate."
  ),
  makeTemplate(
    "PHE_NAKSA",
    "PHE Naksa",
    ["PHE NAKSA", "NAKSA"],
    {
      wageBasis: "DAILY_RATE",
      otMethod: "DAILY_RATE_OT",
      bonusMode: "IN_GROSS",
      bonusCapType: "DAYS_26",
      epfVariant: "CAP_FULL_MONTH",
      esiVariant: "CAP_FULL_MONTH",
      deductPtFromEmployee: true,
    },
    "PHE Naksa: Same as PHE MPDY with WB PT deducted from employee."
  ),
  makeTemplate(
    "RADHANIKETAN",
    "Radha Niketan",
    ["RADHA", "RADHANIKETAN", "NIKETAN"],
    {
      wageBasis: "MONTHLY_DIV_CALENDAR",
      otMethod: "DAILY_RATE_OT",
      bonusMode: "NONE",
      epfVariant: "EXEMPT",
      esiVariant: "EXEMPT",
      ptSlabType: "EXEMPT",
      deductPtFromEmployee: false,
    },
    "RADHANIKETAN: Monthly/CalendarDays, Extra at derived daily rate, EPF/ESI/PT Exempt."
  ),
  makeTemplate(
    "RAMKRISHNA",
    "Ramkrishna Multispeciality Hospital",
    ["RAMKRISHNA", "RKM"],
    {
      wageBasis: "MONTHLY_DIV_26",
      otMethod: "FLAT_OT_RATE",
      otFixedRate: 353,
      bonusMode: "NONE",
      epfVariant: "FIXED_6000_DIV_30",
      esiVariant: "FIXED_6000_DIV_30",
      deductPtFromEmployee: false,
    },
    "RAMKRISHNA: Monthly/26, flat Extra ₹353/duty, statutory PF/ESI calculated on fixed ₹6000/30*Days base."
  ),
  makeTemplate(
    "SOHAM_FACTORY",
    "Soham Factory Sheet (MVCC / Wire Mill / Troll Rod / Admin)",
    ["SOHAM", "MVCC", "WIRE MILL", "TROLL ROD"],
    {
      wageBasis: "MONTHLY_DIV_26",
      otMethod: "DAILY_RATE_OT",
      allowanceMethod: "SOHAM_FACTORY_SPLIT",
      bonusMode: "NONE",
      epfVariant: "SOHAM_BASIC_12",
      esiVariant: "SOHAM_EXCL_FUEL_WASHING",
      ptSlabType: "WB_SITE_VARIANT",
      deductPtFromEmployee: true,
    },
    "SOHAM Factory: Splits Gross into Basic/HRA/Uniform/Medical/Fuel/Washing + Balancing; PF=ROUND(Basic*12%); ESI=ROUNDUP((Gross-Fuel-Washing)*0.75%)."
  ),
];

let templatesSeedPromise: Promise<void> | null = null;

export async function ensureSalaryRuleTemplatesSeeded(): Promise<void> {
  if (!templatesSeedPromise) {
    templatesSeedPromise = (async () => {
      try {
        for (const tpl of ACS_SALARY_RULE_TEMPLATES) {
          await AdminSalaryRuleProfile.updateOne(
            { profileCode: tpl.profileCode },
            {
              $setOnInsert: {
                ...tpl,
                isTemplate: true,
                isActive: true,
                effectiveFrom: "2026-01-01",
              },
            },
            { upsert: true }
          );
        }
      } catch (err) {
        templatesSeedPromise = null;
        throw err;
      }
    })();
  }
  return templatesSeedPromise;
}

export async function resolveSalaryRuleForSite(params: {
  siteId?: string | null;
  siteName?: string;
  ruleProfileId?: string | null;
  designation?: string;
}) {
  await ensureSalaryRuleTemplatesSeeded();

  if (params.ruleProfileId) {
    const direct = await AdminSalaryRuleProfile.findById(params.ruleProfileId).lean();
    if (direct) return direct;
  }

  if (params.siteId) {
    const bySiteId = await AdminSalaryRuleProfile.findOne({
      siteId: params.siteId,
      isActive: true,
    })
      .sort({ effectiveFrom: -1, createdAt: -1 })
      .lean();
    if (bySiteId) return bySiteId;
  }

  const allActive = await AdminSalaryRuleProfile.find({ isActive: true }).lean();
  const cleanSite = (params.siteName || "").trim().toLowerCase();
  if (cleanSite) {
    const exactSite = allActive.find(
      (r) => r.siteName && r.siteName.trim().toLowerCase() === cleanSite
    );
    if (exactSite) return exactSite;

    // Keyword match picking the most specific (longest matching keyword)
    let bestMatch: (typeof allActive)[number] | null = null;
    let bestLen = 0;
    for (const r of allActive) {
      for (const kw of r.siteMatchKeywords || []) {
        const cleanKw = kw.trim().toLowerCase();
        if (cleanKw && cleanSite.includes(cleanKw) && cleanKw.length > bestLen) {
          bestLen = cleanKw.length;
          bestMatch = r;
        }
      }
    }
    if (bestMatch) return bestMatch;
  }

  return (
    allActive.find((r) => r.profileCode === "STANDARD_DEFAULT") ??
    allActive[0] ??
    {
      ...DEFAULT_SALARY_RULE_CONFIG,
      profileCode: "STANDARD_DEFAULT",
      profileName: "ACS Standard Statutory Default",
    }
  );
}
