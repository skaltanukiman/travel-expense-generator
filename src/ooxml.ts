import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExpenseReportConfig, TravelExpenseItem } from "./domain.js";
import { attributeValue, decodeXml, encodeXml } from "./xml.js";
import { readZip, writeZip, zipEntryMap, type ZipEntry } from "./zip.js";

const detailStartRow = 9;
const safeDetailEndRow = 28;
const allDetailEndRow = 29;
const detailColumns = ["A", "C", "E", "H", "K", "N", "O", "P"] as const;

export type GenerationResult = {
  outputPath: string;
  insertedRows: number[];
  preservedRows: number[];
  totalYen: number;
  subtotalYen: number;
};

export async function generateExpenseWorkbook(
  config: ExpenseReportConfig,
  items: TravelExpenseItem[],
  outputPath: string,
): Promise<GenerationResult> {
  if (items.length === 0) {
    throw new Error("出力対象の交通費明細がありません。");
  }
  const month = items[0].travelDate.slice(0, 7);
  if (items.some((item) => item.travelDate.slice(0, 7) !== month)) {
    throw new Error("複数月の明細を1つの精算書へ出力することはできません。");
  }

  const entries = readZip(await readFile(config.templatePath));
  const entryMap = zipEntryMap(entries);
  const sheetPath = resolveWorksheetPath(entryMap, config.sheetName);
  const sheetEntry = requiredEntry(entryMap, sheetPath);
  const originalExpenseSheet = entryMap.get(resolveWorksheetPath(entryMap, "経費"))?.data;
  let sheetXml = sheetEntry.data.toString("utf8");
  validateTemplate(sheetXml);

  const sharedStrings = readSharedStrings(entryMap.get("xl/sharedStrings.xml")?.data);
  const targetRows: number[] = [];
  const preservedRows: number[] = [];
  for (let row = detailStartRow; row <= allDetailEndRow; row += 1) {
    const transportation = readCellText(sheetXml, `C${row}`, sharedStrings).trim();
    if (transportation === config.transportation) {
      targetRows.push(row);
    } else if (transportation) {
      preservedRows.push(row);
    }
  }

  for (const row of targetRows) {
    for (const column of detailColumns) {
      sheetXml = setCell(sheetXml, `${column}${row}`, null);
    }
  }

  const availableRows: number[] = [];
  for (let row = detailStartRow; row <= safeDetailEndRow; row += 1) {
    if (!preservedRows.includes(row)) {
      availableRows.push(row);
    }
  }
  if (items.length > availableRows.length) {
    throw new Error(
      `明細が多すぎます。入力可能件数は ${availableRows.length} 件、対象は ${items.length} 件です。`
        + ` 保持行: ${preservedRows.join(", ") || "なし"}`,
    );
  }

  const [year, monthNumber] = month.split("-").map(Number);
  sheetXml = setCell(sheetXml, "K3", year);
  sheetXml = setCell(sheetXml, "N3", monthNumber);
  sheetXml = setCell(sheetXml, "P3", config.statementDay);
  sheetXml = setCell(sheetXml, "L5", config.department);
  sheetXml = setCell(sheetXml, "L6", config.employeeName);

  const insertedRows = items.map((item, index) => {
    const row = availableRows[index];
    sheetXml = setCell(sheetXml, `A${row}`, excelDateSerial(item.travelDate));
    sheetXml = setCell(sheetXml, `C${row}`, item.transportation);
    sheetXml = setCell(sheetXml, `E${row}`, item.departure);
    sheetXml = setCell(sheetXml, `H${row}`, item.arrival);
    sheetXml = setCell(sheetXml, `K${row}`, item.purpose);
    sheetXml = setCell(
      sheetXml,
      `N${row}`,
      item.tripType === "roundTrip" ? config.roundTripLabel : config.oneWayLabel,
    );
    sheetXml = setCell(sheetXml, `O${row}`, item.receiptStatus);
    sheetXml = setCell(sheetXml, `P${row}`, item.amountYen);
    return row;
  });

  const subtotalYen = Array.from(
    { length: safeDetailEndRow - detailStartRow + 1 },
    (_, index) => readCellNumber(sheetXml, `P${detailStartRow + index}`),
  ).reduce((sum, amount) => sum + amount, 0);
  sheetXml = setFormulaCachedValue(sheetXml, "P30", subtotalYen);
  sheetXml = setFormulaCachedValue(sheetXml, "C33", config.employeeName);
  validateTemplate(sheetXml);
  sheetEntry.data = Buffer.from(sheetXml, "utf8");
  if (originalExpenseSheet) {
    const currentExpenseSheet = entryMap.get(resolveWorksheetPath(entryMap, "経費"))?.data;
    if (!currentExpenseSheet?.equals(originalExpenseSheet)) {
      throw new Error("経費シートが意図せず変更されました。");
    }
  }

  await writeFile(outputPath, writeZip(entries));
  return {
    outputPath,
    insertedRows,
    preservedRows,
    totalYen: items.reduce((sum, item) => sum + item.amountYen, 0),
    subtotalYen,
  };
}

