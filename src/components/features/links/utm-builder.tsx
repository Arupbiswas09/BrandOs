"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Link2, X } from "lucide-react";
import { useApp } from "@/components/app/provider";
import { Btn, IconBtn, Select, cx } from "@/components/ui";
import { linkBtn } from "@/components/link-button";
import { UTM_CHANNELS, buildUtm, parseWebUrl, slug, utmValue, type UtmChannel } from "@/lib/utm";

/*
 * Tracked links: the same address tagged per channel (Meta, Google Ads,
 * email…) so analytics can tell where each visit came from. One row per
 * channel with one Copy button, and a custom row for anything else. Nothing
 * is stored; the links are built in the browser.
 */

type Named = { name: string } | null | undefined;

/** Campaign from the offer (else the asset or CTA), content from the asset or CTA, as slugs. */
export function utmDefaults({ offer, asset, cta }: { offer?: Named; asset?: Named; cta?: { text: string } | null }) {
  const a = slug(asset?.name ?? ""), c = slug(cta?.text ?? ""), o = slug(offer?.name ?? "");
  const campaign = o || a || c;
  const content = o ? a || c : a && c ? c : "";
  return { campaign, content: content === campaign ? "" : content };
}

const INPUT = "field h-9 w-full py-1.5 font-mono text-small";

function useCopy() {
  const { toast } = useApp();
  const [done, setDone] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Link copied");
      setDone(key);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(null), 1600);
    } catch {
      toast("Copying did not work here. Select the link and copy it.", "error");
    }
  };
  return { copy, done };
}

/** The address in quiet grey and its tags in ink, so the part that differs per channel stands out. */
function TaggedLink({ link }: { link: string }) {
  const i = link.search(/[?&]utm_/);
  return i < 0 ? <>{link}</> : <><span className="text-mute-2">{link.slice(0, i)}</span>{link.slice(i)}</>;
}

function LinkRow({ id, label, link, copied, onCopy, control }: {
  id: string; label: string; link: string | null; copied: boolean; onCopy: () => void; control?: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]">
      <div id={id} className="min-w-0 text-body font-medium text-ink">{label}</div>
      <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        {control}
        <code className="block rounded-sm bg-wash px-2 py-1 font-mono text-small leading-[1.5] text-ink" title={link ?? undefined}>
          <span className="line-clamp-2 select-all break-all">{link ? <TaggedLink link={link} /> : <span className="text-mute-2">Fill in source and medium</span>}</span>
        </code>
      </div>
      <Btn size="sm" variant="secondary" className="col-start-2 row-start-1 sm:col-start-3" disabled={!link} onClick={onCopy} aria-describedby={id}>
        {copied ? <Check aria-hidden size={15} className="text-ok" /> : <Copy aria-hidden size={15} />}
        {copied ? "Copied" : "Copy"}
      </Btn>
    </li>
  );
}

/**
 * The tracked links for one address. `offer`, `asset` and `cta` only
 * pre-fill the campaign and content names; everything can be edited.
 */
