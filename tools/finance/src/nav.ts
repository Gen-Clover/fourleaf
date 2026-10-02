import type { ToolNav } from "@genclover/ui/nav";

// Menus follow the money: price and quote → bill → pay people and bills → hold and control cash → report and hand
// over to the accountant. Clients, delivery and people have their own tools.
export const financeNav: ToolNav = {
  tool: "Financial System",
  home: "/finance",
  sections: [
    { items: [{ href: "/finance", label: "Dashboard", icon: "▦" }] },
    {
      title: "Sales",
      items: [
        { href: "/pipeline", label: "Sales Pipeline", icon: "↗", description: "Quoted projects and the weighted forecast" },
        { href: "/finance/projects", label: "Projects (commercials)", icon: "◧", description: "Quotes, agreed terms, billing and profitability per project" },
        { href: "/calculator", label: "Quick Calculator", icon: "∑", description: "Price a team in seconds" },
        { href: "/rate-card", label: "Rate Card", icon: "☰", description: "Standard and floor rates by role" },
      ],
    },
    {
      title: "Billing",
      items: [
        { href: "/billing", label: "Monthly Billing", icon: "₿", description: "Close each project's month" },
        { href: "/invoices", label: "Invoices", icon: "⎙", description: "GST and export invoices, payments, TDS" },
      ],
    },
    {
      title: "Spend",
      items: [
        { href: "/finance/payruns", label: "Pay runs", icon: "₹", description: "Salaries and contractor payables, approved monthly" },
        { href: "/expenses", label: "Expenses", icon: "₹", description: "Bills, pass-through costs, what's unpaid" },
        { href: "/commitments", label: "Commitments", icon: "⧗", description: "Rent, taxes, subscriptions and payroll due" },
      ],
    },
    {
      title: "Treasury",
      items: [
        { href: "/cfo", label: "CFO Dashboard", icon: "◎", description: "Cash, available to spend, runway, alerts" },
        { href: "/funds", label: "Funds", icon: "▣", description: "Fund balances, transfers and the ledger" },
        { href: "/planner", label: "Hire Planner", icon: "⚖", description: "Can we afford this hire?" },
      ],
    },
    {
      title: "Reports",
      items: [
        { href: "/reports", label: "Reports", icon: "▤", description: "P&L, cash flow, receivables, margins" },
        { href: "/finance/accountant", label: "Accountant pack", icon: "⇩", description: "Everything for the CA / Zoho Books in one download" },
      ],
    },
    { items: [{ href: "/approvals", label: "Approvals", icon: "✓", description: "Pay runs, large expenses, price exceptions" }] },
  ],
  admin: [
    { href: "/admin", label: "Admin Overview", icon: "⚙", description: "Where each setting lives" },
    { href: "/admin/rate-card", label: "Manage Rate Card", icon: "✎", description: "Edit roles and rates" },
    { href: "/admin/formula", label: "Settings & formula", icon: "ƒ", description: "Company, GST, TDS, approval limit, FX, allocation, subcategories" },
    { href: "/admin/policies", label: "Financial Policies", icon: "§", description: "Allocation split by company stage" },
  ],
};
