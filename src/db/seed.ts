import type { DB } from "./index";
import * as s from "./schema";
import { DEFAULT_GOALS } from "@/lib/constants";

/** Turns the prototype's "3 days ago" style strings into real dates. */
function ago(label: string, now: Date): Date {
  const t = now.getTime();
  const H = 3600_000, D = 24 * H;
  if (label === "just now") return new Date(t - 60_000);
  if (label === "yesterday") return new Date(t - D);
  const m = /^(\d+)\s+(hour|day|week|month|year)s?\s+ago$/.exec(label);
  if (!m) return new Date(t);
  const n = Number(m[1]);
  const unit = { hour: H, day: D, week: 7 * D, month: 30 * D, year: 365 * D }[m[2] as "hour"]!;
  return new Date(t - n * unit);
}

let seq = 0;
const uid = (p: string) => `${p}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function seed(db: DB) {
  const now = new Date();
  const at = (l: string) => ago(l, now);

  /* ---------------- people ---------------- */
  const people: Array<Partial<s.User> & { id: string; name: string; initials: string; role: string }> = [
    { id: "pr", name: "Priya Raman", initials: "PR", role: "Strategy lead", access: "Admin", allClients: true },
    { id: "ta", name: "Tom Aldridge", initials: "TA", role: "Paid media", access: "Reviewer", allClients: true },
    { id: "ib", name: "Ines Batz", initials: "IB", role: "Design", access: "Editor", brandIds: ["br1"] },
    { id: "jw", name: "Joss Weekes", initials: "JW", role: "Client lead", access: "Manager", allClients: true },
    { id: "do", name: "Dana Okafor", initials: "DO", role: "Copy and content", access: "Editor", groupIds: ["g1"] },
    { id: "mv", name: "Marta Vieira", initials: "MV", role: "Account director", access: "Viewer", groupIds: ["g2"] },
    { id: "lp", name: "Leo Park", initials: "LP", role: "Freelance copywriter", access: "Contributor", groupIds: ["g1"] },
    { id: "rh", name: "Ruth Hale", initials: "RH", role: "Parish administrator", access: "Client", clientIds: ["cl2"] },
  ];
  const users = people.map((p) => ({
    clientIds: [], brandIds: [], groupIds: [], allClients: false, access: "Viewer" as s.Access,
    email: p.access === "Client" ? `${p.name.split(" ")[0].toLowerCase()}@staidan.example` : `${p.name.split(" ")[0].toLowerCase()}@quokkaforgood.org`,
    ...p,
  }));

  const groups = [
    { id: "g1", name: "Nonprofit pod", clientIds: ["cl1", "cl2"], brandIds: [], note: "Everyone who touches faith and community work." },
    { id: "g2", name: "Sport and outdoors", clientIds: ["cl3"], brandIds: [], note: "Northgate and anything seasonal." },
  ];

  const clients = [
    { id: "cl1", name: "Quokka For Good", kind: "Our agency · nonprofit growth", contactId: "pr", since: "2021", note: "Us. Everything we sell to nonprofits lives here, positioned once per segment so nobody rewrites it from memory." },
    { id: "cl2", name: "St Aidan Parish", kind: "Church · Bristol", contactId: "do", since: "2024", note: "Annual giving and the Christmas appeal. The parish brand plus a separate youth identity." },
    { id: "cl3", name: "Northgate Athletics Trust", kind: "Sports nonprofit · Leeds", contactId: "jw", since: "2025", note: "Season intake and corporate squad sponsorship." },
    { id: "cl4", name: "Harlow Community Trust", kind: "Community foundation · Essex", contactId: "pr", since: "2022", note: "Retainer ended March 2026. Kept for the case study and the grant numbers.", archived: true },
  ];

  const goals = () => DEFAULT_GOALS.map((g) => ({ ...g }));
  const brands: s.Brand[] = [
    {
      id: "br1", clientId: "cl1", parentId: null, name: "Quokka For Good", mark: "QG", tagline: "Nonprofit growth, argued three ways.", primary: "#1F6F5C", secondary: "#E8B44A", ownerId: "pr", teamSize: 6,
      description: "Our own house. Four services, three segments, five angles — every combination either exists here or is visibly missing.",
      voice: 'Warm and specific. Name the number. Never write "make a difference".',
      boilerplate: "Quokka For Good helps nonprofits grow audience, donations and volunteers through paid search, web and reporting.",
      segments: [{ name: "Church", color: "#7C6AC4" }, { name: "Education", color: "#2D6FA8" }, { name: "Sports nonprofit", color: "#C2740C" }, { name: "All segments", color: "#6E7C76" }],
      fonts: [
        { name: "Instrument Serif", role: "Headings", files: "2 files · woff2, otf", weights: "400", fallback: "Georgia, serif", source: "Google Fonts · OFL" },
        { name: "Instrument Sans", role: "Body and UI", files: "4 files · woff2", weights: "400, 500, 600, 700", fallback: "system-ui, sans-serif", source: "Google Fonts · OFL" },
      ],
      colours: [
        { name: "Mangrove", hex: "#1F6F5C", usage: "Buttons, links, headings.", role: "Primary", pantone: "PMS 7722 C" },
        { name: "Sand Gold", hex: "#E8B44A", usage: "Emphasis only. Never for body text.", role: "Accent", pantone: "PMS 7409 C" },
        { name: "Ink", hex: "#14201C", usage: "Body text.", role: "Text", pantone: "PMS Black 6 C" },
        { name: "Shell", hex: "#F4F7F5", usage: "Surfaces and section fills.", role: "Background" },
      ],
      kit: {
        version: "2026.1",
        mission: "Help nonprofits grow the audience, money and volunteers they need — and show exactly how.",
        values: ["Specific over grand", "Show the working", "Earn attention, never buy guilt"],
        weAre: ["Warm", "Specific", "Plain-spoken", "Quietly confident"],
        weAreNot: ["Preachy", "Vague", "Corporate", "Guilt-tripping"],
        wordsUse: ["give", "grow", "show", "people", "numbers", "your community"],
        wordsAvoid: ["make a difference", "leverage", "synergy", "solutions", "beneficiaries"],
        voiceExamples: [
          { context: "Ad headline", say: "Your Ad Grant can bring in 40 new volunteers a month.", dont: "Unlock the power of digital to make a difference." },
          { context: "Email subject", say: "3 changes that raised St Aidan's giving by 22%", dont: "Newsletter — October edition" },
        ],
        typeScale: [
          { name: "Display", font: "Instrument Serif", size: 56, weight: 400, lineHeight: 1.05, tracking: -0.02 },
          { name: "Heading 1", font: "Instrument Serif", size: 40, weight: 400, lineHeight: 1.1, tracking: -0.015 },
          { name: "Heading 2", font: "Instrument Sans", size: 28, weight: 600, lineHeight: 1.2, tracking: -0.01 },
          { name: "Body", font: "Instrument Sans", size: 17, weight: 400, lineHeight: 1.55 },
          { name: "Caption", font: "Instrument Sans", size: 13, weight: 500, lineHeight: 1.4, tracking: 0.02 },
        ],
        logo: {
          clearSpace: "The height of the Q on every side.",
          minDigital: "24 px tall",
          minPrint: "10 mm tall",
          notes: "Use the full-colour mark on Shell or white, the reversed mark on Mangrove or photography.",
          misuse: ["Stretch or squash it", "Recolour it outside the palette", "Add shadows or outlines", "Place it on busy photography without the reversed version"],
        },
        imagery: "Real people from real partner organisations, in natural light. Show the work happening, not people posing.",
        imageryDo: ["Candid moments", "Natural light", "Faces the reader can see"],
        imageryDont: ["Stock handshakes", "Sad-child fundraising images", "Heavy filters"],
        dos: ["Lead with the number", "Name the organisation you helped", "Use Mangrove for every primary button"],
        donts: ["Write \"make a difference\"", "Use Sand Gold for text on white", "Mix more than two typefaces"],
      },
      guidelines: [{ name: "Brand Guidelines 2026.pdf", size: "8.4 MB" }, { name: "Tone of voice one-pager.pdf", size: "420 KB" }],
      goals: goals(), archived: false, createdAt: at("1 year ago"), updatedAt: at("2 hours ago"),
    },
    {
      id: "br2", clientId: "cl2", parentId: null, name: "St Aidan Parish", mark: "SA", tagline: "A church that shows its working.", primary: "#6B4E9E", secondary: "#C9A227", ownerId: "do", teamSize: 2,
      description: "Parish-wide identity for giving, services and community work.",
      voice: "Plain and unhurried. Speak to one person, not a congregation.",
      boilerplate: "St Aidan Parish has served the Bedminster community since 1878.",
      segments: [{ name: "Parishioners", color: "#6B4E9E" }, { name: "Local families", color: "#2F8F62" }, { name: "Donors", color: "#C9A227" }, { name: "All segments", color: "#6E7C76" }],
      fonts: [{ name: "Instrument Sans", role: "All type", files: "4 files · woff2" }],
      colours: [{ name: "Vespers", hex: "#6B4E9E", usage: "Primary." }, { name: "Brass", hex: "#C9A227", usage: "Secondary." }, { name: "Ink", hex: "#191424", usage: "Body text." }],
      guidelines: [{ name: "Parish identity notes.pdf", size: "1.6 MB" }], kit: { weAre: ["Plain", "Unhurried", "Welcoming"], weAreNot: ["Churchy", "Preachy"] },
      goals: goals(), archived: false, createdAt: at("1 year ago"), updatedAt: at("yesterday"),
    },
    {
      id: "br3", clientId: "cl2", parentId: "br2", name: "St Aidan Youth", mark: "SY", tagline: "Thursday nights, all welcome.", primary: "#C9622A", secondary: "#2F7A6B", ownerId: "do", teamSize: 1,
      description: "Separate identity for the youth programme. Deliberately does not look like the parish.",
      voice: "Direct and unfussy. No church vocabulary unless a young person used it first.",
      boilerplate: "St Aidan Youth runs free weekly sessions for 11 to 18 year olds.",
      segments: [{ name: "Young people", color: "#C9622A" }, { name: "Parents", color: "#2F7A6B" }, { name: "All segments", color: "#6E7C76" }],
      fonts: [{ name: "Instrument Sans", role: "All type", files: "4 files · woff2" }],
      colours: [{ name: "Ember", hex: "#C9622A", usage: "Primary." }, { name: "Pitch Green", hex: "#2F7A6B", usage: "Secondary." }],
      guidelines: [], kit: {}, goals: goals(), archived: false, createdAt: at("8 months ago"), updatedAt: at("5 days ago"),
    },
    {
      id: "br4", clientId: "cl3", parentId: null, name: "Northgate Athletics", mark: "NA", tagline: "Every kid gets a lane.", primary: "#1D6FA3", secondary: "#E0553B", ownerId: "jw", teamSize: 3,
      description: "Membership, intake and sponsorship for a community athletics trust.",
      voice: "Encouraging, never patronising. Talk about effort, not talent.",
      boilerplate: "Northgate Athletics Trust runs subsidised track and field for 600 young athletes across Leeds.",
      segments: [{ name: "Young athletes", color: "#1D6FA3" }, { name: "Parents", color: "#2F8F62" }, { name: "Corporate sponsors", color: "#E0553B" }, { name: "All segments", color: "#6E7C76" }],
      fonts: [{ name: "Instrument Sans", role: "All type", files: "4 files · woff2" }],
      colours: [{ name: "Track Blue", hex: "#1D6FA3", usage: "Primary." }, { name: "Lane Red", hex: "#E0553B", usage: "Secondary." }, { name: "Ink", hex: "#101820", usage: "Body text." }],
      guidelines: [{ name: "Trust brand book.pdf", size: "4.1 MB" }], kit: {},
      goals: goals(), archived: false, createdAt: at("1 year ago"), updatedAt: at("2 days ago"),
    },
  ];

  const sv = (id: string, brandId: string, name: string, short: string, ownerId: string, when: string, description: string, archived = false) =>
    ({ id, brandId, name, short, ownerId, description, archived, createdAt: at("3 months ago"), updatedAt: at(when) });
  const services = [
    sv("sv1", "br1", "Google Ad Grant", "Ten thousand a month, actually spent", "pr", "2 hours ago", "Account rebuild and ongoing management of the Google Ad Grant. The same capability, argued differently depending on whether the nonprofit wants reach, money or people."),
    sv("sv2", "br1", "Website Design", "Pages that finish the job", "ib", "yesterday", "Landing pages, donation pages and event pages. Sold as one service, positioned per page type because the buying reason differs."),
    sv("sv3", "br1", "Impact Report", "Last year, made legible", "do", "3 days ago", "The annual report. Three completely different arguments live inside this one service, and mixing them is why most impact reports read like nothing."),
    sv("sv4", "br1", "Google Workspace", "Free tier, set up properly", "ta", "1 week ago", "Nonprofit Workspace provisioning and migration. Barely marketed yet — two segments written, one missing.", true),
    sv("sv5", "br2", "Annual Giving", "The year of asking", "do", "yesterday", "Christmas appeal, weekly giving and legacy conversations under one plan."),
    sv("sv6", "br3", "Youth Programme", "Thursday nights, filled", "do", "5 days ago", "Recruitment and retention for the weekly youth sessions."),
    sv("sv7", "br4", "Season Membership", "Intake and renewal", "jw", "2 days ago", "Spring intake, renewals and corporate squad sponsorship."),
  ];

  const O = (
    id: string, brandId: string, serviceId: string | null, name: string, short: string, segment: string, goalNames: string[],
    status: s.OfferStatus, ownerId: string, when: string, positioning: string, promise: string, proof: string,
    primaryCtaId: string, secondaryCtaId: string, tags: string[], offerType: string,
  ): s.Offer => ({
    id, brandId, serviceId, name, short, segment, goals: goalNames, status, ownerId, positioning, promise, proof,
    primaryCtaId: primaryCtaId || null, secondaryCtaId: secondaryCtaId || null, tags, offerType,
    review: "None", reviewerId: null, changeNote: "", dueAt: null, archived: false, createdAt: at("3 months ago"), updatedAt: at(when),
  });
  const offers: s.Offer[] = [
    O("of1", "br1", "sv1", "Ad Grant for Church Reach", "Fill the pews from search", "Church", ["Audience growth"], "Active", "pr", "2 hours ago",
      "Every week somebody in your parish searches for a church and finds a directory listing instead of you.",
      "First page for every local church query inside ninety days.", "Eleven parishes, average 4.2x lift in new-visitor enquiries.", "ct1", "ct2", ["grant", "church", "search"], "Paid engagement"),
    O("of2", "br1", "sv1", "Ad Grant for School Enrolment", "Reach families who are looking", "Education", ["Audience growth"], "Active", "pr", "yesterday",
      "Parents research schools for months before they call. The grant puts you in that research.",
      "Own the local enrolment search before open day.", "Two academy trusts, 3.1x enquiry volume year on year.", "ct1", "ct2", ["grant", "education"], "Paid engagement"),
    O("of3", "br1", "sv1", "Ad Grant for Club Sign-ups", "Find the kids not yet playing", "Sports nonprofit", ["Audience growth"], "Ideation", "jw", "4 days ago",
      "Clubs recruit through word of mouth and then wonder why the same families keep turning up.",
      "A steady intake that does not depend on who knows who.", "Not written yet. First club pilot starts in March.", "ct1", "", ["grant", "sports"], "Paid engagement"),
    O("of4", "br1", "sv1", "Ad Grant for Church Giving", "Turn search into giving", "Church", ["Revenue"], "Active", "pr", "3 days ago",
      "The grant cannot buy donations directly, but it can carry someone from a question to a giving page in two clicks.",
      "A third of grant traffic reaching a giving page.", "St Aidan: 22 percent of new regular givers arrived through search.", "ct3", "ct1", ["grant", "church", "donations"], "Paid engagement"),
    O("of5", "br1", "sv1", "Ad Grant for School Fundraising", "Fund the thing the budget will not", "Education", ["Revenue"], "Ideation", "do", "1 week ago",
      "Every school has one project the budget will never cover. That project is the campaign.",
      "One funded project per academic year, paid for by search traffic.", "Draft. Needs a proof point before this goes out.", "ct3", "", ["grant", "education", "donations"], "Paid engagement"),
    O("of6", "br1", "sv1", "Ad Grant for Volunteer Recruitment", "Ask for time, not money", "Sports nonprofit", ["Recruitment"], "Active", "jw", "5 days ago",
      "Clubs die from a shortage of coaches, not a shortage of children.",
      "Twelve new volunteer applications a quarter.", "Northgate filled six coaching slots in seven weeks.", "ct4", "", ["grant", "volunteers"], "Paid engagement"),
    O("of7", "br1", "sv2", "Campaign Landing Page", "One page, every channel", "All segments", ["Audience growth", "Revenue"], "Active", "ib", "yesterday",
      "One page that Meta ads, search ads and a newsletter sponsorship can all point at without contradicting each other.",
      "A single page live within ten working days.", "Fourteen campaigns run off this page structure.", "ct5", "ct1", ["web", "landing"], "Paid engagement"),
    O("of8", "br1", "sv2", "Donation Page Rebuild", "Stop losing people at checkout", "All segments", ["Revenue"], "Active", "ib", "4 days ago",
      "Most nonprofit donation pages lose two thirds of the people who arrive ready to give.",
      "Cut donation page abandonment by half.", "Average completion up from 31 to 68 percent across nine rebuilds.", "ct3", "ct5", ["web", "donations"], "Paid engagement"),
    O("of9", "br1", "sv2", "Event Donation Page", "A page that closes on the night", "Church", ["Revenue"], "Active", "ib", "1 week ago",
      "An event raises the most money in the ninety minutes people are still in the room.",
      "A page that works on a phone, in a hall, on bad wifi.", "St Aidan harvest supper: 41 percent of gifts made in-room.", "ct3", "", ["web", "event", "church"], "Paid engagement"),
    O("of10", "br1", "sv3", "Impact Report for Donor Growth", "A report that asks", "All segments", ["Revenue"], "Active", "do", "3 days ago",
      "The impact report is the only document a lapsed donor will still open. Treat it as an ask, not an archive.",
      "A report that pays for itself in reactivated giving.", "Three clients, average 18 percent lapsed-donor reactivation.", "ct3", "ct6", ["report", "donors"], "Paid engagement"),
    O("of11", "br1", "sv3", "Impact Report for Subscribers", "A report that just tells you", "All segments", ["Audience growth"], "Active", "do", "3 days ago",
      "Some readers are already convinced. Asking them again is how you lose them.",
      "A version with no ask in it at all.", "Unsubscribes fell 40 percent on the no-ask edition.", "ct6", "", ["report", "subscribers"], "Paid engagement"),
    O("of12", "br1", "sv3", "Impact Report for Long-Term Trust", "A report a funder can cite", "Education", ["Retention"], "Ideation", "do", "2 weeks ago",
      "Institutional funders do not read stories. They read the same four numbers, year on year, and check whether you changed the method.",
      "A report that survives a due-diligence read.", "In progress with two trust funders.", "", "", ["report", "funders"], "Paid engagement"),
    O("of13", "br1", "sv4", "Workspace for Churches", "Free tier, set up properly", "Church", ["Retention"], "Ideation", "ta", "1 week ago",
      "Most parishes run on one shared inbox and a personal Dropbox. That is a safeguarding problem before it is an IT problem.",
      "Every volunteer on their own account within a fortnight.", "Two parishes migrated. Written up but never marketed.", "", "", ["workspace", "church"], "Paid engagement"),
    O("of14", "br1", "sv4", "Workspace for Schools", "Shared drives that survive staff turnover", "Education", ["Retention"], "Paused", "ta", "1 month ago",
      "When a teacher leaves, the files should not leave with them.",
      "Nothing important living in a personal account.", "One trust, 340 accounts migrated.", "", "", ["workspace", "education"], "Paid engagement"),
    O("of15", "br1", null, "Free Marketing Audit", "The way in", "All segments", ["Audience growth"], "Active", "pr", "6 hours ago",
      "A free audit that names one specific number in the reader account. It sits above every service and feeds all of them.",
      "A booked call within two weeks of the audit landing.", "Highest-converting thing we own. 38 percent of new clients started here.", "ct1", "ct2", ["audit", "acquisition"], "Audit"),
    O("of16", "br1", null, "Partner Co-Marketing", "Borrow someone else audience", "All segments", ["Retention"], "Ideation", "pr", "2 weeks ago",
      "Other nonprofit suppliers reach the same people we do and are not competitors.",
      "Four co-marketing partners inside a year.", "One pilot with a donation platform.", "", "", ["partners"], "Content series"),
    O("of17", "br2", "sv5", "Christmas Appeal", "The one ask of the year", "Donors", ["Revenue"], "Active", "do", "yesterday",
      "One appeal, one number, one deadline. Everything else the parish sends is not an ask.",
      "Beat last Christmas by a fifth.", "2025 appeal raised 41k against a 34k target.", "ct7", "", ["appeal", "christmas"], "Campaign"),
    O("of18", "br2", "sv5", "Weekly Giving", "Regular, quiet, reliable", "Parishioners", ["Retention"], "Active", "do", "1 week ago",
      "A standing order is a decision made once. The envelope is a decision made fifty-two times.",
      "Half of regular givers on standing order.", "Standing orders up from 88 to 141 households.", "ct7", "ct8", ["giving", "recurring"], "Campaign"),
    O("of19", "br3", "sv6", "Thursday Night Sign-ups", "Get them through the door", "Young people", ["Audience growth"], "Active", "do", "5 days ago",
      "Free, warm, no questions, no faith requirement. That is the whole pitch and it works better unadorned.",
      "Forty regulars by the summer.", "Attendance up from 12 to 31 since January.", "", "", ["youth", "recruitment"], "Campaign"),
    O("of20", "br4", "sv7", "Spring Intake", "Fill the lanes", "Young athletes", ["Audience growth"], "Active", "jw", "2 days ago",
      "Every child who tries athletics once in spring is three times more likely to still be running at sixteen.",
      "Two hundred new athletes across the spring intake.", "2025 intake: 174 sign-ups, 71 percent retained to autumn.", "ct9", "", ["intake", "season"], "Campaign"),
    O("of21", "br4", "sv7", "Sponsor A Squad", "Local money, local kids", "Corporate sponsors", ["Retention"], "Active", "jw", "1 week ago",
      "A squad sponsorship costs less than a fortnight of local radio and puts a logo on eleven kids every Saturday.",
      "Twelve squads sponsored for a full season.", "Nine squads sponsored in 2025, seven renewed.", "ct10", "", ["sponsorship", "b2b"], "Paid engagement"),
    O("of22", "br1", null, "Nonprofit Marketing Notes", "Weekly, no pitch", "All segments", ["Awareness", "Audience growth"], "Active", "do", "yesterday",
      "A weekly note about what actually worked for a nonprofit that week, written in public on LinkedIn and mirrored to the list. Nothing in it is for sale.",
      "Two hundred new subscribers a quarter without a single ad.", "Grew from 0 to 1,900 subscribers in fourteen months.", "", "", ["organic", "linkedin", "content"], "Content series"),
    O("of23", "br1", "sv1", "Ad Grant Readiness Checklist", "Gated, doc on request", "All segments", ["Audience growth"], "Active", "do", "3 days ago",
      "A one-page checklist that tells a nonprofit whether they are even eligible before they waste a month applying.",
      "Four hundred downloads a quarter, half of them qualified.", "Highest-converting thing on LinkedIn. 31 percent request rate.", "ct1", "", ["lead-magnet", "linkedin"], "Lead magnet"),
    O("of24", "br1", "sv1", "Thirty-Minute Grant Consultation", "Free, no deck", "All segments", ["Revenue"], "Active", "pr", "1 week ago",
      "Half an hour on a call where we answer the actual question instead of presenting credentials.",
      "Eight booked calls a month.", "Converts at 34 percent to a paid engagement.", "ct1", "ct2", ["consultation", "sales"], "Free consultation"),
  ];
  const setO = (id: string, p: Partial<s.Offer>) => Object.assign(offers.find((o) => o.id === id)!, p);
  const inDays = (n: number) => new Date(now.getTime() + n * 24 * 3600 * 1000);
  setO("of17", { dueAt: inDays(21) });
  setO("of20", { dueAt: inDays(9) });
  setO("of12", { dueAt: inDays(-2) });
  setO("of3", { dueAt: inDays(12) });
  setO("of12", { review: "In review", reviewerId: "pr" });
  setO("of3", { review: "Changes requested", reviewerId: "pr", changeNote: "Proof point is empty. Do not put this in front of a club until the March pilot gives us a number." });
  setO("of24", { review: "Approved", reviewerId: "jw" });
  setO("of14", { archived: true });
  setO("of5", { archived: true });

  const ctas = [
    { id: "ct1", brandId: "br1", text: "Book a Free Audit", bg: "#1F6F5C", fg: "#FFFFFF", style: "solid", url: "quokkaforgood.org/audit" },
    { id: "ct2", brandId: "br1", text: "See the Playbook", bg: "transparent", fg: "#1F6F5C", style: "outline", url: "quokkaforgood.org/playbook" },
    { id: "ct3", brandId: "br1", text: "Fix My Donation Page", bg: "#E8B44A", fg: "#14201C", style: "solid", url: "quokkaforgood.org/donation-pages" },
    { id: "ct4", brandId: "br1", text: "Recruit Volunteers", bg: "#1F6F5C", fg: "#FFFFFF", style: "solid", url: "quokkaforgood.org/volunteers" },
    { id: "ct5", brandId: "br1", text: "See Example Pages", bg: "transparent", fg: "#1F6F5C", style: "outline", url: "quokkaforgood.org/work" },
    { id: "ct6", brandId: "br1", text: "Read the Sample Report", bg: "transparent", fg: "#1F6F5C", style: "outline", url: "quokkaforgood.org/impact-sample" },
    { id: "ct7", brandId: "br2", text: "Give Now", bg: "#6B4E9E", fg: "#FFFFFF", style: "solid", url: "staidan.org/give" },
    { id: "ct8", brandId: "br2", text: "Set Up a Standing Order", bg: "transparent", fg: "#6B4E9E", style: "outline", url: "staidan.org/regular" },
    { id: "ct9", brandId: "br4", text: "Join the Intake", bg: "#1D6FA3", fg: "#FFFFFF", style: "solid", url: "northgateathletics.org/intake" },
    { id: "ct10", brandId: "br4", text: "Sponsor a Squad", bg: "#E0553B", fg: "#FFFFFF", style: "solid", url: "northgateathletics.org/sponsor" },
  ];

  /* ---------------- assets ---------------- */
  type Legacy = "Draft" | "Review" | "Changes requested" | "Approved" | "Live" | "Archived";
  const SMAP: Record<Legacy, [s.AssetStatus, s.Review]> = {
    Draft: ["Draft", "None"], Review: ["Draft", "In review"], "Changes requested": ["Draft", "Changes requested"],
    Approved: ["Ready", "Approved"], Live: ["Live", "Approved"], Archived: ["Archived", "None"],
  };
  const linkRows: s.Link[] = [];
  const A = (
    id: string, brandId: string | null, name: string, type: string, channel: string, legacy: Legacy,
    offs: string[], ownerId: string, when: string, extra: Partial<s.Asset> = {},
  ): s.Asset => {
    const [status, review] = SMAP[legacy];
    offs.forEach((o) => linkRows.push({ id: uid("lk"), assetId: id, offerId: o, createdBy: "pr", createdAt: at("1 month ago") }));
    return {
      id, brandId, name, type, channel, status, review, reviewerId: null, changeNote: "", ownerId, version: 1,
      short: "", tags: [], url: "", notes: "", copy: null, files: [], specs: "", audienceNotes: "", aiPrompt: "",
      ctaId: null, clientVisible: false, isTemplate: false, clonedFromId: null, gated: false,
      delivery: type === "Landing page" ? "Designed page" : "None",
      items: type === "Checklist" ? [] : null, promptFor: "", prompt: "", dueAt: null, archived: false,
      createdAt: at("3 months ago"), updatedAt: at(when), ...extra,
    };
  };
  const assets: s.Asset[] = [
    A("as1", "br1", "Free Audit Landing Page", "Landing page", "Owned", "Live", ["of15", "of1", "of4", "of7"], "pr", "2 hours ago", {
      version: 6, short: "The page everything points at", url: "quokkaforgood.org/audit", ctaId: "ct1", clientVisible: true, tags: ["landing", "evergreen", "all-channel"],
      copy: { headline: "Your Google Ad Grant is worth ten thousand a month. We will tell you exactly how much of it you are wasting.", body: "Send us read-only access. Two weeks later you get a plan your own team can run, whether or not you hire us.", cta: "Book a Free Audit" },
      files: [{ name: "audit-lp.figma", size: "4.2 MB" }, { name: "hero-search-results.png", size: "1.1 MB" }],
      notes: "Four offers point here, across two services. Meta, Google and both sponsorships all land on this page. Do not fork it without asking Priya.", specs: "Desktop 1440, mobile 390. CTA above the fold on both.",
    }),
    A("as2", "br1", "Meta Ads — Church Giving", "Meta ad", "Meta", "Review", ["of4", "of9"], "do", "5 hours ago", {
      version: 2, short: "Lapsed-giver retargeting", tags: ["meta", "retargeting"], specs: "1080x1080 and 1080x1350, four variants.", reviewerId: "pr",
      audienceNotes: "Lookalike from existing regular givers, excluding current standing orders.", aiPrompt: "Write four ad variants for lapsed church donors that name the specific fund, never the word blessed.",
    }),
    A("as3", "br1", "Google Search Ads — Grant Intent", "Google ad", "Google", "Live", ["of1", "of2", "of15"], "pr", "yesterday", {
      version: 4, short: "Exact-match grant queries", tags: ["search", "ads"], specs: "15 headlines, 4 descriptions, 3 ad groups.", audienceNotes: "Exact and phrase match on grant management intent, UK only.",
    }),
    A("as4", "br1", "Nonprofit Weekly Sponsorship", "Newsletter ad", "Newsletter sponsorship", "Live", ["of15"], "do", "4 days ago", {
      version: 2, short: "Primary slot, 22k readers", tags: ["sponsorship", "paid"],
      copy: { headline: "Most nonprofits spend a third of their ad grant. Find out what yours is doing.", body: "A free two-week audit from Quokka For Good. No pitch unless you ask for one.", cta: "Book a Free Audit" },
      notes: "Booked quarterly. Points at the same audit page as the Meta and Google work.",
    }),
    A("as5", "br1", "Donorbox Onboarding Sponsorship", "Newsletter ad", "Onboarding flow", "Approved", ["of15", "of8"], "do", "1 week ago", {
      short: "Step 3 of their signup flow", tags: ["sponsorship", "partner"],
      notes: "Placed inside another product onboarding flow, so the reader has already decided to fundraise. Highest intent placement we buy.",
    }),
    A("as6", "br1", "Church Case Study — St Aidan", "Case study", "Owned", "Approved", ["of1", "of4", "of9"], "pr", "1 week ago", {
      version: 2, short: "22 percent of new givers", clientVisible: true, tags: ["proof", "church"], files: [{ name: "st-aidan-case-study.pdf", size: "2.1 MB" }],
      notes: "The strongest church proof we have. Reused across three offers in two services.",
    }),
    A("as7", "br1", "Donation Page Teardown Deck", "Document", "Owned", "Live", ["of8", "of9"], "ib", "4 days ago", {
      version: 3, short: "Nine rebuilds, before and after", tags: ["proof", "web"], files: [{ name: "donation-teardowns.pdf", size: "11.4 MB" }], archived: true,
    }),
    A("as8", "br1", "Impact Report Sample — Donor Edition", "Document", "Owned", "Approved", ["of10"], "do", "3 days ago", {
      short: "The version that asks", ctaId: "ct6", clientVisible: true, files: [{ name: "impact-sample-donor.pdf", size: "6.8 MB" }],
    }),
    A("as9", "br1", "Impact Report Sample — Subscriber Edition", "Document", "Owned", "Approved", ["of11"], "do", "3 days ago", {
      short: "The version with no ask", ctaId: "ct6", clientVisible: true, files: [{ name: "impact-sample-subscriber.pdf", size: "6.2 MB" }],
    }),
    A("as10", "br1", "Volunteer Recruitment Email", "Email", "Email", "Live", ["of6"], "jw", "5 days ago", {
      version: 2, short: "Coach and marshal outreach", ctaId: "ct4",
      copy: { headline: "Your club does not need more children. It needs two more adults on a Tuesday.", body: "Ninety minutes a week, no coaching badge required to start.", cta: "Recruit Volunteers" },
    }),
    A("as11", "br1", "Sports Club Landing Page", "Landing page", "Owned", "Draft", ["of3", "of6"], "jw", "4 days ago", {
      short: "Club intake page", tags: ["landing", "sports"], notes: "Blocked on the sports proof point. Offer is still in ideation.",
    }),
    A("as12", "br1", "Workspace for Churches One-Pager", "Document", "Owned", "Draft", ["of13"], "ta", "1 week ago", { short: "Safeguarding-first pitch", tags: ["workspace"] }),
    A("as13", "br1", "Ad Grant Compliance Checklist", "Document", "Owned", "Approved", [], "pr", "3 weeks ago", {
      version: 2, short: "5 percent CTR rules", clientVisible: true, files: [{ name: "grant-compliance.pdf", size: "840 KB" }],
      notes: "Not linked to any offer. Probably belongs on all six Ad Grant offers.",
    }),
    A("as14", "br1", "Campaign Landing Page Template", "Template", "Owned", "Approved", [], "ib", "2 months ago", { isTemplate: true, short: "The page structure we reuse", tags: ["template", "web"] }),
    A("as15", "br1", "Impact Report Template", "Template", "Owned", "Approved", [], "do", "2 months ago", { isTemplate: true, short: "Three-edition master", tags: ["template", "report"] }),
    A("as16", "br1", "Primary Logo", "Logo", "Owned", "Approved", [], "pr", "5 months ago", {
      short: "Full lockup, all formats", files: [{ name: "qfg-logo.svg", size: "42 KB" }, { name: "qfg-logo-white.svg", size: "40 KB" }, { name: "qfg-icon.svg", size: "12 KB" }],
    }),
    A("as17", "br1", "Brand Guidelines 2026", "Guidelines", "Owned", "Approved", [], "pr", "2 months ago", { version: 2, files: [{ name: "brand-guidelines-2026.pdf", size: "8.4 MB" }] }),
    A("as18", "br1", "Brand Typeface Files", "Font", "Owned", "Approved", [], "pr", "5 months ago", {
      files: [{ name: "InstrumentSerif.woff2", size: "64 KB" }, { name: "InstrumentSans.woff2", size: "88 KB" }],
    }),
    A("as19", "br2", "Christmas Appeal Landing Page", "Landing page", "Owned", "Live", ["of17"], "do", "yesterday", {
      version: 3, short: "One number, one deadline", url: "staidan.org/christmas", ctaId: "ct7", clientVisible: true, tags: ["appeal"],
      copy: { headline: "Thirty-four thousand pounds keeps the hall open all winter.", body: "The warm space runs six days a week from November. This is what it costs.", cta: "Give Now" },
    }),
    A("as20", "br2", "Appeal Letter — Print", "Document", "Owned", "Approved", ["of17"], "do", "1 week ago", {
      short: "Pew and post version", files: [{ name: "appeal-letter-2026.pdf", size: "1.9 MB" }], specs: "A4, two colour.",
    }),
    A("as21", "br2", "Standing Order Explainer", "Email", "Email", "Review", ["of18"], "do", "2 days ago", { short: "Envelope to standing order", ctaId: "ct8", reviewerId: "jw" }),
    A("as22", "br2", "St Aidan Parish Logo", "Logo", "Owned", "Approved", [], "do", "1 year ago", { files: [{ name: "st-aidan-logo.svg", size: "31 KB" }], archived: true }),
    A("as23", "br3", "Thursday Night Poster", "Poster", "Owned", "Live", ["of19"], "do", "5 days ago", {
      short: "School noticeboards", files: [{ name: "thursday-a3.pdf", size: "2.4 MB" }], specs: "A3, full bleed.", reviewerId: "pr",
    }),
    A("as24", "br3", "Youth Instagram Set", "Social post", "Organic social", "Approved", ["of19"], "do", "1 week ago", { short: "Nine-post grid", specs: "1080x1350." }),
    A("as25", "br3", "St Aidan Youth Logo", "Logo", "Owned", "Approved", [], "do", "8 months ago", { files: [{ name: "sy-logo.svg", size: "26 KB" }] }),
    A("as26", "br4", "Spring Intake Landing Page", "Landing page", "Owned", "Live", ["of20"], "jw", "2 days ago", {
      version: 4, short: "Intake sign-up", url: "northgateathletics.org/intake", ctaId: "ct9", clientVisible: true, tags: ["intake"],
      copy: { headline: "Every child who tries athletics once is three times more likely to still be running at sixteen.", body: "Six free taster sessions across April. No kit, no club, no cost.", cta: "Join the Intake" },
    }),
    A("as27", "br4", "Intake Google Ads", "Google ad", "Google", "Live", ["of20"], "jw", "3 days ago", { short: "Local intent, ten mile radius", specs: "8 headlines, 3 descriptions." }),
    A("as28", "br4", "Squad Sponsorship Pack", "Document", "Owned", "Review", ["of21"], "jw", "2 days ago", {
      short: "Tiers and reach", ctaId: "ct10", files: [{ name: "squad-sponsorship-2026.pdf", size: "5.6 MB" }], reviewerId: "jw",
      notes: "Waiting on final attendance figures before this goes to buyers.",
    }),
    A("as29", "br4", "Northgate Logo", "Logo", "Owned", "Approved", [], "jw", "1 year ago", { files: [{ name: "northgate-logo.svg", size: "34 KB" }], reviewerId: "ib" }),
    A("as32", null, "New Client Onboarding", "SOP", "Owned", "Live", [], "pr", "2 months ago", {
      short: "Kickoff to first deliverable", tags: ["process", "onboarding"], files: [{ name: "client-onboarding-sop.pdf", size: "380 KB" }],
      notes: "Covers the kickoff call, access handover, brand set-up in here, and what has to be signed before work starts. NDA and photo release live as attachments on this SOP.",
    }),
    A("as33", null, "Asset Handover to Client", "SOP", "Owned", "Live", [], "jw", "3 months ago", {
      short: "What we send and how", tags: ["process", "delivery"], files: [{ name: "handover-sop.pdf", size: "240 KB" }, { name: "photo-release.pdf", size: "120 KB" }],
      notes: "Nothing leaves without Cleared to send on the asset and a named approver in the review log.",
    }),
    A("as30", null, "Campaign Launch", "SOP", "Owned", "Live", [], "ta", "6 weeks ago", {
      short: "Go-live sequence", tags: ["process", "launch"], files: [{ name: "launch-sop.pdf", size: "290 KB" }],
      notes: "Order of operations for the day a campaign goes live, including who watches spend for the first 48 hours.",
    }),
    A("as34", null, "Universal Email Wrapper", "Template", "Email", "Approved", [], "ib", "3 months ago", { isTemplate: true, short: "Brand-agnostic email shell", tags: ["template", "email"] }),
    A("as35", null, "Sponsorship Booking Brief", "Template", "Owned", "Approved", [], "do", "3 months ago", { isTemplate: true, short: "What to send a newsletter owner", tags: ["template", "sponsorship"] }),
    A("as36", "br1", "LinkedIn Carousel — Grant Myths", "LinkedIn post", "LinkedIn", "Review", ["of22", "of23"], "do", "3 hours ago", {
      short: "8 slides, no pitch", tags: ["linkedin", "organic"], specs: "1080x1350, eight slides.", reviewerId: "pr",
      copy: { headline: "Five things people believe about the Google Ad Grant that are simply not true", body: "Slide by slide, with the policy reference for each one.", cta: "" },
    }),
    A("as37", "br1", "LinkedIn Weekly Note Series", "LinkedIn post", "LinkedIn", "Live", ["of22"], "do", "yesterday", {
      version: 3, short: "52 posts, one a week", tags: ["linkedin", "organic", "evergreen"], notes: "Written in public first, mirrored to the newsletter on Fridays. Never carries an ask.",
    }),
    A("as38", "br1", "Ad Grant Readiness Checklist", "Lead magnet", "Owned", "Live", ["of23", "of15"], "do", "3 days ago", {
      version: 2, short: "Gated doc, sent on request", clientVisible: true, tags: ["lead-magnet", "gated"], url: "docs.google.com/document/d/grant-readiness", gated: true, delivery: "Doc link",
      copy: { headline: "Are you actually eligible for the Google Ad Grant?", body: "Fourteen checks. If you fail three of them, do not apply yet.", cta: "Request the checklist" },
      notes: "No designed landing page. People request it in a LinkedIn comment or the newsletter and we send the Doc link.",
    }),
    A("as39", "br1", "Consultation Booking Page", "Landing page", "Owned", "Changes requested", ["of24"], "ib", "6 hours ago", {
      short: "Calendar embed only", url: "quokkaforgood.org/consultation", ctaId: "ct1", tags: ["landing", "sales"], reviewerId: "pr",
      changeNote: "The calendar embed pushes the only proof point below the fold. Move the 34 percent line above it.",
    }),
    A("as40", "br1", "Grant Myths Newsletter Edition", "Newsletter ad", "Email", "Draft", ["of22"], "do", "2 days ago", { short: "Friday mirror of the carousel", tags: ["newsletter", "organic"] }),
  ];

  const CL = (id: string, name: string, short: string, tags: string[], items: string[]) =>
    A(id, null, name, "Checklist", "Owned", "Live", [], "pr", "2 weeks ago", {
      version: 2, short, tags, reviewerId: "pr", items: items.map((text) => ({ text, done: false })),
    });
  const PR = (id: string, name: string, short: string, promptFor: string, tags: string[], prompt: string) =>
    A(id, null, name, "Prompt", "Owned", "Live", [], "do", "1 week ago", { version: 3, short, tags, reviewerId: "pr", promptFor, prompt });

  assets.push(
    CL("ck1", "Google Ad Grant Approval", "Before you submit the application", ["grant", "compliance"], [
      "Nonprofit status verified and current in the Google for Nonprofits account",
      "Website is on a verified domain the organisation actually owns",
      "HTTPS on every page the ads point at, no mixed content",
      "No broken links anywhere in the site navigation",
      "At least two ad groups per campaign, two ads per ad group",
      "Sitelink extensions on every campaign",
      "Geographic targeting set and not left at worldwide",
      "Conversion tracking live and firing before submission",
      "No single-word or overly generic keywords",
      "Landing pages match ad copy, no bait and switch",
      "Donation page reachable within two clicks from every landing page",
      "Account linked to Analytics with data flowing",
    ]),
    CL("ck2", "Website Optimization", "Run quarterly on any live site", ["web", "recurring"], [
      "Every page has a unique title under sixty characters",
      "Meta descriptions written, not auto-generated",
      "One H1 per page, headings in real order",
      "All images have alt text that describes the image",
      "Internal links point at live pages, no redirect chains",
      "Primary CTA above the fold on every landing page",
      "Forms tested on a real phone, not just a resized browser",
      "Analytics and conversion goals verified this quarter",
      "404 page exists and offers a way back",
      "Sitemap current and submitted",
    ]),
    CL("ck3", "Speed Optimization", "When a site feels slow", ["web", "performance"], [
      "Largest Contentful Paint under 2.5 seconds on mobile",
      "Cumulative Layout Shift under 0.1",
      "Images served as WebP or AVIF at display size",
      "Hero image preloaded, everything below the fold lazy-loaded",
      "Fonts subset and preloaded, no render-blocking webfont",
      "Unused CSS and JS removed, not just minified",
      "Caching headers set on static assets",
      "Third-party scripts audited — every one justified",
      "Server response under 600ms",
      "Tested on a throttled 4G connection, not office wifi",
    ]),
    CL("ck4", "Website Audit", "Full review before a rebuild pitch", ["web", "audit"], [
      "Crawl complete, every page inventoried",
      "Traffic by page pulled for the last twelve months",
      "Conversion paths mapped end to end",
      "Mobile experience reviewed on a real device",
      "Accessibility pass — contrast, focus order, keyboard nav",
      "Content freshness checked, stale pages flagged",
      "Brand consistency against the current guidelines",
      "Competitor comparison on the three pages that matter",
      "Technical SEO issues listed and prioritised",
      "Findings written up with an owner against each fix",
    ]),
    CL("ck5", "Landing Page Audit", "Before a page goes live", ["web", "landing", "audit"], [
      "One page, one goal, one primary CTA",
      "Headline names the reader’s problem, not our service",
      "Proof point visible without scrolling",
      "Form asks for the minimum that makes the lead useful",
      "CTA text matches the CTA library entry",
      "Thank-you state tested, not assumed",
      "Tracking fires on submit and is visible in Analytics",
      "Page loads under three seconds on mobile",
      "Copy read aloud once — no sentence longer than a breath",
      "Client-facing claim checked against what legal allows",
    ]),
    PR("pm1", "Landing Page Hero Copy", "Headline, subhead and CTA", "Copy", ["landing", "copy"],
      "You write landing page headlines for nonprofit organisations.\n\nContext:\n- Organisation: [NAME]\n- What they do: [ONE SENTENCE]\n- The offer: [OFFER POSITIONING]\n- Segment: [church / education / sports nonprofit]\n- Goal: [awareness / audience growth / revenue / retention / recruitment]\n\nWrite three options. Each needs:\n1. A headline under fourteen words that names the reader’s problem, not our service\n2. A subhead of one sentence that says what happens next\n3. CTA text of three words or fewer\n\nRules: no “make a difference”, no “empower”, no “unlock”. Use a specific number wherever one exists. Write at reading age eleven."),
    PR("pm2", "Meta Ad Creative Brief", "Static image ad set", "Creative", ["meta", "ads"],
      "Generate creative direction for a Meta ad set.\n\nContext:\n- Brand: [NAME] — primary colour [HEX], secondary [HEX]\n- Offer: [OFFER NAME AND POSITIONING]\n- Audience: [WHO, AND WHAT THEY ALREADY BELIEVE]\n- Proof we can use: [NUMBER OR RESULT]\n\nProduce four variants. For each:\n- Visual direction in one sentence (subject, composition, mood)\n- Primary text, maximum 125 characters\n- Headline, maximum 40 characters\n- Which single objection it answers\n\nSizes: 1080x1080 and 1080x1350. No stock-photo handshakes, no people pointing at laptops."),
    PR("pm3", "Impact Report Section Draft", "One section, three editions", "Copy", ["report", "copy"],
      "Draft one section of a nonprofit impact report.\n\nContext:\n- Section: [NAME]\n- The numbers: [DATA]\n- Edition: [donor / subscriber / funder]\n\nEdition rules:\n- Donor edition ends with an ask and names what the next gift buys\n- Subscriber edition has no ask at all\n- Funder edition leads with method and states the limitations honestly\n\nLength: 180 to 250 words. Lead with the number, then the person it describes. One quote maximum. Never use the word “journey”."),
    PR("pm4", "LinkedIn Carousel Outline", "Eight slides, no pitch", "Creative", ["linkedin", "organic"],
      "Outline a LinkedIn carousel for a nonprofit marketing audience.\n\nContext:\n- Topic: [TOPIC]\n- The one thing the reader should do differently afterwards: [CHANGE]\n- Proof or example available: [DETAIL]\n\nEight slides:\n1. A claim most of the audience believes and is wrong about\n2-6. One idea per slide, one sentence plus one supporting line\n7. The specific action\n8. Who wrote it, no logo wall\n\nNo pitch anywhere. No “swipe →”. Slide one must work as a standalone image in the feed."),
  );

  const due: [string, number][] = [["as2", 1], ["as36", 3], ["as39", -1], ["as21", 5], ["as28", 2], ["as11", 14], ["as40", 6], ["as19", 20], ["as12", 30]];
  for (const [id, n] of due) { const a = assets.find((x) => x.id === id); if (a) a.dueAt = new Date(now.getTime() + n * 24 * 3600 * 1000); }

  /* ---------------- conversation ---------------- */
  const C = (id: string, kind: "asset" | "offer", itemId: string, userId: string, text: string, when: string, extra: Partial<s.Comment> = {}): s.Comment =>
    ({ id, kind, itemId, userId, text, createdAt: at(when), editedAt: null, resolved: false, isChange: false, refs: [], mentions: [], ...extra });
  const comments = [
    C("cm1", "asset", "as1", "jw", "Client asked whether we can say “ten thousand” or have to say “up to ten thousand”. Legal says up to. Can we reword without losing the punch?", "4 hours ago"),
    C("cm2", "asset", "as1", "pr", "“Worth up to ten thousand a month. Most of it goes unspent.” Same punch, defensible.", "3 hours ago"),
    C("cm3", "asset", "as39", "pr", "The calendar embed pushes the only proof point below the fold. Move the 34 percent line above it.", "6 hours ago", { isChange: true }),
    C("cm4", "asset", "as36", "ib", "Slide four has the old logo lockup. Everything else is current.", "2 hours ago"),
    C("cm5", "offer", "of3", "pr", "Proof point is empty. Do not put this in front of a club until the March pilot gives us a number.", "4 days ago", { isChange: true }),
    C("cm6", "offer", "of12", "do", "Two trust funders have seen the draft structure and both asked for the method note up front rather than as an appendix.", "1 week ago"),
    C("cm7", "asset", "as38", "do", "Worth building a real page for this eventually — the Doc link converts fine but we lose everyone who wants to skim before requesting.", "3 days ago", { resolved: true }),
    C("cm8", "offer", "of7", "ib", "This page structure is now carrying four offers. If we change it, check all four before shipping.", "yesterday"),
    C("cm9", "asset", "as1", "do", "@Priya Raman the same proof line is doing work on #Ad Grant for Church Reach — if we reword it here we should reword it there the same day.", "2 hours ago", { refs: ["of1"], mentions: ["pr"] }),
    C("cm10", "offer", "of15", "jw", "Worth saying out loud: #Ad Grant for Church Giving is the one that actually converts off this audit, not the reach version. @Dana Okafor can you check the sequence points there?", "yesterday", { refs: ["of4"], mentions: ["do"] }),
    C("cm11", "offer", "of22", "do", "The checklist we gate on #Ad Grant Readiness Checklist is the single best performing thing in the feed. Keep it in the rotation.", "3 days ago", { refs: ["of23"] }),
  ];

  const act = (userId: string, action: string, type: string, itemId: string, label: string, field: string, when: string) =>
    ({ id: uid("ac"), userId, action, type, itemId, label, field, createdAt: at(when) });
  const activity = [
    act("pr", "updated", "asset", "as1", "Free Audit Landing Page", "Copy", "2 hours ago"),
    act("do", "sent for review", "asset", "as2", "Meta Ads — Church Giving", "Status", "5 hours ago"),
    act("pr", "updated", "offer", "of15", "Free Marketing Audit", "Proof", "6 hours ago"),
    act("do", "updated", "asset", "as19", "Christmas Appeal Landing Page", "Copy", "yesterday"),
    act("pr", "linked", "asset", "as3", "Google Search Ads — Grant Intent", "to Free Marketing Audit", "yesterday"),
    act("do", "sent for review", "asset", "as21", "Standing Order Explainer", "Status", "2 days ago"),
    act("jw", "sent for review", "asset", "as28", "Squad Sponsorship Pack", "Status", "2 days ago"),
    act("jw", "updated", "offer", "of20", "Spring Intake", "Promise", "2 days ago"),
    act("do", "created", "offer", "of12", "Impact Report for Long-Term Trust", "", "2 weeks ago"),
    act("jw", "created", "offer", "of3", "Ad Grant for Club Sign-ups", "", "4 days ago"),
    act("ta", "paused", "offer", "of14", "Workspace for Schools", "Status", "1 month ago"),
    act("ib", "updated", "offer", "of7", "Campaign Landing Page", "Positioning", "yesterday"),
  ];

  const recents = [
    { userId: "pr", kind: "brand", itemId: "br1", visitedAt: at("1 hour ago") },
    { userId: "pr", kind: "service", itemId: "sv1", visitedAt: at("2 hours ago") },
    { userId: "pr", kind: "offer", itemId: "of15", visitedAt: at("3 hours ago") },
    { userId: "pr", kind: "asset", itemId: "as1", visitedAt: at("4 hours ago") },
  ];

  await db.transaction(async (tx) => {
    await tx.insert(s.users).values(users);
    await tx.insert(s.groups).values(groups);
    await tx.insert(s.clients).values(clients);
    await tx.insert(s.brands).values(brands);
    await tx.insert(s.services).values(services);
    await tx.insert(s.ctas).values(ctas);
    await tx.insert(s.offers).values(offers);
    await tx.insert(s.assets).values(assets);
    await tx.insert(s.links).values(linkRows);
    await tx.insert(s.comments).values(comments);
    await tx.insert(s.activity).values(activity);
    await tx.insert(s.recents).values(recents);
  });
}
