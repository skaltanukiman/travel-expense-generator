import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExpenseReportConfig } from "./domain.js";

export async function loadConfig(configPath: string): Promise<ExpenseReportConfig> {
  const absoluteConfigPath = path.resolve(configPath);
  const raw = await readFile(absoluteConfigPath, "utf8");
  const config = JSON.parse(raw.replace(/^\uFEFF/u, "")) as ExpenseReportConfig;
  const baseDirectory = path.dirname(absoluteConfigPath);

  return {
    ...config,
    templatePath: resolveFrom(baseDirectory, config.templatePath),
    inputDirectory: resolveFrom(baseDirectory, config.inputDirectory),
    outputDirectory: resolveFrom(baseDirectory, config.outputDirectory),
  };
}

function resolveFrom(baseDirectory: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(baseDirectory, value);
}