export function UtmBuilder({ url, offer, asset, cta, className }: {
  url: string; offer?: Named; asset?: Named; cta?: { text: string } | null; className?: string;
}) {
  const uid = useId();
  const defaults = utmDefaults({ offer, asset, cta });
  const [campaign, setCampaign] = useState(defaults.campaign);
  const [content, setContent] = useState(defaults.content);
  const [network, setNetwork] = useState(UTM_CHANNELS.find((c) => c.sources)?.sources?.[0] ?? "linkedin");
  const [custom, setCustom] = useState({ source: "", medium: "" });
  const { copy, done } = useCopy();

  if (!parseWebUrl(url)) {
    return <p className={cx("m-0 rounded-lg bg-wash px-3 py-2.5 text-meta text-mute-2", className)}>{url.trim() ? "This is not a web address, so it cannot be tagged." : "Add a link first, then tracked links appear here."}</p>;
  }
  const tag = (source: string, medium: string) => {
    const [s, m] = [utmValue(source), utmValue(medium)];
    return s && m ? buildUtm(url, { source: s, medium: m, campaign: utmValue(campaign), content: utmValue(content) }) : null;
  };
  const sourceOf = (ch: UtmChannel) => (ch.sources ? network : ch.source);

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Campaign</span>
          <input className={INPUT} value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="free-marketing-audit" spellCheck={false} autoComplete="off" />
        </label>
        <label className="block">
          <span className="label flex justify-between gap-2"><span>Content</span><span className="font-normal text-mute-2">Optional</span></span>
          <input className={INPUT} value={content} onChange={(e) => setContent(e.target.value)} placeholder="landing-page" spellCheck={false} autoComplete="off" />
        </label>
      </div>
      <ul className="m-0 list-none divide-y divide-divider overflow-hidden rounded-xl border border-line bg-surface p-0">
        {UTM_CHANNELS.map((ch) => {
          const source = sourceOf(ch);
          return (
            <LinkRow key={ch.key} id={`${uid}-${ch.key}`} label={ch.label} link={tag(source, ch.medium)}
              copied={done === ch.key} onCopy={() => { const l = tag(source, ch.medium); if (l) void copy(ch.key, l); }}
              control={ch.sources && (
                <Select aria-label="Network" value={network} onChange={setNetwork} options={ch.sources.map((s) => ({ value: s, label: s }))}
                  className="mb-1.5 h-8 w-auto py-1 pr-8 font-mono text-small" />
              )} />
          );
        })}
        <LinkRow id={`${uid}-custom`} label="Custom" link={tag(custom.source, custom.medium)}
          copied={done === "custom"} onCopy={() => { const l = tag(custom.source, custom.medium); if (l) void copy("custom", l); }}
          control={(
            <div className="mb-1.5 grid grid-cols-2 gap-2">
              <input aria-label="Custom source" className={cx(INPUT, "h-8")} value={custom.source} onChange={(e) => setCustom({ ...custom, source: e.target.value })} placeholder="source" spellCheck={false} autoComplete="off" />
              <input aria-label="Custom medium" className={cx(INPUT, "h-8")} value={custom.medium} onChange={(e) => setCustom({ ...custom, medium: e.target.value })} placeholder="medium" spellCheck={false} autoComplete="off" />
            </div>
          )} />
      </ul>
    </div>
  );
}

/**
 * A "Tracked links" trigger that opens the builder in a dialog, for rows that
 * show a link (an offer's key links, a CTA). `look` picks the trigger: a
 * secondary button, a quiet text action beside Open and Copy link, or the
 * icon alone where the words would need a line of their own. Escape or the
 * close button closes it and focus goes back to the trigger.
 */
export function TrackedLinksButton({ url, offer, asset, cta, what: whatName, label = "Tracked links", look = "button", size = "sm", className }: {
  url: string; offer?: Named; asset?: Named; cta?: { text: string } | null; what?: string; label?: string;
  look?: "button" | "quiet" | "icon"; size?: "sm" | "md"; className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  useEffect(() => {
    const d = dialog.current;
    if (open && d && !d.open) d.showModal();
  }, [open]);
  if (!parseWebUrl(url)) return null;
  const close = () => { dialog.current?.close(); };
  const what = whatName ?? asset?.name ?? cta?.text ?? offer?.name;
  const named = what ? `${label} for ${what}` : label;
  return (
    <>
      {look === "button" ? (
        <Btn size={size} variant="secondary" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
          <Link2 aria-hidden size={15} />
          {label}
        </Btn>
      ) : (
        <button type="button" aria-haspopup="dialog" aria-label={named} title={look === "icon" ? named : undefined} onClick={() => setOpen(true)}
          className={cx(linkBtn("quiet"), look === "icon" && "w-6 px-0", className)}>
          <Link2 aria-hidden size={13} />{look === "quiet" && label}
        </button>
      )}
      {open && (
        <dialog ref={dialog} aria-labelledby={titleId} onClose={() => setOpen(false)}
          // Keys stay in the dialog, so Escape closes it and not the drawer or page behind.
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          className="m-auto w-[min(680px,calc(100vw-32px))] max-w-none animate-pop overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-[rgba(16,22,20,.38)]">
          <div className="flex max-h-[min(86vh,calc(100dvh-48px))] flex-col">
            <div className="flex flex-none items-start justify-between gap-3 border-b border-line py-5 pl-6 pr-3 sm:pl-7">
              <div className="min-w-0">
                <h2 id={titleId} className="m-0 text-title font-semibold">Tracked links</h2>
                <p className="m-0 mt-1 text-meta text-mute-2 text-pretty">
                  {what ? <>For {what}. </> : null}Each link opens the same page and tells analytics which channel the visit came from.
                </p>
                <p className="m-0 mt-1.5 truncate font-mono text-small text-mute-2" title={url}>{url.trim()}</p>
              </div>
              <IconBtn label="Close" onClick={close}><X aria-hidden /></IconBtn>
            </div>
            <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5 sm:px-7">
              <UtmBuilder url={url} offer={offer} asset={asset} cta={cta} />
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
