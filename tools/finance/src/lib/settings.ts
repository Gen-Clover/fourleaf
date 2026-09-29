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

export async function getParams(): Promise<Params & { companyName: string; projectCodePrefix: string }> {
  const rows = await prisma.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const params = Object.fromEntries(PARAM_KEYS.map((k) => [k, Number(map[k] ?? 0)])) as Params;
  return { ...params, companyName: map.companyName ?? "Gen Clover", projectCodePrefix: map.projectCodePrefix ?? "GC" };
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
    prefix: m.invoicePrefix || "GC",
    termsDays: Number(m.paymentTermsDays ?? 30) || 30,
  };
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
