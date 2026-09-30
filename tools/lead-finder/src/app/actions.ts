"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@genclover/db";
import { audit } from "@genclover/db/audit";
import { enqueue } from "@genclover/db/jobs";
import * as ids from "@genclover/ids";
import { assertRole } from "@genclover/auth";
import { errMsg, type Result } from "@genclover/ui/result";
import { type Area, expand, grid, isRect } from "../lib/geo";
import { costOf, findArea, monthUsage } from "../lib/google";
import { normalizeUrl } from "../lib/audit";
import { rescore } from "../lib/leads";
import { isMarket } from "../lib/markets";
import { OUTREACH_TYPES, recordOutreach } from "../lib/outreach";
import { queueRefresh } from "../lib/refresh";
import { type CellPayload, MAX_CELL_QUERIES, createSearch, nextWeekly, planCells } from "../lib/searchPlan";
import { CLOSED_STAGES, isService, SOURCES, STAGES, STAGE_LABEL } from "../lib/services";
import { getLfSettings, googleKeyConfigured } from "../lib/settings";

// ---------- Searches ----------

const SearchInput = z.object({
  service: z.string().refine((s) => s === "ALL" || isService(s), "Pick a service"),
  nicheKey: z.string().min(1, "Pick a niche"),
  phrases: z.array(z.string().trim().min(2)).min(1, "Add at least one search phrase").max(12, "Up to 12 phrases"),
  areas: z.string().trim().min(2, "Type at least one place"),
  radiusKm: z.number().min(0).max(50),
  depth: z.enum(["QUICK", "THOROUGH"]),
});
export type SearchInputT = z.input<typeof SearchInput>;

export type Estimate = {
  ok: boolean;
  message: string;
  areas?: Area[];
  cellQueries?: number;
  requestsMin?: number;
  requestsMax?: number;
  costMinUsd?: number;
  costMaxUsd?: number;
  spendUsd?: number;
  capUsd?: number;
};

