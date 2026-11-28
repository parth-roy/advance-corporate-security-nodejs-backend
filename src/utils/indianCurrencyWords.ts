const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
] as const;

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
] as const;

function convertBelowThousand(n: number): string {
  const num = Math.floor(n);
  if (num === 0) return "";
  if (num < 20) return ONES[num] ?? "";
  if (num < 100) {
    const t = Math.floor(num / 10);
    const o = num % 10;
    return [TENS[t] ?? "", o > 0 ? ONES[o] ?? "" : ""].filter(Boolean).join(" ");
  }
  const h = Math.floor(num / 100);
  const rem = num % 100;
  return [`${ONES[h] ?? ""} Hundred`, rem > 0 ? convertBelowThousand(rem) : ""]
    .filter(Boolean)
    .join(" ");
}

function convertIntegerIndian(n: number): string {
  const clean = Math.floor(Math.max(0, n));
  if (clean === 0) return "Zero";

  const crore = Math.floor(clean / 10000000);
  const remAfterCrore = clean % 10000000;
  const lakh = Math.floor(remAfterCrore / 100000);
  const remAfterLakh = remAfterCrore % 100000;
  const thousand = Math.floor(remAfterLakh / 1000);
  const rest = remAfterLakh % 1000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${convertIntegerIndian(crore)} Crore`);
  if (lakh > 0) parts.push(`${convertBelowThousand(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${convertBelowThousand(thousand)} Thousand`);
  if (rest > 0) parts.push(convertBelowThousand(rest));
  return parts.join(" ");
}

/**
 * Converts a rupee amount into formal Indian English cheque / voucher wording.
 * Example: 9703 -> "Rupees Nine Thousand Seven Hundred Three Only"
 */
export function numberToIndianCurrencyWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return "Rupees Zero Only";
  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  const rupeeWords = `Rupees ${convertIntegerIndian(rupees)}`;
  if (paise > 0) {
    return `${rupeeWords} and ${convertBelowThousand(paise)} Paise Only`;
  }
  return `${rupeeWords} Only`;
}
