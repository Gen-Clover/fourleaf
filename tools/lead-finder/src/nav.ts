import type { ToolNav } from "@genclover/ui/nav";

// Find businesses → work the leads (Today) → review with Claude → learn from reports.
export const leadFinderNav: ToolNav = {
  tool: "Lead Finder",
  home: "/leads",
  sections: [
    { items: [{ href: "/leads", label: "Dashboard", icon: "▦" }] },
    { items: [{ href: "/leads/today", label: "Today", icon: "✓", description: "Replies, follow-ups and first messages, one at a time", editor: true }] },
    { items: [{ href: "/leads/list", label: "Leads", icon: "☰", description: "Every lead, ranked by service" }] },
    {
      title: "Find",
      items: [
        { href: "/leads/find", label: "New search", icon: "⌕", description: "Search Google Maps by niche and area", editor: true },
        { href: "/leads/searches", label: "Searches", icon: "◷", description: "Past and weekly searches" },
        { href: "/leads/new", label: "Add a lead", icon: "+", description: "Walk-ins, referrals, your own contacts", editor: true },
      ],
    },
    {
      title: "Insights",
      items: [
        { href: "/leads/claude", label: "Claude review", icon: "✦", description: "Have Claude judge leads and write messages", editor: true },
        { href: "/leads/reports", label: "Reports", icon: "▤", description: "Reply and win rates, Google spend per result" },
      ],
    },
  ],
  admin: [{ href: "/leads/settings", label: "Lead Finder Settings", icon: "⚙", description: "Niches, spend cap, automation rules, scoring" }],
};
