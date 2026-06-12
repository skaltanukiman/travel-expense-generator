import { describe, expect, it } from "vitest";
import { buildOutputFileName } from "../src/app.js";
import type { ExpenseReportConfig } from "../src/domain.js";

describe("buildOutputFileName", () => {
  it("設定値と対象月から提出用ファイル名を生成する", () => {
    expect(buildOutputFileName(createConfig(), "2026-05")).toBe(
      "林 勇希_202605 経費交通費精算書ver.4.xlsx",
    );
  });
});

function createConfig(): ExpenseReportConfig {
  return {
    templatePath: "template.xlsx",
    inputDirectory: "inputs",
    outputDirectory: "outputs",
    outputFileName: {
      name: "林 勇希",
      documentName: "経費交通費精算書",
      version: "ver.4",
    },
    sheetName: "交通費",
    department: "IT",
    employeeName: "林 勇希",
    oneWayLabel: "片",
    roundTripLabel: "往",
    statementDay: 1,
    transportations: [],
  };
}
