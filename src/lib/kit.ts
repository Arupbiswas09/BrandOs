import type { Asset, Brand, TypeStyle } from "@/db/schema";

/** What a complete, industry-standard Brand Kit contains, and whether this one has it. */
export function kitChecks(b: Brand, assets: Asset[]) {
  const k = b.kit ?? {};
  const logos = assets.filter((a) => a.brandId === b.id && a.type === "Logo" && !a.archived);
  return [
    { key: "logo", label: "Logo files", done: logos.length > 0, hint: "Upload the primary logo as a master file." },
    { key: "logoRules", label: "Logo rules", done: !!(k.logo?.clearSpace && (k.logo?.minDigital || k.logo?.minPrint)), hint: "Clear space and minimum size." },
    { key: "colours", label: "Colour palette", done: b.colours.length >= 2, hint: "At least a primary and one more." },
    { key: "print", label: "Print values", done: b.colours.some((c) => c.pantone || c.cmyk), hint: "Pantone or CMYK for print." },
    { key: "fonts", label: "Typefaces", done: b.fonts.length > 0, hint: "Heading and body fonts." },
    { key: "scale", label: "Type scale", done: (k.typeScale?.length ?? 0) >= 3, hint: "Sizes for headings and body." },
    { key: "voice", label: "Voice and tone", done: !!b.voice && ((k.weAre?.length ?? 0) > 0 || (k.wordsAvoid?.length ?? 0) > 0), hint: "Personality and words to avoid." },
    { key: "imagery", label: "Imagery style", done: !!k.imagery, hint: "What photography should look like." },
    { key: "rules", label: "Do's and don'ts", done: (k.dos?.length ?? 0) + (k.donts?.length ?? 0) > 0, hint: "The rules people break most." },
    { key: "boilerplate", label: "Boilerplate", done: !!b.boilerplate, hint: "The one paragraph about the brand." },
  ];
}

export function kitScore(b: Brand, assets: Asset[]) {
  const c = kitChecks(b, assets);
  return { checks: c, done: c.filter((x) => x.done).length, total: c.length, pct: Math.round((c.filter((x) => x.done).length / c.length) * 100) };
}

/** A sensible default type scale from the brand's fonts. */
export function defaultScale(b: Brand): TypeStyle[] {
  const head = b.fonts[0]?.name ?? "Inter";
  const body = b.fonts[1]?.name ?? head;
  return [
    { name: "Heading 1", font: head, size: 40, weight: 700, lineHeight: 1.1, tracking: -0.02 },
    { name: "Heading 2", font: head, size: 28, weight: 600, lineHeight: 1.2, tracking: -0.01 },
    { name: "Heading 3", font: head, size: 20, weight: 600, lineHeight: 1.3 },
    { name: "Body", font: body, size: 16, weight: 400, lineHeight: 1.55 },
    { name: "Small", font: body, size: 13, weight: 500, lineHeight: 1.4 },
  ];
}
