/**
 * The link shelves under `/resource` (资源库 / 工具站 / To Read).
 *
 * Authored as one JSON file per shelf in `content/links/<shelf>.json`, named
 * after the shelf's slug in `site.config.ts` (`linkShelves`):
 *
 *   [
 *     {
 *       "category": "Web 开发",
 *       "links": [
 *         { "title": "MDN Web Docs", "url": "https://developer.mozilla.org/", "description": "Web 标准文档" },
 *         { "title": "Can I use", "url": "https://caniuse.com/" }
 *       ]
 *     }
 *   ]
 *
 *   category     The group heading. Groups appear in file order.
 *   title        What the card says, and what the default search looks at.
 *   url          Opens in a new tab. Must start with http:// or https://.
 *   description  Optional. One short line under the title; the
 *                "标题 + 描述 + 链接" search mode also searches it and the url.
 *
 * These files are not compiled into the bundle: the build copies them to
 * `dist/data/links/` and a shelf page fetches only its own file. Validated at
 * build time by `scripts/links.ts`; the runtime goes through the same
 * `parseLinkShelf` below, so both agree on what a valid file is.
 */

import { withBase } from "../lib/basePath";
import type { LinkShelfId } from "../site.config";

export interface LinkItem {
  title: string;
  url: string;
  description?: string;
}

export interface LinkGroup {
  category: string;
  links: LinkItem[];
}

const GROUP_KEYS = new Set(["category", "links"]);
const LINK_KEYS = new Set(["title", "url", "description"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Checks one shelf file. Returns the groups that passed plus one message per
 * problem, located by group and link number so the author can find it.
 */
export function parseLinkShelf(data: unknown): {
  groups: LinkGroup[];
  errors: string[];
} {
  const groups: LinkGroup[] = [];
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push("顶层必须是数组，每一项是一个分类");
    return { groups, errors };
  }

  const seenCategories = new Set<string>();

  data.forEach((rawGroup, gi) => {
    const at = `第 ${gi + 1} 个分类`;
    if (!isObject(rawGroup)) {
      errors.push(`${at} 必须是对象`);
      return;
    }
    const unknownKeys = Object.keys(rawGroup).filter((k) => !GROUP_KEYS.has(k));
    if (unknownKeys.length > 0) {
      errors.push(`${at} 有未知字段：${unknownKeys.join(", ")}，只能写 category 和 links`);
      return;
    }
    if (!nonEmpty(rawGroup.category)) {
      errors.push(`${at} 的 category 必须是非空字符串`);
      return;
    }
    const category = rawGroup.category.trim();
    if (seenCategories.has(category)) {
      errors.push(`${at}「${category}」与前面的分类重名`);
      return;
    }
    seenCategories.add(category);

    if (!Array.isArray(rawGroup.links)) {
      errors.push(`${at}「${category}」的 links 必须是数组`);
      return;
    }

    const links: LinkItem[] = [];
    const seenLinks = new Set<string>();

    rawGroup.links.forEach((rawLink: unknown, li) => {
      const where = `${at}「${category}」的第 ${li + 1} 条链接`;
      if (!isObject(rawLink)) {
        errors.push(`${where} 必须是对象`);
        return;
      }
      const unknownLinkKeys = Object.keys(rawLink).filter((k) => !LINK_KEYS.has(k));
      if (unknownLinkKeys.length > 0) {
        errors.push(
          `${where} 有未知字段：${unknownLinkKeys.join(", ")}，只能写 title、url 和 description`,
        );
        return;
      }
      if (!nonEmpty(rawLink.title)) {
        errors.push(`${where} 的 title 必须是非空字符串`);
        return;
      }
      const title = rawLink.title.trim();
      if (typeof rawLink.url !== "string" || !isWebUrl(rawLink.url.trim())) {
        errors.push(`${where}（${title}）的 url 必须以 http:// 或 https:// 开头`);
        return;
      }
      const url = rawLink.url.trim();
      if (rawLink.description !== undefined && typeof rawLink.description !== "string") {
        errors.push(`${where}（${title}）的 description 必须是字符串`);
        return;
      }
      const key = `${title}\n${url}`;
      if (seenLinks.has(key)) {
        errors.push(`${where}（${title}）与本分类里的另一条重复`);
        return;
      }
      seenLinks.add(key);

      const description = rawLink.description?.trim();
      links.push(description ? { title, url, description } : { title, url });
    });

    groups.push({ category, links });
  });

  return { groups, errors };
}

/** Total links across a shelf's groups. */
export function countLinks(groups: readonly LinkGroup[]): number {
  return groups.reduce((n, g) => n + g.links.length, 0);
}

/** Shelves already fetched, or in flight. */
const cache = new Map<LinkShelfId, Promise<LinkGroup[]>>();

/**
 * One shelf, fetched on first ask and remembered for the session. A missing
 * file is an error rather than an empty shelf: the build refuses to ship a
 * declared shelf without one. A failed request is dropped from the cache so
 * the next visit retries.
 */
export function loadLinkShelf(shelf: LinkShelfId): Promise<LinkGroup[]> {
  const hit = cache.get(shelf);
  if (hit) return hit;

  const request = fetch(withBase(`/data/links/${shelf}.json`))
    .then(async (res) => {
      // On Pages a missing file is a 404 whose body is the SPA itself.
      if (!res.ok) throw new Error(`links ${shelf}: HTTP ${res.status}`);
      return parseLinkShelf(await res.json()).groups;
    })
    .catch((error: unknown) => {
      cache.delete(shelf);
      throw error;
    });

  cache.set(shelf, request);
  return request;
}
