export const WAGE_BASIS_TYPES = [
  "DAILY_RATE",
  "MONTHLY_DIV_26",
  "MONTHLY_DIV_30",
  "MONTHLY_DIV_CALENDAR",
] as const;
export type WageBasisType = (typeof WAGE_BASIS_TYPES)[number];

export const OT_CALC_METHODS = [
  "NONE",
  "FLAT_OT_RATE",
  "DAILY_RATE_OT",
  "HOURLY_DOUBLE_OT",
  "HOURLY_SINGLE_MERGE",
  "SHIFT_RATIO_OT",
] as const;
export type OtCalcMethod = (typeof OT_CALC_METHODS)[number];

export const ALLOWANCE_METHODS = [
  "NONE",
  "FIXED_ALLOWANCE",
  "BHEL_ENHANCED",
  "GRSE_5PCT_CANTEEN",
  "SOHAM_FACTORY_SPLIT",
] as const;
export type AllowanceMethod = (typeof ALLOWANCE_METHODS)[number];

export const BONUS_MODES = ["NONE", "IN_GROSS", "OUTSIDE_GROSS"] as const;
export type BonusMode = (typeof BONUS_MODES)[number];

export const BONUS_WAGE_BASES = ["PRESENT_WAGES", "PRESENT_PLUS_EXTRA"] as const;
export type BonusWageBase = (typeof BONUS_WAGE_BASES)[number];

export const BONUS_CAP_TYPES = ["NONE", "WAGE_21000", "DAYS_26"] as const;
export type BonusCapType = (typeof BONUS_CAP_TYPES)[number];

export const EPF_VARIANTS = [
  "UNCAPPED_12",
  "CAP_15000",
  "CAP_25000",
  "CAP_DAYS_26",
  "CAP_FULL_MONTH",
  "FIXED_DAILY_399_26",
  "EMPLOYER_RATIO_DAYS",
  "FIXED_6000_DIV_30",
  "SOHAM_BASIC_12",
  "EXEMPT",
] as const;
export type EpfVariant = (typeof EPF_VARIANTS)[number];

export const EPF_WAGE_BASES = [
  "PRESENT_WAGES",
  "PRESENT_PLUS_EXTRA",
  "GROSS",
] as const;
export type EpfWageBase = (typeof EPF_WAGE_BASES)[number];

export const ESI_VARIANTS = [
  "UNCAPPED_075",
  "CAP_21000",
  "CAP_DAYS_30",
  "CAP_FULL_MONTH",
  "FIXED_DAILY_399_26",
  "FIXED_6000_DIV_30",
  "SOHAM_EXCL_FUEL_WASHING",
  "EXEMPT",
] as const;
export type EsiVariant = (typeof ESI_VARIANTS)[number];

export const PT_SLAB_TYPES = ["WB_STANDARD", "WB_SITE_VARIANT", "EXEMPT"] as const;
export type PtSlabType = (typeof PT_SLAB_TYPES)[number];

export const PAYROLL_ROUND_MODES = ["ROUND", "ROUNDUP", "EXACT_PAISE"] as const;
export type PayrollRoundMode = (typeof PAYROLL_ROUND_MODES)[number];

export interface ISalaryRuleConfig {
  wageBasis: WageBasisType;
  otMethod: OtCalcMethod;
  otFixedRate: number;
  shiftRatioNumerator: number;
  shiftRatioDenominator: number;
  allowanceMethod: AllowanceMethod;
  fixedAllowanceMonthly: number;
  bhelEnhancedMonthly: number;
  grseAllowancePct: number;
  canteenRatePerDay: number;
  bonusMode: BonusMode;
  bonusWageBase: BonusWageBase;
  bonusRatePct: number;
  bonusCapType: BonusCapType;
  epfVariant: EpfVariant;
  epfWageBase: EpfWageBase;
  employerEpfRatePct: number;
  esiVariant: EsiVariant;
  employerEsiRatePct: number;
  ptSlabType: PtSlabType;
  deductPtFromEmployee: boolean;
  gemChargeMonthly: number;
  adminChargeMonthly: number;
  roundMode: PayrollRoundMode;
}

