import type { ReceiptRecord } from "./domain.js";

export function parseExcludeDays(value: string): number[] {
  if (value.trim() === "") {
    return [];
  }
  const days = value.split(",").map((part) => {
    const token = part.trim();
    const day = Number(token);
    if (!/^\d+$/u.test(token) || !Number.isInteger(day) || day < 1 || day > 31) {
      throw new Error("除外日は1～31の日付をカンマ区切りで指定してください。例: 13,23,25");
    }
    return day;
  });
  return [...new Set(days)];
}

export function validateExcludeDays(days: number[], month: string): void {
  if (days.length === 0) {
    return;
  }
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(month)) {
    throw new Error("対象月を --month YYYY-MM で指定してください。");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  // setUTCFullYear avoids Date.UTC's special treatment of years 0–99.
  const lastDay = new Date(0);
  lastDay.setUTCFullYear(year, monthNumber, 0);
  const invalidDay = days.find((day) => day > lastDay.getUTCDate());
  if (invalidDay !== undefined) {
    throw new Error(`${year}年${monthNumber}月に${invalidDay}日は存在しません。`);
  }
}

export function excludeReceiptsByDay(receipts: ReceiptRecord[], month: string, days: number[]): {
  remainingReceipts: ReceiptRecord[];
  excludedReceipts: ReceiptRecord[];
} {
  validateExcludeDays(days, month);
  const excludedDates = new Set(days.map((day) => `${month}-${String(day).padStart(2, "0")}`));
  const remainingReceipts: ReceiptRecord[] = [];
  const excludedReceipts: ReceiptRecord[] = [];
  for (const receipt of receipts) {
    (excludedDates.has(receipt.travelDate) ? excludedReceipts : remainingReceipts).push(receipt);
  }
  return { remainingReceipts, excludedReceipts };
}
