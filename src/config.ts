import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExpenseReportConfig } from "./domain.js";

export async function loadConfig(
  configPath: string,
  rootDirectory = process.cwd(),
): Promise<ExpenseReportConfig> {
  const absoluteConfigPath = path.resolve(configPath);
  const raw = await readFile(absoluteConfigPath, "utf8");
  const config = JSON.parse(raw.replace(/^\uFEFF/u, "")) as ExpenseReportConfig;

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
