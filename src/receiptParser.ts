import path from "node:path";
import type {
  EachReceiptDateTransportationConfig,
  ExpenseReportConfig,
  ReceiptRecord,
  ReceiptTransportationConfig,
  TravelExpenseItem,
} from "./domain.js";

const receiptFilePattern =
  /^(\d{4})(\d{2})(\d{2})_(\d+)(.+?)_(.+?)\s*領収書_JR(.+?)(?:⇒|→|->)(.+)\.pdf$/iu;

export function parseReceiptFileName(
  filePath: string,
): ReceiptRecord {
  const fileName = path.basename(filePath);
  const match = receiptFilePattern.exec(fileName);
  if (!match) {
    throw new Error(`JR九州領収書のファイル名を解析できません: ${fileName}`);
  }

  const [, year, month, day, routeNumberText, employeeName, , from, to] = match;
  const routeNumber = Number(routeNumberText);

  return {
    sourceFileName: fileName,
    travelDate: `${year}-${month}-${day}`,
    routeNumber,
    employeeName: employeeName.trim(),
    from: normalizeStation(from),
    to: normalizeStation(to),
  };
}

export type CreateTravelExpenseItemsResult = {
  items: TravelExpenseItem[];
  acceptedReceipts: ReceiptRecord[];
  skippedReceipts: ReceiptRecord[];
};

export function createTravelExpenseItems(
  receipts: ReceiptRecord[],
  config: ExpenseReportConfig,
): CreateTravelExpenseItemsResult {
  const receiptTransportations = config.transportations.filter(
    (transportation): transportation is ReceiptTransportationConfig =>
      transportation.enabled && transportation.source === "receipt",
  );
  const acceptedReceipts: ReceiptRecord[] = [];
  const skippedReceipts: ReceiptRecord[] = [];
  for (const receipt of receipts) {
    const accepted = receiptTransportations.some((transportation) =>
      hasConfiguredRoute(receipt, transportation)
    );
    (accepted ? acceptedReceipts : skippedReceipts).push(receipt);
  }

  const items = config.transportations.flatMap((transportation) => {
    if (!transportation.enabled) {
      return [];
    }
    return transportation.source === "receipt"
      ? groupReceipts(
        acceptedReceipts.filter((receipt) => hasConfiguredRoute(receipt, transportation)),
        transportation,
      )
      : createEachReceiptDateItems(acceptedReceipts, transportation);
  });
  return { items, acceptedReceipts, skippedReceipts };
}

function hasConfiguredRoute(
  receipt: ReceiptRecord,
  transportation: ReceiptTransportationConfig,
): boolean {
  return Object.hasOwn(transportation.routeFaresYen, String(receipt.routeNumber));
}

export function groupReceipts(
  receipts: ReceiptRecord[],
  transportation: ReceiptTransportationConfig,
): TravelExpenseItem[] {
  const groups = new Map<string, ReceiptRecord[]>();
  for (const receipt of receipts) {
    const stations = [receipt.from, receipt.to].sort((a, b) => a.localeCompare(b, "ja"));
    const key = [receipt.travelDate, ...stations].join("\u0000");
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
        transportation: transportation.name,
        departure: first.from,
        arrival: first.to,
        purpose: transportation.purpose,
        tripType: hasReversePair ? "roundTrip" : "oneWay",
        receiptStatus: transportation.receiptStatus,
        amountYen: ordered.reduce((sum, item) => sum + fareForReceipt(item, transportation), 0),
        sourceFileNames: ordered.map((item) => item.sourceFileName),
      } satisfies TravelExpenseItem;
    })
    .sort((a, b) =>
      a.travelDate.localeCompare(b.travelDate) ||
      a.departure.localeCompare(b.departure, "ja") ||
      a.arrival.localeCompare(b.arrival, "ja")
    );
}

function createEachReceiptDateItems(
  receipts: ReceiptRecord[],
  transportation: EachReceiptDateTransportationConfig,
): TravelExpenseItem[] {
  const dates = [...new Set(receipts.map((receipt) => receipt.travelDate))].sort();
  return dates.map((travelDate) => ({
    travelDate,
    transportation: transportation.name,
    departure: transportation.departure,
    arrival: transportation.arrival,
    purpose: transportation.purpose,
    tripType: transportation.tripType,
    receiptStatus: transportation.receiptStatus,
    amountYen: transportation.amountYen,
    sourceFileNames: receipts
      .filter((receipt) => receipt.travelDate === travelDate)
      .map((receipt) => receipt.sourceFileName),
  }));
}

function fareForReceipt(
  receipt: ReceiptRecord,
  transportation: ReceiptTransportationConfig,
): number {
  const amountYen = transportation.routeFaresYen[String(receipt.routeNumber)];
  if (!Number.isInteger(amountYen) || amountYen <= 0) {
    throw new Error(
      `経路番号 ${receipt.routeNumber} の運賃は正の整数で設定してください: ${receipt.sourceFileName}`,
    );
  }
  return amountYen;
}

function normalizeStation(value: string): string {
  return value.trim().replace(/\s+/gu, "").replace(/駅$/u, "");
}
