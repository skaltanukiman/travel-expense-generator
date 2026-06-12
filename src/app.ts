import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "./cli.js";
import { loadConfig } from "./config.js";
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
  const items = createTravelExpenseItems(targetReceipts, config);

  const outputPath = args.outputPath
    ? path.resolve(args.outputPath)
    : path.join(config.outputDirectory, buildOutputFileName(config, month));
  await mkdir(path.dirname(outputPath), { recursive: true });
  const result = await generateExpenseWorkbook(config, items, outputPath);

  console.log(`出力しました: ${result.outputPath}`);
  console.log(`JR九州領収書: ${targetReceipts.length} 件 / 精算書明細: ${items.length} 件`);
  console.log(`生成明細合計: ${result.totalYen.toLocaleString("ja-JP")} 円`);
  console.log(`精算書小計: ${result.subtotalYen.toLocaleString("ja-JP")} 円`);
  console.log(`保持した既存明細行: ${result.preservedRows.join(", ") || "なし"}`);
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
