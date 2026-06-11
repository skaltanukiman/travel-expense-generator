import path from "node:path";

export type CliArgs = {
  configPath: string;
  inputDirectory?: string;
  templatePath?: string;
  outputPath?: string;
  month?: string;
};

export function parseArgs(argv = process.argv.slice(2)): CliArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      throw new Error(`不明な引数です: ${key}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${key} の値がありません。`);
    }
    values.set(key, value);
    index += 1;
  }

  return {
    configPath: values.get("--config") ?? path.resolve("expense-report.jsonc"),
    inputDirectory: values.get("--input"),
    templatePath: values.get("--template"),
    outputPath: values.get("--output"),
    month: values.get("--month"),
  };
}
