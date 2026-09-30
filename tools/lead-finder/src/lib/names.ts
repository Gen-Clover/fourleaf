// Tidy Google business names and addresses for display and messages.

/** Plain text: fancy Unicode letters (𝗕𝗼𝗹𝗱, 𝐒𝐞𝐫𝐢𝐟) become normal letters, spacing collapsed. */
export const cleanName = (name: string) => name.normalize("NFKC").replace(/\s+/g, " ").trim();

/**
 * The name a person would say: keyword stuffing after " - ", " | ", " – " or " (" is dropped.
 * "Den Star Dental Clinic - Dr. Mrigank Dogra Dentist in Panchkula" → "Den Star Dental Clinic"
 */
export function shortName(name: string) {
  const clean = cleanName(name).replace(/[\s\-|–—,:]+$/, "");
  const cut = clean.split(/\s[-|–—]\s|\s\(|\s\||,\s|:\s/)[0].trim();
  return cut.length >= 3 ? cut : clean;
}

const NOT_A_NAME = /^(Dental|Dentist|Clinic|Care|Hospital|Eye|Skin|Hair|Smile|Tooth|Teeth|Multi|Speciality|Specialty|And|The|Of|In|Best|Centre|Center|Orthodontic|Implant|Laser|Physio|Health|Medical|City|Family|Advanced)$/i;

/**
 * "Dr. Sharma's Dental Clinic" → "Dr. Sharma"; "Dr. Neelam Shourie City Dental Clinic" → "Dr. Neelam Shourie";
 * null when the name has no doctor in it.
 */
export function personFromName(name: string) {
  const m = cleanName(name).match(/\bDr\.?\s+((?:[A-Z][a-z]+(?:['’]s)?\s*){1,3})/);
  if (!m) return null;
  const words: string[] = [];
  for (const w of m[1].trim().split(/\s+/)) {
    const bare = w.replace(/['’]s$/, "");
    if (NOT_A_NAME.test(bare)) break;
    words.push(bare);
    if (w !== bare) break; // possessive ends the name: "Sharma's"
  }
  return words.length ? `Dr. ${words.slice(0, 2).join(" ")}` : null;
}

/** Official names people don't use in conversation. */
const CITY_ALIASES: Record<string, string> = {
  "Sahibzada Ajit Singh Nagar": "Mohali",
  "S.A.S. Nagar": "Mohali",
  "SAS Nagar": "Mohali",
  Rupnagar: "Ropar",
};

/**
 * The town from a Google formatted address, without another request:
 * "SCO 12, Sector 35-C, Chandigarh, 160022, India" → "Chandigarh";
 * "Phase 7, Sahibzada Ajit Singh Nagar, Punjab 160062, India" → "Mohali".
 */
export function cityFromAddress(address: string | null) {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length && /^(India|USA|United States)$/i.test(parts.at(-1)!)) parts.pop();
  // Drop "Punjab 160062" / "TX 78701" / "160022" style state-and-postcode parts.
  while (parts.length > 1 && (/\d{5,6}$/.test(parts.at(-1)!) || /^[A-Z]{2}$/.test(parts.at(-1)!))) parts.pop();
  const city = parts.at(-1);
  if (!city || /\d/.test(city)) return null;
  return CITY_ALIASES[city] ?? city;
}
