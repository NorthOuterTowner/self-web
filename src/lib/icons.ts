/**
 * Every Phosphor icon the site uses, chosen in one place.
 *
 * Swapping an icon is a one-line change here. Three decisions behind the way
 * it is wired:
 *
 * Not in `site.config.ts`, even though that is where the nav entries live.
 * The content compiler (`scripts/content.ts`) imports the config, and putting
 * React components in there would make every content rebuild load React and
 * the icon set for nothing. So the config stays data, and the nav looks icons
 * up here by the same `key` it already uses.
 *
 * One deep import per icon (`@phosphor-icons/react/House`) rather than named
 * imports from the package root. The root re-exports roughly 1,500 icons. A
 * production build would tree-shake them (the package declares
 * `sideEffects: false`), but the dev server and `tsc` would still read every
 * one, and each icon's type file carries six base64 preview images in its
 * JSDoc. Deep imports cost nothing at build time and keep both fast.
 *
 * The `…Icon` names, because the unsuffixed ones (`House`) are marked
 * deprecated as of 2.1. The suffix also avoids names like Phosphor's `Link`,
 * which would clash with the router `Link` used all over this codebase.
 *
 * Weight, size and colour are the library defaults — `regular`, `1em`,
 * `currentColor` — so there is no `IconContext` provider. Regular strokes are
 * 1/16 of the icon's size, which at nav and footer sizes lands on the same
 * ~1px as the site's hairlines. `light` would render sub-pixel and wash out on
 * a 1x screen, the same failure as the too-faint stars in the notes field.
 * Size is set in CSS next to each usage.
 */

import { CellTowerIcon } from "@phosphor-icons/react/CellTower";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { CodeIcon } from "@phosphor-icons/react/Code";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { FeatherIcon } from "@phosphor-icons/react/Feather";
import { FilesIcon } from "@phosphor-icons/react/Files";
import { GithubLogoIcon } from "@phosphor-icons/react/GithubLogo";
import { GraphIcon } from "@phosphor-icons/react/Graph";
import { HouseIcon } from "@phosphor-icons/react/House";
import { LinkedinLogoIcon } from "@phosphor-icons/react/LinkedinLogo";
import { StarFourIcon } from "@phosphor-icons/react/StarFour";
import { XIcon } from "@phosphor-icons/react/X";
import type { Icon } from "@phosphor-icons/react/lib";
import type { CategoryId } from "../site.config";

export type { Icon };

/**
 * Top nav, keyed by the nav's own `key`: "home", the category ids, and the
 * `navExtras` keys.
 *
 * The `satisfies` makes "home" and every category mandatory, so adding a
 * category without an icon is a type error rather than a gap in the bar.
 * Extras are looked up by a runtime string, so a missing one just renders
 * without an icon.
 */
export const sectionIcons = {
  home: HouseIcon,
  // A quill: writing for oneself, as opposed to the other two streams.
  journal: FeatherIcon,
  computing: CodeIcon,
  // The comms writing is about radios and base stations, so a mast rather
  // than a generic broadcast wave.
  comms: CellTowerIcon,
  // Overlapping sheets — the same picture the skills page draws.
  skills: FilesIcon,
  // Nodes and edges: the roadmap is a DAG, and a tree icon would claim a
  // hierarchy it does not have.
  roadmap: GraphIcon,
  // Four-pointed, like the registration marks around the notes field.
  others: StarFourIcon,
} satisfies Record<"home" | CategoryId, Icon> & Record<string, Icon>;

export function sectionIcon(key: string): Icon | undefined {
  return (sectionIcons as Record<string, Icon>)[key];
}

/** Footer contact links. */
export const socialIcons = {
  github: GithubLogoIcon,
  linkedin: LinkedinLogoIcon,
} satisfies Record<string, Icon>;

/** The code block copy button, by state. */
export const copyIcons = {
  idle: CopyIcon,
  copied: CheckIcon,
  failed: XIcon,
} satisfies Record<"idle" | "copied" | "failed", Icon>;
