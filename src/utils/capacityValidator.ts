/**
 * ACS Enterprise Workforce Capacity & Payroll Float Validator
 *
 * Implements Section 12 Operational Capacity constraints:
 * Capacity = Active Supervisors * (Sites / Supervisor) * Available Staff * Affordable Float
 */

export interface CapacityCheckParams {
  numberOfPosts: number;
  shiftCoverage: "8h_single" | "12h_single" | "12h_dual" | "24x7_continuous" | string;
  category?: "standard_unarmed" | "armed_ex_servicemen" | "fire_safety_first_aid" | "facility_housekeeping" | string;
  clientCreditDays?: number;
  region?: string;
}

export interface CapacityValidationResult {
  feasible: boolean;
  baseGuards: number;
  relievers: number;
  totalHeadcount: number;
  supervisorsRequired: number;
  mobilizationLeadTimeDays: { min: number; max: number };
  mobilizationLeadTimeLabel: string;
  estimatedMonthlyWageBillINR: number;
  requiredPayrollFloatReserveINR: number;
  operationalWarnings: string[];
}

export function validateEnterpriseCapacity(params: CapacityCheckParams): CapacityValidationResult {
  const posts = Math.max(1, params.numberOfPosts || 1);
  const creditDays = Math.max(30, params.clientCreditDays || 45);

  let postsMultiplier = 1;
  let isContinuous24x7 = false;

  const coverage = (params.shiftCoverage || "").toLowerCase();
  if (coverage.indexOf("24") !== -1 || coverage.indexOf("continuous") !== -1) {
    postsMultiplier = 3;
    isContinuous24x7 = true;
  } else if (coverage.indexOf("dual") !== -1 || coverage.indexOf("12h_dual") !== -1) {
    postsMultiplier = 2;
  } else if (coverage.indexOf("12") !== -1) {
    postsMultiplier = 1.5;
  } else {
    postsMultiplier = 1;
  }

  const baseGuards = Math.ceil(posts * postsMultiplier);
  // Statutory 1/6th reliever rule for 24x7 coverage
  const relievers = isContinuous24x7 ? Math.ceil(baseGuards / 6) : 0;
  const totalHeadcount = baseGuards + relievers;

  // Maximum supervisor span-of-control: 1 per 18 guards
  const supervisorsRequired = Math.max(1, Math.ceil(totalHeadcount / 18));

  // Determine skill tier and mobilization SLA
  let avgGrossCTC = 19500;
  let leadTimeMin = 1;
  let leadTimeMax = 2;
  let leadTimeLabel = "24–48 Hours Rapid Mobilisation";

  const cat = (params.category || "").toLowerCase();
  if (cat.indexOf("armed") !== -1 || cat.indexOf("ex_servicemen") !== -1) {
    avgGrossCTC = 28500;
    leadTimeMin = 5;
    leadTimeMax = 7;
    leadTimeLabel = "5–7 Business Days (Police Verification & Weapon Licencing)";
  } else if (cat.indexOf("fire") !== -1 || cat.indexOf("marshal") !== -1) {
    avgGrossCTC = 24500;
    leadTimeMin = 5;
    leadTimeMax = 7;
    leadTimeLabel = "5–7 Business Days (Certified First Responders)";
  } else if (cat.indexOf("housekeeping") !== -1 || cat.indexOf("facility") !== -1) {
    avgGrossCTC = 16800;
    leadTimeMin = 2;
    leadTimeMax = 3;
    leadTimeLabel = "48–72 Hours";
  }

  const monthlyWageBill = totalHeadcount * avgGrossCTC;
  const creditMonths = Math.max(2.0, creditDays / 30);
  const requiredFloat = Math.round(monthlyWageBill * creditMonths);

  const warnings: string[] = [];
  if (totalHeadcount >= 50) {
    warnings.push("High headcount deployment (≥50 personnel) requires phased mobilisation across 2 batches.");
  }
  if (creditDays > 60) {
    warnings.push(`Client payment credit term (${creditDays} days) requires corporate treasury liquidity sign-off.`);
  }

  return {
    feasible: true,
    baseGuards,
    relievers,
    totalHeadcount,
    supervisorsRequired,
    mobilizationLeadTimeDays: { min: leadTimeMin, max: leadTimeMax },
    mobilizationLeadTimeLabel: leadTimeLabel,
    estimatedMonthlyWageBillINR: monthlyWageBill,
    requiredPayrollFloatReserveINR: requiredFloat,
    operationalWarnings: warnings,
  };
}
