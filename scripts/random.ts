/**
 * Build-time check and compaction for the word lists behind `/game`.
 *
 * Layout: `content/random/<category>/<field>.txt`, one folder per category
 * (大类) and one file per field (小类), as declared in `randomCategories` in
 * site.config.ts. The authoring format is one term per line in double quotes,
 * with blank lines as group separators. What ships is the bare terms joined
 * by `\n`: no quotes, no CRs, no blank lines, so the page can split the text
 * without parsing it.
 *
 * Called from `compile()` in content.ts so `content:check` in CI catches a
 * broken list, and from the dev server so local and deployed lists are
 * byte-identical.
 */
import { resolve } from "node:path";
import { Glob } from "bun";
import {
  isRandomFieldKey,
  randomFieldList,
  type RandomFieldKey,
} from "../src/site.config";

export const RANDOM_DIR = "random";

/** One quoted term, no quotes or line breaks inside. */
const LINE = /^"([^"\r\n]+)"$/;

export interface RandomList {
  key: RandomFieldKey;
  /** Path inside dist/, e.g. `data/random/engineering/ai.txt`. */
  to: string;
  /** The shipped body: bare terms, `\n`-separated, no trailing newline. */
  body: string;
  count: number;
}

export interface RandomResult {
  lists: RandomList[];
  errors: string[];
  /** Terms found in more than one field. Reported, not fatal. */
  shared: string[];
}

/** Validate one list's source text. Returns the terms, or errors. */
export function parseRandomSource(
  display: string,
  text: string,
): { words: string[]; errors: string[] } {
  const words: string[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const word = LINE.exec(line)?.[1]?.trim();
    if (!word) {
      errors.push(`${display}:${i + 1}  每行一个词，用英文双引号包住，例如 "跳表"，实际是：${line}`);
      return;
    }
    const first = seen.get(word);
    if (first !== undefined) {
      errors.push(`${display}:${i + 1}  "${word}" 与第 ${first} 行重复`);
      return;
    }
    seen.set(word, i + 1);
    words.push(word);
  });

  if (words.length === 0 && errors.length === 0) {
    errors.push(`${display}  文件是空的`);
  }
  return { words, errors };
}

export async function compileRandom(contentDir: string): Promise<RandomResult> {
  const dir = resolve(contentDir, RANDOM_DIR);
  const lists: RandomList[] = [];
  const errors: string[] = [];
  const owners = new Map<string, RandomFieldKey[]>();

  // Relative paths with forward slashes, whatever the platform's separator.
  const files = new Set(
    (
      await Array.fromAsync(new Glob("**/*").scan({ cwd: dir, onlyFiles: true })).catch(
        () => [] as string[],
      )
    ).map((p) => p.replaceAll("\\", "/")),
  );

  const declared = randomFieldList.map((f) => `${f.key}.txt`);
  for (const path of files) {
    const key = path.endsWith(".txt") ? path.slice(0, -4) : "";
    if (!isRandomFieldKey(key)) {
      errors.push(
        `content/${RANDOM_DIR}/${path}  不对应任何领域。路径必须是 <大类>/<小类>.txt，可用：${declared.join(", ")}（在 site.config.ts 的 randomCategories 里声明）`,
      );
    }
  }

  for (const field of randomFieldList) {
    const path = `${field.key}.txt`;
    const display = `content/${RANDOM_DIR}/${path}`;
    if (!files.has(path)) {
      errors.push(`${display}  缺失：randomCategories 声明了「${field.label}」，但没有对应的词库文件`);
      continue;
    }
    const parsed = parseRandomSource(display, await Bun.file(resolve(dir, path)).text());
    errors.push(...parsed.errors);
    if (parsed.errors.length > 0) continue;

    for (const w of parsed.words) owners.set(w, [...(owners.get(w) ?? []), field.key]);
    lists.push({
      key: field.key,
      to: `data/${RANDOM_DIR}/${path}`,
      body: parsed.words.join("\n"),
      count: parsed.words.length,
    });
  }

  const shared = [...owners]
    .filter(([, o]) => o.length > 1)
    .map(([w, o]) => `"${w}"  (${o.join(", ")})`);

  return { lists, errors, shared };
}

/** One list as shipped, for the dev server. Undefined if missing or broken. */
export async function readRandomList(
  contentDir: string,
  key: RandomFieldKey,
): Promise<string | undefined> {
  const file = Bun.file(resolve(contentDir, RANDOM_DIR, `${key}.txt`));
  if (!(await file.exists())) return undefined;
  const parsed = parseRandomSource(key, await file.text());
  return parsed.errors.length > 0 ? undefined : parsed.words.join("\n");
}
