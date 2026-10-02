/** Menu contract: every tool exports its menu; the portal shell renders it as the top navigation bar. */
export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** One line shown under the label in menus, so people find the right page without guessing. */
  description?: string;
};
// Who sees an item is decided by its path: packages/auth/src/access.ts.

/** A titled section is a menu in the top bar (and tabs under it on its pages); an untitled one is plain links. */
export type NavSection = {
  title?: string;
  items: NavItem[];
};

export type ToolNav = {
  /** Tool name shown next to the logo. */
  tool: string;
  /** The tool's landing page, opened from the portal home (e.g. /finance). */
  home: string;
  sections: NavSection[];
  /** Settings links (ADMIN only), shown in the gear menu. */
  admin?: NavItem[];
};
