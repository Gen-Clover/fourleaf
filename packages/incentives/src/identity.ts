// Business identity: the numbers that make a business unique, so one business can't be onboarded twice (as a
// "new" client earning a new incentive, or as branches under different names). Safe to import in the browser.
//
// India   CIN    companies (21 characters, e.g. U72900PB2020PTC051234), from the MCA register
//         LLPIN  LLPs (AAA-1234)
//         GSTIN  GST-registered businesses (15 characters, last one a checksum); characters 3–12 are the PAN,
//                which is the same for every branch (GSTIN) of one business across states
//         PAN    every business has one; proprietorships and partnerships have no CIN, so PAN is the key
// USA     EIN    federal employer ID (12-3456789), from the client's W-9
// Both    website domain and phone, as softer signals (shared phones and domains happen).
//
// There is no free API for these: they are typed in at onboarding from the client's documents (GST certificate,
// MCA master data, W-9) and checked here. Free places to look one up by hand are in LOOKUPS.

const GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const CIN_RE = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}(PLC|PTC|GOI|SGC|NPL|FLC|FTC|GAP|GAT|ULL|ULT|OPC)[0-9]{6}$/;
export const LLPIN_RE = /^[A-Z]{3}-[0-9]{4}$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const EIN_RE = /^[0-9]{2}-?[0-9]{7}$/;

/** Free official look-ups (captcha, one at a time). */
export const LOOKUPS = {
  cin: { label: "MCA: company / LLP master data", url: "https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html" },
  gstin: { label: "GST portal: search taxpayer", url: "https://services.gst.gov.in/services/searchtp" },
  ein: { label: "IRS: EIN comes from the client's W-9", url: "https://www.irs.gov/forms-pubs/about-form-w-9" },
};

/** The GSTIN's 15th character is a checksum of the first 14 (mod 36). A typo or an invented number fails it. */
export function gstinChecksumOk(gstin: string) {
  const g = gstin.toUpperCase();
  if (!GSTIN_RE.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GST_CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36] === g[14];
}

export const normalizeCin = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, "") || null;
export const normalizeEin = (s: string | null | undefined) => {
  const d = (s ?? "").replace(/[^0-9]/g, "");
  return d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2)}` : (s ?? "").trim() || null;
};

/** Reasons a number is wrong, or null when it is fine (empty is fine: not every business has every number). */
export function checkCin(cin: string | null | undefined) {
  const c = normalizeCin(cin);
  if (!c) return null;
  return CIN_RE.test(c) || LLPIN_RE.test(c) ? null : "CIN should look like U72900PB2020PTC051234 (or an LLPIN like AAB-1234)";
}
export function checkGstin(gstin: string | null | undefined) {
  const g = (gstin ?? "").trim().toUpperCase();
  if (!g) return null;
  if (!GSTIN_RE.test(g)) return "GSTIN should look like 03ABCDE1234F1Z5";
  return gstinChecksumOk(g) ? null : "This GSTIN fails its check digit: a character is wrong. Copy it from the GST certificate";
}
export function checkEin(ein: string | null | undefined) {
  const e = (ein ?? "").trim();
  if (!e) return null;
  return EIN_RE.test(e) ? null : "EIN should look like 12-3456789";
}

/** example.com from any website text (www, https, paths stripped). */
export function domainOf(website: string | null | undefined) {
  const w = (website ?? "").trim().toLowerCase();
  if (!w) return null;
  try {
    const host = new URL(/^https?:\/\//.test(w) ? w : `https://${w}`).hostname.replace(/^www\./, "");
    // Free website builders and social pages are shared by thousands of businesses: not an identity.
    if (/(^|\.)(facebook|instagram|linkedin|wixsite|blogspot|wordpress|business\.site|google|sites\.google|linktr)\.(com|ee|site)$/.test(host) || /business\.site$/.test(host)) return null;
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/** The last 10 digits of a phone number (enough to match +91 / 0 / spaces variants). */
export function phoneKey(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/[^0-9]/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

/** Normalised name for a soft match ("Dr. Smile Dental Clinic Pvt Ltd" → "smile dental clinic"). */
export function nameKey(name: string | null | undefined) {
  return (
    (name ?? "")
      .toLowerCase()
      .replace(/\b(dr|mr|mrs|ms|the|pvt|private|ltd|limited|llp|llc|inc|co|company|corp|corporation)\b\.?/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim() || null
  );
}

export type IdentityInput = { name?: string | null; gstin?: string | null; pan?: string | null; cin?: string | null; ein?: string | null; website?: string | null; phone?: string | null };

/** The keys a business is matched on. Hard keys (registrations) decide; soft keys (domain, phone, name) warn. */
export function identityKeys(x: IdentityInput) {
  const gstin = (x.gstin ?? "").trim().toUpperCase() || null;
  const pan = (x.pan ?? "").trim().toUpperCase() || (gstin ? gstin.slice(2, 12) : null);
  return { gstin, pan, cin: normalizeCin(x.cin), ein: x.ein ? normalizeEin(x.ein) : null, domain: domainOf(x.website), phone: phoneKey(x.phone), name: nameKey(x.name) };
}
