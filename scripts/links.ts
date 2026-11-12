/**
 * Build-time check for `content/links/<shelf>.json`.
 *
 * These files are copied, not bundled, so this is the one place a malformed
 * shelf gets caught before it ships. Called from `compile()` in content.ts so
 * `content:check` in CI covers it too.
 *
 * Fails on a declared shelf with no file, a file no shelf declares, invalid
 * JSON, or anything `parseLinkShelf` rejects.
 */
import { resolve } from "node:path";
import { Glob } from "bun";
import { countLinks, parseLinkShelf } from "../src/content/links";
import { linkShelves } from "../src/site.config";
import type { Asset } from "./content";

export const LINKS_DIR = "links";

export async function compileLinks(
  contentDir: string,
): Promise<{ files: Asset[]; links: number; errors: string[] }> {
  const dir = resolve(contentDir, LINKS_DIR);
  const files: Asset[] = [];
  const errors: string[] = [];
  let links = 0;

  const names = new Set(
    await Array.fromAsync(new Glob("*").scan({ cwd: dir, onlyFiles: true })).catch(
      () => [] as string[],
    ),
  );
  const declared = new Set(linkShelves.map((s) => `${s.slug}.json`));

  for (const name of [...names].sort()) {
    if (!declared.has(name)) {
      errors.push(
        `content/${LINKS_DIR}/${name}  不对应任何资源页。可用：${[...declared].join(", ")}（在 site.config.ts 的 linkShelves 里声明）`,
      );
    }
  }

  for (const shelf of linkShelves) {
    const name = `${shelf.slug}.json`;
    const display = `content/${LINKS_DIR}/${name}`;
    if (!names.has(name)) {
      errors.push(`${display}  缺失：linkShelves 声明了「${shelf.title}」，但没有对应的文件`);
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

    const parsed = parseLinkShelf(data);
    for (const err of parsed.errors) errors.push(`${display}  ${err}`);
    if (parsed.errors.length > 0) continue;

    links += countLinks(parsed.groups);
    files.push({ from, to: `data/${LINKS_DIR}/${name}` });
  }

  return { files, links, errors };
}
