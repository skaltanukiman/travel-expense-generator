import { describe, expect, it } from "vitest";
import { readZip, writeZip, type ZipEntry } from "../src/zip.js";

describe("ZIP", () => {
  it("Excel内のZIPエントリを往復変換できる", () => {
    const entries: ZipEntry[] = [
      {
        name: "xl/workbook.xml",
        data: Buffer.from("<workbook/>"),
        modifiedTime: 0,
        modifiedDate: 0,
        externalAttributes: 0,
      },
      {
        name: "xl/worksheets/sheet1.xml",
        data: Buffer.from("<worksheet/>"),
        modifiedTime: 0,
        modifiedDate: 0,
        externalAttributes: 0,
      },
    ];

    expect(readZip(writeZip(entries)).map(({ name, data }) => [name, data.toString()])).toEqual([
      ["xl/workbook.xml", "<workbook/>"],
      ["xl/worksheets/sheet1.xml", "<worksheet/>"],
    ]);
  });
});
