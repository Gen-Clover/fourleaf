// What the client is billed for a person's time on a project. Set per assignment, by finance only; the team
// and the delivery manager see hours worked, never the billing basis.
//
//   ACTUAL   billed = hours worked
//   PER_DAY  billed = billValue hours for each day with time logged (e.g. 8 for a full day's engagement)
//   FACTOR   billed = hours worked × billValue
//
// The billing basis must match the client contract (e.g. a per-day engagement in the SOW). Billed hours are
// saved on each time entry when it's logged, and recomputed when the basis changes.

export const BILL_MODES: Record<string, { label: string; hint: string; unit: string }> = {
  ACTUAL: { label: "Hours worked", hint: "The client is billed the hours logged", unit: "" },
  PER_DAY: { label: "Fixed hours per day", hint: "Each day with time logged bills this many hours (per-day engagement)", unit: "hrs / day" },
  FACTOR: { label: "Multiplier", hint: "Hours logged × this factor (e.g. an agreed productivity factor)", unit: "×" },
};

export type BillBasis = { billMode: string; billValue: number; billable: boolean };

export function billedHours(hours: number, a: BillBasis | null | undefined) {
  if (hours <= 0) return 0;
  if (!a) return hours; // time on a project without an assignment bills what was worked
  if (!a.billable) return 0;
  if (a.billMode === "PER_DAY") return a.billValue > 0 ? a.billValue : hours;
  if (a.billMode === "FACTOR") return Math.round(hours * (a.billValue > 0 ? a.billValue : 1) * 100) / 100;
  return hours;
}

/** A time entry's billed hours (older entries have none saved: they bill what was worked). */
export const billedOf = (e: { hours: number; billedHours: number | null; billable: boolean }) => (e.billable ? (e.billedHours ?? e.hours) : 0);