export function validateTemplate(sheetXml: string): void {
  const requirements = [
    /<c\b[^>]*\br="P30"[^>]*>[\s\S]*?<f[^>]*>SUM\(P9:Q28\)<\/f>/u,
    /<c\b[^>]*\br="C33"[^>]*>[\s\S]*?<f[^>]*>L6<\/f>/u,
    /<dataValidation\b[^>]*\bsqref="N9:N29"[^>]*>/u,
    /<dataValidation\b[^>]*\bsqref="O9:O29"[^>]*>/u,
    /<mergeCell\b[^>]*\bref="L32:M32"[^>]*\/>/u,
    /<mergeCell\b[^>]*\bref="P32:Q32"[^>]*\/>/u,
  ];
  if (requirements.some((requirement) => !requirement.test(sheetXml))) {
    throw new Error("テンプレート構造が想定と異なります。対象テンプレートを確認してください。");
  }
}

export function resolveWorksheetPath(entryMap: Map<string, ZipEntry>, sheetName: string): string {
  const workbookXml = requiredEntry(entryMap, "xl/workbook.xml").data.toString("utf8");
  const sheetTag = [...workbookXml.matchAll(/<sheet\b[^>]*\/>/gu)]
    .find((match) => attributeValue(match[0], "name") === sheetName)?.[0];
  if (!sheetTag) {
    throw new Error(`シートが見つかりません: ${sheetName}`);
  }
  const relationshipId = attributeValue(sheetTag, "r:id");
  if (!relationshipId) {
    throw new Error(`シートの関連付けが見つかりません: ${sheetName}`);
  }

  const relationships = requiredEntry(entryMap, "xl/_rels/workbook.xml.rels").data.toString("utf8");
  const relationshipTag = [...relationships.matchAll(/<Relationship\b[^>]*\/>/gu)]
    .find((match) => attributeValue(match[0], "Id") === relationshipId)?.[0];
  const target = relationshipTag ? attributeValue(relationshipTag, "Target") : null;
  if (!target) {
    throw new Error(`シートのファイルが見つかりません: ${sheetName}`);
  }
  return path.posix.normalize(path.posix.join("xl", target));
}

function requiredEntry(entryMap: Map<string, ZipEntry>, name: string): ZipEntry {
  const entry = entryMap.get(name);
  if (!entry) {
    throw new Error(`Excel内部ファイルが見つかりません: ${name}`);
  }
  return entry;
}

function readSharedStrings(buffer?: Buffer): string[] {
  if (!buffer) {
    return [];
  }
  return [...buffer.toString("utf8").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)].map((match) =>
    [...match[1].replace(/<rPh\b[^>]*>[\s\S]*?<\/rPh>/gu, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)]
      .map((text) => decodeXml(text[1]))
      .join("")
  );
}

function readCellText(sheetXml: string, address: string, sharedStrings: string[]): string {
  const cell = findCell(sheetXml, address);
  if (!cell) {
    return "";
  }
  const type = attributeValue(cell, "t");
  if (type === "inlineStr") {
    return [...cell.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)]
      .map((match) => decodeXml(match[1]))
      .join("");
  }
  if (type !== "s" && type !== "str") {
    return "";
  }
  const value = /<v\b[^>]*>([\s\S]*?)<\/v>/u.exec(cell)?.[1];
  if (value === undefined) {
    return "";
  }
  return type === "s" ? sharedStrings[Number(value)] ?? "" : decodeXml(value);
}

