import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildOutputFileName } from "../src/app.js";
import type { ExpenseReportConfig } from "../src/domain.js";
import { readZip, writeZip, zipEntryMap } from "../src/zip.js";
import { createTemplateEntries } from "./helpers/template.js";

describe("buildOutputFileName", () => {
  it("設定値と対象月から提出用ファイル名を生成する", () => {
    expect(buildOutputFileName(createConfig(), "2026-05")).toBe(
      "林 勇希_202605 経費交通費精算書ver.4.xlsx",
    );
  });
});

describe("CLI", () => {
  it.each([
    [undefined, [13, 23, 25, 26]], ["", [13, 23, 25, 26]],
    ["23", [13, 25, 26]], ["13,23,25", [26]],
    [" 13 , 23 , 25 ", [26]], ["23,23,25", [13, 26]], ["1", [13, 23, 25, 26]],
  ])("除外日 %s をJR往復・バス・金額へ反映し、PDFを保持する", async (excludeDays, expectedDays) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "travel-expense-cli-"));
    try {
      const fileNames = [13, 23, 25, 26].flatMap((day) => commuteFileNames(`202609${day}`));
      const config = await prepareCliInputs(directory, fileNames);
      await writeFile(config.templatePath, writeZip(createTemplateEntries()));
      const result = runCli(directory, ["--month", "2026-09", ...(excludeDays === undefined ? [] : ["--exclude-days", excludeDays])]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`日付指定による除外: ${(4 - expectedDays.length) * 2} 件`);
      expect(result.stdout).toContain(`交通費精算対象: ${expectedDays.length * 2} 件`);
      expect(result.stdout).toContain(`精算書明細: ${expectedDays.length * 2} 件`);
      expect(result.stdout).toContain(`生成明細合計: ${(expectedDays.length * 3660).toLocaleString("ja-JP")} 円`);
      expect(result.stdout).toContain(`精算書小計: ${(expectedDays.length * 3660 + 1000).toLocaleString("ja-JP")} 円`);
      if (excludeDays?.trim()) {
        const days = [...new Set(excludeDays.split(",").map(Number))];
        expect(result.stdout).toContain(`交通費精算から除外する日: ${days.map((day) => `${day}日`).join(", ")}`);
      }
      const outputPath = path.join(config.outputDirectory, buildOutputFileName(config, "2026-09"));
      const entries = zipEntryMap(readZip(await readFile(outputPath)));
      const traffic = entries.get("xl/worksheets/sheet1.xml")!.data.toString("utf8");
      for (const day of [13, 23, 25, 26]) {
        const serial = (Date.UTC(2026, 8, day) - Date.UTC(1899, 11, 30)) / 86_400_000;
        expect(traffic.split(`<v>${serial}</v>`).length - 1).toBe(expectedDays.includes(day) ? 2 : 0);
      }
      expect(traffic.match(/>電車</gu)).toHaveLength(expectedDays.length);
      expect(traffic.match(/>バス</gu)).toHaveLength(expectedDays.length);
      expect(entries.get("xl/worksheets/sheet2.xml")!.data).toEqual(createTemplateEntries()[3].data);
      expect((await readdir(config.inputDirectory)).sort()).toEqual(fileNames.sort());
      for (const fileName of fileNames) {
        expect(await readFile(path.join(config.inputDirectory, fileName), "utf8")).toBe("");
      }
    } finally {
      await removeTestDirectory(directory);
    }
  });

  it("日付除外を設定外経路より先に分類し、他の月は数えない", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "travel-expense-cli-"));
    try {
      const config = await prepareCliInputs(directory, [
        ...commuteFileNames("20260913"), ...commuteFileNames("20260923"),
        ...travelFileNames("20260923"), ...travelFileNames("20260925"),
        ...commuteFileNames("20260926"), ...commuteFileNames("20260823"),
      ]);
      await writeFile(config.templatePath, writeZip(createTemplateEntries()));
      const result = runCli(directory, ["--month", "2026-09", "--exclude-days", "23"]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("JR九州領収書: 10 件");
      expect(result.stdout).toContain("日付指定による除外: 4 件");
      expect(result.stdout).toContain("設定外経路による除外: 2 件");
      expect(result.stdout).toContain("交通費精算対象: 4 件");
      for (const fileName of [...commuteFileNames("20260923"), ...travelFileNames("20260923")]) {
        expect(result.stdout).toContain(fileName);
        expect(result.stderr).not.toContain(fileName);
      }
      for (const fileName of travelFileNames("20260925")) {
        expect(result.stderr).toContain(fileName);
      }
      expect(result.stdout + result.stderr).not.toContain("20260823");
    } finally {
      await removeTestDirectory(directory);
    }
  });

  it.each([false, true])("全件日付除外ならExcelを生成・上書きしない（既存出力: %s）", async (existingOutput) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "travel-expense-cli-"));
    try {
      const files = commuteFileNames("20260923");
      const config = await prepareCliInputs(directory, files);
      const outputPath = path.join(config.outputDirectory, buildOutputFileName(config, "2026-09"));
      if (existingOutput) {
        await mkdir(config.outputDirectory);
        await writeFile(outputPath, "existing workbook");
      }
      // 月を除外前に推測し、テンプレートを開く前に終了する。
      const result = runCli(directory, ["--exclude-days", "23"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("日付指定による除外後、交通費精算対象となる領収書がありません。");
      expect(result.stdout).toContain("日付指定による除外: 2 件");
      expect(result.stdout).toContain("交通費精算対象: 0 件");
      expect(result.stdout).not.toContain("出力しました:");
      if (existingOutput) {
        expect(await readFile(outputPath, "utf8")).toBe("existing workbook");
      } else {
        expect(existsSync(config.outputDirectory)).toBe(false);
      }
      expect((await readdir(config.inputDirectory)).sort()).toEqual(files.sort());
    } finally {
      await removeTestDirectory(directory);
    }
  });

  it("日付除外後に設定外経路のみ残る場合もExcelを生成しない", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "travel-expense-cli-"));
    try {
      const config = await prepareCliInputs(directory, [...commuteFileNames("20260913"), ...travelFileNames()]);
      const result = runCli(directory, ["--month", "2026-09", "--exclude-days", "13"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("交通費精算対象となる領収書がありません。");
      expect(result.stdout).toContain("日付指定による除外: 2 件");
      expect(result.stdout).toContain("設定外経路による除外: 2 件");
      expect(result.stdout).toContain("交通費精算対象: 0 件");
      expect(existsSync(config.outputDirectory)).toBe(false);
    } finally {
      await removeTestDirectory(directory);
    }
  });

  it.each([true, false])("指定月／推測月の日数で検証する（月指定: %s）", async (explicitMonth) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "travel-expense-cli-"));
    try {
      const config = await prepareCliInputs(directory, commuteFileNames("20270213"));
      const result = runCli(directory, [...(explicitMonth ? ["--month", "2027-02"] : []), "--exclude-days", "29"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("2027年2月に29日は存在しません。");
      expect(existsSync(config.outputDirectory)).toBe(false);
    } finally {
      await removeTestDirectory(directory);
    }
  });

  it("月指定なしでも閏年の日付を除外して残った日のExcelを生成する", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "travel-expense-cli-"));
    try {
      const config = await prepareCliInputs(directory, [...commuteFileNames("20280213"), ...commuteFileNames("20280229")]);
      await writeFile(config.templatePath, writeZip(createTemplateEntries()));
      const result = runCli(directory, ["--exclude-days", "29"]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("日付指定による除外: 2 件");
      expect(result.stdout).toContain("精算書明細: 2 件");
      expect(existsSync(path.join(config.outputDirectory, buildOutputFileName(config, "2028-02")))).toBe(true);
    } finally {
      await removeTestDirectory(directory);
    }
  });

  it("8件中設定外の2件を警告し、正常な6件からExcelを生成する", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "travel-expense-cli-"));
    try {
      const fileNames = [
        ...commuteFileNames("20260904"),
        ...commuteFileNames("20260911"),
        ...commuteFileNames("20260923"),
        ...travelFileNames(),
      ];
      const config = await prepareCliInputs(directory, fileNames);
      await writeFile(config.templatePath, writeZip(createTemplateEntries()));
      const result = runCli(directory);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("警告: 設定外の経路のため交通費精算対象から除外しました:");
      for (const fileName of travelFileNames()) {
        expect(result.stderr).toContain(fileName);
      }
      expect(result.stdout).toContain("JR九州領収書: 8 件");
      expect(result.stdout).toContain("交通費精算対象: 6 件");
      expect(result.stdout).toContain("交通費精算対象外: 2 件");
      expect(result.stdout).toContain("精算書明細: 6 件");
      expect(result.stdout).toContain("生成明細合計: 10,980 円");
      expect(result.stdout).toContain("精算書小計: 11,980 円");
      expect(result.stdout).toContain("保持した既存明細行: 14");
      const outputPath = path.join(config.outputDirectory, buildOutputFileName(config, "2026-09"));
      const entries = zipEntryMap(readZip(await readFile(outputPath)));
      const traffic = entries.get("xl/worksheets/sheet1.xml")!.data.toString("utf8");
      expect(traffic).not.toContain("由布院");
      expect(traffic.match(/>電車</gu)).toHaveLength(3);
      expect(traffic.match(/>バス</gu)).toHaveLength(3);
      expect(traffic).toContain("<f>SUM(P9:Q28)</f><v>11980</v>");
      expect(entries.get("xl/worksheets/sheet2.xml")!.data)
        .toEqual(createTemplateEntries()[3].data);
    } finally {
      await removeTestDirectory(directory);
    }
  });

  it.each([false, true])(
    "全件対象外なら終了コード1で停止し、Excelを生成・上書きしない（既存出力: %s）",
    async (existingOutput) => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "travel-expense-cli-"));
      try {
        const config = await prepareCliInputs(directory, travelFileNames());
        const outputPath = path.join(config.outputDirectory, buildOutputFileName(config, "2026-09"));
        if (existingOutput) {
          await mkdir(config.outputDirectory);
          await writeFile(outputPath, "existing workbook");
        }
        // テンプレートがなくても、対象外の判定を先に行う。
        const result = runCli(directory);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("交通費精算対象となる領収書がありません。");
        expect(result.stderr).toContain("警告:");
        for (const fileName of travelFileNames()) {
          expect(result.stderr).toContain(fileName);
        }
        expect(result.stdout).toContain("JR九州領収書: 2 件");
        expect(result.stdout).toContain("交通費精算対象: 0 件");
        expect(result.stdout).toContain("交通費精算対象外: 2 件");
        expect(result.stdout).not.toContain("出力しました:");
        if (existingOutput) {
          expect(await readFile(outputPath, "utf8")).toBe("existing workbook");
        } else {
          expect(existsSync(config.outputDirectory)).toBe(false);
          expect(existsSync(outputPath)).toBe(false);
        }
      } finally {
        await removeTestDirectory(directory);
      }
    },
  );

  it("対象月以外の設定外経路を警告・件数に含めない", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "travel-expense-cli-"));
    try {
      const config = await prepareCliInputs(directory, [
        ...commuteFileNames("20260904"), ...travelFileNames("20260823"),
      ]);
      await writeFile(config.templatePath, writeZip(createTemplateEntries()));
      const result = runCli(directory);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("JR九州領収書: 2 件");
      expect(result.stdout).toContain("交通費精算対象: 2 件");
      expect(result.stdout).not.toContain("交通費精算対象外:");
    } finally {
      await removeTestDirectory(directory);
    }
  });
});

