import { notFound } from "next/navigation";
import { requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { getParams } from "../../../../../lib/settings";
import { MODELS, effectiveRate, lineHours, plannedMonthly, usLoadedRate } from "../../../../../lib/calc";
import { date, pct, usd } from "@genclover/ui/format";
import PrintButton from "./PrintButton";

// Client-facing quote. Never shows the internal allocation split (see rate card notes).
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { client: true, resources: { orderBy: { sortOrder: "asc" }, include: { role: true } } },
  });
  if (!project) notFound();
  const p = await getParams();
  const monthly = plannedMonthly(project, project.resources);
  let usTotal = 0;
  for (const r of project.resources) if (r.role) usTotal += lineHours(r) * usLoadedRate(r.role.usSalary, p);
  const hours = project.resources.reduce((s, r) => s + lineHours(r), 0);
  // Per-role rates only apply to T&M; other models are priced as a package.
  const perRole = project.engagementModel === "TM";

  return (
    <div className="mx-auto max-w-4xl bg-surface p-10 text-sm print:p-0">
      <div className="mb-6 flex items-start justify-between border-b-4 border-brand pb-4">
        <div>
          <div className="text-2xl font-bold text-ink">{p.companyName}</div>
          <div className="text-neutral-500">Managed Product & Engineering Services</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">Commercial Proposal</div>
          <div className="font-mono text-xs">{project.code}</div>
          <div className="text-xs text-neutral-500">{date(new Date())}</div>
          <PrintButton />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold uppercase text-neutral-500">Prepared for</div>
          <div className="font-semibold">{project.client.name}</div>
          {project.client.contactName && <div>{project.client.contactName}</div>}
          {project.client.email && <div>{project.client.email}</div>}
          {project.client.billingAddress && <div className="whitespace-pre-line text-neutral-600">{project.client.billingAddress}</div>}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-neutral-500">Engagement</div>
          <div className="font-semibold">{project.name}</div>
          <div>{MODELS[project.engagementModel]}</div>
          {project.startDate && <div>Start: {date(project.startDate)}</div>}
        </div>
      </div>
      {project.description && <p className="mb-6 whitespace-pre-line text-neutral-700">{project.description}</p>}

      <table className="tbl mb-6">
        <thead>
          <tr><th>Role</th><th className="num">Headcount</th><th className="num">Hours / month</th>{perRole && <><th className="num">Rate ($/hr)</th><th className="num">Monthly</th></>}</tr>
        </thead>
        <tbody>
          {project.resources.map((r) => (
            <tr key={r.id}>
              <td>{r.label}</td>
              <td className="num">{r.headcount}</td>
              <td className="num">{lineHours(r)}</td>
              {perRole && <><td className="num">{usd(effectiveRate(r))}</td><td className="num">{usd(lineHours(r) * effectiveRate(r))}</td></>}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-6 ml-auto w-96 space-y-1">
        {project.engagementModel === "RETAINER" && (
          <>
            <div className="flex justify-between"><span>Monthly retainer ({project.agreedRetainerHrs} hrs)</span><b>{usd(project.agreedMonthly)}</b></div>
            <div className="flex justify-between"><span>Additional hours</span><span>{usd(project.agreedExtraRate)}/hr</span></div>
          </>
        )}
        {project.engagementModel === "BLENDED" && <div className="flex justify-between"><span>Blended rate</span><b>{usd(project.agreedBlendedRate)}/hr</b></div>}
        {project.engagementModel === "FIXED" && <div className="flex justify-between"><span>Fixed monthly fee</span><b>{usd(project.agreedMonthly)}</b></div>}
        <div className="flex justify-between border-t-2 border-ink pt-2 text-lg font-semibold">
          <span>Estimated monthly investment</span><span className="text-brand-fg">{usd(monthly)}</span>
        </div>
        <div className="flex justify-between text-neutral-500"><span>Effective hourly rate</span><span>{hours ? usd(monthly / hours) : "—"}</span></div>
        {usTotal > 0 && (
          <div className="mt-2 rounded bg-brand-soft p-2 text-xs">
            Equivalent US onsite team (loaded cost): ~{usd(usTotal, 0)}/month — estimated savings <b>{pct(1 - monthly / usTotal)}</b>.
          </div>
        )}
      </div>

      <div className="border-t pt-4 text-xs text-neutral-500">
        <p>Senior talent with 7+ years of experience. Rates in USD, exclusive of applicable taxes. Third-party costs (hosting, paid APIs, SaaS licences) are billed at cost.</p>      </div>
    </div>
  );
}
