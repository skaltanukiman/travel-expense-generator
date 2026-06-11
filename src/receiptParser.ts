import path from "node:path";
import type { ExpenseReportConfig, ReceiptRecord, TravelExpenseItem } from "./domain.js";

const receiptFilePattern =
  /^(\d{4})(\d{2})(\d{2})_(\d+)(.+?)_(.+?)\s*領収書_JR(.+?)(?:⇒|→|->)(.+)\.pdf$/iu;

export function parseReceiptFileName(
  filePath: string,
  config: ExpenseReportConfig,
): ReceiptRecord {
  const fileName = path.basename(filePath);
  const match = receiptFilePattern.exec(fileName);
  if (!match) {
    throw new Error(`JR九州領収書のファイル名を解析できません: ${fileName}`);
  }

  const [, year, month, day, routeNumberText, employeeName, , from, to] = match;
  const routeNumber = Number(routeNumberText);
  const amountYen = config.routeFaresYen[String(routeNumber)];
  if (!Number.isInteger(amountYen) || amountYen <= 0) {
    throw new Error(`経路番号 ${routeNumber} の運賃が設定されていません: ${fileName}`);
  }

  return {
    sourceFileName: fileName,
    travelDate: `${year}-${month}-${day}`,
    routeNumber,
    employeeName: employeeName.trim(),
    purpose: config.defaultPurpose,
    from: normalizeStation(from),
    to: normalizeStation(to),
    amountYen,
  };
}

export function groupReceipts(
  receipts: ReceiptRecord[],
  config: ExpenseReportConfig,
): TravelExpenseItem[] {
  const groups = new Map<string, ReceiptRecord[]>();
  for (const receipt of receipts) {
    const stations = [receipt.from, receipt.to].sort((a, b) => a.localeCompare(b, "ja"));
    const key = [receipt.travelDate, receipt.purpose, ...stations].join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), receipt]);
  }

  return [...groups.values()]
    .map((group) => {
      const ordered = [...group].sort((a, b) =>
        a.routeNumber - b.routeNumber || a.sourceFileName.localeCompare(b.sourceFileName, "ja")
      );
      const first = ordered[0];
      const hasReversePair = ordered.some(
        (item) => item.from === first.to && item.to === first.from,
      );

      return {
        travelDate: first.travelDate,
        transportation: config.transportation,
        departure: first.from,
        arrival: first.to,
        purpose: first.purpose || config.defaultPurpose,
        tripType: hasReversePair ? "roundTrip" : "oneWay",
        receiptStatus: config.receiptStatus,
        amountYen: ordered.reduce((sum, item) => sum + item.amountYen, 0),
        sourceFileNames: ordered.map((item) => item.sourceFileName),
      } satisfies TravelExpenseItem;
    })
    .sort((a, b) =>
      a.travelDate.localeCompare(b.travelDate) ||
      a.departure.localeCompare(b.departure, "ja") ||
      a.arrival.localeCompare(b.arrival, "ja")
    );
}

function normalizeStation(value: string): string {
  return value.trim().replace(/\s+/gu, "").replace(/駅$/u, "");
}