export interface IFactoryComponentsBreakdown {
  basic: number;
  hra: number;
  uniformAllowance: number;
  medical: number;
  fuel: number;
  washing: number;
  balancingAllowance: number;
}

export interface IPayrollCalcInput {
  rate: number;
  presentDays: number;
  extraDays?: number;
  otHours?: number;
  nhDays?: number;
  daysInMonth?: number;
  canteenDays?: number;
  fixedAllowanceOverride?: number;
  arrearAddition?: number;
  advanceDeduction?: number;
  uniformDeduction?: number;
  otherDeduction?: number;
  pfExemptEmployee?: boolean;
  esiExemptEmployee?: boolean;
  rule: Partial<ISalaryRuleConfig>;
}

export interface IPayrollCalcResult {
  daysInMonth: number;
  presentDays: number;
  extraDays: number;
  otHours: number;
  nhDays: number;
  effectiveTotalDays: number;
  dailyEquivalentRate: number;
  presentWages: number;
  extraDutyAmount: number;
  allowanceAmount: number;
  canteenAllowance: number;
  bonusInGross: number;
  bonusOutsideGross: number;
  grossSalary: number;
  epfWage: number;
  epfEmployee: number;
  epfEmployer: number;
  esiWage: number;
  esiEmployee: number;
  esiEmployer: number;
  ptComputed: number;
  ptDeducted: number;
  gemCharge: number;
  adminCharge: number;
  advanceDeduction: number;
  uniformDeduction: number;
  otherDeduction: number;
  arrearAddition: number;
  totalDeductions: number;
  exactNetPay: number;
  netPay: number;
  factoryComponents?: IFactoryComponentsBreakdown;
}

export const DEFAULT_SALARY_RULE_CONFIG: ISalaryRuleConfig = {
  wageBasis: "DAILY_RATE",
  otMethod: "DAILY_RATE_OT",
  otFixedRate: 0,
  shiftRatioNumerator: 3,
  shiftRatioDenominator: 8,
  allowanceMethod: "NONE",
  fixedAllowanceMonthly: 0,
  bhelEnhancedMonthly: 3908,
  grseAllowancePct: 5,
  canteenRatePerDay: 16,
  bonusMode: "NONE",
  bonusWageBase: "PRESENT_PLUS_EXTRA",
  bonusRatePct: 8.33,
  bonusCapType: "NONE",
  epfVariant: "CAP_15000",
  epfWageBase: "PRESENT_PLUS_EXTRA",
  employerEpfRatePct: 13,
  esiVariant: "CAP_21000",
  employerEsiRatePct: 3.25,
  ptSlabType: "WB_STANDARD",
  deductPtFromEmployee: true,
  gemChargeMonthly: 0,
  adminChargeMonthly: 0,
  roundMode: "ROUND",
};

function r2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function applyFinalRound(n: number, mode: PayrollRoundMode): number {
  if (mode === "ROUNDUP") return Math.ceil(n);
  if (mode === "ROUND") return Math.round(n);
  return r2(n);
}

export function computeWbProfessionalTax(grossWage: number, slabType: PtSlabType): number {
  if (slabType === "EXEMPT") return 0;
  if (slabType === "WB_SITE_VARIANT") {
    if (grossWage <= 20000) return 0;
    if (grossWage <= 30000) return 100;
    if (grossWage <= 50000) return 140;
    return 170;
  }
  // Standard West Bengal P.Tax Monthly Slab
  if (grossWage <= 10000) return 0;
  if (grossWage <= 15000) return 110;
  if (grossWage <= 25000) return 130;
  if (grossWage <= 40000) return 150;
  return 200;
}

