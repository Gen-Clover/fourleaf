import { PageHeader, Stat } from "@genclover/ui";
import { requireRole } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { monthUsage } from "../../lib/google";
import { getLfSettings, googleKeyConfigured } from "../../lib/settings";
import { LfSettingsForm, NichesForm } from "./SettingsForms";

export default async function LeadFinderSettings() {
  await requireRole("ADMIN");
  const [settings, niches, s] = await Promise.all([
    prisma.setting.findMany({ where: { group: "Lead Finder" }, orderBy: { sortOrder: "asc" } }),
    prisma.leadNiche.findMany({ orderBy: { sortOrder: "asc" } }),
    getLfSettings(),
  ]);
  const usage = await monthUsage(s);
  return (
    <>
      <PageHeader title="Lead Finder Settings" subtitle="Niches, the monthly Google spend cap, Google's prices, and score thresholds." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Google key" value={googleKeyConfigured() ? "Connected" : "Missing"} hint={googleKeyConfigured() ? "GOOGLE_MAPS_API_KEY in .env" : "Add GOOGLE_MAPS_API_KEY to .env"} />
        <Stat label="Spend this month" value={`$${usage.spendUsd.toFixed(2)}`} accent hint={`Cap $${usage.capUsd}`} />
        <Stat label="Search requests" value={usage.counts.SEARCH} hint={`${s.searchFreePerMonth} free a month`} />
        <Stat label="Area + refresh requests" value={usage.counts.AREA + usage.counts.DETAILS} hint="Area lookups and 30-day refreshes" />
      </div>
      <div className="space-y-6">
        <LfSettingsForm settings={settings.map(({ key, value, label, unit, description }) => ({ key, value, label, unit, description }))} />
        <NichesForm niches={niches.map(({ key, label, phrases, market, value, bookingRelevant, active }) => ({ key, label, phrases, market, value, bookingRelevant, active }))} />
        <p className="text-xs text-neutral-500">
          Google data rule: only place IDs may be kept indefinitely. Leads you are still working get fresh Google data every 30 days; leads that are won,
          lost, not a fit or do-not-contact have their Google details cleared after 30 days. Your notes, website checks and history stay.
        </p>
      </div>
    </>
  );
}
