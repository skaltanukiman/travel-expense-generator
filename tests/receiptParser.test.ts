import { describe, expect, it } from "vitest";
import type { ExpenseReportConfig } from "../src/domain.js";
import { createTravelExpenseItems, parseReceiptFileName } from "../src/receiptParser.js";

describe("parseReceiptFileName", () => {
  it("JR九州領収書のファイル名を解析する", () => {
    expect(
      parseReceiptFileName("20260511_1山田 太郎_通勤費 領収書_JR戸畑⇒博多.pdf"),
    ).toMatchObject({
      travelDate: "2026-05-11",
      routeNumber: 1,
      employeeName: "山田 太郎",
      from: "戸畑",
      to: "博多",
    });
  });
});

describe("createTravelExpenseItems", () => {
  it("同日の電車往復と、領収書日付に対応するバスを生成する", () => {
    const receipts = createReceipts();

    expect(createTravelExpenseItems(receipts, createConfig())).toEqual([
      expect.objectContaining({
        travelDate: "2026-05-11",
        transportation: "電車",
        departure: "戸畑",
        arrival: "博多",
        tripType: "roundTrip",
        receiptStatus: "有",
        amountYen: 3100,
      }),
      expect.objectContaining({
        travelDate: "2026-05-11",
        transportation: "バス",
        departure: "一枝入口",
        arrival: "戸畑駅",
        tripType: "roundTrip",
        receiptStatus: "無",
        amountYen: 560,
      }),
    ]);
  });

  it("enabledがfalseの交通機関は出力しない", () => {
    const config = createConfig();
    config.transportations[1].enabled = false;

    expect(createTravelExpenseItems(createReceipts(), config).map((item) => item.transportation))
      .toEqual(["電車"]);
  });

  it("設定配列へ交通機関を追加すると同じ領収書日付の明細を追加する", () => {
    const config = createConfig();
    config.transportations.push({
      enabled: true,
      source: "eachReceiptDate",
      name: "モノレール",
      departure: "出発駅",
      arrival: "到着駅",
      purpose: "通勤",
      tripType: "roundTrip",
      receiptStatus: "無",
      amountYen: 400,
    });

    expect(createTravelExpenseItems(createReceipts(), config).map((item) => item.transportation))
      .toEqual(["電車", "バス", "モノレール"]);
  });
});

function createReceipts() {
  return [
    parseReceiptFileName("20260511_1山田 太郎_通勤費 領収書_JR戸畑⇒博多.pdf"),
    parseReceiptFileName("20260511_2山田 太郎_通勤費 領収書_JR博多⇒戸畑.pdf"),
  ];
}

function createConfig(): ExpenseReportConfig {
  return {
    templatePath: "template.xlsx",
    inputDirectory: "inputs",
    outputDirectory: "outputs",
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
        enabled: true,
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
