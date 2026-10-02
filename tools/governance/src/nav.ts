import type { ToolNav } from "@genclover/ui/nav";

// Filings and renewals on time, issues resolved at the right level, decisions on record.
export const governanceNav: ToolNav = {
  tool: "Governance & Compliance",
  home: "/governance",
  sections: [
    { items: [{ href: "/governance", label: "Overview", icon: "▦" }] },
    { items: [{ href: "/compliance", label: "Compliance calendar", icon: "◷", description: "GST, TDS, income tax, MCA, payroll, renewals" }] },
    { items: [{ href: "/issues", label: "Issues", icon: "!", description: "Issues and escalations by level" }] },
    { items: [{ href: "/decisions", label: "Decisions", icon: "§", description: "Board resolutions and major decisions" }] },
    { items: [{ href: "/approvals", label: "Approvals", icon: "✓", description: "Everything waiting for a second person" }] },
  ],
};
