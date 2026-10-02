import type { ToolNav } from "@genclover/ui/nav";

// Find businesses and companies → work them (Today) → deals (opportunities) → won → Clients & Agreements.
export const leadFinderNav: ToolNav = {
  tool: "Lead Finder",
  home: "/leads",
  sections: [
    { items: [{ href: "/leads", label: "Dashboard", icon: "▦" }] },
    { items: [{ href: "/leads/today", label: "Today", icon: "✓", description: "Replies, follow-ups and first messages, one at a time" }] },
    {
      title: "Leads",
      items: [
        { href: "/leads/list", label: "Local businesses", icon: "☰", description: "Found on Google Maps or added by hand, ranked by service" },
        { href: "/leads/accounts", label: "Company accounts", icon: "▣", description: "B2B: typed in, from LinkedIn or imported" },
        { href: "/leads/opportunities", label: "Opportunities", icon: "◆", description: "Deals by stage; a company can have several" },
      ],
    },
    {
      title: "Pipeline",
      items: [
        { href: "/leads/tasks", label: "Calls & meetings", icon: "☎", description: "Call-backs, meetings and visits: mine or the team's" },
        { href: "/leads/snoozed", label: "Snoozed", icon: "☾", description: "“Not now” leads and the date each comes back" },
        { href: "/leads/won", label: "Won", icon: "★", description: "Won deals waiting for onboarding" },
        { href: "/leads/list?stuck=1", label: "Stuck deals", icon: "!", description: "Replied, meeting or proposal with no movement" },
      ],
    },
    {
      title: "Find",
      items: [
        { href: "/leads/find", label: "New search", icon: "⌕", description: "Search Google Maps by niche and area" },
        { href: "/leads/searches", label: "Searches", icon: "◷", description: "Past and weekly searches" },
        { href: "/leads/new", label: "Add a lead", icon: "+", description: "Walk-ins, referrals, companies, your own contacts" },
        { href: "/leads/import", label: "Import a list", icon: "⇪", description: "CSV from LinkedIn Sales Navigator, Apollo or any spreadsheet" },
      ],
    },
    {
      title: "Insights",
      items: [
        { href: "/leads/claude", label: "Claude review", icon: "✦", description: "Have Claude judge leads and write messages" },
        { href: "/leads/reports", label: "Reports", icon: "▤", description: "Reply and win rates, Google spend per result" },
      ],
    },
  ],
  admin: [{ href: "/leads/settings", label: "Lead Finder Settings", icon: "⚙", description: "Niches, spend cap, automation rules, scoring" }],
};
