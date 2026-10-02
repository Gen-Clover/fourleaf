"use server";

// Outreach from the Today queue and lead pages, bulk work on filtered lists, background-job controls,
// and the Claude review (copy a brief out, paste the answer back).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@genclover/db";
import { audit } from "@genclover/db/audit";
import { assertPermission } from "@genclover/auth";
import { errMsg, type Result } from "@genclover/ui/result";
import { buildBrief, parseClaudeAnswer } from "../lib/brief";
import { loadBriefLeads } from "../lib/briefData";
import { sendLeadEmail } from "../lib/email";
import { monthUsage } from "../lib/google";
import { markReplied, undoActivity } from "../lib/outreach";
import { listWhere, parseFilters } from "../lib/query";
import { queueRefresh, refreshEstimate } from "../lib/refresh";
import { isService } from "../lib/services";
import { getLfSettings } from "../lib/settings";

// ---------- Outreach ----------

export async function sendEmailNow(id: string, input: { subject: string; text: string; service?: string | null }): Promise<Result> {
  try {
    const user = await assertPermission("leads.edit");
    const subject = z.string().trim().min(1, "Add a subject").max(200).parse(input.subject);
    const text = z.string().trim().min(1, "Write the message").max(6000).parse(input.text);
    await sendLeadEmail(id, { subject, text, service: isService(input.service) ? input.service : null, by: { id: user.id, name: user.name } });
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads/today");
    return { ok: true, message: "Email sent." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** They replied on WhatsApp or by phone (email replies are picked up from the inbox automatically). */
export async function markRepliedNow(id: string, note?: string): Promise<Result> {
  try {
    const user = await assertPermission("leads.edit");
    await markReplied(id, { text: note?.trim() || "They replied", by: { id: user.id, name: user.name } });
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads/today");
    return { ok: true, message: "Marked as replied." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** Remove a message/call/visit/reply that was logged by mistake. */
export async function undoLoggedActivity(activityId: string): Promise<Result> {
  try {
    const user = await assertPermission("leads.edit");
    const act = await prisma.leadActivity.findUniqueOrThrow({ where: { id: activityId }, select: { leadId: true } });
    await undoActivity(activityId, { id: user.id, name: user.name });
    revalidatePath(`/leads/${act.leadId}`);
    revalidatePath("/leads/today");
    return { ok: true, message: "Undone." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** Not today: comes back in the queue tomorrow. */
export async function skipForToday(id: string): Promise<Result> {
  try {
    await assertPermission("leads.edit");
    await prisma.lead.update({ where: { id }, data: { nextFollowUpAt: new Date(Date.now() + 20 * 3_600_000) } });
    revalidatePath("/leads/today");
    return { ok: true, message: "Skipped until tomorrow." };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

// ---------- Bulk on the filtered list ----------

async function matchingIds(query: string, meId: string) {
  const s = await getLfSettings();
  const f = parseFilters(Object.fromEntries(new URLSearchParams(query)), meId);
  const leads = await prisma.lead.findMany({ where: listWhere(f, s), select: { id: true }, take: 5000 });
  return leads.map((l) => l.id);
}

/** How many of the leads matching the list's filters (or the selected ones) a refresh would run for, and the cost. */
export async function estimateRefresh(input: { query?: string; ids?: string[] }) {
  const user = await assertPermission("leads.edit");
  const ids = input.ids?.length ? input.ids : await matchingIds(input.query ?? "", user.id);
  const [est, usage] = await Promise.all([refreshEstimate(ids), monthUsage()]);
  return { ...est, spendUsd: usage.spendUsd, capUsd: usage.capUsd };
}

export async function refreshMatching(input: { query?: string; ids?: string[] }): Promise<Result> {
  try {
    const user = await assertPermission("leads.edit");
    const ids = input.ids?.length ? input.ids : await matchingIds(input.query ?? "", user.id);
    const n = await queueRefresh(ids);
    await audit(user, "UPDATE", "Lead", null, `Queued Google data refresh for ${n} lead(s)`);
    revalidatePath("/leads/list");
    return { ok: true, message: `${n} refresh(es) queued. The list updates as they finish.` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

// ---------- Background jobs ----------

export async function retryFailedJobs(): Promise<Result> {
  const user = await assertPermission("leads.edit");
  const { count } = await prisma.job.updateMany({
    where: { status: "FAILED", type: { startsWith: "LF_" } },
    data: { status: "QUEUED", attempts: 0, error: null, runAfter: new Date() },
  });
  await audit(user, "UPDATE", "Job", null, `Retried ${count} failed Lead Finder job(s)`);
  revalidatePath("/leads");
  return { ok: true, message: `${count} job(s) queued again.` };
}

/** Jobs paused at the spend cap (refreshes, searches) run again after the cap is raised. */
export async function resumePausedJobs(): Promise<Result> {
  const user = await assertPermission("leads.edit");
  const { count } = await prisma.job.updateMany({ where: { status: "PAUSED", type: { startsWith: "LF_" } }, data: { status: "QUEUED", runAfter: new Date() } });
  await prisma.leadSearch.updateMany({ where: { status: "PAUSED" }, data: { status: "RUNNING", error: null } });
  await audit(user, "UPDATE", "Job", null, `Resumed ${count} paused Lead Finder job(s)`);
  revalidatePath("/leads");
  return { ok: true, message: `${count} job(s) resumed.` };
}

// ---------- Claude review ----------

/** The text to paste into Claude: instructions + these leads' details. */
export async function claudeBrief(ids: string[]): Promise<{ ok: boolean; text: string; message: string }> {
  try {
    const user = await assertPermission("leads.edit");
    const leadIds = z.array(z.string()).min(1, "Select some leads").max(40, "Up to 40 leads per brief, so Claude's answer stays complete").parse(ids);
    const leads = await loadBriefLeads(leadIds);
    return { ok: true, text: buildBrief(leads, user.name.split(" ")[0]), message: "" };
  } catch (e) {
    return { ok: false, text: "", message: errMsg(e) };
  }
}

/** Save Claude's answer: each "### GL-…" block goes to its lead. */
export async function saveClaudeAnswer(text: string): Promise<Result & { saved?: string[]; unknown?: string[] }> {
  try {
    const user = await assertPermission("leads.edit");
    const results = parseClaudeAnswer(z.string().min(10, "Paste Claude's answer").max(400_000).parse(text));
    if (!results.length) throw new Error('No lead blocks found. Each should start with "### GL-…" as in the instructions.');
    const leads = await prisma.lead.findMany({ where: { code: { in: results.map((r) => r.code) } }, select: { id: true, code: true } });
    const byCode = new Map(leads.map((l) => [l.code, l.id]));
    const saved: string[] = [];
    for (const r of results) {
      const id = byCode.get(r.code);
      if (!id) continue;
      await prisma.lead.update({
        where: { id },
        data: { claudeFit: r.fit, claudeService: r.service, claudeSummary: r.summary || null, claudeMessage: r.message, claudeAt: new Date() },
      });
      await prisma.leadActivity.create({ data: { leadId: id, type: "NOTE", text: `Claude review: ${r.fit ?? "?"} fit${r.service ? `, lead with ${r.service}` : ""}\n${r.summary}`, byId: user.id, byName: user.name } });
      saved.push(r.code);
    }
    revalidatePath("/leads/list");
    const unknown = results.map((r) => r.code).filter((c) => !byCode.has(c));
    return { ok: saved.length > 0, message: `Saved ${saved.length} review(s)${unknown.length ? `; ${unknown.length} ID(s) not found: ${unknown.join(", ")}` : ""}.`, saved, unknown };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}
