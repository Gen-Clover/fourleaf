// "Today" means the working day in India (IST), wherever the server runs.
const IST = 330 * 60_000;

/** 23:59:59 IST today, as a Date. Follow-ups "due today" are due at or before this. */
export function endOfTodayIst(now = new Date()) {
  const local = new Date(now.getTime() + IST);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23, 59, 59, 999) - IST);
}

/** 00:00 IST today. */
export const startOfTodayIst = (now = new Date()) => new Date(endOfTodayIst(now).getTime() - 86_400_000 + 1);

/** 00:00 IST on the 1st of this month. */
export function startOfMonthIst(now = new Date()) {
  const local = new Date(now.getTime() + IST);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - IST);
}
