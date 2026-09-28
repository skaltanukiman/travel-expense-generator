import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.js";
import { excludeReceiptsByDay, parseExcludeDays, validateExcludeDays } from "../src/excludeDays.js";
import { parseReceiptFileName } from "../src/receiptParser.js";

describe("除外日の入力", () => {
  it.each([
    ["", []], ["  ", []], ["23", [23]], ["13,23,25", [13, 23, 25]],
    ["13, 23, 25", [13, 23, 25]], [" 13 , 23 , 25", [13, 23, 25]],
    ["23,23,25", [23, 25]], ["01,1,31", [1, 31]],
  ])("%s を正規化する", (input, expected) => {
    expect(parseExcludeDays(input as string)).toEqual(expected);
  });

  it.each(["0", "32", "abc", "23a", "-1", "1.5", "1,,2", "23,", ",23", "1e1", "+1"])(
    "%s を拒否する", (input) => {
      expect(() => parseArgs(["--exclude-days", input])).toThrow("除外日は1～31の日付をカンマ区切りで指定してください。");
    },
  );

  it("既存オプションと空文字の除外日を受け付ける", () => {
    expect(parseArgs([
      "--config", "config.jsonc", "--input", "inputs", "--template", "template.xlsx",
      "--output", "report.xlsx", "--month", "2026-09", "--exclude-days", "",
    ])).toEqual({
      configPath: "config.jsonc", inputDirectory: "inputs", templatePath: "template.xlsx",
      outputPath: "report.xlsx", month: "2026-09", excludeDays: [],
    });
    expect(parseArgs([]).excludeDays).toEqual([]);
    expect(parseArgs(["--exclude-days", " 23,23,25 "]).excludeDays).toEqual([23, 25]);
  });

  it("値の欠落をエラーにする", () => {
    expect(() => parseArgs(["--exclude-days"])).toThrow("--exclude-days の値がありません。");
    expect(() => parseArgs(["--exclude-days", "--month", "2026-09"])).toThrow("--exclude-days の値がありません。");
    expect(() => parseArgs(["--month", ""])).toThrow("--month の値がありません。");
  });
});

describe("対象月の日数", () => {
  it.each([
    ["2026-09", 31, "2026年9月に31日は存在しません。"],
    ["2027-02", 29, "2027年2月に29日は存在しません。"],
    ["2028-02", 30, "2028年2月に30日は存在しません。"],
    ["2100-02", 29, "2100年2月に29日は存在しません。"],
  ])("%s の %i 日を拒否する", (month, day, message) => {
    expect(() => validateExcludeDays([day], month)).toThrow(message);
  });
  it.each([["2028-02", 29], ["2000-02", 29], ["2026-09", 30], ["2026-01", 31]])(
    "%s の %i 日を受け付ける", (month, day) => {
      expect(() => validateExcludeDays([day], month)).not.toThrow();
    },
  );
  it.each(["2026-13", "2026-00", "2026-9", "abc"])("不正な対象月 %s を拒否する", (month) => {
    expect(() => validateExcludeDays([23], month)).toThrow("対象月を --month YYYY-MM");
  });
});

describe("ReceiptRecord の日付除外", () => {
  it("指定した年月日だけを分類し、元のレコードを変更しない", () => {
    const receipts = ["20260923", "20260925", "20260823"].flatMap((date) => [1, 2].map((route) =>
      parseReceiptFileName(`${date}_${route}山田 太郎_通勤費 領収書_JR戸畑⇒博多.pdf`),
    ));
    const original = structuredClone(receipts);
    const result = excludeReceiptsByDay(receipts, "2026-09", [23]);
    expect(result.excludedReceipts).toEqual(receipts.slice(0, 2));
    expect(result.remainingReceipts).toEqual(receipts.slice(2));
    expect(receipts).toEqual(original);
  });
});
