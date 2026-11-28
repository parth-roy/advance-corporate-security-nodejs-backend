import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ACS_SALARY_RULE_TEMPLATES } from "../data/salaryRuleTemplates";
import { ACS_BILLING_RULE_TEMPLATES } from "../data/billingRuleTemplates";
import { calculateEmployeePayrollLine } from "../services/payrollCalculation.service";
import { calculateSiteBill } from "../services/billingCalculation.service";
import { normalizeOnboardingBatch } from "../services/onboardingImport.service";

function salaryTpl(code: string) {
  const found = ACS_SALARY_RULE_TEMPLATES.find((t) => t.profileCode === code);
  assert.ok(found, `Missing salary rule template: ${code}`);
  return found;
}

function billingTpl(code: string) {
  const found = ACS_BILLING_RULE_TEMPLATES.find((t) => t.profileCode === code);
  assert.ok(found, `Missing billing rule template: ${code}`);
  return found;
}

describe("Phase 7 (P7.2): October 2026 Ground-Truth Parity Suite (All 9 Core Sheets)", () => {
  it("1. BALARAM (CMOH): matches Row 5 (Anjan Goswami) and 15-staff sheet totals to the paise", () => {
    const row5 = calculateEmployeePayrollLine({
      rate: 10556,
      presentDays: 26,
      daysInMonth: 31,
      rule: salaryTpl("BALARAM_CMOH"),
    });
    assert.equal(row5.presentWages, 10556);
    assert.equal(row5.bonusInGross, 879.31);
    assert.equal(row5.grossSalary, 11435.31);
    assert.equal(row5.epfEmployee, 1266.72);
    assert.equal(row5.esiEmployee, 79.17);
    assert.equal(row5.ptDeducted, 0);
    assert.equal(row5.totalDeductions, 1345.89);
    assert.equal(row5.exactNetPay, 10089.42);
    assert.equal(row5.netPay, 10089);

    // Row 20 workbook totals across 15 identical 26-day guards
    assert.equal(Math.round(row5.presentWages * 15), 158340);
    assert.equal(Math.round(row5.epfEmployee * 15 * 10) / 10, 19000.8);
    assert.equal(Math.round(row5.esiEmployee * 15 * 100) / 100, 1187.55);
  });

  it("2. RIFLE (RFI): matches Payroll Row 5 & Row 19 plus Invoice ADV/NOV26/23 (₹12,17,745.46)", () => {
    const sujit = calculateEmployeePayrollLine({
      rate: 840,
      presentDays: 19,
      daysInMonth: 31,
      rule: salaryTpl("RIFLE_RFI"),
    });
    assert.equal(sujit.presentWages, 15960);
    assert.equal(sujit.bonusInGross, 1329.47);
    assert.equal(sujit.grossSalary, 17289.47);
    assert.equal(sujit.epfEmployee, 1915.2);
    assert.equal(sujit.esiEmployee, 119.7);
    assert.equal(sujit.ptDeducted, 0);
    assert.equal(sujit.totalDeductions, 2034.9);
    assert.equal(sujit.exactNetPay, 15254.57);

    const liton = calculateEmployeePayrollLine({
      rate: 840,
      presentDays: 20,
      daysInMonth: 31,
      rule: salaryTpl("RIFLE_RFI"),
    });
    assert.equal(liton.presentWages, 16800);
    assert.equal(liton.bonusInGross, 1399.44);
    assert.equal(liton.grossSalary, 18199.44);
    assert.equal(liton.epfEmployee, 2016);
    assert.equal(liton.esiEmployee, 126);
    assert.equal(liton.exactNetPay, 16057.44);

    // Invoice ADV/NOV26/23: 915 Normal + 40 NH = 955 duties @ 840
    const inv = calculateSiteBill({
      lines: [
        {
          label: "Manpower Outsourcing Services - Unskilled",
          normalDays: 915,
          extraDays: 40,
          baseRate: 840,
          headcount: 40,
        },
      ],
      rule: billingTpl("RFI_INV"),
    });
    assert.equal(inv.totalBillableDays, 955);
    assert.equal(inv.wagesSubtotal, 802200);
    assert.equal(inv.epfTotal, 104286);
    assert.equal(inv.esiTotal, 26071.5);
    assert.equal(inv.bonusTotal, 66823.26);
    assert.equal(inv.statutoryTotal, 197180.76);
    assert.equal(inv.serviceChargeAmount, 32606.92);
    assert.equal(inv.taxableSubtotal, 1031987.68);
    assert.equal(inv.cgstAmount, 92878.89);
    assert.equal(inv.sgstAmount, 92878.89);
    assert.equal(inv.totalInvoiceAmount, 1217745.46);
  });

  it("3. MSME TOOL: matches Payroll Row 5 (Vijay Sukla) & Row 6 (Indradeo Das) plus RCM Bills #26 & #27", () => {
    const vijay = calculateEmployeePayrollLine({
      rate: 414,
      presentDays: 26,
      extraDays: 5,
      daysInMonth: 31,
      fixedAllowanceOverride: 1500,
      rule: { ...salaryTpl("MSME_TOOL"), gemChargeMonthly: 0 },
    });
    assert.equal(vijay.presentWages, 10764);
    assert.equal(vijay.extraDutyAmount, 1538.45);
    assert.equal(vijay.allowanceAmount, 1500);
    assert.equal(vijay.bonusInGross, 896.64);
    assert.equal(vijay.grossSalary, 14699.09);
    assert.equal(vijay.epfEmployee, 1291.68);
    assert.equal(vijay.esiEmployee, 80.73);
    assert.equal(vijay.ptDeducted, 0);
    assert.equal(vijay.exactNetPay, 13326.68);

    const indradeo = calculateEmployeePayrollLine({
      rate: 338,
      presentDays: 26,
      extraDays: 37,
      daysInMonth: 31,
      rule: salaryTpl("MSME_TOOL"),
    });
    assert.equal(indradeo.presentWages, 8788);
    assert.equal(indradeo.extraDutyAmount, 11384.53);
    assert.equal(indradeo.bonusInGross, 732.04);
    assert.equal(indradeo.grossSalary, 20904.57);
    assert.equal(indradeo.epfEmployee, 1054.56);
    assert.equal(indradeo.esiEmployee, 65.91);
    assert.equal(indradeo.gemCharge, 969.23);
    assert.equal(indradeo.ptDeducted, 100);

    // MSME OCT-26 BILL.xlsx -> S.S Bill #26 & S.G Bill #27 (RCM)
    const billSs = calculateSiteBill({
      lines: [{ label: "Ex-Serv. Security Supervisor", normalDays: 31, baseRate: 612.45 }],
      rule: billingTpl("MSME_SS"),
    });
    assert.equal(billSs.wagesSubtotal, 18985.95);
    assert.equal(billSs.totalGst, 0);
    assert.equal(billSs.totalInvoiceAmount, 18986);

    const billSg = calculateSiteBill({
      lines: [{ label: "Security Guard", normalDays: 631, baseRate: 514.29 }],
      rule: billingTpl("MSME_SG"),
    });
    assert.equal(billSg.lineItems[0]?.effectiveBaseRate, 435.84);
    assert.equal(billSg.wagesSubtotal, 275015.04);
    assert.equal(billSg.totalGst, 0);
    assert.equal(billSg.totalInvoiceAmount, 275015);
  });

  it("4. FSSAI: matches Payroll Rows 5 & 8 (Bonus outside Gross, PT 100) and Invoice ADV/NOV26/15 (₹2,57,056)", () => {
    const chandan = calculateEmployeePayrollLine({
      rate: 1008,
      presentDays: 26,
      daysInMonth: 31,
      rule: salaryTpl("FSSAI"),
    });
    assert.equal(chandan.presentWages, 26208);
    assert.equal(chandan.bonusInGross, 0);
    assert.equal(chandan.bonusOutsideGross, 2183.13);
    assert.equal(chandan.grossSalary, 26208);
    assert.equal(chandan.epfEmployee, 3144.96);
    assert.equal(chandan.esiEmployee, 196.56);
    assert.equal(chandan.ptDeducted, 100);
    assert.equal(chandan.totalDeductions, 3441.52);
    assert.equal(chandan.exactNetPay, 22766.48);

    const mithun = calculateEmployeePayrollLine({
      rate: 827,
      presentDays: 26,
      daysInMonth: 31,
      rule: salaryTpl("FSSAI"),
    });
    assert.equal(mithun.presentWages, 21502);
    assert.equal(mithun.bonusOutsideGross, 1791.12);
    assert.equal(mithun.epfEmployee, 2580.24);
    assert.ok(Math.abs(mithun.esiEmployee - 161.265) <= 0.01);
    assert.equal(mithun.ptDeducted, 100);
    assert.ok(Math.abs(mithun.exactNetPay - 18660.495) <= 0.01);

    // Invoice ADV/NOV26/15: HK 78@827, SG KOL 78@1008, SG GUW 26@1008
    const inv = calculateSiteBill({
      lines: [
        { label: "Housekeeping", normalDays: 78, baseRate: 827, headcount: 3 },
        { label: "Security Services KOL", normalDays: 78, baseRate: 1008, headcount: 3 },
        { label: "Security Services GUWAHATI", normalDays: 26, baseRate: 1008, headcount: 1 },
      ],
      rule: billingTpl("FSSAI_INV"),
    });
    assert.equal(inv.totalBillableDays, 182);
    assert.equal(inv.wagesSubtotal, 169338);
    assert.equal(inv.serviceChargeAmount, 6883);
    assert.equal(inv.taxableSubtotal, 217844);
    assert.equal(inv.cgstAmount, 19606);
    assert.equal(inv.sgstAmount, 19606);
    assert.equal(inv.totalInvoiceAmount, 257056);
  });

  it("5. SOHAM: matches Factory component split, ROUND PF / ROUNDUP ESI & Invoice ADV/NOV26/29 (₹449)", () => {
    const factory = calculateEmployeePayrollLine({
      rate: 18000,
      presentDays: 26,
      daysInMonth: 31,
      rule: salaryTpl("SOHAM_FACTORY"),
    });
    assert.ok(factory.factoryComponents);
    assert.equal(factory.factoryComponents.basic, 2800);
    assert.equal(factory.factoryComponents.fuel, 1650);
    assert.equal(factory.factoryComponents.washing, 1500);
    assert.equal(factory.epfEmployee, 336);
    assert.equal(factory.esiEmployee, 112);
    assert.equal(factory.ptDeducted, 0);

    const inv = calculateSiteBill({
      lines: [
        {
          label: "Being The Bill for Supervisor",
          normalDays: 12,
          baseRate: 14500 / 31,
          headcount: 2,
        },
      ],
      rule: billingTpl("SOHAM_RCM"),
    });
    assert.equal(inv.serviceChargeAmount, 449.03);
    assert.equal(inv.totalGst, 0);
    assert.equal(inv.totalInvoiceAmount, 449);
  });

  it("6. PHE: matches PHE MPDY Row 5, PHE NAKSA Row 5 & both multi-month Govt Works invoices", () => {
    const mpdy = calculateEmployeePayrollLine({
      rate: 487,
      presentDays: 27,
      extraDays: 4,
      daysInMonth: 31,
      rule: salaryTpl("PHE_MPDY"),
    });
    assert.equal(mpdy.presentWages, 13149);
    assert.equal(mpdy.extraDutyAmount, 1948);
    assert.equal(mpdy.bonusInGross, 1054.74);
    assert.equal(mpdy.grossSalary, 16151.74);
    assert.equal(mpdy.epfEmployee, 1811.64);
    assert.equal(mpdy.esiEmployee, 113.23);
    assert.equal(mpdy.ptDeducted, 0);
    assert.equal(mpdy.exactNetPay, 14226.88);

    const naksa = calculateEmployeePayrollLine({
      rate: 487,
      presentDays: 27,
      extraDays: 4,
      daysInMonth: 31,
      rule: salaryTpl("PHE_NAKSA"),
    });
    assert.equal(naksa.ptDeducted, 130);
    assert.equal(naksa.totalDeductions, 2054.87);
    assert.equal(naksa.exactNetPay, 14096.88);

    // ADV/NOV26/25 (Jul-Aug 26: 1426 + 62 = 1488 mandays @ 686) -> ₹12,16,308
    const invJulAug = calculateSiteBill({
      lines: [
        { label: "Un-armed security guard", normalDays: 1426, baseRate: 686 },
        { label: "Armed security guard", normalDays: 62, baseRate: 686 },
      ],
      rule: billingTpl("PHE_WORKS"),
    });
    assert.equal(invJulAug.wagesSubtotal, 1020768);
    assert.equal(invJulAug.govtDeductionAmount, 204.15);
    assert.equal(invJulAug.taxableSubtotal, 1020563.85);
    assert.equal(invJulAug.cgstAmount, 91850.75);
    assert.equal(invJulAug.sgstAmount, 91850.75);
    assert.equal(invJulAug.cessAmount, 12042.65);
    assert.equal(invJulAug.totalInvoiceAmount, 1216308);

    // ADV/NOV26/30 (Sep-Oct 26: 1403 + 61 = 1464 mandays @ 686) -> ₹11,96,690
    const invSepOct = calculateSiteBill({
      lines: [
        { label: "Un-armed security guard", normalDays: 1403, baseRate: 686 },
        { label: "Armed security guard", normalDays: 61, baseRate: 686 },
      ],
      rule: billingTpl("PHE_WORKS"),
    });
    assert.equal(invSepOct.wagesSubtotal, 1004304);
    assert.equal(invSepOct.govtDeductionAmount, 200.86);
    assert.equal(invSepOct.taxableSubtotal, 1004103.14);
    assert.equal(invSepOct.cgstAmount, 90369.28);
    assert.equal(invSepOct.sgstAmount, 90369.28);
    assert.equal(invSepOct.cessAmount, 11848.42);
    assert.equal(invSepOct.totalInvoiceAmount, 1196690);
  });

  it("7. NIELIT (NIELD): matches Payroll Rows 5 & 6 plus Inter-State IGST Invoice ADV/NOV26/12 (₹95,926)", () => {
    const bipin = calculateEmployeePayrollLine({
      rate: 10919.55,
      presentDays: 31,
      daysInMonth: 31,
      rule: salaryTpl("NIELD"),
    });
    assert.equal(bipin.presentWages, 10919.55);
    assert.equal(bipin.epfEmployee, 1310.35);
    assert.equal(bipin.esiEmployee, 81.9);
    assert.equal(bipin.ptDeducted, 0);
    assert.equal(bipin.exactNetPay, 9527.31);

    const ravi = calculateEmployeePayrollLine({
      rate: 10919.55,
      presentDays: 30,
      daysInMonth: 31,
      rule: salaryTpl("NIELD"),
    });
    assert.equal(ravi.presentWages, 10567.31);
    assert.equal(ravi.epfEmployee, 1268.08);
    assert.equal(ravi.esiEmployee, 79.25);
    assert.equal(ravi.ptDeducted, 0);
    assert.equal(ravi.exactNetPay, 9219.97);

    // 5 staff * 31 + 1 staff * 30 = 185 duty days @ 10919.55 / 30
    const inv = calculateSiteBill({
      lines: [
        {
          label: "Watch and Ward (Fixed Remuneration)",
          normalDays: 185,
          baseRate: 10919.55 / 30,
          headcount: 6,
        },
      ],
      rule: billingTpl("NIELIT_BIHAR"),
    });
    assert.equal(inv.gstMode, "INTER_IGST");
    assert.equal(inv.wagesSubtotal, 67337.22);
    assert.equal(inv.epfTotal, 8753.84);
    assert.equal(inv.esiTotal, 2188.46);
    assert.equal(inv.serviceChargeAmount, 3013.76);
    assert.equal(inv.taxableSubtotal, 81293.28);
    assert.equal(inv.cgstAmount, 0);
    assert.equal(inv.sgstAmount, 0);
    assert.equal(inv.igstAmount, 14632.79);
    assert.equal(inv.totalInvoiceAmount, 95926);
  });

  it("8. BEGDUBI / BANGDUBI: matches Payroll Rows 5 & 6 plus Split Invoices ADV/NOV26/18 (₹78,399) & 19 (₹23,118)", () => {
    const sourav = calculateEmployeePayrollLine({
      rate: 781,
      presentDays: 3,
      daysInMonth: 31,
      rule: salaryTpl("BEGDUBI"),
    });
    assert.equal(sourav.presentWages, 2343);
    assert.equal(sourav.epfEmployee, 207.69);
    assert.equal(sourav.esiEmployee, 17.57);
    assert.equal(sourav.adminCharge, 371.88);
    assert.equal(sourav.ptDeducted, 0);
    assert.equal(sourav.exactNetPay, 1745.85);

    const bhim = calculateEmployeePayrollLine({
      rate: 781,
      presentDays: 24,
      daysInMonth: 31,
      rule: salaryTpl("BEGDUBI"),
    });
    assert.equal(bhim.presentWages, 18744);
    assert.equal(bhim.epfEmployee, 1661.54);
    assert.equal(bhim.esiEmployee, 140.58);
    assert.equal(bhim.adminCharge, 2975.08);
    assert.equal(bhim.ptDeducted, 0);
    assert.equal(bhim.exactNetPay, 13966.8);

    const chefInv = calculateSiteBill({
      lines: [{ label: "Chef (Semi-skilled)", normalDays: 73, baseRate: 781, headcount: 4 }],
      rule: billingTpl("BANGDUBI_CHEF"),
    });
    assert.equal(chefInv.lineItems[0]?.inclusiveRate, 881.38);
    assert.equal(chefInv.lineItems[0]?.lineAmount, 64340.74);
    assert.equal(chefInv.totalInvoiceAmount, 78399);

    const hkInv = calculateSiteBill({
      lines: [{ label: "Housekeeping (Unskilled)", normalDays: 24, baseRate: 693, headcount: 1 }],
      rule: billingTpl("BANGDUBI_HK"),
    });
    assert.equal(hkInv.lineItems[0]?.inclusiveRate, 790.52);
    assert.equal(hkInv.lineItems[0]?.lineAmount, 18972.48);
    assert.equal(hkInv.totalInvoiceAmount, 23118);
  });

  it("9. CULTURE BARASAT: matches Payroll Row 5 (Shibnath Saha, ₹9,233.32) & Invoice ADV/NOV26/24 (₹14,921)", () => {
    const shibnath = calculateEmployeePayrollLine({
      rate: 406,
      presentDays: 26,
      daysInMonth: 31,
      rule: salaryTpl("CULTURE_BARASAT"),
    });
    assert.equal(shibnath.presentWages, 10556);
    assert.equal(shibnath.bonusInGross, 0);
    assert.equal(shibnath.bonusOutsideGross, 879.31);
    assert.equal(shibnath.epfEmployee, 1244.88);
    assert.ok(Math.abs(shibnath.esiEmployee - 77.805) <= 0.01);
    assert.equal(shibnath.ptDeducted, 0);
    assert.ok(Math.abs(shibnath.exactNetPay - 9233.315) <= 0.01);

    const inv = calculateSiteBill({
      lines: [{ label: "Security Guard", normalDays: 25, baseRate: 406, headcount: 1 }],
      rule: billingTpl("CULTURE_INV"),
    });
    assert.equal(inv.lineItems[0]?.inclusiveRate, 505.8);
    assert.equal(inv.totalInvoiceAmount, 14921);
  });
});

