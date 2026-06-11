import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ExpenseReportConfig, TravelExpenseItem } from "../src/domain.js";
import { generateExpenseWorkbook, resolveWorksheetPath, validateTemplate } from "../src/ooxml.js";
import { readZip, writeZip, zipEntryMap, type ZipEntry } from "../src/zip.js";

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
        preservedRows: [13],
        totalYen: 3100,
        subtotalYen: 3660,
      });
      expect(outputEntries.get("xl/worksheets/sheet2.xml")!.data)
        .toEqual(templateEntries.get("xl/worksheets/sheet2.xml")!.data);
      expect(outputTraffic).toContain('r="C9" s="1" t="inlineStr"');
      expect(outputTraffic).toContain("電車");
      expect(outputTraffic).toContain("<v>3660</v>");
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
    sheetName: "交通費",
    department: "IT",
    employeeName: "テスト",
    transportation: "電車",
    defaultPurpose: "通勤",
    receiptStatus: "有",
    oneWayLabel: "片",
    roundTripLabel: "往",
    statementDay: 30,
    routeFaresYen: { "1": 1550, "2": 1550 },
  };
}

function createTemplateEntries(): ZipEntry[] {
  const workbook = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets><sheet name="交通費" sheetId="1" r:id="rId1"/>',
    '<sheet name="経費" sheetId="2" r:id="rId2"/></sheets></workbook>',
  ].join("");
  const relationships = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>',
    '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/>',
    "</Relationships>",
  ].join("");
  const cells = [
    cell("K3"), cell("N3"), cell("P3"), cell("L5"), cell("L6"),
    ...Array.from({ length: 21 }, (_, index) => {
      const row = index + 9;
      return ["A", "C", "E", "H", "K", "N", "O", "P"].map((column) => {
        if (row === 9 && column === "C") {
          return stringCell(`${column}${row}`, "電車");
        }
        if (row === 9 && column === "P") {
          return numberCell(`${column}${row}`, 3000);
        }
        if (row === 13 && column === "C") {
          return stringCell(`${column}${row}`, "バス");
        }
        if (row === 13 && column === "P") {
          return numberCell(`${column}${row}`, 560);
        }
        return cell(`${column}${row}`);
      }).join("");
    }),
    '<c r="P30" s="1"><f>SUM(P9:Q28)</f><v>3560</v></c>',
    '<c r="C33" s="1" t="str"><f>L6</f><v>旧氏名</v></c>',
  ].join("");
  const traffic = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<sheetData><row r="1">${cells}</row></sheetData>`,
    '<mergeCells><mergeCell ref="L32:M32"/><mergeCell ref="P32:Q32"/></mergeCells>',
    '<dataValidations><dataValidation sqref="N9:N29"/><dataValidation sqref="O9:O29"/></dataValidations>',
    "</worksheet>",
  ].join("");

  return [
    entry("xl/workbook.xml", workbook),
    entry("xl/_rels/workbook.xml.rels", relationships),
    entry("xl/worksheets/sheet1.xml", traffic),
    entry("xl/worksheets/sheet2.xml", "<worksheet>unchanged expense sheet</worksheet>"),
  ];
}

function cell(address: string): string {
  return `<c r="${address}" s="1"/>`;
}

function stringCell(address: string, value: string): string {
  return `<c r="${address}" s="1" t="inlineStr"><is><t>${value}</t></is></c>`;
}

function numberCell(address: string, value: number): string {
  return `<c r="${address}" s="1"><v>${value}</v></c>`;
}

function entry(name: string, value: string): ZipEntry {
  return {
    name,
    data: Buffer.from(value),
    modifiedTime: 0,
    modifiedDate: 0,
    externalAttributes: 0,
  };
}
