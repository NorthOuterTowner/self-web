/**
 * Build-time check and compaction for `content/random/*.txt`, the word lists
 * behind `/game`.
 *
 * The authoring format is one term per line in double quotes, with blank
 * lines as group separators. What ships is the bare terms joined by `\n`: no
 * quotes, no CRs, no blank lines. That cuts the files by roughly a fifth before
 * gzip, and it lets the page split the text without parsing it.
 *
 * Called from `compile()` in content.ts so `content:check` in CI catches a
 * broken list, and from the dev server so local and deployed lists are
 * byte-identical.
 */
import { resolve } from "node:path";
import { Glob } from "bun";
import { randomFields, type RandomFieldId } from "../src/site.config";

export const RANDOM_DIR = "random";

/** One quoted term, no quotes or line breaks inside. */
const LINE = /^"([^"\r\n]+)"$/;

export interface RandomList {
  id: RandomFieldId;
  /** Path inside dist/, e.g. `data/random/law.txt`. */
  to: string;
  /** The shipped body: bare terms, `\n`-separated, no trailing newline. */
  body: string;
  count: number;
}

export interface RandomResult {
  lists: RandomList[];
  errors: string[];
  /** Terms found in more than one list. Not an error, but it skews 全领域. */
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
    const m = LINE.exec(line);
    const word = m?.[1]?.trim();
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
    errors.push(`${display}  文件为空`);
  }
  return { words, errors };
}

export async function compileRandom(contentDir: string): Promise<RandomResult> {
  const dir = resolve(contentDir, RANDOM_DIR);
  const lists: RandomList[] = [];
  const errors: string[] = [];
  const owners = new Map<string, RandomFieldId[]>();

  const names = new Set(
    await Array.fromAsync(new Glob("*").scan({ cwd: dir, onlyFiles: true })).catch(
      () => [] as string[],
    ),
  );
  const ids = randomFields.map((f) => f.id as string);

  for (const name of names) {
    if (!name.endsWith(".txt") || !ids.includes(name.slice(0, -4))) {
      errors.push(
        `content/${RANDOM_DIR}/${name}  不对应任何领域。文件名必须是 <id>.txt，可用 id：${ids.join(", ")}（在 site.config.ts 的 randomFields 里声明）`,
      );
    }
  }

  for (const field of randomFields) {
    const name = `${field.id}.txt`;
    const display = `content/${RANDOM_DIR}/${name}`;
    if (!names.has(name)) {
      errors.push(`${display}  缺失：randomFields 声明了「${field.title}」，但没有对应的词库文件`);
      continue;
    }
    const parsed = parseRandomSource(display, await Bun.file(resolve(dir, name)).text());
    errors.push(...parsed.errors);
    if (parsed.errors.length > 0) continue;

    for (const w of parsed.words) owners.set(w, [...(owners.get(w) ?? []), field.id]);
    lists.push({
      id: field.id,
      to: `data/${RANDOM_DIR}/${name}`,
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
  id: RandomFieldId,
): Promise<string | undefined> {
  const file = Bun.file(resolve(contentDir, RANDOM_DIR, `${id}.txt`));
  if (!(await file.exists())) return undefined;
  const parsed = parseRandomSource(id, await file.text());
  return parsed.errors.length > 0 ? undefined : parsed.words.join("\n");
}
