import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ACS_SALARY_RULE_TEMPLATES } from "../data/salaryRuleTemplates";
import { calculateEmployeePayrollLine } from "../services/payrollCalculation.service";

function getTemplate(code: string) {
  const tpl = ACS_SALARY_RULE_TEMPLATES.find((t) => t.profileCode === code);
  assert.ok(tpl, `Missing salary rule template ${code}`);
  return tpl;
}

describe("Phase 5: ACS Site-Wise Payroll Calculation Engine (Excel Parity)", () => {
  it("BALARAM_CMOH: Monthly/26 + Bonus in Gross + Uncapped 12% PF + 0.75% ESI + PT NOT deducted from employee", () => {
    const res = calculateEmployeePayrollLine({
      rate: 10556,
      presentDays: 26,
      daysInMonth: 31,
      rule: getTemplate("BALARAM_CMOH"),
    });
    assert.equal(res.presentWages, 10556);
    assert.equal(res.bonusInGross, 879.31);
    assert.equal(res.grossSalary, 11435.31);
    assert.equal(res.epfEmployee, 1266.72);
    assert.equal(res.esiEmployee, 79.17);
    assert.equal(res.ptComputed, 110);
    assert.equal(res.ptDeducted, 0);
    assert.equal(res.netPay, 10089);
  });

  it("RIFLE_RFI: Daily 840 × 26 + 8.33% Bonus capped at ₹21,000 + PF capped at ₹25,000 + ESI capped at ₹21,000 + WB PT", () => {
    const res = calculateEmployeePayrollLine({
      rate: 840,
      presentDays: 26,
      daysInMonth: 31,
      rule: getTemplate("RIFLE_RFI"),
    });
    assert.equal(res.presentWages, 21840);
    assert.equal(res.bonusInGross, 1749.3); // 21000 * 8.33%
    assert.equal(res.epfEmployee, 2620.8); // 21840 * 12%
    assert.equal(res.esiEmployee, 157.5); // 21000 * 0.75%
    assert.equal(res.ptDeducted, 100);
    assert.equal(res.netPay, 20711);
  });

  it("MSME_TOOL: Flat OT ₹307.69/day + GeM Charge ₹400/26*(P+E) + Bonus in Gross", () => {
    const res = calculateEmployeePayrollLine({
      rate: 414,
      presentDays: 26,
      extraDays: 4,
      daysInMonth: 31,
      rule: getTemplate("MSME_TOOL"),
    });
    assert.equal(res.presentWages, 10764);
    assert.equal(res.extraDutyAmount, 1230.76);
    assert.equal(res.gemCharge, 461.54);
    assert.equal(res.ptDeducted, 0);

    const indradeo = calculateEmployeePayrollLine({
      rate: 338,
      presentDays: 26,
      extraDays: 37,
      daysInMonth: 31,
      rule: getTemplate("MSME_TOOL"),
    });
    assert.equal(indradeo.ptDeducted, 100);
  });

  it("ICAR: Hourly Double OT ((627 / 8) * 40 * 2 = ₹6,270) + ₹25k PF cap + ₹21k ESI cap", () => {
    const res = calculateEmployeePayrollLine({
      rate: 627,
      presentDays: 26,
      otHours: 40,
      daysInMonth: 31,
      rule: getTemplate("ICAR"),
    });
    assert.equal(res.presentWages, 16302);
    assert.equal(res.extraDutyAmount, 6270);
    assert.equal(res.grossSalary, 22572);
    assert.equal(res.epfEmployee, 1956.24); // 16302 * 12%
    assert.equal(res.esiEmployee, 122.27); // 16302 * 0.75%
  });

  it("TRSL_TITAGARH: OT hours/8 merged into effective days + 26-day EPF cap + 30-day ESI cap", () => {
    const res = calculateEmployeePayrollLine({
      rate: 489,
      presentDays: 26,
      otHours: 16,
      daysInMonth: 31,
      rule: getTemplate("TRSL_TITAGARH"),
    });
    assert.equal(res.effectiveTotalDays, 28); // 26 + 16/8
    assert.equal(res.presentWages, 13692); // 489 * 28
    assert.equal(res.epfWage, 12714); // 26 * 489 cap
    assert.equal(res.epfEmployee, 1525.68);
    assert.equal(res.esiWage, 13692); // within 30 * 489
    assert.equal(res.esiEmployee, 102.69);
  });

  it("SOHAM_FACTORY: 6-component split + PF ROUND(Basic*12%) + ESI ROUNDUP((Gross-Fuel-Washing)*0.75%)", () => {
    const res = calculateEmployeePayrollLine({
      rate: 18000,
      presentDays: 26,
      daysInMonth: 31,
      rule: getTemplate("SOHAM_FACTORY"),
    });
    assert.ok(res.factoryComponents);
    assert.equal(res.factoryComponents.basic, 2800);
    assert.equal(res.factoryComponents.hra, 3200);
    assert.equal(res.factoryComponents.uniformAllowance, 3000);
    assert.equal(res.factoryComponents.medical, 1250);
    assert.equal(res.factoryComponents.fuel, 1650);
    assert.equal(res.factoryComponents.washing, 1500);
    assert.equal(res.factoryComponents.balancingAllowance, 4600);
    assert.equal(res.epfEmployee, 336); // Math.round(2800 * 0.12)
    assert.equal(res.esiWage, 14850); // 18000 - 1650 - 1500
    assert.equal(res.esiEmployee, 112); // Math.ceil(14850 * 0.0075 = 111.375)
  });

  it("CULTURE_BARASAT, BEGDUBI, BHEL, GRSE, PHE, RAMKRISHNA & RADHANIKETAN edge rules", () => {
    const culture = calculateEmployeePayrollLine({
      rate: 406,
      presentDays: 25,
      rule: getTemplate("CULTURE_BARASAT"),
    });
    assert.equal(culture.presentWages, 10150);
    assert.equal(culture.bonusInGross, 0);
    assert.equal(culture.bonusOutsideGross, 845.5);
    assert.equal(culture.epfWage, 9975); // 399 * 25
    assert.equal(culture.epfEmployee, 1197);

    const begdubi = calculateEmployeePayrollLine({
      rate: 781,
      presentDays: 26,
      rule: getTemplate("BEGDUBI"),
    });
    assert.equal(begdubi.epfEmployee, 1800); // (75/13*12)*26
    assert.equal(begdubi.adminCharge, 3223);

    const bhel = calculateEmployeePayrollLine({
      rate: 10556,
      presentDays: 32,
      rule: getTemplate("BHEL"),
    });
    assert.equal(bhel.presentWages, 11259.73);
    assert.equal(bhel.allowanceAmount, 4168.53); // 3908 / 30 * 32

    const grse = calculateEmployeePayrollLine({
      rate: 1094,
      presentDays: 21,
      canteenDays: 21,
      rule: getTemplate("GRSE"),
    });
    assert.equal(grse.allowanceAmount, 1148.7);
    assert.equal(grse.canteenAllowance, 336);
    assert.equal(grse.esiEmployee, 0);

    const phe = calculateEmployeePayrollLine({
      rate: 487,
      presentDays: 26,
      extraDays: 4,
      daysInMonth: 31,
      rule: getTemplate("PHE_MPDY"),
    });
    assert.equal(phe.bonusInGross, 1054.74); // MIN(26*487, 30*487)*8.33% = 12662 * 0.0833
    assert.equal(phe.epfEmployee, 1753.2); // MIN(31*487, 30*487)*12%

    const rkm = calculateEmployeePayrollLine({
      rate: 12000,
      presentDays: 26,
      extraDays: 2,
      rule: getTemplate("RAMKRISHNA"),
    });
    assert.equal(rkm.extraDutyAmount, 706); // 353 * 2
    assert.equal(rkm.epfEmployee, 624); // (6000/30)*26*12%
    assert.equal(rkm.esiEmployee, 39); // (6000/30)*26*0.75%

    const radha = calculateEmployeePayrollLine({
      rate: 9000,
      presentDays: 31,
      daysInMonth: 31,
      rule: getTemplate("RADHANIKETAN"),
    });
    assert.equal(radha.presentWages, 9000);
    assert.equal(radha.epfEmployee, 0);
    assert.equal(radha.esiEmployee, 0);
    assert.equal(radha.ptDeducted, 0);
    assert.equal(radha.netPay, 9000);
  });
});