function readCellNumber(sheetXml: string, address: string): number {
  const cell = findCell(sheetXml, address);
  const value = cell ? /<v\b[^>]*>([\s\S]*?)<\/v>/u.exec(cell)?.[1] : undefined;
  const number = value === undefined ? 0 : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function setCell(sheetXml: string, address: string, value: string | number | null): string {
  const span = findCellSpan(sheetXml, address);
  if (!span) {
    throw new Error(`テンプレート内にセルが見つかりません: ${address}`);
  }
  const current = sheetXml.slice(span.start, span.end);
  const openingTag = /^<c\b[^>]*>/u.exec(current)?.[0] ?? current;
  const style = attributeValue(openingTag, "s");
  const attributes = [`r="${address}"`, ...(style ? [`s="${encodeXml(style)}"`] : [])];
  const replacement = value === null
    ? `<c ${attributes.join(" ")}/>`
    : typeof value === "number"
    ? `<c ${attributes.join(" ")}><v>${value}</v></c>`
    : `<c ${attributes.join(" ")} t="inlineStr"><is><t xml:space="preserve">${encodeXml(value)}</t></is></c>`;
  return `${sheetXml.slice(0, span.start)}${replacement}${sheetXml.slice(span.end)}`;
}

function setFormulaCachedValue(sheetXml: string, address: string, value: string | number): string {
  const span = findCellSpan(sheetXml, address);
  if (!span) {
    throw new Error(`テンプレート内に数式セルが見つかりません: ${address}`);
  }
  const current = sheetXml.slice(span.start, span.end);
  if (!current.includes("<f")) {
    throw new Error(`数式セルではありません: ${address}`);
  }
  const openingTag = /^<c\b[^>]*>/u.exec(current)?.[0];
  if (!openingTag) {
    throw new Error(`数式セルの開始タグが不正です: ${address}`);
  }
  const typedOpeningTag = setOpeningTagType(openingTag, typeof value === "string" ? "str" : null);
  const cachedValue = `<v>${encodeXml(String(value))}</v>`;
  const typedCell = `${typedOpeningTag}${current.slice(openingTag.length)}`;
  const replacement = /<v\b[^>]*>[\s\S]*?<\/v>/u.test(typedCell)
    ? typedCell.replace(/<v\b[^>]*>[\s\S]*?<\/v>/u, cachedValue)
    : typedCell.replace("</c>", `${cachedValue}</c>`);
  return `${sheetXml.slice(0, span.start)}${replacement}${sheetXml.slice(span.end)}`;
}

function setOpeningTagType(openingTag: string, type: string | null): string {
  const withoutType = openingTag.replace(/\s+t="[^"]*"/u, "");
  return type === null
    ? withoutType
    : withoutType.replace(/>$/u, ` t="${encodeXml(type)}">`);
}

function findCell(sheetXml: string, address: string): string | null {
  const span = findCellSpan(sheetXml, address);
  return span ? sheetXml.slice(span.start, span.end) : null;
}

function findCellSpan(sheetXml: string, address: string): { start: number; end: number } | null {
  const attributeIndex = sheetXml.indexOf(`r="${address}"`);
  if (attributeIndex < 0) {
    return null;
  }
  const start = sheetXml.lastIndexOf("<c", attributeIndex);
  const openingEnd = sheetXml.indexOf(">", attributeIndex);
  if (start < 0 || openingEnd < 0 || sheetXml.slice(start, attributeIndex).includes(">")) {
    return null;
  }
  if (sheetXml[openingEnd - 1] === "/") {
    return { start, end: openingEnd + 1 };
  }
  const closingStart = sheetXml.indexOf("</c>", openingEnd + 1);
  if (closingStart < 0) {
    return null;
  }
  return { start, end: closingStart + 4 };
}

function excelDateSerial(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000) + 25_569;
}
