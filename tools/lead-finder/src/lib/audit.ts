// Website audit: fetch a business's home page like a visitor would and record what's missing.
// Only public web addresses are fetched (no private or local network), with timeouts and a size cap.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { personFromName } from "./names";
import type { AuditFacts } from "./scoring";

export type Contacts = { emails: string[]; whatsappNumber: string | null; socials: string | null; personName: string | null };
export type AuditResult = AuditFacts &
  Contacts & { url: string; finalUrl: string | null; httpStatus: number | null; responseMs: number | null; hasEmail: boolean; analytics: boolean };

const UA = "Mozilla/5.0 (compatible; GenCloverSiteCheck/1.0; +https://genclover.com)";
const MAX_BYTES = 1_500_000;

/** Pages that aren't the business's own site: social profiles, directories, map links. */
const NOT_OWN_SITE = [
  "facebook.com", "fb.com", "instagram.com", "linktr.ee", "justdial.com", "sulekha.com", "indiamart.com", "tradeindia.com",
  "wa.me", "whatsapp.com", "business.site", "g.page", "maps.app.goo.gl", "google.com", "youtube.com", "linkedin.com",
  "x.com", "twitter.com", "practo.com", "yelp.com", "zomato.com", "booking.com", "tripadvisor.com", "magicbricks.com", "99acres.com",
];

