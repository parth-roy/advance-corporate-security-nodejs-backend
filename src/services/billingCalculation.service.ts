import { SiteGstMode } from "../models/admin/AdminCore.model";
import { numberToIndianCurrencyWords } from "../utils/indianCurrencyWords";

export const BILLING_ARCHETYPES = [
  "ALL_INCLUSIVE_RATE",
  "DAY_RATE_STATUTORY_MARKUP",
  "MONTHLY_POOL_STATUTORY",
  "GOVT_WORKS_DEDUCT_CESS",
  "SERVICE_CHARGE_ONLY",
] as const;
export type BillingArchetype = (typeof BILLING_ARCHETYPES)[number];

export const POOL_STATUTORY_MODES = [
  "UNCAPPED",
  "CAPPED_25000_PER_WORKER",
  "HEADCOUNT_15000",
  "CAPPED_21000_PER_WORKER",
  "EXEMPT",
] as const;
export type PoolStatutoryMode = (typeof POOL_STATUTORY_MODES)[number];

export const BILLING_ROUND_MODES = ["ROUND", "ROUNDUP", "EXACT_PAISE"] as const;
export type BillingRoundMode = (typeof BILLING_ROUND_MODES)[number];

export interface IBillingRuleConfig {
  archetype: BillingArchetype;
  gstMode: SiteGstMode;
  sacCode: string;
  epfEmployerPct: number;
  edliPct: number;
  pfAdminPct: number;
  pfFixedPerDay: number;
  poolEpfMode: PoolStatutoryMode;
  esiEmployerPct: number;
  poolEsiMode: PoolStatutoryMode;
  bonusPct: number;
  serviceChargePct: number;
  stripGstFromTenderRate: boolean;
  tenderTaxPct: number;
  govtDeductionPct: number;
  cessPct: number;
  subtotalRoundMode: BillingRoundMode;
  gstRoundMode: BillingRoundMode;
  totalRoundMode: BillingRoundMode;
  includeFactoryActNote: boolean;
  interestRatePct: number;
}

export interface IBillingLineInput {
  label: string;
  designation?: string;
  normalDays: number;
  extraDays?: number;
  otHours?: number;
  otDivisor?: number;
  baseRate: number;
  headcount?: number;
}

export interface IBillingLineComputed {
  label: string;
  designation: string;
  normalDays: number;
  extraDays: number;
  otHours: number;
  totalDays: number;
  baseRate: number;
  effectiveBaseRate: number;
  inclusiveRate: number;
  epfAmount: number;
  esiAmount: number;
  bonusAmount: number;
  lineAmount: number;
}

export interface IBillingCalculationResult {
  archetype: BillingArchetype;
  gstMode: SiteGstMode;
  sacCode: string;
  lineItems: IBillingLineComputed[];
  totalBillableDays: number;
  wagesSubtotal: number;
  epfTotal: number;
  esiTotal: number;
  bonusTotal: number;
  statutoryTotal: number;
  govtDeductionAmount: number;
  serviceChargeAmount: number;
  taxableSubtotal: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalGst: number;
  cessAmount: number;
  preRoundTotal: number;
  roundOff: number;
  totalInvoiceAmount: number;
  amountInWords: string;
}

export const DEFAULT_BILLING_RULE_CONFIG: IBillingRuleConfig = {
  archetype: "ALL_INCLUSIVE_RATE",
  gstMode: "INTRA_CGST_SGST",
  sacCode: "998533",
  epfEmployerPct: 12,
  edliPct: 0.5,
  pfAdminPct: 0.5,
  pfFixedPerDay: 0,
  poolEpfMode: "UNCAPPED",
  esiEmployerPct: 3.25,
  poolEsiMode: "UNCAPPED",
  bonusPct: 0,
  serviceChargePct: 0,
  stripGstFromTenderRate: false,
  tenderTaxPct: 18,
  govtDeductionPct: 0,
  cessPct: 0,
  subtotalRoundMode: "EXACT_PAISE",
  gstRoundMode: "ROUND",
  totalRoundMode: "ROUND",
  includeFactoryActNote: false,
  interestRatePct: 24,
};

function r2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function roundWithMode(n: number, mode: BillingRoundMode): number {
  if (mode === "ROUNDUP") return Math.ceil(n);
  if (mode === "ROUND") return Math.round(n);
  return r2(n);
}