describe("Phase 7 (P7.1): Onboarding Batch Normalization & Validation Helpers", () => {
  it("normalizes Sites, 500+ Employees, Opening Advances & Unpaid Dress EMIs and captures row errors", () => {
    const bulkEmployees = Array.from({ length: 450 }, (_, i) => ({
      legacyEmpCode: String(1781 + i),
      fullName: `Guard Worker ${i + 1}`,
      siteName: i % 2 === 0 ? "MSME TOOL ROOM" : "NIELIT PATNA",
      designation: i % 3 === 0 ? "Supervisor" : "Security Guard",
      rateType: "Daily",
      baseRate: "414",
      uanNumber: `1009000${String(i).padStart(5, "0")}`,
      esiNumber: `3100${String(i).padStart(6, "0")}`,
      ifscCode: "utib0000436",
    }));

    const batch = normalizeOnboardingBatch({
      defaultMonthKey: "2026-10",
      sites: [
        {
          siteName: "NIELIT PATNA",
          clientGstin: "10AAATD0315M1ZC",
          gstMode: "IGST 18%",
          subUnits: "PATNA CAMPUS | BIHTA",
          serviceChargePct: "3.85",
        },
        { siteName: "" },
      ],
      employees: [...bulkEmployees, { fullName: "Missing Site", siteName: "" }],
      openingAdvances: [
        {
          legacyEmpCode: "1781",
          onAccountOf: "MSME TOOL ROOM",
          date: "07-11-2026",
          amount: "5000",
          recoveredAmount: "1500",
          recoveryMode: "EMI",
          installmentCount: 4,
        },
        {
          legacyEmpCode: "1782",
          onAccountOf: "MSME TOOL ROOM",
          amount: "0",
        },
      ],
      openingUniformPlans: [
        {
          legacyEmpCode: "3065",
          employeeName: "SANTOH PRASDA",
          siteName: "MSME TOOL ROOM",
          totalCharge: 2500,
          recoveredAmount: 625,
          installmentCount: 4,
        },
      ],
    });

    assert.equal(batch.sites.length, 1);
    assert.equal(batch.sites[0]?.stateCode, "10");
    assert.equal(batch.sites[0]?.gstMode, "INTER_IGST");
    assert.deepEqual(batch.sites[0]?.subUnits, ["PATNA CAMPUS", "BIHTA"]);

    assert.equal(batch.employees.length, 450);
    assert.equal(batch.employees[0]?.deptPrefix, "SEC");
    assert.equal(batch.employees[0]?.rateType, "DAILY");
    assert.equal(batch.employees[0]?.ifscCode, "UTIB0000436");
    assert.equal(batch.employees[0]?.esiHolder, "Yes");

    assert.equal(batch.openingAdvances.length, 1);
    assert.equal(batch.openingAdvances[0]?.remainingBalance, 3500);
    assert.equal(batch.openingAdvances[0]?.status, "PARTIAL");
    assert.equal(batch.openingAdvances[0]?.monthlyAmount, 875);
    assert.equal(batch.openingAdvances[0]?.date, "2026-11-07");

    assert.equal(batch.openingUniformPlans.length, 1);
    assert.equal(batch.openingUniformPlans[0]?.remainingBalance, 1875);
    assert.equal(batch.openingUniformPlans[0]?.status, "ACTIVE");
    assert.equal(batch.openingUniformPlans[0]?.monthlyAmount, 469);

    assert.equal(batch.errors.length, 3);
  });
});
