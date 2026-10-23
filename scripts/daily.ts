/**
 * Build-time check for `content/daily/*.json`.
 *
 * These files are not compiled into the bundle, only copied, so this is the
 * one place a malformed month gets caught before it ships. Called from
 * `compile()` in content.ts so `content:check` in CI covers it too.
 */
import { resolve } from "node:path";
import { Glob } from "bun";
import { MONTH_FILE, parseDailyMonth } from "../src/content/daily";
import type { Asset } from "./content";

export const DAILY_DIR = "daily";

export async function compileDaily(
  contentDir: string,
): Promise<{ files: Asset[]; days: number; errors: string[] }> {
  const dir = resolve(contentDir, DAILY_DIR);
  const files: Asset[] = [];
  const errors: string[] = [];
  let days = 0;

  const names = (
    await Array.fromAsync(new Glob("*").scan({ cwd: dir, onlyFiles: true }))
      // No such directory yet is fine: no entries.
      .catch(() => [] as string[])
  ).sort();

  for (const name of names) {
    const display = `content/${DAILY_DIR}/${name}`;
    const month = name.replace(/\.json$/, "");
    if (!name.endsWith(".json") || !MONTH_FILE.test(month)) {
      errors.push(`${display}  文件名必须是 YYYY-MM.json，例如 2026-10.json`);
      continue;
    }

    const from = resolve(dir, name);
    let data: unknown;
    try {
      data = await Bun.file(from).json();
    } catch (error) {
      errors.push(`${display}  不是合法的 JSON：${(error as Error).message}`);
      continue;
    }

    const parsed = parseDailyMonth(month, data);
    for (const err of parsed.errors) errors.push(`${display}  ${err}`);
    if (parsed.errors.length > 0) continue;

    days += parsed.entries.size;
    // Under data/, not daily/: `/daily` is the page's route, and a real
    // directory at that path would make GitHub Pages redirect it to the
    // folder instead of serving the app.
    files.push({ from, to: `data/${DAILY_DIR}/${name}` });
  }

  return { files, days, errors };
}
