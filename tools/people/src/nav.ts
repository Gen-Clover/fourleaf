import type { ToolNav } from "@genclover/ui/nav";

// Hire or engage → documents → work orders / project team → hours → pay run (Finance) → exit.
export const peopleNav: ToolNav = {
  tool: "People",
  home: "/people",
  sections: [
    { items: [{ href: "/people", label: "People", icon: "☺", description: "Employees and contractors" }] },
    { items: [{ href: "/people/work-orders", label: "Work orders", icon: "⎘", description: "Contractors on projects" }] },
    { items: [{ href: "/timesheets", label: "Timesheets", icon: "◷", description: "Hours by person and project" }] },
    { items: [{ href: "/finance/payruns", label: "Pay runs", icon: "₹", description: "Monthly salaries and contractor payables" }] },
  ],
};
