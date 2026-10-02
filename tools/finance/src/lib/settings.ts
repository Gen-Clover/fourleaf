import "server-only";
import { prisma } from "@genclover/db";
import type { Bucket, Params } from "./calc";

export const PARAM_KEYS: (keyof Params)[] = [
  "fxRate",
  "billableHoursPerYear",
  "usHoursPerYear",
  "usLoadFactor",
  "coverageTarget",
  "floorThreshold",
  "floorDeltaLow",
  "floorDeltaHigh",
  "premiumPctMin",
  "premiumPctMax",
  "rateRounding",
  "blendedRate",
  "retainerHours",
  "retainerAmount",
  "additionalHourRate",
];

export async function getParams(): Promise<Params & { companyName: string }> {
  const rows = await prisma.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const params = Object.fromEntries(PARAM_KEYS.map((k) => [k, Number(map[k] ?? 0)])) as Params;
  return { ...params, companyName: map.companyName ?? "Gen Clover" };
}

/** Company + invoicing details printed on invoices. */
export async function getInvoiceSettings() {
  const rows = await prisma.setting.findMany({ where: { group: { in: ["Company", "Invoicing"] } } });
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    companyName: m.companyName ?? "Gen Clover",
    legalName: m.companyLegalName || m.companyName || "Gen Clover",
    address: m.companyAddress ?? "",
    gstin: m.gstin ?? "",
    lut: m.lutNumber ?? "",
    sac: m.sacCode ?? "998314",
    bank: m.bankDetails ?? "",
    prefix: m.invoicePrefix || "GCI",
    termsDays: Number(m.paymentTermsDays ?? 30) || 30,
    state: m.companyState ?? "",
    pan: m.companyPan ?? "",
    gstRate: Number(m.gstRatePct ?? 18) || 0,
  };
}

/** Pay runs, approvals and costing. */
export async function getPaySettings() {
  const rows = await prisma.setting.findMany({ where: { group: "Pay & approvals" } });
  const m = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  return { tdsContractorPct: m.tdsContractorPct ?? 10, approvalLimitInr: m.approvalLimitInr ?? 25000, overheadPerHourInr: m.overheadPerHourInr ?? 0 };
}

export async function getBuckets(): Promise<Bucket[]> {
  const rows = await prisma.allocationBucket.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map(({ key, name, percent, category, isProfit }) => ({ key, name, percent, category, isProfit }));
}

export function parseSnapshot(json: string): Bucket[] {
  try {
    return JSON.parse(json) as Bucket[];
  } catch {
    return [];
  }
}
