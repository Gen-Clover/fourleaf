import type { ToolNav } from "@genclover/ui/nav";

export const financeNav: ToolNav = {
  tool: "Finance",
  sections: [
    {
      items: [
        { href: "/", label: "Dashboard", icon: "▦" },
        { href: "/projects", label: "Projects", icon: "◧" },
        { href: "/clients", label: "Clients", icon: "◉" },
        { href: "/calculator", label: "Quick Calculator", icon: "∑" },
        { href: "/rate-card", label: "Rate Card", icon: "☰" },
      ],
    },
    {
      title: "Financial Control",
      items: [
        { href: "/cfo", label: "CFO Dashboard", icon: "◎", editor: true },
        { href: "/funds", label: "Funds", icon: "▣", editor: true },
        { href: "/commitments", label: "Commitments", icon: "⧗", editor: true },
        { href: "/planner", label: "Hire Planner", icon: "⚖", editor: true },
        { href: "/pipeline", label: "Sales Pipeline", icon: "↗", editor: true },
      ],
    },
    {
      title: "Delivery",
      items: [
        { href: "/timesheets", label: "Timesheets", icon: "◷" },
        { href: "/people", label: "People", icon: "☺", editor: true },
      ],
    },
    {
      title: "Finance",
      items: [
        { href: "/billing", label: "Monthly Billing", icon: "₿" },
        { href: "/invoices", label: "Invoices", icon: "⎙" },
        { href: "/expenses", label: "Expenses", icon: "₹", editor: true },
        { href: "/reports", label: "Reports", icon: "▤", editor: true },
      ],
    },
  ],
  admin: [
    { href: "/admin", label: "Admin Overview", icon: "⚙" },
    { href: "/admin/rate-card", label: "Manage Rate Card", icon: "✎" },
    { href: "/admin/formula", label: "Formula & Allocation", icon: "ƒ" },
    { href: "/admin/policies", label: "Financial Policies", icon: "§" },
  ],
};
