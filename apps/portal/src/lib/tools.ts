import { canAccessPath } from "@genclover/auth/access";
import { clientsNav } from "@genclover/clients/nav";
import { deliveryNav } from "@genclover/delivery/nav";
import { financeNav } from "@genclover/finance/nav";
import { governanceNav } from "@genclover/governance/nav";
import { leadFinderNav } from "@genclover/lead-finder/nav";
import { peopleNav } from "@genclover/people/nav";
import type { NavItem, ToolNav } from "@genclover/ui/nav";

/** Every tool in the portal, in the order of the work (find → sign → deliver → pay → govern). Add a tool here. */
export const TOOLS: { nav: ToolNav; icon: string; description: string }[] = [
  { nav: leadFinderNav, icon: "◎", description: "Leads, company accounts, outreach and deals" },
  { nav: clientsNav, icon: "◉", description: "Onboarding, clients, NDA / MSA / SOW and renewals" },
  { nav: deliveryNav, icon: "◧", description: "Projects, milestones, team, timesheets, resources" },
  { nav: peopleNav, icon: "☺", description: "Employees, contractors, documents, work orders" },
  { nav: financeNav, icon: "₹", description: "Invoices, receipts, pay runs, spend, cash, reports" },
  { nav: governanceNav, icon: "§", description: "Compliance calendar, issues, decisions, approvals" },
];

/** The portal home, shown in the shared top bar like a tool with no menus of its own. */
export const PORTAL_NAV: ToolNav = { tool: "Portal", home: "/", sections: [] };

export const CORE_ADMIN: NavItem[] = [
  { href: "/admin/users", label: "Users & Roles", icon: "👤", description: "Who can sign in, and their role" },
  { href: "/admin/audit", label: "Audit Log", icon: "⎘", description: "Every change: who, what and when" },
];

export type ToolLink = { name: string; href: string; home: string; icon: string; description: string };
export type PageLink = { tool: string; label: string; description?: string; href: string; icon: string; group?: string };

/**
 * The tools this role can use, each opening on the first page the role can see there. A tool whose only page
 * for this role is one an earlier tool already opens (a team member's Timesheets is in Delivery and People) is
 * left out, so no two tiles lead to the same page.
 */
export function toolsFor(role: string): ToolLink[] {
  const taken = new Set<string>();
  return TOOLS.flatMap((t) => {
    const pages = [t.nav.home, ...t.nav.sections.flatMap((s) => s.items.map((i) => i.href))].filter((h) => canAccessPath(role, h));
    if (!pages.length || pages.every((h) => taken.has(h))) return [];
    pages.forEach((h) => taken.add(h));
    return [{ name: t.nav.tool, href: pages[0], home: t.nav.home, icon: t.icon, description: t.description }];
  });
}

/** Every page this role can open, across all tools and settings: what the page search (Ctrl+K) looks through. */
export function pagesFor(role: string): PageLink[] {
  const seen = new Set<string>();
  const out: PageLink[] = [{ tool: "Portal", label: "Home", description: "Overview and all tools", href: "/", icon: "⌂" }];
  for (const t of TOOLS) {
    const items = [
      ...t.nav.sections.flatMap((s) => s.items.map((i) => ({ ...i, group: s.title }))),
      ...(t.nav.admin ?? []).map((i) => ({ ...i, group: "Settings" })),
    ];
    for (const i of items) {
      if (seen.has(i.href) || !canAccessPath(role, i.href)) continue;
      seen.add(i.href);
      out.push({ tool: t.nav.tool, label: i.label, description: i.description, href: i.href, icon: i.icon, group: i.group });
    }
  }
  for (const i of CORE_ADMIN) if (canAccessPath(role, i.href)) out.push({ tool: "Portal", label: i.label, description: i.description, href: i.href, icon: i.icon, group: "Settings" });
  return out;
}
