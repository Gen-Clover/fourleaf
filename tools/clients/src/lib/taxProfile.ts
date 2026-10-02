// What a client's country means for tax and the details they need. Used by the client form (to show the
// right fields), and by the actions (to check and clean what is saved). Safe to import in the browser.
//
// India:            state (GST place of supply) is required. GSTIN only if they are GST registered (then the
//                   invoice is B2B and they can claim the GST back); its first two digits are the state code,
//                   and characters 3–12 are their PAN. PAN optional (TDS they deduct is reported against it).
// Outside India:    no GSTIN or PAN (Indian registrations). Invoices are export of services under Gen Clover's
//                   LUT, with no GST. Billing address with the country is needed on the invoice.
// Everyone:         billing address before the first invoice is issued (a tax invoice must show it).

/** GST state codes (the first two digits of a GSTIN). */
export const GST_STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01", "Himachal Pradesh": "02", Punjab: "03", Chandigarh: "04", Uttarakhand: "05", Haryana: "06", Delhi: "07",
  Rajasthan: "08", "Uttar Pradesh": "09", Bihar: "10", Sikkim: "11", "Arunachal Pradesh": "12", Nagaland: "13", Manipur: "14",
  Mizoram: "15", Tripura: "16", Meghalaya: "17", Assam: "18", "West Bengal": "19", Jharkhand: "20", Odisha: "21", Chhattisgarh: "22",
  "Madhya Pradesh": "23", Gujarat: "24", "Dadra and Nagar Haveli and Daman and Diu": "26", Maharashtra: "27", Karnataka: "29", Goa: "30",
  Lakshadweep: "31", Kerala: "32", "Tamil Nadu": "33", Puducherry: "34", "Andaman and Nicobar Islands": "35", Telangana: "36",
  "Andhra Pradesh": "37", Ladakh: "38",
};

export const isIndia = (country: string | null | undefined) => ["india", "in", "bharat"].includes((country ?? "").trim().toLowerCase());

/** The PAN inside a GSTIN (characters 3–12). */
export const panFromGstin = (gstin: string) => gstin.slice(2, 12);

/** What will happen on this client's invoices, in one line. */
export function taxNote(c: { country: string; state: string; gstin?: string | null }, companyState: string) {
  if (!isIndia(c.country)) return "Export of services: no GST, under Gen Clover's LUT (renewed every year). Invoice in USD.";
  if (!c.state) return "Pick the state: it decides CGST + SGST or IGST.";
  const gst = c.state.toLowerCase() === companyState.toLowerCase() ? `CGST 9% + SGST 9% (same state as Gen Clover, ${companyState})` : "IGST 18% (another state)";
  return `${gst}. ${c.gstin ? "B2B invoice with their GSTIN: they can claim the GST back." : "No GSTIN: the invoice is B2C (unregistered client)."}`;
}

/**
 * Checks and cleans the tax fields before saving. Throws a readable error, or returns the fields to save
 * (GSTIN / PAN cleared outside India; PAN filled in from the GSTIN when left empty).
 */
export function cleanTaxFields<T extends { country?: string | null; state?: string | null; gstin?: string | null; pan?: string | null }>(d: T): T {
  if (!isIndia(d.country)) return { ...d, gstin: null, pan: null };
  if (!d.state) throw new Error("Pick the client's state: it is the GST place of supply (CGST + SGST or IGST)");
  if (d.gstin) {
    const code = GST_STATE_CODES[d.state];
    if (code && d.gstin.slice(0, 2) !== code) throw new Error(`This GSTIN is registered in another state (code ${d.gstin.slice(0, 2)}); ${d.state} is ${code}. Check the GSTIN or the state.`);
    if (d.pan && d.pan !== panFromGstin(d.gstin)) throw new Error(`The PAN doesn't match the GSTIN (it contains ${panFromGstin(d.gstin)})`);
    return { ...d, pan: d.pan || panFromGstin(d.gstin) };
  }
  return d;
}
