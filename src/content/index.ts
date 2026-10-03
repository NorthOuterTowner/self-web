import type { CategoryId } from "../site.config";
import { posts as generated } from "./generated";
import type { Post } from "./types";

/**
 * Query layer over the compiled content.
 *
 * `generated.ts` is produced from content/**\/*.md by scripts/content.ts and
 * already arrives sorted newest first.
 */

export const allPosts: Post[] = generated;

export const postsByCategory: Record<CategoryId, Post[]> = {
  journal: allPosts.filter((p) => p.category === "journal"),
  computing: allPosts.filter((p) => p.category === "computing"),
  comms: allPosts.filter((p) => p.category === "comms"),
};

export function getPosts(category: CategoryId): Post[] {
  return postsByCategory[category];
}

export function getPost(
  category: CategoryId,
  slug: string | undefined,
): Post | undefined {
  const posts = postsByCategory[category];
  if (!slug) return posts[0];
  return posts.find((p) => p.slug === slug);
}

export function getNeighbours(category: CategoryId, slug: string) {
  const posts = postsByCategory[category];
  const i = posts.findIndex((p) => p.slug === slug);
  return {
    prev: i > 0 ? posts[i - 1] : undefined,
    next: i >= 0 && i < posts.length - 1 ? posts[i + 1] : undefined,
  };
}

export type { Post };
