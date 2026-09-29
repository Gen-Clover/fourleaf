import Link from "next/link";
import { PageHeader, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBuckets, getParams } from "@/lib/settings";
import { bucketTotal } from "@/lib/calc";

export default async function AdminPage() {
  await requireRole("ADMIN");
  const [users, roles, activeRoles, buckets, p, recent] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: true, where: { active: true } }),
    prisma.roleRate.count(),
    prisma.roleRate.count({ where: { active: true } }),
    getBuckets(),
    getParams(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const count = (r: string) => users.find((u) => u.role === r)?._count ?? 0;
  const tiles = [
    { href: "/admin/rate-card", title: "Manage Rate Card", body: "Add, edit, reorder or retire roles. Standard, floor overrides, market ranges, US salaries, India CTC." },
    { href: "/admin/formula", title: "Formula & Allocation", body: "Allocation buckets (65/10/25), FX, hours, US load factor, floor & premium rules, packages." },
    { href: "/admin/policies", title: "Financial Policies", body: "Allocation policy by company stage (Rate card, Base, Startup, Growth, Mature). Activate one to change how receipts fill the funds." },
    { href: "/admin/users", title: "Users & Roles", body: "Invite people as Admin, Editor or Viewer. Disable access or reset passwords." },
    { href: "/admin/audit", title: "Audit Log", body: "Who changed what and when — rates, formula, projects, agreements and billing." },
  ];
  return (
    <>
      <PageHeader title="Admin Panel" subtitle="Control the rate card, the pricing formula and who can access the portal." />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Active users" value={count("ADMIN") + count("EDITOR") + count("VIEWER")} hint={`${count("ADMIN")} admin · ${count("EDITOR")} editor · ${count("VIEWER")} viewer`} />
        <Stat label="Roles on rate card" value={activeRoles} hint={`${roles - activeRoles} inactive`} />
        <Stat label="Allocation total" value={`${bucketTotal(buckets)}%`} hint={buckets.map((b) => b.percent).join(" / ")} />
        <Stat label="FX assumption" value={`₹${p.fxRate}`} hint="per US$" />
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="card block p-5 transition hover:border-brand/40 hover:shadow">
            <div className="font-semibold text-brand">{t.title} →</div>
            <p className="mt-1 text-sm text-neutral-600">{t.body}</p>
          </Link>
        ))}
      </div>
      <div className="card">
        <div className="card-h"><div className="card-t">Recent activity</div><Link href="/admin/audit" className="text-sm text-brand">View all</Link></div>
        <ul className="divide-y divide-neutral-100">
          {recent.map((l) => (
            <li key={l.id} className="flex justify-between gap-4 px-5 py-2 text-sm">
              <span><b>{l.userName}</b> · {l.action} {l.entity} — <span className="text-neutral-600">{l.summary}</span></span>
              <span className="text-xs whitespace-nowrap text-neutral-400">{l.createdAt.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