export function normalizeUrl(raw: string) {
  const s = raw.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function isSocialOnly(url: string) {
  try {
    const host = new URL(normalizeUrl(url)).hostname.replace(/^www\./, "").toLowerCase();
    return NOT_OWN_SITE.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function privateAddress(ip: string) {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v === "::";
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function assertPublic(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("not a web address");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!ips.length || ips.some(privateAddress)) throw new Error("not a public address");
}

/** GET with redirects followed by hand, so every hop is checked. */
async function get(url: string, timeoutMs = 15_000) {
  let current = new URL(url);
  for (let hop = 0; hop < 6; hop++) {
    await assertPublic(current);
    const res = await fetch(current, { redirect: "manual", headers: { "User-Agent": UA, Accept: "text/html,*/*" }, signal: AbortSignal.timeout(timeoutMs) });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current);
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader && size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader?.cancel().catch(() => {});
    const text = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    return { status: res.status, finalUrl: current.toString(), text, contentType: res.headers.get("content-type") ?? "" };
  }
  throw new Error("too many redirects");
}

function friendlyError(e: unknown) {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = (err as { code?: string }).code ?? err.cause?.code ?? "";
  if (err.name === "TimeoutError" || err.name === "AbortError") return "took too long to load";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "domain not found";
  if (code === "ECONNREFUSED" || code === "ECONNRESET") return "server refused the connection";
  if (code.startsWith("ERR_TLS") || code.includes("CERT") || /certificate/i.test(err.cause?.message ?? "")) return "security certificate error";
  return err.message ?? "could not load";
}

const PLATFORMS: [RegExp, string][] = [
  [/wp-content|wp-includes/i, "WordPress"],
  [/static\.wixstatic\.com|wix\.com/i, "Wix"],
  [/blogger\.com|blogspot\.com/i, "Blogspot"],
  [/sites\.google\.com/i, "Google Sites"],
  [/cdn\.shopify\.com/i, "Shopify"],
  [/squarespace\.com/i, "Squarespace"],
  [/webflow\.(io|com)/i, "Webflow"],
  [/img1\.wsimg\.com/i, "GoDaddy builder"],
  [/\/media\/jui\/|content="Joomla/i, "Joomla"],
  [/drupal/i, "Drupal"],
  [/\/_next\/static/i, "Next.js"],
];

export function inspectHtml(html: string, now = new Date()) {
  const years = [...html.matchAll(/(?:©|&copy;|&#169;|copyright)\s*(?:[^0-9<]{0,25})?((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/gi)]
    .flatMap((m) => [m[1], m[2]].filter(Boolean).map(Number))
    .filter((y) => y <= now.getFullYear());
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;
  return {
    mobileViewport: /<meta[^>]+name=["']?viewport/i.test(html),
    // Direct links, plus the chat-button plugins that draw the button with JavaScript (not share buttons).
    hasWhatsApp:
      /wa\.me\/|api\.whatsapp\.com\/send|whatsapp:\/\/|web\.whatsapp\.com\/send|wa\.link\/|click-to-chat|ht_ctc|ht-ctc|joinchat|qlwapp|wati\.io|interakt|getbutton\.io|chaty|whatsapp-(button|chat|widget)|wa-(button|widget)/i.test(html),
    // A form on the page, or a form plugin the site loads everywhere (the form itself is often on /contact).
    hasForm: /<form[\s>]|docs\.google\.com\/forms|forms\.gle|typeform\.com|jotform|tally\.so|hsforms|wpcf7|contact-form-7|wpforms|gform_|elementor-form|ninja-forms|formidable/i.test(html),
    hasTel: /href=["'](tel|callto):/i.test(html),
    // A phone number written on the page (Indian mobile or US format), even if it isn't a tap-to-call link.
    phoneShown: /(\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b|\+1[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}|\b0\d{2,4}[\s-]?\d{6,8}\b/.test(html),
    hasEmail: /href=["']mailto:/i.test(html),
    hasBooking: /calendly\.com|cal\.com\/|practo\.com|zocdoc|setmore|simplybook|booksy|fresha|razorpay|book\s+(an\s+)?appointment|book\s+now|schedule\s+(an\s+)?appointment|book\s+a\s+(table|room|visit|consultation)/i.test(html),
    title: title ? title.slice(0, 200) : null,
    metaDescription:
      /<meta[^>]+name=["']description["'][^>]*content=["'][^"']{10,}/i.test(html) || /<meta[^>]+content=["'][^"']{10,}["'][^>]*name=["']description["']/i.test(html),
    hasH1: /<h1[\s>]/i.test(html),
    copyrightYear: years.length ? Math.max(...years) : null,
    platform: PLATFORMS.find(([re]) => re.test(html))?.[1] ?? null,
    adsDetected: /googleads\.g\.doubleclick|['"]AW-\d+|google_conversion|fbq\(\s*['"]init|connect\.facebook\.net\/[^"']*fbevents/i.test(html),
    analytics: /googletagmanager\.com|google-analytics\.com|gtag\(/i.test(html),
    // A chat assistant or WhatsApp bot already answers visitors.
    hasChatBot:
      /tawk\.to|crisp\.chat|widget\.intercom|tidio|zopim|zdassets|freshchat|js\.driftt|livechatinc|botpress|chatbase|manychat|landbot|wati\.io|interakt|gallabox|aisensy|kommunicate|voiceflow|elfsight[^"']*chat/i.test(html),
    hasFaq: /frequently asked questions|\bfaqs?\b/i.test(html),
    // Built in the browser: almost no links and an empty app container.
    jsRendered: (html.match(/<a\s/gi)?.length ?? 0) < 3 && /<div[^>]+id=["'](root|app|__next|___gatsby)["'][^>]*>\s*<\/div>/i.test(html),
  };
}

const JUNK_EMAIL =
  /\.(png|jpe?g|gif|svg|webp|css|js)$|@(example|domain|email|yourdomain|test)\.|sentry|wixpress|godaddy|@2x|u00|no-?reply|^(support|info|admin|test|example|email|name|user|your|you|someone)@(gmail|yahoo|hotmail|outlook)\.com$/i;
/** A real address: the domain ends in letters ("bootstrap@5.3.0" in a script link is not an email). */
export const isRealEmail = (e: string) => /^[\w.+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(e) && !JUNK_EMAIL.test(e);

const SOCIAL: [string, RegExp][] = [
  ["facebook", /https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share|plugins|tr\b|dialog)[\w.\-/]+/i],
  ["instagram", /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|explore)[\w.\-]+/i],
  ["linkedin", /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[\w.\-]+/i],
  ["youtube", /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)[\w.\-]+/i],
];

/** Contact details written on a page: emails, WhatsApp number, social links, and a "Dr. …" name. */
export function extractContacts(html: string): Contacts {
  const emails = [
    ...new Set(
      [...html.matchAll(/mailto:([^"'?\s>]+)/gi), ...html.matchAll(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g)]
        .map((m) => decodeURIComponent((m[1] ?? m[0]).trim()).toLowerCase())
        .filter(isRealEmail),
    ),
  ].slice(0, 5);
  const wa = html.match(/wa\.me\/\+?(\d{10,15})|api\.whatsapp\.com\/send\/?\?phone=\+?(\d{10,15})/i);
  const socials = Object.fromEntries(SOCIAL.map(([k, re]) => [k, html.match(re)?.[0]?.replace(/["'<>].*$/, "")]).filter(([, v]) => v));
  // Most-mentioned "Dr. Firstname Lastname" in the visible text.
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const names = new Map<string, number>();
  for (const m of text.matchAll(/\bDr\.?\s+[A-Z][a-z]{2,}(?:['’]s)?(?:\s+[A-Z][a-z]{2,}){0,2}/g)) {
    // Same clean-up as Google names: "Dr. Jyotika Dental Clinic" → "Dr. Jyotika".
    const name = personFromName(m[0]);
    if (name) names.set(name, (names.get(name) ?? 0) + 1);
  }
  const personName = [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { emails, whatsappNumber: wa?.[1] ?? wa?.[2] ?? null, socials: Object.keys(socials).length ? JSON.stringify(socials) : null, personName };
}

function mergeContacts(a: Contacts, b: Contacts): Contacts {
  const socials = { ...(b.socials ? JSON.parse(b.socials) : {}), ...(a.socials ? JSON.parse(a.socials) : {}) };
  return {
    emails: [...new Set([...a.emails, ...b.emails])].slice(0, 5),
    whatsappNumber: a.whatsappNumber ?? b.whatsappNumber,
    socials: Object.keys(socials).length ? JSON.stringify(socials) : null,
    personName: a.personName ?? b.personName,
  };
}

/** The site's own contact / appointment page, if the home page links to one. */
async function contactPage(html: string, baseUrl: string) {
  const base = new URL(baseUrl);
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    let href: URL;
    try {
      href = new URL(m[1], base);
    } catch {
      continue;
    }
    if (href.hostname !== base.hostname || href.pathname === base.pathname) continue;
    if (!/contact|enquir|inquir|appointment|book|reach-us|get-in-touch/i.test(href.pathname)) continue;
    try {
      const r = await get(href.toString(), 12_000);
      return r.status < 400 ? r.text : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function hasSitemap(origin: string) {
  for (const path of ["/sitemap.xml", "/sitemap_index.xml"]) {
    try {
      const r = await get(origin + path, 10_000);
      if (r.status === 200 && /<(urlset|sitemapindex)/i.test(r.text)) return true;
    } catch {
      // try the next one
    }
  }
  return false;
}

export async function auditWebsite(rawUrl: string): Promise<AuditResult> {
  const url = normalizeUrl(rawUrl);
  const empty = inspectHtml("");
  const base: AuditResult = {
    ...empty,
    url,
    finalUrl: null,
    httpStatus: null,
    responseMs: null,
    reachable: false,
    socialOnly: isSocialOnly(url),
    https: false,
    sitemap: null,
    psiMobile: null,
    error: null,
    emails: [],
    whatsappNumber: null,
    socials: null,
    personName: null,
  };
  if (base.socialOnly) return base;

  // Try HTTPS first (even for http:// addresses), then the address as given.
  const tries = [...new Set([url.replace(/^http:/i, "https:"), url])];
  let lastError: unknown = null;
  for (const attempt of tries) {
    const started = Date.now();
    try {
      const page = await get(attempt);
      const responseMs = Date.now() - started;
      if (page.status >= 400) {
        lastError = new Error(`error ${page.status}`);
        continue;
      }
      const facts = inspectHtml(page.text);
      const origin = new URL(page.finalUrl).origin;
      // Enquiry features often live on the contact page: check it too and count what either page has.
      const contact = await contactPage(page.text, page.finalUrl);
      let contacts = extractContacts(page.text);
      if (contact) {
        const c = inspectHtml(contact);
        for (const k of ["hasWhatsApp", "hasForm", "hasTel", "phoneShown", "hasEmail", "hasBooking", "hasChatBot", "hasFaq"] as const) facts[k] ||= c[k];
        contacts = mergeContacts(contacts, extractContacts(contact));
      }
      return {
        ...base,
        ...facts,
        ...contacts,
        finalUrl: page.finalUrl,
        httpStatus: page.status,
        responseMs,
        reachable: true,
        socialOnly: isSocialOnly(page.finalUrl),
        https: page.finalUrl.startsWith("https:"),
        sitemap: await hasSitemap(origin),
      };
    } catch (e) {
      lastError = e;
    }
  }
  return { ...base, error: friendlyError(lastError) };
}
