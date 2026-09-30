import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, hasRole } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { listWhere, orderBy, parseFilters, scoreField } from "../lib/query";
import { SERVICE, isService, STAGE_LABEL } from "../lib/services";
import { getLfSettings } from "../lib/settings";

const cell = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The lead list as CSV, with the same filters as the page. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.role, "EDITOR")) return new NextResponse("Forbidden", { status: 403 });
  const f = parseFilters(Object.fromEntries(req.nextUrl.searchParams));
  const s = await getLfSettings();
  const leads = await prisma.lead.findMany({ where: listWhere(f, s.hotScore, s.warmScore), orderBy: orderBy(f), take: 5000 });
  const field = scoreField(f);
  const head = ["Lead ID", "Business", "Niche", "Area", "Stage", "Do not contact", "Score", "Best service", "Phone", "Email", "Website", "Rating", "Reviews", "Next follow-up", "Added"];
  const rows = leads.map((l) => [
    l.code, l.name, l.nicheKey, l.area, STAGE_LABEL[l.stage] ?? l.stage, l.doNotContact ? "yes" : "", l[field],
    isService(l.bestService) ? SERVICE[l.bestService].label : "", l.intlPhone ?? l.phone, l.email, l.website, l.rating, l.reviewCount, l.nextFollowUpAt, l.createdAt,
  ]);
  const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
