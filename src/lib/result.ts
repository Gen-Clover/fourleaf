import { z } from "zod";

export type Result = { ok: boolean; message: string } | undefined;

export const errMsg = (e: unknown) => (e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : String(e));
export const fail = (e: unknown) => ({ ok: false, message: errMsg(e) });

/** Form helpers: blank → null */
export const optStr = z.string().trim().transform((s) => (s === "" ? null : s)).nullable().optional();
export const optDate = z.string().trim().transform((s) => (s === "" ? null : new Date(s))).nullable().optional();
export const optNum = z.string().trim().transform((s) => (s === "" ? null : Number(s))).pipe(z.number().nullable());