export function calculateSiteBill(params: {
  lines: IBillingLineInput[];
  rule: Partial<IBillingRuleConfig>;
}): IBillingCalculationResult {
  const rule: IBillingRuleConfig = { ...DEFAULT_BILLING_RULE_CONFIG, ...params.rule };
  const combinedPfPct = rule.epfEmployerPct + rule.edliPct + rule.pfAdminPct;

  const computedLines: IBillingLineComputed[] = [];
  let totalBillableDays = 0;
  let wagesSubtotal = 0;
  let epfTotal = 0;
  let esiTotal = 0;
  let bonusTotal = 0;

  for (const rawLine of params.lines) {
    const normalDays = Math.max(0, Number(rawLine.normalDays) || 0);
    const extraDays = Math.max(0, Number(rawLine.extraDays) || 0);
    const otHours = Math.max(0, Number(rawLine.otHours) || 0);
    const otDiv = rawLine.otDivisor && rawLine.otDivisor > 0 ? rawLine.otDivisor : 8;
    const totalDays = r2(normalDays + extraDays + otHours / otDiv);
    const baseRate = Math.max(0, Number(rawLine.baseRate) || 0);

    let effectiveBaseRate = baseRate;
    if (
      rule.archetype === "ALL_INCLUSIVE_RATE" &&
      rule.stripGstFromTenderRate &&
      rule.tenderTaxPct > 0
    ) {
      effectiveBaseRate = r2(baseRate / (1 + rule.tenderTaxPct / 100));
    }

    let linePf = 0;
    let lineEsi = 0;
    let lineBonus = 0;
    let inclusiveRate = effectiveBaseRate;
    let lineAmount = 0;

    if (rule.archetype === "ALL_INCLUSIVE_RATE") {
      lineAmount = r2(totalDays * effectiveBaseRate);
      wagesSubtotal += lineAmount;
    } else if (rule.archetype === "DAY_RATE_STATUTORY_MARKUP") {
      const pfPerDay =
        rule.pfFixedPerDay > 0 ? rule.pfFixedPerDay : r2((effectiveBaseRate * combinedPfPct) / 100);
      const esiPerDay =
        rule.poolEsiMode === "EXEMPT"
          ? 0
          : r2((effectiveBaseRate * rule.esiEmployerPct) / 100);
      const bonusPerDay =
        rule.bonusPct > 0 ? r2((effectiveBaseRate * rule.bonusPct) / 100) : 0;

      inclusiveRate = r2(effectiveBaseRate + pfPerDay + esiPerDay + bonusPerDay);
      const baseAmt = r2(totalDays * effectiveBaseRate);
      linePf = r2(totalDays * pfPerDay);
      lineEsi = r2(totalDays * esiPerDay);
      lineBonus = r2(totalDays * bonusPerDay);
      lineAmount = r2(totalDays * inclusiveRate);

      wagesSubtotal += baseAmt;
      epfTotal += linePf;
      esiTotal += lineEsi;
      bonusTotal += lineBonus;
    } else if (
      rule.archetype === "MONTHLY_POOL_STATUTORY" ||
      rule.archetype === "GOVT_WORKS_DEDUCT_CESS" ||
      rule.archetype === "SERVICE_CHARGE_ONLY"
    ) {
      lineAmount = r2(totalDays * effectiveBaseRate);
      wagesSubtotal += lineAmount;
    }

    totalBillableDays += totalDays;
    computedLines.push({
      label: rawLine.label,
      designation: rawLine.designation || rawLine.label,
      normalDays: r2(normalDays),
      extraDays: r2(extraDays),
      otHours: r2(otHours),
      totalDays,
      baseRate: r2(baseRate),
      effectiveBaseRate: r2(effectiveBaseRate),
      inclusiveRate: r2(inclusiveRate),
      epfAmount: r2(linePf),
      esiAmount: r2(lineEsi),
      bonusAmount: r2(lineBonus),
      lineAmount: r2(lineAmount),
    });
  }

  wagesSubtotal = roundWithMode(wagesSubtotal, rule.subtotalRoundMode);

  if (rule.archetype === "MONTHLY_POOL_STATUTORY") {
    const totalHeads = params.lines.reduce((s, l) => s + (l.headcount || 1), 0);
    if (rule.poolEpfMode === "EXEMPT") {
      epfTotal = 0;
    } else if (rule.poolEpfMode === "HEADCOUNT_15000") {
      epfTotal = roundWithMode((totalHeads * 15000 * combinedPfPct) / 100, rule.subtotalRoundMode);
    } else if (rule.poolEpfMode === "CAPPED_25000_PER_WORKER") {
      const cappedBase = computedLines.reduce(
        (s, l) => s + Math.min(25000, l.lineAmount),
        0
      );
      epfTotal = roundWithMode((cappedBase * combinedPfPct) / 100, rule.subtotalRoundMode);
    } else {
      epfTotal = roundWithMode((wagesSubtotal * combinedPfPct) / 100, rule.subtotalRoundMode);
    }

    if (rule.poolEsiMode === "EXEMPT") {
      esiTotal = 0;
    } else if (rule.poolEsiMode === "CAPPED_21000_PER_WORKER") {
      const cappedEsiBase = computedLines.reduce(
        (s, l) => s + Math.min(21000, l.lineAmount),
        0
      );
      esiTotal = roundWithMode((cappedEsiBase * rule.esiEmployerPct) / 100, rule.subtotalRoundMode);
    } else {
      esiTotal = roundWithMode((wagesSubtotal * rule.esiEmployerPct) / 100, rule.subtotalRoundMode);
    }

    if (rule.bonusPct > 0) {
      bonusTotal = roundWithMode((wagesSubtotal * rule.bonusPct) / 100, rule.subtotalRoundMode);
    }
  } else {
    epfTotal = roundWithMode(epfTotal, rule.subtotalRoundMode);
    esiTotal = roundWithMode(esiTotal, rule.subtotalRoundMode);
    bonusTotal = roundWithMode(bonusTotal, rule.subtotalRoundMode);
  }

  const statutoryTotal = r2(epfTotal + esiTotal + bonusTotal);
  const govtDeductionAmount =
    rule.archetype === "GOVT_WORKS_DEDUCT_CESS" && rule.govtDeductionPct > 0
      ? r2((wagesSubtotal * rule.govtDeductionPct) / 100)
      : 0;

  let serviceChargeBase = wagesSubtotal;
  if (rule.archetype === "DAY_RATE_STATUTORY_MARKUP" || rule.archetype === "MONTHLY_POOL_STATUTORY") {
    serviceChargeBase = r2(wagesSubtotal + statutoryTotal);
  }

  const serviceChargeAmount =
    rule.serviceChargePct > 0
      ? roundWithMode((serviceChargeBase * rule.serviceChargePct) / 100, rule.subtotalRoundMode)
      : 0;

  const taxableSubtotal =
    rule.archetype === "SERVICE_CHARGE_ONLY"
      ? r2(serviceChargeAmount)
      : rule.archetype === "GOVT_WORKS_DEDUCT_CESS"
        ? r2(wagesSubtotal - govtDeductionAmount + serviceChargeAmount)
        : roundWithMode(wagesSubtotal + statutoryTotal + serviceChargeAmount, rule.subtotalRoundMode);

  let cgstRate = 0;
  let sgstRate = 0;
  let igstRate = 0;
  if (rule.gstMode === "INTRA_CGST_SGST") {
    cgstRate = 9;
    sgstRate = 9;
  } else if (rule.gstMode === "INTER_IGST") {
    igstRate = 18;
  }

  const cgstAmount = cgstRate > 0 ? roundWithMode((taxableSubtotal * cgstRate) / 100, rule.gstRoundMode) : 0;
  const sgstAmount = sgstRate > 0 ? roundWithMode((taxableSubtotal * sgstRate) / 100, rule.gstRoundMode) : 0;
  const igstAmount = igstRate > 0 ? roundWithMode((taxableSubtotal * igstRate) / 100, rule.gstRoundMode) : 0;
  const totalGst = r2(cgstAmount + sgstAmount + igstAmount);

  const cessAmount =
    rule.archetype === "GOVT_WORKS_DEDUCT_CESS" && rule.cessPct > 0
      ? r2(((taxableSubtotal + totalGst) * rule.cessPct) / 100)
      : 0;

  const preRoundTotal = r2(taxableSubtotal + totalGst + cessAmount);
  const totalInvoiceAmount = roundWithMode(preRoundTotal, rule.totalRoundMode);
  const roundOff = r2(totalInvoiceAmount - preRoundTotal);

  return {
    archetype: rule.archetype,
    gstMode: rule.gstMode,
    sacCode: rule.sacCode,
    lineItems: computedLines,
    totalBillableDays: r2(totalBillableDays),
    wagesSubtotal: r2(wagesSubtotal),
    epfTotal: r2(epfTotal),
    esiTotal: r2(esiTotal),
    bonusTotal: r2(bonusTotal),
    statutoryTotal: r2(statutoryTotal),
    govtDeductionAmount: r2(govtDeductionAmount),
    serviceChargeAmount: r2(serviceChargeAmount),
    taxableSubtotal: r2(taxableSubtotal),
    cgstRate,
    cgstAmount: r2(cgstAmount),
    sgstRate,
    sgstAmount: r2(sgstAmount),
    igstRate,
    igstAmount: r2(igstAmount),
    totalGst: r2(totalGst),
    cessAmount: r2(cessAmount),
    preRoundTotal: r2(preRoundTotal),
    roundOff,
    totalInvoiceAmount,
    amountInWords: numberToIndianCurrencyWords(totalInvoiceAmount),
  };
}
