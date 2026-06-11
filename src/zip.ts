import { deflateRawSync, inflateRawSync } from "node:zlib";

export type ZipEntry = {
  name: string;
  data: Buffer;
  modifiedTime: number;
  modifiedDate: number;
  externalAttributes: number;
};

const localSignature = 0x04034b50;
const centralSignature = 0x02014b50;
const endSignature = 0x06054b50;

export function readZip(buffer: Buffer): ZipEntry[] {
  const endOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    assertSignature(buffer, offset, centralSignature, "central directory");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const modifiedTime = buffer.readUInt16LE(offset + 12);
    const modifiedDate = buffer.readUInt16LE(offset + 14);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameBytes = buffer.subarray(offset + 46, offset + 46 + fileNameLength);
    const name = nameBytes.toString((flags & 0x800) !== 0 ? "utf8" : "utf8");

    assertSignature(buffer, localOffset, localSignature, `local entry ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 0
      ? Buffer.from(compressed)
      : method === 8
      ? inflateRawSync(compressed)
      : unsupportedCompression(name, method);

    entries.push({ name, data, modifiedTime, modifiedDate, externalAttributes });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

export function writeZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const isDirectory = entry.name.endsWith("/");
    const compressed = isDirectory ? Buffer.alloc(0) : deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(localSignature, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(entry.modifiedTime, 10);
    local.writeUInt16LE(entry.modifiedDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(centralSignature, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(entry.modifiedTime, 12);
    central.writeUInt16LE(entry.modifiedDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(entry.externalAttributes, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);

    localOffset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(endSignature, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function zipEntryMap(entries: ZipEntry[]): Map<string, ZipEntry> {
  return new Map(entries.map((entry) => [entry.name, entry]));
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === endSignature) {
      return offset;
    }
  }
  throw new Error("ZIPの中央ディレクトリ終端が見つかりません。");
}

function assertSignature(buffer: Buffer, offset: number, expected: number, label: string): void {
  if (buffer.readUInt32LE(offset) !== expected) {
    throw new Error(`ZIP ${label} の構造が不正です。`);
  }
}

function unsupportedCompression(name: string, method: number): never {
  throw new Error(`未対応のZIP圧縮方式です: ${name} (method=${method})`);
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