function commuteFileNames(date: string): string[] {
  return [
    `${date}_1林 勇希_通勤費 領収書_JR戸畑⇒博多.pdf`,
    `${date}_2林 勇希_通勤費 領収書_JR博多⇒戸畑.pdf`,
  ];
}

function travelFileNames(date = "20260923"): string[] {
  return [
    `${date}_9林 勇希_通勤費 領収書_JR博多⇒由布院.pdf`,
    `${date}_9林 勇希_通勤費 領収書_JR由布院⇒博多.pdf`,
  ];
}

async function prepareCliInputs(directory: string, fileNames: string[]): Promise<ExpenseReportConfig> {
  const config = createConfig();
  config.templatePath = path.join(directory, "template.xlsx");
  config.inputDirectory = path.join(directory, "inputs");
  config.outputDirectory = path.join(directory, "outputs");
  config.transportations = [
    {
      enabled: true, source: "receipt", name: "電車", purpose: "通勤",
      receiptStatus: "有", routeFaresYen: { "1": 1550, "2": 1550 },
    },
    {
      enabled: true, source: "eachReceiptDate", name: "バス", purpose: "通勤",
      receiptStatus: "無", departure: "一枝入口", arrival: "戸畑駅",
      tripType: "roundTrip", amountYen: 560,
    },
  ];
  await mkdir(config.inputDirectory);
  for (const fileName of fileNames) {
    await writeFile(path.join(config.inputDirectory, fileName), "");
  }
  await writeFile(path.join(directory, "expense-report.jsonc"), `// CLIテスト設定\n${JSON.stringify(config)}`);
  return config;
}

function runCli(directory: string, args: string[] = ["--month", "2026-09"]) {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  return spawnSync(process.execPath, [
    "--import", "tsx", path.join(projectRoot, "src", "index.ts"),
    "--config", path.join(directory, "expense-report.jsonc"), ...args,
  ], { cwd: projectRoot, encoding: "utf8", timeout: 10_000, windowsHide: true });
}

async function removeTestDirectory(directory: string): Promise<void> {
  const testRoot = path.resolve(directory);
  if (!testRoot.startsWith(path.join(path.resolve(os.tmpdir()), "travel-expense-cli-"))) {
    throw new Error(`テスト用一時ディレクトリではありません: ${testRoot}`);
  }
  await rm(testRoot, { recursive: true, force: true });
}

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
