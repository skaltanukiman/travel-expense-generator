import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ExpenseReportConfig, TravelExpenseItem } from "../src/domain.js";
import { generateExpenseWorkbook, resolveWorksheetPath, validateTemplate } from "../src/ooxml.js";
import { readZip, writeZip, zipEntryMap } from "../src/zip.js";

import { createTemplateEntries } from "./helpers/template.js";

describe("generateExpenseWorkbook", () => {
  it("交通費セルだけを変更し、経費シートとテンプレート構造を保持する", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "travel-expense-generator-"));
    try {
      const templatePath = path.join(directory, "template.xlsx");
      const outputPath = path.join(directory, "output.xlsx");
      await writeFile(templatePath, writeZip(createTemplateEntries()));
      const config = createConfig(templatePath, directory);
      const items: TravelExpenseItem[] = [
        {
          travelDate: "2026-05-11",
          transportation: "電車",
          departure: "戸畑",
          arrival: "博多",
          purpose: "通勤費",
          tripType: "roundTrip",
          receiptStatus: "有",
          amountYen: 3100,
          sourceFileNames: ["outbound.pdf", "return.pdf"],
        },
      ];

      const result = await generateExpenseWorkbook(config, items, outputPath);
      const templateEntries = zipEntryMap(readZip(await readFile(templatePath)));
      const outputEntries = zipEntryMap(readZip(await readFile(outputPath)));
      const trafficPath = resolveWorksheetPath(outputEntries, "交通費");
      const outputTraffic = outputEntries.get(trafficPath)!.data.toString();

      expect(result).toMatchObject({
        insertedRows: [9],
        preservedRows: [14],
        totalYen: 3100,
        subtotalYen: 4100,
      });
      expect(outputEntries.get("xl/worksheets/sheet2.xml")!.data)
        .toEqual(templateEntries.get("xl/worksheets/sheet2.xml")!.data);
      expect(outputTraffic).toContain('r="C9" s="1" t="inlineStr"');
      expect(outputTraffic).toContain("電車");
      expect(outputTraffic).not.toContain(">バス<");
      expect(outputTraffic).toContain("タクシー");
      expect(outputTraffic).toContain("<v>4100</v>");
      expect(outputTraffic).toContain('<c r="C33" s="1" t="str"><f>L6</f><v>テスト</v></c>');
      validateTemplate(outputTraffic);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function createConfig(templatePath: string, outputDirectory: string): ExpenseReportConfig {
  return {
    templatePath,
    inputDirectory: outputDirectory,
    outputDirectory,
    outputFileName: {
      name: "テスト",
      documentName: "経費交通費精算書",
      version: "ver.4",
    },
    sheetName: "交通費",
    department: "IT",
    employeeName: "テスト",
    oneWayLabel: "片",
    roundTripLabel: "往",
    statementDay: 30,
    transportations: [
      {
        enabled: true,
        source: "receipt",
        name: "電車",
        purpose: "通勤",
        receiptStatus: "有",
        routeFaresYen: { "1": 1550, "2": 1550 },
      },
      {
        enabled: false,
        source: "eachReceiptDate",
        name: "バス",
        departure: "一枝入口",
        arrival: "戸畑駅",
        purpose: "通勤",
        tripType: "roundTrip",
        receiptStatus: "無",
        amountYen: 560,
      },
    ],
  };
}
