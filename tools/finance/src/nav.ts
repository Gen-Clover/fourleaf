import type { ToolNav } from "@genclover/ui/nav";

// Menus follow the money: win work → deliver it → bill it → spend → hold and control cash → report.
export const financeNav: ToolNav = {
  tool: "Financial System",
  home: "/finance",
  sections: [
    { items: [{ href: "/finance", label: "Dashboard", icon: "▦" }] },
    {
      title: "Sales",
      items: [
        { href: "/pipeline", label: "Sales Pipeline", icon: "↗", description: "Open deals and the weighted forecast", editor: true },
        { href: "/clients", label: "Clients", icon: "◉", description: "Client records, IDs and codes" },
        { href: "/projects", label: "Projects", icon: "◧", description: "Quotes, agreements, teams and milestones" },
        { href: "/calculator", label: "Quick Calculator", icon: "∑", description: "Price a team in seconds" },
        { href: "/rate-card", label: "Rate Card", icon: "☰", description: "Standard and floor rates by role" },
      ],
    },
    {
      title: "Delivery",
      items: [
        { href: "/timesheets", label: "Timesheets", icon: "◷", description: "Hours by person, project and day" },
        { href: "/people", label: "People", icon: "☺", description: "Team, cost rates and payroll", editor: true },
      ],
    },
    {
      title: "Billing",
      items: [
        { href: "/billing", label: "Monthly Billing", icon: "₿", description: "Close each project's month" },
        { href: "/invoices", label: "Invoices", icon: "⎙", description: "Issue invoices and record payments" },
      ],
    },
    {
      title: "Spend",
      items: [
        { href: "/expenses", label: "Expenses", icon: "₹", description: "Bills, pass-through costs, what's unpaid", editor: true },
        { href: "/commitments", label: "Commitments", icon: "⧗", description: "Rent, taxes, subscriptions and payroll due", editor: true },
      ],
    },
    {
      title: "Treasury",
      items: [
        { href: "/cfo", label: "CFO Dashboard", icon: "◎", description: "Cash, available to spend, runway, alerts", editor: true },
        { href: "/funds", label: "Funds", icon: "▣", description: "Fund balances, transfers and the ledger", editor: true },
        { href: "/planner", label: "Hire Planner", icon: "⚖", description: "Can we afford this hire?", editor: true },
      ],
    },
    { items: [{ href: "/reports", label: "Reports", icon: "▤", description: "P&L, cash flow, receivables, margins", editor: true }] },
  ],
  admin: [
    { href: "/admin", label: "Admin Overview", icon: "⚙", description: "Where each setting lives" },
    { href: "/admin/rate-card", label: "Manage Rate Card", icon: "✎", description: "Edit roles and rates" },
    { href: "/admin/formula", label: "Formula & Allocation", icon: "ƒ", description: "FX, hours, floors, alert thresholds" },
    { href: "/admin/policies", label: "Financial Policies", icon: "§", description: "Allocation split by company stage" },
  ],
};
