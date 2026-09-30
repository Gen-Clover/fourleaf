import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, ReadOnlyNote } from "@genclover/ui";
import { hasRole, requireUser } from "@genclover/auth";
import { prisma } from "@genclover/db";
import { suggestClientCode } from "@genclover/ids";
import { date } from "@genclover/ui/format";
import { emailConfigured } from "../../lib/email";
import { messageOptions } from "../../lib/leadMessages";
import { localTime, marketOf } from "../../lib/markets";
import { whatsappNumber } from "../../lib/messages";
import { shortName } from "../../lib/names";
import type { Reason } from "../../lib/scoring";
import { SERVICES, SOURCES, STAGE_LABEL } from "../../lib/services";
import { getLfSettings } from "../../lib/settings";
import AutoRefresh from "../AutoRefresh";
import { Check, Score, StageBadge } from "../bits";
import { ClaudePanel, RepliedButton, UndoButton } from "../ClaudePanel";
import { Composer } from "../Composer";
import { recheckWebsite } from "../actions";
import { ActivityForm, ConvertForm, DetailsForm, StageForm } from "./LeadForms";

const ACTIVITY_ICON: Record<string, string> = { NOTE: "✎", WHATSAPP: "💬", EMAIL: "✉", CALL: "☎", VISIT: "⌂", STAGE: "→", SYSTEM: "•", REPLY: "↩" };
const FIT_COLOR: Record<string, string> = { HIGH: "bg-emerald-50 text-emerald-700", MEDIUM: "bg-amber-50 text-amber-700", LOW: "bg-neutral-100 text-neutral-600" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      activities: { orderBy: { at: "desc" }, take: 100 },
      audits: { orderBy: { createdAt: "desc" }, take: 1 },
      hits: { include: { search: { select: { id: true, nicheLabel: true, areaLabel: true, createdAt: true } } } },
      client: { select: { id: true, number: true, code: true } },
    },
  });
  if (!lead) notFound();
  const [settings, niches, clientCodes, branches] = await Promise.all([
    getLfSettings(),
    prisma.leadNiche.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, label: true, market: true } }),
    prisma.client.findMany({ select: { code: true } }),
    lead.brandKey ? prisma.lead.findMany({ where: { brandKey: lead.brandKey, id: { not: lead.id } }, select: { id: true, name: true, area: true, reviewCount: true, branchOfId: true } }) : [],
  ]);
  const canEdit = hasRole(user.role, "EDITOR");
  const niche = niches.find((n) => n.key === lead.nicheKey);
  const market = marketOf(lead.market);
  const audit = lead.audits[0];
  const reasons: Reason[] = lead.reasons ? JSON.parse(lead.reasons) : [];
  const opportunities = SERVICES.map((s) => ({ ...s, score: lead[s.field] })).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  const checking = lead.auditStatus === "PENDING";
  const { stepLabel, options } = messageOptions(lead, user.name.split(" ")[0]);
  const socials: Record<string, string> = lead.socials ? JSON.parse(lead.socials) : {};
  const primary = lead.branchOfId ? branches.find((b) => b.id === lead.branchOfId) : null;
  const time = localTime(lead.market, lead.lng);

  return (
    <>
      <AutoRefresh active={checking} />
      <PageHeader
        title={lead.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/leads/list" className="hover:underline">← Leads</Link>·<span className="font-mono text-xs">{lead.code}</span>·<span>{market.label}</span>
            {niche && <>·<span>{niche.label}</span></>}
            {lead.area && <>·<span>{lead.area}</span></>}·<StageBadge stage={lead.stage} />
            {lead.doNotContact && <span className="badge bg-red-50 text-red-700">Do not contact</span>}
            {lead.claudeFit && <span className={`badge ${FIT_COLOR[lead.claudeFit]}`}>Claude: {lead.claudeFit.toLowerCase()} fit</span>}
          </span>
        }
        actions={
          <>
            {canEdit && !lead.doNotContact && lead.contactCount > 0 && !lead.repliedAt && <RepliedButton id={lead.id} />}
            {lead.client && (
              <Link href={`/clients/${lead.client.id}`} className="btn-secondary">
                Client {lead.client.number} · {lead.client.code} →
              </Link>
            )}
          </>
        }
      />
      {!canEdit && <ReadOnlyNote />}
      {primary && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          A branch of <Link className="font-medium underline" href={`/leads/${primary.id}`}>{primary.name}</Link>, which is the one to contact.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <section className="card">
            <div className="card-h">
              <div className="card-t">Opportunities</div>
              <span className="text-xs text-neutral-500">Need (up to 60) + ability to pay ({lead.ability} of 40)</span>
            </div>
            {opportunities.length === 0 ? (
              <p className="p-5 text-sm text-neutral-500">{checking ? "Checking the website…" : "Nothing to offer found yet."}</p>
            ) : (
              <div className="divide-y divide-neutral-100">
                {opportunities.map((o) => (
                  <div key={o.key} className="flex gap-4 px-5 py-3">
                    <div className="w-14 shrink-0 pt-0.5"><Score score={o.score} hot={settings.hotScore} warm={settings.warmScore} /></div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-900">{o.label} <span className="font-normal text-neutral-500">· {market.offers[o.key]}</span></div>
                      <ul className="mt-1 space-y-0.5 text-sm text-neutral-600">
                        {reasons.filter((r) => r.service === o.key && r.points > 0).map((r) => <li key={r.text}>• {r.text}</li>)}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {reasons.some((r) => r.service === "ABILITY") && (
              <div className="border-t border-neutral-200 px-5 py-3 text-sm text-neutral-600">
                <span className="font-medium text-neutral-900">Can they pay? </span>
                {reasons.filter((r) => r.service === "ABILITY").map((r) => r.text).join(" · ")}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-h">
              <div className="card-t">Message · {stepLabel}</div>
              <span className="text-xs text-neutral-500">
                {lead.market === "US" ? `Their time: ${time.label}` : `${lead.contactCount} sent`}
                {lead.nextFollowUpAt && ` · next ${date(lead.nextFollowUpAt)}`}
              </span>
            </div>
            <div className="p-5">
              <Composer
                leadId={lead.id}
                canEdit={canEdit}
                doNotContact={lead.doNotContact}
                whatsapp={whatsappNumber(lead.whatsappNumber, lead.intlPhone, lead.phone, lead.market)}
                email={lead.emailBounced ? null : lead.email}
                emailFirst={market.emailFirst}
                smtp={emailConfigured()}
                options={options}
              />
            </div>
          </section>

          <section className="card">
            <div className="card-h">
              <div className="card-t">Claude review</div>
              {lead.claudeAt && <span className="text-xs text-neutral-500">Saved {date(lead.claudeAt)}</span>}
            </div>
            <div className="space-y-4 p-5">
              {lead.claudeAt && (
                <div className="rounded-lg bg-neutral-50 p-3 text-sm">
                  <div className="mb-1 font-medium text-neutral-900">
                    {lead.claudeFit ?? "?"} fit{lead.claudeService ? ` · lead with ${SERVICES.find((s) => s.key === lead.claudeService)?.label}` : ""}
                  </div>
                  <p className="whitespace-pre-line text-neutral-600">{lead.claudeSummary}</p>
                  {lead.claudeMessage && <p className="mt-2 text-xs text-neutral-500">Claude&apos;s message is the first option in the composer above.</p>}
                </div>
              )}
              {canEdit && <ClaudePanel ids={[lead.id]} fileName={`claude-${lead.code}.md`} />}
            </div>
          </section>

          <section className="card">
            <div className="card-h">
              <div className="card-t">Website check</div>
              {canEdit && lead.website && (
                <div className="flex gap-2">
                  <form action={recheckWebsite.bind(null, lead.id, false)}><button className="btn-secondary btn-sm" disabled={checking}>Re-check</button></form>
                  <form action={recheckWebsite.bind(null, lead.id, true)}><button className="btn-secondary btn-sm" disabled={checking}>Speed test</button></form>
                </div>
              )}
            </div>
            <div className="p-5">
              {!lead.website ? (
                <p className="text-sm text-neutral-600">No website listed. If they have one, add it under Contact details and it will be checked.</p>
              ) : checking && !audit ? (
                <p className="text-sm text-neutral-500">Checking {lead.website}…</p>
              ) : !audit ? (
                <p className="text-sm text-neutral-500">Not checked yet.</p>
              ) : (
                <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                  <ul className="space-y-1">
                    <Check ok={!audit.socialOnly}>{audit.socialOnly ? "Only a social or directory page" : "Has its own website"}</Check>
                    <Check ok={audit.socialOnly ? null : audit.reachable}>{audit.reachable ? `Opens (${audit.responseMs} ms)` : `Doesn't open${audit.error ? `: ${audit.error}` : ""}`}</Check>
                    <Check ok={audit.reachable ? audit.https : null}>Secure (HTTPS)</Check>
                    <Check ok={audit.reachable ? audit.mobileViewport : null}>Built for phones</Check>
                    <Check ok={audit.psiMobile == null ? null : audit.psiMobile >= 50}>
                      Mobile speed {audit.psiMobile == null ? "(run a speed test)" : `${audit.psiMobile}/100`}
                    </Check>
                    <Check ok={audit.reachable && !audit.jsRendered ? audit.sitemap : null}>Sitemap for Google</Check>
                    <Check ok={audit.reachable && !audit.jsRendered ? audit.hasChatBot : null}>Chat assistant</Check>
                  </ul>
                  <ul className="space-y-1">
                    <Check ok={audit.reachable && !audit.jsRendered ? audit.hasWhatsApp : null}>WhatsApp button</Check>
                    <Check ok={audit.reachable && !audit.jsRendered ? audit.hasForm : null}>Enquiry form</Check>
                    <Check ok={audit.reachable && !audit.jsRendered ? audit.hasTel : null}>
                      {audit.hasTel ? "Tap-to-call number" : audit.phoneShown ? "Phone shown, but not tap-to-call" : "Phone number on the site"}
                    </Check>
                    <Check ok={audit.reachable && !audit.jsRendered ? !!audit.title && audit.metaDescription : null}>Title and description for Google</Check>
                    <Check ok={audit.reachable && !audit.jsRendered ? audit.hasBooking : null}>Online booking</Check>
                    <Check ok={null}>{audit.adsDetected ? "Runs Google / Meta ads (they pay for leads)" : "No ad tracking seen"}</Check>
                  </ul>
                  <p className="mt-3 text-xs text-neutral-500 sm:col-span-2">
                    {audit.jsRendered && "Page is built in the browser, so its content wasn't checked. "}
                    {[audit.platform && `Built with ${audit.platform}`, audit.copyrightYear && `© ${audit.copyrightYear}`, `checked ${date(audit.createdAt)}`].filter(Boolean).join(" · ")}
                    {checking && " · re-checking…"}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-h"><div className="card-t">Timeline</div></div>
            <div className="space-y-4 p-5">
              {canEdit && <ActivityForm id={lead.id} doNotContact={lead.doNotContact} />}
              <ol className="space-y-3">
                {lead.activities.map((a) => (
                  <li key={a.id} className="flex gap-3 text-sm">
                    <span className="mt-0.5 w-5 shrink-0 text-center text-neutral-500">{ACTIVITY_ICON[a.type] ?? "•"}</span>
                    <div className="min-w-0">
                      <div className="whitespace-pre-line break-words text-neutral-800">{a.text}</div>
                      <div className="text-xs text-neutral-500">
                        {a.byName} · {date(a.at)}
                        {canEdit && ["WHATSAPP", "EMAIL", "CALL", "VISIT", "REPLY"].includes(a.type) && (
                          <>
                            {" · "}
                            <UndoButton id={a.id} />
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
                <li className="flex gap-3 text-sm">
                  <span className="mt-0.5 w-5 shrink-0 text-center text-neutral-500">•</span>
                  <div className="text-neutral-500">Found {date(lead.createdAt)} · {SOURCES[lead.source] ?? lead.source}</div>
                </li>
              </ol>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          {!lead.client && canEdit && lead.stage !== "WON" && (
            <ConvertForm
              id={lead.id}
              defaults={{
                name: shortName(lead.name),
                code: suggestClientCode(shortName(lead.name), new Set(clientCodes.map((c) => c.code))),
                contactName: lead.contactName ?? lead.personName,
                email: lead.email,
                phone: lead.intlPhone ?? lead.phone,
                country: market.country,
                city: lead.area,
              }}
            />
          )}
          <StageForm
            // Remount after a save so the form shows the saved values.
            key={`${lead.stage}-${lead.nextFollowUpAt?.toISOString()}-${lead.doNotContact}`}
            id={lead.id}
            stage={lead.stage}
            lostReason={lead.lostReason}
            nextFollowUpAt={lead.nextFollowUpAt?.toISOString() ?? null}
            doNotContact={lead.doNotContact}
            canEdit={canEdit}
          />

          <div className="card space-y-2 p-4 text-sm">
            <div className="card-t mb-1">Business</div>
            {(lead.contactName || lead.personName) && <div>👤 {lead.contactName ?? lead.personName}</div>}
            {lead.phone && <div>☎ <a className="text-brand-fg hover:underline" href={`tel:${lead.intlPhone ?? lead.phone}`}>{lead.phone}</a></div>}
            {lead.whatsappNumber && <div>💬 WhatsApp on their site: +{lead.whatsappNumber}</div>}
            {lead.emails.length > 0 && (
              <div className="break-all">
                ✉ {lead.emails.join(", ")}
                {lead.emailBounced && <span className="ml-1 badge bg-red-50 text-red-700">bounced</span>}
              </div>
            )}
            {lead.website && <div className="break-all">🌐 <a className="text-brand-fg hover:underline" href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a></div>}
            {Object.keys(socials).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(socials).map(([k, v]) => (
                  <a key={k} className="text-brand-fg capitalize hover:underline" href={v} target="_blank" rel="noreferrer">{k}</a>
                ))}
              </div>
            )}
            {lead.mapsUrl && <div>📍 <a className="text-brand-fg hover:underline" href={lead.mapsUrl} target="_blank" rel="noreferrer">Open in Google Maps</a></div>}
            {lead.address && <div className="text-neutral-600">{lead.address}</div>}
            {lead.rating != null && <div className="text-neutral-600">{lead.rating}★ from {lead.reviewCount ?? 0} Google reviews</div>}
            {lead.market === "US" && <div className="text-neutral-600">Their local time: {time.label}</div>}
            {lead.placeId && (
              <div className="text-xs text-neutral-500">
                {lead.googleFetchedAt ? `Google data last updated ${date(lead.googleFetchedAt)}` : "Google details cleared (lead closed over 30 days)"}
              </div>
            )}
            {branches.length > 0 && (
              <div className="border-t border-neutral-200 pt-2 text-xs text-neutral-600">
                <div className="mb-1 font-medium text-neutral-900">{lead.branchCount} branches (same website or phone)</div>
                {branches.map((b) => (
                  <div key={b.id}>
                    <Link className="hover:underline" href={`/leads/${b.id}`}>{b.name}</Link>
                    {b.area && ` · ${b.area}`}
                    {!b.branchOfId && " · main"}
                  </div>
                ))}
              </div>
            )}
            {lead.hits.length > 0 && (
              <div className="border-t border-neutral-200 pt-2 text-xs text-neutral-500">
                Found in:{" "}
                {lead.hits.map((h, i) => (
                  <span key={h.id}>
                    {i > 0 && ", "}
                    <Link className="hover:underline" href={`/leads/searches/${h.search.id}`}>{h.search.nicheLabel} · {h.search.areaLabel}</Link>
                  </span>
                ))}
              </div>
            )}
            {lead.lostReason && <div className="text-xs text-neutral-500">{STAGE_LABEL.LOST}: {lead.lostReason}</div>}
          </div>

          <DetailsForm
            id={lead.id}
            canEdit={canEdit}
            niches={niches}
            lead={{ contactName: lead.contactName, email: lead.email, phone: lead.phone, website: lead.website, nicheKey: lead.nicheKey }}
          />
        </aside>
      </div>
    </>
  );
}
