import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import type { ExpenseReportConfig } from "../src/domain.js";

describe("loadConfig", () => {
  it("テンプレートと入力フォルダーをプロジェクトルートから解決する", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "travel-expense-config-"));
    const configDirectory = path.join(directory, "private");
    const configPath = path.join(configDirectory, "expense-report.jsonc");
    const projectRoot = path.join(directory, "project");
    await mkdir(configDirectory, { recursive: true });
    await writeFile(
      configPath,
      `// 設定ファイルのコメント\n${JSON.stringify(createConfig())}`,
      "utf8",
    );

    try {
      const config = await loadConfig(configPath, projectRoot);

      expect(config.templatePath).toBe(
        path.join(projectRoot, "template", "交通費精算書テンプレート.xlsx"),
      );
      expect(config.inputDirectory).toBe(path.join(projectRoot, "inputs"));
      expect(config.outputDirectory).toBe(path.join(projectRoot, "outputs"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function createConfig(): ExpenseReportConfig {
  return {
    templatePath: "./template/交通費精算書テンプレート.xlsx",
    inputDirectory: "./inputs",
    outputDirectory: "./outputs",
    outputFileName: {
      name: "山田 太郎",
      documentName: "経費交通費精算書",
      version: "ver.4",
    },
    sheetName: "交通費",
    department: "IT",
    employeeName: "山田 太郎",
    transportation: "電車",
    defaultPurpose: "通勤",
    receiptStatus: "有",
    oneWayLabel: "片",
    roundTripLabel: "往",
    statementDay: 30,
    routeFaresYen: { "1": 1550, "2": 1550 },
  };
}
