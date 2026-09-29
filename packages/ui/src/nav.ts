/** Sidebar menu contract: every tool exports its sections; the portal shell renders them. */
export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Hidden from VIEWER accounts. */
  editor?: boolean;
};

export type NavSection = {
  /** Section heading; omit for the tool's top-level links. */
  title?: string;
  items: NavItem[];
};

export type ToolNav = {
  /** Tool name shown above its sections. */
  tool: string;
  sections: NavSection[];
  /** Links shown in the Admin panel (ADMIN only). */
  admin?: NavItem[];
};