/** Look up each place's boundary and estimate requests and cost before anything runs. */
export async function estimateSearch(input: SearchInputT): Promise<Estimate> {
  try {
    await assertRole("EDITOR");
    if (!googleKeyConfigured()) return { ok: false, message: "Add GOOGLE_MAPS_API_KEY to .env to search Google Maps." };
    const d = SearchInput.parse(input);
    const niche = await prisma.leadNiche.findUniqueOrThrow({ where: { key: d.nicheKey } });
    const names = d.areas.split(/[;,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 10);
    const areas: Area[] = [];
    for (const name of names) {
      const found = await findArea(name, niche.market);
      if (!found) return { ok: false, message: `Couldn't find "${name}" on Google Maps` };
      areas.push({ ...found, ...expand(found, d.radiusKm) });
    }
    const s = await getLfSettings();
    const { cellQueries } = planCells(areas, d.phrases, d.depth, s.cellKm);
    if (cellQueries > MAX_CELL_QUERIES)
      return { ok: false, message: `That's ${cellQueries} cell searches. Pick a smaller area, fewer phrases, or a bigger grid cell in Settings.` };
    // At least one page per cell and phrase; at most three pages each, plus room for busy cells to split.
    const requestsMin = cellQueries;
    const requestsMax = d.depth === "QUICK" ? cellQueries * 3 : Math.ceil(cellQueries * 3 * 1.5);
    const [costMinUsd, costMaxUsd, usage] = await Promise.all([costOf("SEARCH", requestsMin, s), costOf("SEARCH", requestsMax, s), monthUsage(s)]);
    return { ok: true, message: "", areas, cellQueries, requestsMin, requestsMax, costMinUsd, costMaxUsd, spendUsd: usage.spendUsd, capUsd: usage.capUsd };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** Run the search now; with `repeat`, also run it every week at that day and hour (IST). */
export async function startSearch(input: SearchInputT & { resolved: Area[]; repeat?: { dayOfWeek: number; hour: number } | null }): Promise<Result> {
  let id = "";
  try {
    const user = await assertRole("EDITOR");
    const d = SearchInput.parse(input);
    const areas = z.array(z.object({ name: z.string() }).passthrough()).parse(input.resolved) as Area[];
    if (!areas.length || !areas.every(isRect)) throw new Error("Estimate the search first");
    const config = { service: d.service, nicheKey: d.nicheKey, phrases: d.phrases, radiusKm: d.radiusKm, depth: d.depth, areas };
    let scheduleId: string | null = null;
    if (input.repeat) {
      const r = z.object({ dayOfWeek: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23) }).parse(input.repeat);
      const niche = await prisma.leadNiche.findUniqueOrThrow({ where: { key: d.nicheKey } });
      const sch = await prisma.leadSchedule.create({
        data: {
          name: `${niche.label} · ${areas.map((a) => a.name.split(",")[0]).join(", ")}`,
          config: JSON.stringify(config),
          dayOfWeek: r.dayOfWeek,
          hour: r.hour,
          nextRunAt: nextWeekly(r.dayOfWeek, r.hour),
          lastRunAt: new Date(),
          createdBy: user.name,
        },
      });
      scheduleId = sch.id;
    }
    const search = await createSearch(config, { id: user.id, name: user.name }, scheduleId);
    id = search.id;
    if (scheduleId) await prisma.leadSchedule.update({ where: { id: scheduleId }, data: { lastSearchId: id } });
    await audit(user, "CREATE", "LeadSearch", id, `Lead search: ${search.nicheLabel} in ${search.areaLabel} (${d.depth.toLowerCase()})${scheduleId ? ", repeats weekly" : ""}`);
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
  redirect(`/leads/searches/${id}`);
}

/** A quick search hit Google's 60 limit in some places: search just those places thoroughly (grid + splitting). */
export async function deepenSearch(id: string) {
  const user = await assertRole("EDITOR");
  const search = await prisma.leadSearch.findUniqueOrThrow({ where: { id } });
  const s = await getLfSettings();
  const items = search.saturated.map((x) => JSON.parse(x) as { phrase: string; rect: CellPayload["rect"]; area: string });
  const jobs = items.flatMap((it) =>
    grid(it.rect, s.cellKm).map((rect) => ({
      type: "LF_SEARCH_CELL",
      group: id,
      payload: { searchId: id, phrase: it.phrase, rect, area: it.area, market: search.market, depth: "THOROUGH" } satisfies CellPayload,
    })),
  );
  if (!jobs.length) return;
  await prisma.leadSearch.update({ where: { id }, data: { status: "RUNNING", saturated: [], depth: "THOROUGH", cellsTotal: { increment: jobs.length }, finishedAt: null } });
  await enqueue(prisma, jobs);
  await audit(user, "UPDATE", "LeadSearch", id, `Went thorough on ${items.length} saturated queries (${jobs.length} cells)`);
  revalidatePath(`/leads/searches/${id}`);
}

export async function setScheduleActive(id: string, active: boolean) {
  const user = await assertRole("EDITOR");
  const cur = await prisma.leadSchedule.findUniqueOrThrow({ where: { id } });
  const sch = await prisma.leadSchedule.update({ where: { id }, data: { active, ...(active ? { nextRunAt: nextWeekly(cur.dayOfWeek, cur.hour) } : {}) } });
  await audit(user, "UPDATE", "LeadSchedule", id, `${active ? "Resumed" : "Paused"} weekly search ${sch.name}`);
  revalidatePath("/leads/searches");
}

export async function deleteSchedule(id: string) {
  const user = await assertRole("EDITOR");
  const sch = await prisma.leadSchedule.delete({ where: { id } });
  await audit(user, "DELETE", "LeadSchedule", id, `Deleted weekly search ${sch.name}`);
  revalidatePath("/leads/searches");
}

export async function runScheduleNow(id: string) {
  await assertRole("EDITOR");
  await prisma.leadSchedule.update({ where: { id }, data: { nextRunAt: new Date() } });
  revalidatePath("/leads/searches");
}

export async function stopSearch(id: string) {
  const user = await assertRole("EDITOR");
  await prisma.job.updateMany({ where: { group: id, status: { in: ["QUEUED", "PAUSED"] } }, data: { status: "CANCELLED" } });
  await prisma.leadSearch.update({ where: { id }, data: { status: "STOPPED", finishedAt: new Date() } });
  await audit(user, "UPDATE", "LeadSearch", id, "Stopped lead search");
  revalidatePath(`/leads/searches/${id}`);
}

export async function resumeSearch(id: string) {
  const user = await assertRole("EDITOR");
  const { count } = await prisma.job.updateMany({ where: { group: id, status: "PAUSED" }, data: { status: "QUEUED", runAfter: new Date() } });
  await prisma.leadSearch.update({ where: { id }, data: { status: count ? "RUNNING" : "DONE", error: null, finishedAt: count ? null : new Date() } });
  await audit(user, "UPDATE", "LeadSearch", id, `Resumed lead search (${count} cells)`);
  revalidatePath(`/leads/searches/${id}`);
}

// ---------- Leads ----------

const opt = z.string().trim().transform((s) => (s === "" ? null : s)).nullable().optional();

const NewLead = z.object({
  name: z.string().trim().min(1, "Business name is required"),
  nicheKey: opt,
  source: z.enum(Object.keys(SOURCES) as [string, ...string[]]),
  market: z.string().refine(isMarket, "Pick a market"),
  website: opt,
  phone: opt,
  email: z.string().trim().transform((s) => (s === "" ? null : s)).pipe(z.email("Invalid email").nullable()).optional(),
  contactName: opt,
  area: opt,
  note: opt,
});

export async function addLead(_: Result, fd: FormData): Promise<Result> {
  let id = "";
  try {
    const user = await assertRole("EDITOR");
    const d = NewLead.parse(Object.fromEntries(fd));
    const code = await ids.nextLeadId(prisma);
    const website = d.website ? normalizeUrl(d.website) : null;
    const lead = await prisma.lead.create({
      data: {
        code,
        name: d.name,
        nicheKey: d.nicheKey,
        source: d.source,
        market: d.market,
        website,
        phone: d.phone,
        email: d.email,
        emails: d.email ? [d.email] : [],
        contactName: d.contactName,
        area: d.area,
        auditStatus: website ? "PENDING" : "NONE",
      },
    });
    id = lead.id;
    await prisma.leadActivity.create({ data: { leadId: id, type: "SYSTEM", text: `Added by hand (${SOURCES[d.source]})`, byId: user.id, byName: user.name } });
    if (d.note) await prisma.leadActivity.create({ data: { leadId: id, type: "NOTE", text: d.note, byId: user.id, byName: user.name } });
    if (website) await enqueue(prisma, { type: "LF_AUDIT", payload: { leadId: id }, group: "audit:manual" });
    else await rescore(id);
    await audit(user, "CREATE", "Lead", id, `Added lead ${code} ${d.name}`);
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
  redirect(`/leads/${id}`);
}

const LeadDetails = z.object({
  contactName: opt,
  email: z.string().trim().transform((s) => (s === "" ? null : s)).pipe(z.email("Invalid email").nullable()).optional(),
  phone: opt,
  website: opt,
  nicheKey: opt,
});

export async function saveLeadDetails(id: string, _: Result, fd: FormData): Promise<Result> {
  try {
    const user = await assertRole("EDITOR");
    const d = LeadDetails.parse(Object.fromEntries(fd));
    const prev = await prisma.lead.findUniqueOrThrow({ where: { id } });
    const website = d.website ? normalizeUrl(d.website) : null;
    const emailChanged = d.email !== prev.email;
    await prisma.lead.update({
      where: { id },
      data: {
        ...d,
        website,
        auditStatus: website !== prev.website ? (website ? "PENDING" : "NONE") : prev.auditStatus,
        // A new address hasn't bounced yet.
        emailBounced: emailChanged ? false : prev.emailBounced,
        emails: d.email && !prev.emails.includes(d.email) ? [d.email, ...prev.emails] : prev.emails,
      },
    });
    if (website !== prev.website && website) await enqueue(prisma, { type: "LF_AUDIT", payload: { leadId: id }, group: "audit:manual" });
    else await rescore(id);
    await audit(user, "UPDATE", "Lead", id, `${prev.code}: details updated`);
    revalidatePath(`/leads/${id}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

const StageInput = z.object({
  stage: z.enum(STAGES),
  lostReason: opt,
  nextFollowUpAt: z.string().trim().transform((s) => (s === "" ? null : new Date(s))).nullable().optional(),
});

export async function saveStage(id: string, _: Result, fd: FormData): Promise<Result> {
  try {
    const user = await assertRole("EDITOR");
    const d = StageInput.parse(Object.fromEntries(fd));
    if (d.stage === "LOST" && !d.lostReason) throw new Error("Pick why it was lost");
    if (d.stage === "WON") throw new Error('Use "Convert to client" to mark a lead as won');
    const prev = await prisma.lead.findUniqueOrThrow({ where: { id } });
    const closed = CLOSED_STAGES.includes(d.stage);
    await prisma.lead.update({
      where: { id },
      data: { stage: d.stage, lostReason: d.stage === "LOST" ? d.lostReason : null, nextFollowUpAt: closed ? null : d.nextFollowUpAt ?? null },
    });
    if (prev.stage !== d.stage) {
      const text = `${STAGE_LABEL[prev.stage]} → ${STAGE_LABEL[d.stage]}${d.stage === "LOST" ? ` (${d.lostReason})` : ""}`;
      await prisma.leadActivity.create({ data: { leadId: id, type: "STAGE", text, byId: user.id, byName: user.name } });
    }
    revalidatePath(`/leads/${id}`);
    return { ok: true, message: "Saved." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** A note, or a message/call/visit (which moves the lead on and schedules the next follow-up). */
export async function logActivity(id: string, input: { type: string; text: string; service?: string | null }): Promise<Result> {
  try {
    const user = await assertRole("EDITOR");
    const type = z.enum(["NOTE", ...OUTREACH_TYPES] as [string, ...string[]]).parse(input.type);
    const text = z.string().trim().min(1, "Write something").max(4000).parse(input.text);
    const service = isService(input.service) ? input.service : null;
    if (OUTREACH_TYPES.includes(type)) await recordOutreach(id, { channel: type, text, service, by: { id: user.id, name: user.name } });
    else await prisma.leadActivity.create({ data: { leadId: id, type, text, byId: user.id, byName: user.name } });
    revalidatePath(`/leads/${id}`);
    return { ok: true, message: "Logged." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function setDoNotContact(id: string, value: boolean) {
  const user = await assertRole("EDITOR");
  const lead = await prisma.lead.update({ where: { id }, data: { doNotContact: value, ...(value ? { nextFollowUpAt: null } : {}) } });
  await prisma.leadActivity.create({ data: { leadId: id, type: "SYSTEM", text: value ? "Marked do not contact" : "Removed from do not contact", byId: user.id, byName: user.name } });
  await audit(user, "UPDATE", "Lead", id, `${lead.code}: ${value ? "do not contact" : "contact allowed again"}`);
  revalidatePath(`/leads/${id}`);
}

export async function recheckWebsite(id: string, speedTest = false) {
  await assertRole("EDITOR");
  await prisma.lead.update({ where: { id }, data: { auditStatus: "PENDING" } });
  await enqueue(prisma, { type: speedTest ? "LF_SPEED" : "LF_AUDIT", payload: { leadId: id }, group: "audit:manual" });
  revalidatePath(`/leads/${id}`);
}

export async function bulkAction(idsIn: string[], action: "QUALIFY" | "NOT_A_FIT" | "SPEED" | "RECHECK" | "REFRESH"): Promise<Result> {
  try {
    const user = await assertRole("EDITOR");
    const leadIds = z.array(z.string()).min(1, "Select some leads").max(500).parse(idsIn);
    if (action === "REFRESH") {
      const n = await queueRefresh(leadIds);
      await audit(user, "UPDATE", "Lead", null, `Queued Google data refresh for ${n} selected lead(s)`);
      revalidatePath("/leads/list");
      return { ok: true, message: `${n} refresh(es) queued. Leads added by hand have no Google data and are skipped.` };
    }
    if (action === "QUALIFY" || action === "NOT_A_FIT") {
      const stage = action === "QUALIFY" ? "QUALIFIED" : "NOT_A_FIT";
      const from = action === "QUALIFY" ? ["NEW"] : ["NEW", "QUALIFIED"];
      const targets = await prisma.lead.findMany({ where: { id: { in: leadIds }, stage: { in: from } }, select: { id: true, stage: true } });
      await prisma.lead.updateMany({ where: { id: { in: targets.map((t) => t.id) } }, data: { stage, ...(stage === "NOT_A_FIT" ? { nextFollowUpAt: null } : {}) } });
      await prisma.leadActivity.createMany({
        data: targets.map((t) => ({ leadId: t.id, type: "STAGE", text: `${STAGE_LABEL[t.stage]} → ${STAGE_LABEL[stage]}`, byId: user.id, byName: user.name, service: null })),
      });
      revalidatePath("/leads/list");
      return { ok: true, message: `${targets.length} lead(s) marked ${STAGE_LABEL[stage].toLowerCase()}.` };
    }
    await prisma.lead.updateMany({ where: { id: { in: leadIds } }, data: { auditStatus: "PENDING" } });
    await enqueue(prisma, leadIds.map((leadId) => ({ type: action === "SPEED" ? "LF_SPEED" : "LF_AUDIT", payload: { leadId }, group: "audit:manual" })));
    revalidatePath("/leads/list");
    return { ok: true, message: `${leadIds.length} website check(s) queued.` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

// ---------- Convert to client ----------

const Convert = z.object({
  name: z.string().trim().min(1, "Client name is required"),
  code: z.string().transform(ids.normalizeClientCode).pipe(z.string().regex(ids.CLIENT_CODE_RE, `Client code: ${ids.CLIENT_CODE_HINT}`)),
  contactName: opt,
  email: z.string().trim().transform((s) => (s === "" ? null : s)).pipe(z.email("Invalid email").nullable()).optional(),
  phone: opt,
  country: opt,
  city: opt,
});

/** Won: create the client (Client ID + code) and link the lead, then start a project in the Financial System. */
export async function convertToClient(id: string, _: Result, fd: FormData): Promise<Result> {
  let clientId = "";
  try {
    const user = await assertRole("EDITOR");
    const d = Convert.parse(Object.fromEntries(fd));
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
    if (lead.clientId) throw new Error("This lead is already a client");
    const taken = await prisma.client.findUnique({ where: { code: d.code }, select: { name: true } });
    if (taken) throw new Error(`Client code ${d.code} is already used by ${taken.name}`);
    const number = await ids.nextClientNumber(prisma);
    const client = await prisma.client.create({
      data: { ...d, number, website: lead.website, notes: `From lead ${lead.code}` },
    });
    clientId = client.id;
    await prisma.lead.update({ where: { id }, data: { clientId, stage: "WON", nextFollowUpAt: null } });
    await prisma.leadActivity.create({ data: { leadId: id, type: "STAGE", text: `Won: client ${number} (${d.code})`, byId: user.id, byName: user.name } });
    await audit(user, "CREATE", "Client", clientId, `Created client ${number} (${d.code}) ${d.name} from lead ${lead.code}`);
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
  redirect(`/projects/new?client=${clientId}`);
}

// ---------- Settings (admin) ----------

const NicheRow = z.object({
  key: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, "Niche keys: lowercase letters, digits and dashes"),
  label: z.string().trim().min(1, "Every niche needs a name"),
  phrases: z.array(z.string().trim().min(2)).min(1, "Every niche needs at least one phrase"),
  market: z.enum(["IN", "US"]),
  value: z.enum(["HIGH", "MEDIUM", "LOW"]),
  bookingRelevant: z.boolean(),
  active: z.boolean(),
});

export async function saveNiches(rows: unknown): Promise<Result> {
  try {
    const user = await assertRole("ADMIN");
    const data = z.array(NicheRow).parse(rows);
    if (new Set(data.map((r) => r.key)).size !== data.length) throw new Error("Two niches have the same key");
    for (const [i, r] of data.entries()) await prisma.leadNiche.upsert({ where: { key: r.key }, create: { ...r, sortOrder: i }, update: { ...r, sortOrder: i } });
    await audit(user, "UPDATE", "LeadNiche", null, `Saved ${data.length} lead niches`);
    revalidatePath("/leads/settings");
    return { ok: true, message: "Niches saved." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function saveLfSettings(values: Record<string, string>): Promise<Result> {
  try {
    const user = await assertRole("ADMIN");
    const rows = await prisma.setting.findMany({ where: { group: "Lead Finder" } });
    const changes: string[] = [];
    for (const row of rows) {
      if (!(row.key in values)) continue;
      const v = String(values[row.key]).trim();
      if (v === "" || Number.isNaN(Number(v)) || Number(v) < 0) throw new Error(`${row.label} must be a number, 0 or more`);
      if (v !== row.value) {
        await prisma.setting.update({ where: { key: row.key }, data: { value: v } });
        changes.push(`${row.label}: ${row.value} → ${v}`);
      }
    }
    if (changes.length) await audit(user, "UPDATE", "Settings", null, changes.join("; "));
    revalidatePath("/leads", "layout");
    return { ok: true, message: changes.length ? `Saved ${changes.length} change(s).` : "No changes." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}
