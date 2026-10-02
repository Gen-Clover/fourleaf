// Who can see and do what, in one place. Edge-safe (no database): the middleware, the server, the menus and
// the portal home all read these tables, so a page, its menu link and its data always agree.
//
// Money has three layers (see docs/genclover-portal/genclover-portal-roadmap.md, "Access"):
//   1. Price: what the client pays. Seen by whoever quotes it (Sales) and by owners and finance.
//   2. Cost: salaries, cost rates, the internal allocation split. Owners, CFO and HR (salaries) only.
//   3. Company totals: revenue, pipeline value, margins, cash. Owners, CFO and the accountant only.

export const ROLES = ["OWNER", "CFO", "SALES", "ONBOARDING", "DELIVERY", "HR", "TEAM", "ACCOUNTANT"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  OWNER: { label: "Owner", description: "Everything, including users, settings and every figure" },
  CFO: { label: "CFO", description: "Finance: invoices, payments, pay runs, costs, margins, reports, approvals, compliance" },
  SALES: { label: "Sales", description: "Leads, accounts and opportunities to won. Sees prices and their own deal values; no costs or company totals" },
  ONBOARDING: { label: "Onboarding", description: "Won deals to clients: client records, agreements (NDA, MSA, SOW), project set-up. No amounts" },
  DELIVERY: { label: "Delivery manager", description: "Projects, scope, milestones, resources, timesheet approval, issues. No money" },
  HR: { label: "HR", description: "People: employees, contractors, documents, work orders, salaries and pay runs" },
  TEAM: { label: "Team member", description: "Logs their own hours" },
  ACCOUNTANT: { label: "Accountant (CA)", description: "Read-only finance and the accountant export; marks compliance filings done" },
};

export const PERMISSIONS = {
  admin: "Users, roles, the audit log and the decision register",
  "leads.view": "Lead Finder: leads, accounts, opportunities, dashboard and reports",
  "leads.edit": "Work leads and opportunities: messages, stages, calls, searches, imports",
  "leads.settings": "Lead Finder settings",
  "leads.won": "Won deals waiting for onboarding",
  "deals.own": "Deal value on leads and opportunities they own",
  "deals.all": "Every deal value, pipeline value, forecast and won value",
  "prices.view": "Client prices: rate card, calculator, packages",
  "clients.view": "Client records and contacts",
  "clients.edit": "Onboard and edit clients",
  "agreements.view": "Agreements: NDA, MSA, SOW, change requests, acceptance (no amounts)",
  "agreements.edit": "Create and update agreements",
  "projects.view": "Projects: scope, milestones and team (no money)",
  "projects.create": "Set up new projects",
  "projects.edit": "Edit milestones, team, scope and change requests",
  "resources.manage": "Resource pool: capacity, allocations, requests",
  "hours.own": "Log their own hours",
  "hours.all": "See and log everyone's hours",
  "hours.approve": "Approve timesheets",
  "people.view": "People register: employees, contractors, documents, work orders (no pay)",
  "people.edit": "Add and edit people, documents, work orders and checklists",
  "cost.view": "Salaries, pay rates, cost rates, margins and the allocation split",
  "cost.edit": "Change salaries and pay rates",
  "payroll.view": "Pay runs and contractor payables",
  "payroll.edit": "Prepare pay runs",
  "finance.view": "Project values, billing, invoices, expenses, cash, reports, accountant export",
  "finance.edit": "Quotes, invoices, payments, expenses",
  "finance.approve": "Approve pay runs, large expenses and price exceptions (second person)",
  "finance.settings": "Rate card, formula, company and tax details, financial policies",
  "compliance.view": "Compliance calendar and decision register",
  "compliance.edit": "Update the compliance calendar and record filings",
  "issues.view": "Issues and escalations",
  "issues.edit": "Raise and work on issues",
} as const;
export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];

const GRANTS: Record<Role, readonly Permission[]> = {
  OWNER: ALL,
  CFO: [
    "leads.view", "deals.all", "prices.view", "clients.view", "clients.edit", "agreements.view", "agreements.edit", "projects.view", "projects.create",
    "hours.all", "people.view", "cost.view", "cost.edit", "payroll.view", "payroll.edit", "finance.view", "finance.edit", "finance.approve",
    "finance.settings", "compliance.view", "compliance.edit", "issues.view", "issues.edit",
  ],
  SALES: ["leads.view", "leads.edit", "deals.own", "prices.view", "clients.view", "issues.view", "issues.edit"],
  ONBOARDING: ["leads.won", "clients.view", "clients.edit", "agreements.view", "agreements.edit", "projects.view", "projects.create", "issues.view", "issues.edit"],
  DELIVERY: [
    "clients.view", "agreements.view", "projects.view", "projects.create", "projects.edit", "resources.manage", "hours.all", "hours.own", "hours.approve",
    "people.view", "issues.view", "issues.edit",
  ],
  HR: ["people.view", "people.edit", "cost.view", "cost.edit", "payroll.view", "payroll.edit", "hours.all", "compliance.view", "issues.view", "issues.edit"],
  TEAM: ["hours.own"],
  ACCOUNTANT: ["finance.view", "cost.view", "payroll.view", "clients.view", "people.view", "compliance.view", "compliance.edit"],
};

