// GST on Gen Clover's invoices. Safe for server and client. Confirm the treatment of unusual cases with the CA.
//
//   Client outside India                      → export of services, zero-rated under LUT (no GST). It counts as an
//                                               export only if paid in foreign currency (or INR where RBI allows).
//   Client in India, same state as Gen Clover → CGST + SGST (half the rate each)
//   Client in India, another state            → IGST (full rate)
//
// The client's location decides it, not the billing currency: an Indian client billed in USD still pays GST.

export const TAX_TYPES: Record<string, string> = {
  NONE: "No tax",
  EXPORT_LUT: "Export of services under LUT (zero-rated)",
  IGST: "IGST (inter-state)",
  CGST_SGST: "CGST + SGST (same state)",
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Is this client in India (GST applies)? */
export const inIndia = (country: string | null | undefined) => ["india", "in", "bharat"].includes(norm(country));

/** The default tax on an invoice to this client. */
export function defaultTax(client: { country: string | null; state: string | null; currency?: string }, company: { state: string; gstRate: number }) {
  if (!inIndia(client.country)) return { taxType: "EXPORT_LUT", taxRate: 0, placeOfSupply: client.country || "Outside India" };
  const same = norm(client.state) && norm(client.state) === norm(company.state);
  return { taxType: same ? "CGST_SGST" : "IGST", taxRate: company.gstRate, placeOfSupply: client.state ?? "" };
}

/** Tax on a subtotal, rounded to the paisa / cent. CGST and SGST are each half. */
export function taxOn(subtotal: number, taxType: string, taxRate: number) {
  const rate = taxType === "IGST" || taxType === "CGST_SGST" ? taxRate : 0;
  const tax = Math.round(subtotal * rate) / 100;
  return { tax, cgst: taxType === "CGST_SGST" ? tax / 2 : 0, sgst: taxType === "CGST_SGST" ? tax / 2 : 0, igst: taxType === "IGST" ? tax : 0 };
}
