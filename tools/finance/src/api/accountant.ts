import { NextResponse, type NextRequest } from "next/server";
import JSZip from "jszip";
import { can, getCurrentUser } from "@genclover/auth";
import { audit } from "@genclover/db/audit";
import { accountantPack } from "../lib/accountant";

const MONTH = /^\d{4}-\d{2}$/;

/** The accountant pack as one ZIP (or one file with ?file=). Finance roles and the accountant only. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "finance.view")) return new NextResponse("Forbidden", { status: 403 });
  const q = req.nextUrl.searchParams;
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  if (!MONTH.test(from) || !MONTH.test(to) || from > to) return new NextResponse("Pick a valid period", { status: 400 });
  const pack = await accountantPack(from, to);
  const file = q.get("file");
  if (file) {
    const body = pack.files[file];
    if (body == null) return new NextResponse("Unknown file", { status: 404 });
    return new NextResponse(`﻿${body}`, { headers: { "Content-Type": file.endsWith(".txt") ? "text/plain; charset=utf-8" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${from}_${to}_${file}"` } });
  }
  const zip = new JSZip();
  for (const [name, body] of Object.entries(pack.files)) zip.file(name, `﻿${body}`);
  const data = await zip.generateAsync({ type: "uint8array" });
  await audit(user, "EXPORT", "AccountantPack", null, `Accountant pack ${from} to ${to}`);
  return new NextResponse(Buffer.from(data), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="genclover-accountant-pack_${from}_${to}.zip"` } });
}
