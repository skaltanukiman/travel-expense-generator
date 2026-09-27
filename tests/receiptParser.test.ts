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

    const result = createTravelExpenseItems(receipts, createConfig());
    expect(result.acceptedReceipts).toEqual(receipts);
    expect(result.skippedReceipts).toEqual([]);
    expect(result.items).toEqual([
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

    expect(createTravelExpenseItems(createReceipts(), config).items.map((item) => item.transportation))
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

    expect(createTravelExpenseItems(createReceipts(), config).items.map((item) => item.transportation))
      .toEqual(["電車", "バス", "モノレール"]);
  });

  it("設定済み経路1・2だけを採用し、経路9の明細は生成しない", () => {
    const accepted = createReceipts();
    const skipped = createTravelReceipts().slice(0, 1);
    const result = createTravelExpenseItems([...accepted, ...skipped], createConfig());

    expect(result.acceptedReceipts).toEqual(accepted);
    expect(result.skippedReceipts).toEqual(skipped);
    expect(result.items.map((item) => item.amountYen)).toEqual([3100, 560]);
    expect(result.items.every((item) =>
      item.sourceFileNames.every((name) => accepted.some((receipt) => receipt.sourceFileName === name))
    )).toBe(true);
  });

  it("全件が設定外の場合は電車もバスも生成しない", () => {
    const receipts = createTravelReceipts();
    expect(createTravelExpenseItems(receipts, createConfig())).toEqual({
      items: [],
      acceptedReceipts: [],
      skippedReceipts: receipts,
    });
  });

  it("同日に通勤往復と旅行往復があっても通勤往復だけを集約する", () => {
    const accepted = createReceipts("20260923");
    const skipped = createTravelReceipts("20260923");
    const result = createTravelExpenseItems([...accepted, ...skipped], createConfig());

    expect(result.skippedReceipts).toEqual(skipped);
    expect(result.items).toEqual([
      expect.objectContaining({
        travelDate: "2026-09-23",
        transportation: "電車",
        departure: "戸畑",
        arrival: "博多",
        tripType: "roundTrip",
        amountYen: 3100,
        sourceFileNames: accepted.map((receipt) => receipt.sourceFileName),
      }),
      expect.objectContaining({
        travelDate: "2026-09-23",
        transportation: "バス",
        sourceFileNames: accepted.map((receipt) => receipt.sourceFileName),
      }),
    ]);
  });

  it("同一区間の設定外復路を先に除外し、対象往路を片道として残す", () => {
    const accepted = createReceipts().slice(0, 1);
    const skipped = parseReceiptFileName("20260511_9山田 太郎_通勤費 領収書_JR博多⇒戸畑.pdf");
    const result = createTravelExpenseItems([...accepted, skipped], createConfig());

    expect(result.skippedReceipts).toEqual([skipped]);
    expect(result.items[0]).toMatchObject({
      tripType: "oneWay",
      amountYen: 1550,
      sourceFileNames: [accepted[0].sourceFileName],
    });
  });

  it("複数日のうち設定外経路しかない日は電車・バスの対象から除外する", () => {
    const accepted = [...createReceipts("20260904"), ...createReceipts("20260911")];
    const skipped = createTravelReceipts("20260923");
    const result = createTravelExpenseItems([...accepted, ...skipped], createConfig());

    expect(result.acceptedReceipts).toEqual(accepted);
    expect(result.skippedReceipts).toEqual(skipped);
    expect(result.items.map((item) => [item.transportation, item.travelDate])).toEqual([
      ["電車", "2026-09-04"],
      ["電車", "2026-09-11"],
      ["バス", "2026-09-04"],
      ["バス", "2026-09-11"],
    ]);
  });

  it("複数の領収書交通機関では各設定に合う領収書のみで明細を生成する", () => {
    const config = createConfig();
    config.transportations.push({
      enabled: true,
      source: "receipt",
      name: "別路線",
      purpose: "通勤",
      receiptStatus: "有",
      routeFaresYen: { "9": 2000 },
    });
    const receipts = [...createReceipts(), ...createTravelReceipts()];
    const result = createTravelExpenseItems(receipts, config);

    expect(result.acceptedReceipts).toEqual(receipts);
    expect(result.skippedReceipts).toEqual([]);
    expect(result.items.map((item) => [item.transportation, item.amountYen])).toEqual([
      ["電車", 3100], ["バス", 560], ["別路線", 4000],
    ]);
    expect(result.items[1].sourceFileNames).toHaveLength(4);
  });

  it("無効な領収書交通機関の経路は日付明細の基準にしない", () => {
    const config = createConfig();
    config.transportations[0].enabled = false;
    const receipts = createReceipts();

    expect(createTravelExpenseItems(receipts, config)).toEqual({
      items: [], acceptedReceipts: [], skippedReceipts: receipts,
    });
  });

  it.each([0, -1, 1.5, NaN, undefined, "1550"])(
    "設定済み経路の不正な運賃 %s はスキップで隠さずエラーにする",
    (fare) => {
      const config = createConfig();
      const transportation = config.transportations[0];
      if (transportation.source !== "receipt") {
        throw new Error("テスト設定が不正です");
      }
      transportation.routeFaresYen["1"] = fare as number;
      expect(() => createTravelExpenseItems(createReceipts(), config))
        .toThrow("経路番号 1 の運賃は正の整数で設定してください");
    },
  );
});

function createReceipts(date = "20260511") {
  return [
    parseReceiptFileName(`${date}_1山田 太郎_通勤費 領収書_JR戸畑⇒博多.pdf`),
    parseReceiptFileName(`${date}_2山田 太郎_通勤費 領収書_JR博多⇒戸畑.pdf`),
  ];
}

function createTravelReceipts(date = "20260511") {
  return [
    parseReceiptFileName(`${date}_9山田 太郎_通勤費 領収書_JR博多⇒由布院.pdf`),
    parseReceiptFileName(`${date}_9山田 太郎_通勤費 領収書_JR由布院⇒博多.pdf`),
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
