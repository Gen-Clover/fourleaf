import type { ToolNav } from "@genclover/ui/nav";

// Signed scope → project → milestones and team → hours → approval → (Finance bills and pays).
export const deliveryNav: ToolNav = {
  tool: "Delivery & Resources",
  home: "/delivery",
  sections: [
    { items: [{ href: "/delivery", label: "Dashboard", icon: "▦" }] },
    { items: [{ href: "/projects", label: "Projects", icon: "◧", description: "Scope, milestones, team, hours, issues" }] },
    {
      title: "Timesheets",
      items: [
        { href: "/timesheets", label: "Timesheets", icon: "◷", description: "Log hours by project and day; submit weekly" },
        { href: "/timesheets/approve", label: "Approve", icon: "✓", description: "Submitted weeks waiting for approval" },
      ],
    },
    { items: [{ href: "/resources", label: "Resources", icon: "☺", description: "Capacity, allocation, clashes, requests" }] },
    { items: [{ href: "/issues", label: "Issues", icon: "!", description: "Issues and escalations across projects" }] },
  ],
};
