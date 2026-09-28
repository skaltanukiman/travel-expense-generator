import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "./cli.js";
import { loadConfig } from "./config.js";
import { excludeReceiptsByDay } from "./excludeDays.js";
import type { ExpenseReportConfig } from "./domain.js";
import { generateExpenseWorkbook } from "./ooxml.js";
import { createTravelExpenseItems, parseReceiptFileName } from "./receiptParser.js";

export async function main(): Promise<void> {
  const args = parseArgs();
  const config = await loadConfig(args.configPath);
  if (args.inputDirectory) {
    config.inputDirectory = path.resolve(args.inputDirectory);
  }
  if (args.templatePath) {
    config.templatePath = path.resolve(args.templatePath);
  }

  const files = (await readdir(config.inputDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => path.join(config.inputDirectory, entry.name));
  const receipts = files.map((file) => parseReceiptFileName(file));
  const month = args.month ?? inferMonth(receipts.map((receipt) => receipt.travelDate));
  const targetReceipts = receipts.filter((receipt) => receipt.travelDate.startsWith(`${month}-`));
  const excludeDays = args.excludeDays ?? [];
  const { remainingReceipts, excludedReceipts } = excludeReceiptsByDay(targetReceipts, month, excludeDays);
  if (excludeDays.length > 0) {
    console.log(`交通費精算から除外する日: ${excludeDays.map((day) => `${day}日`).join(", ")}`);
  }
  if (excludedReceipts.length > 0) {
    console.log("日付指定により交通費精算対象から除外しました:");
    for (const receipt of excludedReceipts) {
      console.log(`  ${receipt.sourceFileName}`);
    }
  }
  const { items, acceptedReceipts, skippedReceipts } = createTravelExpenseItems(remainingReceipts, config);
  if (skippedReceipts.length > 0) {
    console.warn("警告: 設定外の経路のため交通費精算対象から除外しました:");
    for (const receipt of skippedReceipts) {
      console.warn(`  ${receipt.sourceFileName}`);
    }
  }
  if (acceptedReceipts.length === 0) {
    printReceiptCounts(targetReceipts.length, acceptedReceipts.length, skippedReceipts.length, excludedReceipts.length);
    if (excludedReceipts.length > 0 && remainingReceipts.length === 0) {
      throw new Error("日付指定による除外後、交通費精算対象となる領収書がありません。");
    }
    throw new Error("交通費精算対象となる領収書がありません。");
  }

  const outputPath = args.outputPath
    ? path.resolve(args.outputPath)
    : path.join(config.outputDirectory, buildOutputFileName(config, month));
  await mkdir(path.dirname(outputPath), { recursive: true });
  const result = await generateExpenseWorkbook(config, items, outputPath);

  console.log(`出力しました: ${result.outputPath}`);
  printReceiptCounts(targetReceipts.length, acceptedReceipts.length, skippedReceipts.length, excludedReceipts.length);
  console.log(`精算書明細: ${items.length} 件`);
  console.log(`生成明細合計: ${result.totalYen.toLocaleString("ja-JP")} 円`);
  console.log(`精算書小計: ${result.subtotalYen.toLocaleString("ja-JP")} 円`);
  console.log(`保持した既存明細行: ${result.preservedRows.join(", ") || "なし"}`);
}

function printReceiptCounts(total: number, accepted: number, skipped: number, excluded: number): void {
  console.log(`JR九州領収書: ${total} 件`);
  console.log(`日付指定による除外: ${excluded} 件`);
  console.log(`設定外経路による除外: ${skipped} 件`);
  console.log(`交通費精算対象: ${accepted} 件`);
  if (skipped + excluded > 0) {
    console.log(`交通費精算対象外: ${skipped + excluded} 件`);
  }
}

export function buildOutputFileName(config: ExpenseReportConfig, month: string): string {
  const { name, documentName, version } = config.outputFileName;
  return `${name}_${month.replace("-", "")} ${documentName}${version}.xlsx`;
}

function inferMonth(dates: string[]): string {
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))];
  if (months.length !== 1) {
    throw new Error("対象月を --month YYYY-MM で指定してください。");
  }
  return months[0];
}
