import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ACS_BILLING_RULE_TEMPLATES } from "../data/billingRuleTemplates";
import { calculateSiteBill } from "../services/billingCalculation.service";

function getBillTpl(code: string) {
  const tpl = ACS_BILLING_RULE_TEMPLATES.find((t) => t.profileCode === code);
  assert.ok(tpl, `Missing billing rule template ${code}`);
  return tpl;
}

describe("Phase 6: ACS Site Billing Engine (5 Archetypes, 4 GST Regimes & Rounding Parity)", () => {
  it("Type 1 All-Inclusive & RCM GST-Stripping: BHELL (604.29×123 + 18% GST) & MSME S.G (514.29 / 1.18 RCM)", () => {
    const bhell = calculateSiteBill({
      lines: [{ label: "Security Guard", normalDays: 123, baseRate: 604.29 }],
      rule: getBillTpl("BHELL"),
    });
    assert.equal(bhell.wagesSubtotal, 74327.67);
    assert.equal(bhell.cgstAmount, 6689.49);
    assert.equal(bhell.sgstAmount, 6689.49);
    assert.equal(bhell.totalInvoiceAmount, 87706.65);

    const msmeSg = calculateSiteBill({
      lines: [{ label: "Security Guard (S.G)", normalDays: 631, baseRate: 514.29 }],
      rule: getBillTpl("MSME_SG"),
    });
    assert.equal(msmeSg.lineItems[0]?.effectiveBaseRate, 435.84); // 514.29 / 1.18
    assert.equal(msmeSg.wagesSubtotal, 275015.04); // 631 * 435.84
    assert.equal(msmeSg.totalGst, 0); // RCM
  });

  it("Type 2 Day-Rate Statutory Markup: CBDT (646.35×78), CULTURE (505.80×25) & BANGDUBI Chef (881.38×73)", () => {
    const cbdt = calculateSiteBill({
      lines: [{ label: "Security Guard", normalDays: 78, baseRate: 556 }],
      rule: getBillTpl("CBDT_INV"),
    });
    assert.equal(cbdt.lineItems[0]?.inclusiveRate, 646.35);
    assert.equal(cbdt.lineItems[0]?.lineAmount, 50415.3);
    assert.equal(cbdt.serviceChargeAmount, 1644.9);

    const culture = calculateSiteBill({
      lines: [{ label: "Security Guard", normalDays: 25, baseRate: 406 }],
      rule: getBillTpl("CULTURE_INV"),
    });
    assert.equal(culture.lineItems[0]?.inclusiveRate, 505.8);

    const bangdubiChef = calculateSiteBill({
      lines: [{ label: "Chef", normalDays: 73, baseRate: 781 }],
      rule: getBillTpl("BANGDUBI_CHEF"),
    });
    assert.equal(bangdubiChef.lineItems[0]?.inclusiveRate, 881.38);
  });

  it("Type 3 Monthly Pool Statutory: ERTL (7 heads × 15000 × 13%), FSSAI (ROUNDUP GST) & NIELIT (IGST 18%)", () => {
    const ertl = calculateSiteBill({
      lines: [{ label: "Security Guard", normalDays: 186, baseRate: 981, headcount: 7 }],
      rule: getBillTpl("ERTL_INV"),
    });
    assert.equal(ertl.wagesSubtotal, 182466);
    assert.equal(ertl.epfTotal, 13650); // 7 * 15000 * 13%
    assert.equal(ertl.esiTotal, 0);

    const fssai = calculateSiteBill({
      lines: [{ label: "SG + HK Pool", normalDays: 182, baseRate: 930.5 }],
      rule: getBillTpl("FSSAI_INV"),
    });
    assert.equal(fssai.cgstAmount, Math.ceil(fssai.taxableSubtotal * 0.09));
    assert.equal(fssai.sgstAmount, fssai.cgstAmount);

    const nielit = calculateSiteBill({
      lines: [{ label: "Security Guard", normalDays: 185, baseRate: 363.985 }],
      rule: getBillTpl("NIELIT_BIHAR"),
    });
    assert.equal(nielit.gstMode, "INTER_IGST");
    assert.equal(nielit.cgstAmount, 0);
    assert.ok(nielit.igstAmount > 0);
  });

  it("Type 4 Govt Works (-0.02% + GST + 1% Cess) & Type 5 Service-Charge-Only (SOHAM 8% RCM)", () => {
    const phe = calculateSiteBill({
      lines: [{ label: "PHE Multi-Month Guarding", normalDays: 100, baseRate: 686 }],
      rule: getBillTpl("PHE_WORKS"),
    });
    assert.equal(phe.wagesSubtotal, 68600);
    assert.equal(phe.govtDeductionAmount, 13.72); // 0.02% of 68600
    assert.equal(phe.taxableSubtotal, 68586.28);
    assert.ok(phe.cessAmount > 0); // 1% of (taxable + GST)
    assert.equal(phe.totalInvoiceAmount, Math.round(phe.preRoundTotal));

    const soham = calculateSiteBill({
      lines: [{ label: "Factory Wages Pool", normalDays: 1, baseRate: 5612.9 }],
      rule: getBillTpl("SOHAM_RCM"),
    });
    assert.equal(soham.serviceChargeAmount, 449.03);
    assert.equal(soham.totalGst, 0);
    assert.equal(soham.totalInvoiceAmount, 449);
  });
});
