import type { ZipEntry } from "../../src/zip.js";

export function createTemplateEntries(): ZipEntry[] {
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
        if (row === 14 && column === "C") {
          return stringCell(`${column}${row}`, "タクシー");
        }
        if (row === 14 && column === "P") {
          return numberCell(`${column}${row}`, 1000);
        }
        return cell(`${column}${row}`);
      }).join("");
    }),
    '<c r="P30" s="1"><f>SUM(P9:Q28)</f><v>3560</v></c>',
    '<c r="C33" s="1"><f>L6</f><v>0</v></c>',
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
