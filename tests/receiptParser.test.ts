import { describe, expect, it } from "vitest";
import type { ExpenseReportConfig } from "../src/domain.js";
import { groupReceipts, parseReceiptFileName } from "../src/receiptParser.js";

const config: ExpenseReportConfig = {
  templatePath: "template.xlsx",
  inputDirectory: "inputs",
  outputDirectory: "outputs",
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

describe("parseReceiptFileName", () => {
  it("JR九州領収書のファイル名を明細へ変換する", () => {
    expect(
      parseReceiptFileName(
        "20260511_1山田 太郎_通勤費 領収書_JR戸畑⇒博多.pdf",
        config,
      ),
    ).toMatchObject({
      travelDate: "2026-05-11",
      routeNumber: 1,
      employeeName: "山田 太郎",
      purpose: "通勤",
      from: "戸畑",
      to: "博多",
      amountYen: 1550,
    });
  });
});

describe("groupReceipts", () => {
  it("同日の往路と復路を往復1明細へまとめる", () => {
    const receipts = [
      parseReceiptFileName("20260511_1山田 太郎_通勤費 領収書_JR戸畑⇒博多.pdf", config),
      parseReceiptFileName("20260511_2山田 太郎_通勤費 領収書_JR博多⇒戸畑.pdf", config),
    ];

    expect(groupReceipts(receipts, config)).toEqual([
      expect.objectContaining({
        travelDate: "2026-05-11",
        departure: "戸畑",
        arrival: "博多",
        tripType: "roundTrip",
        amountYen: 3100,
      }),
    ]);
  });
});
