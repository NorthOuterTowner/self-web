import type { CSSProperties } from "react";
import { categories, navExtras } from "../site.config";
import { sectionIcon, type Icon } from "./icons";

/** One top-level destination of the site. */
export interface Section {
  to: string;
  /** What the top bar shows: the Latin name, except for 首页. */
  label: string;
  /** Chinese name, for places with room for both. */
  title: string;
  key: string;
  /**
   * Sits where the 00–06 index used to in the nav. Replacing rather than
   * adding keeps each link the same width: index plus icon plus label would
   * have pushed the bar past the edge on laptop widths, above the 900px point
   * where it starts to scroll.
   */
  icon?: Icon;
  /**
   * Set only for the extras. Categories get their accent from the
   * `[data-accent-key]` rules in nav.css; driving the extras from a custom
   * property instead keeps `navExtras` the only file to edit when one is
   * added.
   */
  style?: CSSProperties;
}

/**
 * Every top-level destination, in nav order: home, the three streams, then
 * everything that is a destination without being a stream.
 *
 * The split matters because the home page ring is built from `categories` and
 * has exactly three stations — so "in the nav" and "has a card" have to be
 * separate lists, or adding a link takes the ring apart.
 *
 * Shared by the top bar and the 404 page's site map, so a new destination
 * shows up in both without either being edited.
 */
export const sections: Section[] = [
  {
    to: "/",
    label: "首页",
    title: "首页",
    key: "home",
    icon: sectionIcon("home"),
  },
  ...categories.map((c) => ({
    to: `/${c.slug}`,
    label: c.titleEn,
    title: c.title,
    key: c.id,
    icon: sectionIcon(c.id),
  })),
  ...navExtras.map((e) => ({
    to: e.to,
    label: e.label,
    title: e.title,
    key: e.key,
    icon: sectionIcon(e.key),
    style: { "--accent-dot": `var(--${e.tone})` } as CSSProperties,
  })),
];