export function calculateEmployeePayrollLine(input: IPayrollCalcInput): IPayrollCalcResult {
  const rule: ISalaryRuleConfig = { ...DEFAULT_SALARY_RULE_CONFIG, ...input.rule };
  const daysInMonth =
    input.daysInMonth && Number.isInteger(input.daysInMonth) && input.daysInMonth >= 28
      ? input.daysInMonth
      : 31;
  const rate = Math.max(0, Number(input.rate) || 0);
  const presentDays = Math.max(0, Number(input.presentDays) || 0);
  const rawExtraDays = Math.max(0, Number(input.extraDays) || 0);
  const otHours = Math.max(0, Number(input.otHours) || 0);
  const nhDays = Math.max(0, Number(input.nhDays) || 0);
  const arrearAddition = Math.max(0, Number(input.arrearAddition) || 0);
  const advanceDeduction = Math.max(0, Number(input.advanceDeduction) || 0);
  const uniformDeduction = Math.max(0, Number(input.uniformDeduction) || 0);
  const otherDeduction = Math.max(0, Number(input.otherDeduction) || 0);

  let dailyRate = rate;
  if (rule.wageBasis === "MONTHLY_DIV_26") dailyRate = rate / 26;
  else if (rule.wageBasis === "MONTHLY_DIV_30") dailyRate = rate / 30;
  else if (rule.wageBasis === "MONTHLY_DIV_CALENDAR") dailyRate = rate / daysInMonth;

  // Extra days derivation based on OT method
  let effectivePresentDays = presentDays;
  let effectiveExtraDays = rawExtraDays;
  let extraDutyAmount = 0;

  switch (rule.otMethod) {
    case "NONE":
      effectiveExtraDays = rawExtraDays;
      extraDutyAmount = 0;
      break;
    case "FLAT_OT_RATE":
      effectiveExtraDays = rawExtraDays;
      extraDutyAmount = rule.otFixedRate * effectiveExtraDays;
      break;
    case "DAILY_RATE_OT":
      effectiveExtraDays = rawExtraDays;
      extraDutyAmount = dailyRate * effectiveExtraDays;
      break;
    case "HOURLY_DOUBLE_OT": {
      const hrs = otHours > 0 ? otHours : rawExtraDays * 8;
      effectiveExtraDays = r2(hrs / 8);
      extraDutyAmount = (dailyRate / 8) * hrs * 2;
      break;
    }
    case "HOURLY_SINGLE_MERGE": {
      const mergedFromHours = otHours > 0 ? otHours / 8 : rawExtraDays;
      effectiveExtraDays = r2(mergedFromHours);
      effectivePresentDays = r2(presentDays + mergedFromHours);
      extraDutyAmount = 0;
      break;
    }
    case "SHIFT_RATIO_OT": {
      const den = rule.shiftRatioDenominator > 0 ? rule.shiftRatioDenominator : 8;
      const ratioDays = (presentDays * rule.shiftRatioNumerator) / den + rawExtraDays;
      effectiveExtraDays = r2(ratioDays);
      extraDutyAmount = dailyRate * ratioDays;
      break;
    }
  }

  const presentWages = dailyRate * effectivePresentDays;
  const effectiveTotalDays =
    rule.otMethod === "HOURLY_SINGLE_MERGE"
      ? effectivePresentDays
      : r2(presentDays + effectiveExtraDays);

  // Allowances & Canteen
  let allowanceAmount = 0;
  let canteenAllowance = 0;
  if (input.fixedAllowanceOverride !== undefined && input.fixedAllowanceOverride >= 0) {
    allowanceAmount = input.fixedAllowanceOverride;
  } else if (rule.allowanceMethod === "FIXED_ALLOWANCE") {
    allowanceAmount = rule.fixedAllowanceMonthly;
  } else if (rule.allowanceMethod === "BHEL_ENHANCED") {
    allowanceAmount = (rule.bhelEnhancedMonthly / 30) * presentDays;
  } else if (rule.allowanceMethod === "GRSE_5PCT_CANTEEN") {
    allowanceAmount = presentWages * (rule.grseAllowancePct / 100);
    const cDays = input.canteenDays !== undefined ? input.canteenDays : Math.min(26, presentDays);
    canteenAllowance = cDays * (rule.canteenRatePerDay || 16);
  }

  // Bonus calculation
  let bonusRaw = 0;
  if (rule.bonusMode !== "NONE") {
    const rawWagePool =
      rule.bonusWageBase === "PRESENT_WAGES"
        ? presentWages
        : presentWages + (rule.otMethod === "NONE" ? 0 : extraDutyAmount);
    let bonusWageBase = rawWagePool;
    if (rule.bonusCapType === "WAGE_21000") {
      bonusWageBase = Math.min(21000, rawWagePool);
    } else if (rule.bonusCapType === "DAYS_26") {
      bonusWageBase = Math.min(26 * dailyRate, effectiveTotalDays * dailyRate);
    }
    bonusRaw = bonusWageBase * ((rule.bonusRatePct || 8.33) / 100);
  }

  const bonusInGross = rule.bonusMode === "IN_GROSS" ? bonusRaw : 0;
  const bonusOutsideGross = rule.bonusMode === "OUTSIDE_GROSS" ? bonusRaw : 0;

  const grossSalary =
    presentWages + extraDutyAmount + allowanceAmount + bonusInGross + arrearAddition;

  // Optional SOHAM Factory Multi-Component Breakup
  let factoryComponents: IFactoryComponentsBreakdown | undefined;
  if (rule.allowanceMethod === "SOHAM_FACTORY_SPLIT") {
    const basic = r2((2800 / 26) * effectiveTotalDays);
    const hra = r2((3200 / 26) * effectiveTotalDays);
    const uniformAllowance = r2((3000 / 26) * effectiveTotalDays);
    const medical = r2((1250 / 26) * effectiveTotalDays);
    const fuel = r2((1650 / 26) * effectiveTotalDays);
    const washing = r2((1500 / 26) * effectiveTotalDays);
    const partialSum = basic + hra + uniformAllowance + medical + fuel + washing;
    const balancingAllowance = r2(Math.max(0, grossSalary - partialSum));
    factoryComponents = {
      basic,
      hra,
      uniformAllowance,
      medical,
      fuel,
      washing,
      balancingAllowance,
    };
  }

  // Statutory Wage Base selection for EPF
  const wagePoolForStatutory =
    rule.epfWageBase === "GROSS"
      ? grossSalary
      : rule.epfWageBase === "PRESENT_WAGES"
        ? presentWages
        : presentWages + extraDutyAmount;

  // EPF Employee (All 10 observed variants)
  let epfWage = 0;
  let epfEmployee = 0;
  if (!input.pfExemptEmployee && rule.epfVariant !== "EXEMPT") {
    switch (rule.epfVariant) {
      case "UNCAPPED_12":
        epfWage = wagePoolForStatutory;
        epfEmployee = epfWage * 0.12;
        break;
      case "CAP_15000":
        epfWage = Math.min(15000, wagePoolForStatutory);
        epfEmployee = epfWage * 0.12;
        break;
      case "CAP_25000":
        epfWage = Math.min(25000, wagePoolForStatutory);
        epfEmployee = epfWage * 0.12;
        break;
      case "CAP_DAYS_26":
        epfWage = Math.min(26 * dailyRate, effectiveTotalDays * dailyRate);
        epfEmployee = epfWage * 0.12;
        break;
      case "CAP_FULL_MONTH":
        epfWage = Math.min(daysInMonth * dailyRate, presentWages + extraDutyAmount);
        epfEmployee = epfWage * 0.12;
        break;
      case "FIXED_DAILY_399_26":
        epfWage = Math.min(399 * presentDays, 399 * 26);
        epfEmployee = epfWage * 0.12;
        break;
      case "EMPLOYER_RATIO_DAYS":
        epfEmployee = ((75 / 13) * 12) * presentDays;
        epfWage = r2(epfEmployee / 0.12);
        break;
      case "FIXED_6000_DIV_30":
        epfWage = (6000 / 30) * presentDays;
        epfEmployee = epfWage * 0.12;
        break;
      case "SOHAM_BASIC_12":
        epfWage = factoryComponents ? factoryComponents.basic : presentWages;
        epfEmployee = Math.round(epfWage * 0.12);
        break;
    }
  }
  const epfEmployer = epfWage > 0 ? epfWage * ((rule.employerEpfRatePct || 13) / 100) : 0;

  // ESI Employee (All 7/8 observed variants)
  let esiWage = 0;
  let esiEmployee = 0;
  if (!input.esiExemptEmployee && rule.esiVariant !== "EXEMPT") {
    switch (rule.esiVariant) {
      case "UNCAPPED_075":
        esiWage = wagePoolForStatutory;
        esiEmployee = esiWage * 0.0075;
        break;
      case "CAP_21000":
        esiWage = Math.min(21000, wagePoolForStatutory);
        esiEmployee = esiWage * 0.0075;
        break;
      case "CAP_DAYS_30":
        esiWage = Math.min(30 * dailyRate, presentWages + extraDutyAmount);
        esiEmployee = esiWage * 0.0075;
        break;
      case "CAP_FULL_MONTH":
        esiWage = Math.min(daysInMonth * dailyRate, presentWages + extraDutyAmount);
        esiEmployee = esiWage * 0.0075;
        break;
      case "FIXED_DAILY_399_26":
        esiWage = Math.min(399 * presentDays, 399 * 26);
        esiEmployee = esiWage * 0.0075;
        break;
      case "FIXED_6000_DIV_30":
        esiWage = (6000 / 30) * presentDays;
        esiEmployee = esiWage * 0.0075;
        break;
      case "SOHAM_EXCL_FUEL_WASHING": {
        const excluded = factoryComponents ? factoryComponents.fuel + factoryComponents.washing : 0;
        esiWage = Math.max(0, grossSalary - excluded);
        esiEmployee = Math.ceil(esiWage * 0.0075);
        break;
      }
    }
  }
  const esiEmployer =
    esiWage > 0
      ? rule.esiVariant === "SOHAM_EXCL_FUEL_WASHING"
        ? Math.ceil(esiWage * ((rule.employerEsiRatePct || 3.25) / 100))
        : esiWage * ((rule.employerEsiRatePct || 3.25) / 100)
      : 0;

  // WB PT & deductPtFromEmployee
  const ptComputed = computeWbProfessionalTax(grossSalary, rule.ptSlabType);
  const ptDeducted = rule.deductPtFromEmployee ? ptComputed : 0;

  // Special site charges (MSME Gem Charge & Begdubi Admin Charge)
  const gemCharge =
    rule.gemChargeMonthly > 0
      ? (rule.gemChargeMonthly / 26) * (presentDays + effectiveExtraDays)
      : 0;
  const adminCharge =
    rule.adminChargeMonthly > 0 ? (rule.adminChargeMonthly / 26) * presentDays : 0;

  const totalDeductions =
    epfEmployee +
    esiEmployee +
    ptDeducted +
    advanceDeduction +
    uniformDeduction +
    gemCharge +
    adminCharge +
    otherDeduction;

  const exactNetPay = Math.max(0, grossSalary - totalDeductions);
  const netPay = applyFinalRound(exactNetPay, rule.roundMode);

  return {
    daysInMonth,
    presentDays: r2(presentDays),
    extraDays: r2(effectiveExtraDays),
    otHours: r2(otHours),
    nhDays: r2(nhDays),
    effectiveTotalDays: r2(effectiveTotalDays),
    dailyEquivalentRate: r2(dailyRate),
    presentWages: r2(presentWages),
    extraDutyAmount: r2(extraDutyAmount),
    allowanceAmount: r2(allowanceAmount),
    canteenAllowance: r2(canteenAllowance),
    bonusInGross: r2(bonusInGross),
    bonusOutsideGross: r2(bonusOutsideGross),
    grossSalary: r2(grossSalary),
    epfWage: r2(epfWage),
    epfEmployee: r2(epfEmployee),
    epfEmployer: r2(epfEmployer),
    esiWage: r2(esiWage),
    esiEmployee: r2(esiEmployee),
    esiEmployer: r2(esiEmployer),
    ptComputed: r2(ptComputed),
    ptDeducted: r2(ptDeducted),
    gemCharge: r2(gemCharge),
    adminCharge: r2(adminCharge),
    advanceDeduction: r2(advanceDeduction),
    uniformDeduction: r2(uniformDeduction),
    otherDeduction: r2(otherDeduction),
    arrearAddition: r2(arrearAddition),
    totalDeductions: r2(totalDeductions),
    exactNetPay: r2(exactNetPay),
    netPay,
    ...(factoryComponents ? { factoryComponents } : {}),
  };
}
