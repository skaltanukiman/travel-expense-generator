import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExpenseReportConfig } from "./domain.js";

export async function loadConfig(
  configPath: string,
  rootDirectory = process.cwd(),
): Promise<ExpenseReportConfig> {
  const absoluteConfigPath = path.resolve(configPath);
  const raw = await readFile(absoluteConfigPath, "utf8");
  const config = JSON.parse(stripJsonComments(raw.replace(/^\uFEFF/u, ""))) as ExpenseReportConfig;

  return {
    ...config,
    templatePath: resolveFrom(rootDirectory, config.templatePath),
    inputDirectory: resolveFrom(rootDirectory, config.inputDirectory),
    outputDirectory: resolveFrom(rootDirectory, config.outputDirectory),
  };
}

function resolveFrom(baseDirectory: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(baseDirectory, value);
}

export function stripJsonComments(value: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];

    if (lineComment) {
      if (current === "\n" || current === "\r") {
        lineComment = false;
        result += current;
      } else {
        result += " ";
      }
      continue;
    }

    if (blockComment) {
      if (current === "*" && next === "/") {
        result += "  ";
        blockComment = false;
        index += 1;
      } else {
        result += current === "\n" || current === "\r" ? current : " ";
      }
      continue;
    }

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "\"") {
      inString = true;
      result += current;
    } else if (current === "/" && next === "/") {
      result += "  ";
      lineComment = true;
      index += 1;
    } else if (current === "/" && next === "*") {
      result += "  ";
      blockComment = true;
      index += 1;
    } else {
      result += current;
    }
  }

  return result;
}