/** Accounts created before the named roles: ADMIN became Owner, EDITOR Sales, VIEWER Team member. */
const LEGACY: Record<string, Role> = { ADMIN: "OWNER", EDITOR: "SALES", VIEWER: "TEAM" };

export function normalizeRole(role: string | null | undefined): Role {
  if (role && (ROLES as readonly string[]).includes(role)) return role as Role;
  return LEGACY[role ?? ""] ?? "TEAM";
}

export const roleLabel = (role: string) => ROLE_INFO[normalizeRole(role)].label;

export function can(role: string, permission: Permission) {
  return GRANTS[normalizeRole(role)].includes(permission);
}

export const permissionsOf = (role: string): readonly Permission[] => GRANTS[normalizeRole(role)];

export const canAny = (role: string, permissions: readonly Permission[]) => permissions.some((p) => can(role, p));

/**
 * Pages and APIs by path; the first match wins, so specific paths come before their parents. A page needs
 * any one of the listed permissions. Paths not listed (home, login, logout) are open to every signed-in user.
 */
const ROUTES: [RegExp, Permission[]][] = [
  // Portal settings and the approvals inbox
  [/^\/admin\/(users|audit)(\/|$)/, ["admin"]],
  [/^\/admin(\/|$)/, ["finance.settings"]],
  [/^\/approvals(\/|$)/, ["finance.approve", "hours.approve", "resources.manage"]],

  // Lead Finder (sales)
  [/^\/leads\/won(\/|$)/, ["leads.view", "leads.won"]],
  [/^\/leads\/settings(\/|$)/, ["leads.settings"]],
  [/^\/leads\/(find|new|claude|today|import)(\/|$)/, ["leads.edit"]],
  [/^\/leads$/, ["leads.view"]],
  [/^\/leads\/opportunities\/[^/]+$/, ["leads.view", "leads.won"]], // a won opportunity is part of the hand-over
  [/^\/leads\/c[a-z0-9]{20,}$/, ["leads.view", "leads.won"]], // a lead; won-only roles see won leads only
  [/^\/leads(\/|$)/, ["leads.view"]],
  [/^\/api\/leads(\/|$)/, ["leads.edit"]],

  // Clients & Agreements
  [/^\/clients\/(new|onboarding)(\/|$)/, ["clients.edit"]],
  [/^\/clients(\/|$)/, ["clients.view"]],
  [/^\/agreements\/new(\/|$)/, ["agreements.edit", "projects.edit"]], // delivery raises change requests and acceptance
  [/^\/agreements(\/|$)/, ["agreements.view"]],

  // Delivery & Resources
  [/^\/delivery(\/|$)/, ["projects.view"]],
  [/^\/projects\/[^/]+\/quote(\/|$)/, ["finance.view"]], // the printed client quote has prices
  [/^\/projects\/new(\/|$)/, ["projects.create"]],
  [/^\/projects(\/|$)/, ["projects.view"]],
  [/^\/timesheets\/approve(\/|$)/, ["hours.approve"]],
  [/^\/timesheets(\/|$)/, ["hours.own", "hours.all"]],
  [/^\/resources(\/|$)/, ["resources.manage"]],

  // People
  [/^\/people\/new(\/|$)/, ["people.edit"]],
  [/^\/people(\/|$)/, ["people.view"]],

  // Financial System
  [/^\/finance\/payruns(\/|$)/, ["payroll.view"]],
  [/^\/finance(\/|$)/, ["finance.view"]],
  [/^\/(rate-card|calculator)(\/|$)/, ["prices.view"]],
  [/^\/(pipeline|billing|invoices|expenses|commitments|cfo|funds|planner|reports)(\/|$)/, ["finance.view"]],
  [/^\/api\/export(\/|$)/, ["finance.view"]],
  [/^\/api\/accountant(\/|$)/, ["finance.view"]],

  // Governance & Compliance
  [/^\/(governance|compliance|decisions)(\/|$)/, ["compliance.view"]],
  [/^\/issues(\/|$)/, ["issues.view"]],
];

/** The permissions a path needs, or null when any signed-in user may open it. */
export function pathPermissions(pathname: string): Permission[] | null {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  return ROUTES.find(([re]) => re.test(path))?.[1] ?? null;
}

export function canAccessPath(role: string, pathname: string) {
  const need = pathPermissions(pathname);
  return !need || canAny(role, need);
}
