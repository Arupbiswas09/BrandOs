"use client";

import Link from "next/link";
import type { Asset, Offer } from "@/db/schema";
import { ASSET_STATUS, OFFER_STATUS, REVIEW_COLOR } from "@/lib/constants";
import { href } from "@/lib/routes";
import type { WS } from "@/lib/ws";
import { plural } from "@/lib/ws";
import { useApp } from "./app/provider";
import { Link2, MessageSquare, Unlink } from "lucide-react";
import { Avatar, Blocks, Chip, CodeTile, DueBadge, Tick, cx } from "./ui";
import { FOCUS, LIFT } from "./polish";

/** One square per asset, coloured by where it stands in review. Live assets get a ring. */
export function blocksFor(list: Asset[], limit = 28) {
  return list.slice(0, limit).map((a) => {
    const rv = a.review ?? "None";
    const color = rv === "Approved" ? "#2F8F62" : rv === "In review" ? "#C99A2E" : rv === "Changes requested" ? "#C2410C" : "#CBD5E1";
    return {
      id: a.id,
      color,
      title: `${a.name} — ${a.status}${rv !== "None" ? ` · ${rv}` : ""}`,
      ring: a.status === "Live" ? "inset 0 0 0 1.5px rgba(16,22,20,.35)" : "none",
    };
  });
}

export function StatusChips({ a }: { a: Asset }) {
  return (
    <span className="mb-2 flex flex-wrap items-center gap-[5px]">
      <Chip color={ASSET_STATUS[a.status] ?? "#94A3B8"} size="xs">{a.status}</Chip>
      {a.review !== "None" && <Chip color={REVIEW_COLOR[a.review]} size="xs">{a.review}</Chip>}
      <span className="font-mono text-[12.5px] text-mute-4">v{a.version}</span>
    </span>
  );
}

function linkLabel(n: number) {
  return n === 0 ? "Not linked yet" : n === 1 ? "Linked to 1 offer" : `Linked to ${n} offers`;
}

type AssetVariant = "full" | "recent" | "library" | "kit" | "font";

/** `selecting` turns the card into a checkbox for bulk changes instead of opening the asset. */
export function AssetCard({ a, variant = "full", selecting, selected, onToggle }: { a: Asset; variant?: AssetVariant; selecting?: boolean; selected?: boolean; onToggle?: () => void }) {
  const { ws, openAsset } = useApp();
  const color = ws.colorOf(a);
  const n = ws.linkedOfferIds(a.id).length;
  const open = ws.openCount("asset", a.id);
  const tileH = variant === "recent" ? 78 : variant === "kit" || variant === "font" ? 88 : 84;
  return (
    <button
      type="button"
      onClick={() => (selecting ? onToggle?.() : openAsset(a.id))}
      {...(selecting && { role: "checkbox", "aria-checked": !!selected })}
      className={cx(
        "group relative flex flex-col overflow-hidden rounded-[13px] border border-line bg-white p-0 text-left shadow-[0_1px_2px_rgba(15,23,42,.04)]",
        variant === "kit" || variant === "font" ? "transition hover:border-line-strong" : LIFT,
        FOCUS,
        a.archived && !selected && "opacity-55",
        selected && "border-accent ring-2 ring-accent",
      )}
    >
      {selecting && <span className="absolute left-2 top-2 z-[1] rounded-[6px] bg-white p-[2px] shadow-[0_1px_4px_rgba(16,22,20,.25)]"><Tick on={!!selected} size={19} /></span>}
      {ws.previewOf(a) ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; next/image would proxy it through the optimizer
        <img src={ws.previewOf(a)!} alt="" loading="lazy" className="w-full border-b border-divider bg-wash object-cover" style={{ height: tileH }} />
      ) : (
        <CodeTile code={ws.codeOf(a)} color={color} height={tileH} className="w-full border-b border-divider" style={{ fontSize: variant === "recent" ? 14 : 15 }} />
      )}
      <span className={cx("block", variant === "kit" || variant === "font" ? "px-3.5 py-[13px]" : variant === "recent" ? "px-3.5 pb-3.5 pt-[13px]" : "p-3.5")}>
        {variant === "full" && <span className="mb-1 block text-[12.5px] font-medium text-mute-4">{a.type}</span>}
        <span className={cx("block text-[15px] font-semibold leading-[1.35] text-ink", variant !== "kit" && variant !== "font" && "mb-2")}>{a.name}</span>
        {variant === "kit" && <span className="mt-[3px] block text-[14.5px] text-mute-2">{a.short}</span>}
        {variant === "font" && <span className="mt-[3px] block text-[14.5px] text-mute-2">{a.type}</span>}
        {variant === "library" && (
          <>
            <span className="mb-2 flex items-center gap-[7px]">
              <span className="text-[13.5px] text-mute-4">{a.type}</span>
              {a.type === "Checklist" && <span className="font-mono text-[13px] text-mute-2">{(a.items ?? []).length} checks</span>}
              {a.type === "Prompt" && <span className="font-mono text-[13px] text-mute-2">{a.promptFor}</span>}
            </span>
            <span className="block text-[14.5px] text-mute-2">{a.short}</span>
          </>
        )}
        {(variant === "full" || variant === "recent") && (
          <>
            <StatusChips a={a} />
            {a.dueAt && a.status !== "Live" && a.status !== "Archived" && <DueBadge at={a.dueAt} now={ws.d.now} className="mb-2" />}
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-divider pt-2 text-[13px] font-medium">
              <span className="inline-flex items-center gap-1" style={{ color: n === 0 ? "#8A6A12" : "#475569" }}>
                {n === 0 ? <Unlink aria-hidden size={13} /> : <Link2 aria-hidden size={13} />}{linkLabel(n)}
              </span>
              {open > 0 && <span className="inline-flex items-center gap-1 text-mute-2"><MessageSquare aria-hidden size={13} />{plural(open, "open note")}</span>}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

export function GoalChips({ ws, o, size = "sm" }: { ws: WS; o: Offer; size?: "sm" | "md" }) {
  if (!o.goals.length) return null;
  return (
    <span className="flex flex-wrap gap-[5px]">
      {o.goals.map((g) => <Chip key={g} round size={size} color={ws.goalColor(o.brandId, g)}>{g}</Chip>)}
    </span>
  );
}

export function OfferCard({ o, variant = "full" }: { o: Offer; variant?: "full" | "standalone" | "service" }) {
  const { ws } = useApp();
  const assets = ws.linkedAssets(o.id);
  const ac = assets.length;
  const open = ws.openCount("offer", o.id);
  const segColor = ws.segColor(o.segment, o.brandId);
  const assetLabel = ac === 0 ? "No assets yet" : plural(ac, "asset");
  const serviceName = o.serviceId ? ws.service(o.serviceId)?.name ?? "" : "Standalone";

  if (variant === "standalone") {
    return (
      <Link href={href.offer(o.id)} className={cx("flex flex-col gap-2.5 rounded-[13px] border border-line bg-white px-5 py-[18px] text-left shadow-[0_1px_2px_rgba(15,23,42,.04)]", LIFT, FOCUS, o.archived && "opacity-55")}>
        <span className="flex flex-wrap items-center gap-1.5">
          <Chip color={OFFER_STATUS[o.status]}>{o.status}</Chip>
          <Chip color={segColor}>{o.segment}</Chip>
        </span>
        <span className="block text-[16.5px] font-semibold leading-[1.3] tracking-[-0.012em] text-ink">{o.name}</span>
        {o.positioning && <span className="block text-[15px] leading-[1.5] text-mute-1 text-pretty">{o.positioning}</span>}
        <span className="mt-auto block w-full border-t border-divider pt-2.5 text-[14px] font-medium" style={{ color: ac === 0 ? "#8A6A12" : "#475569" }}>{assetLabel}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href.offer(o.id)}
      className={cx(
        "flex flex-col rounded-[14px] border border-line bg-white text-left shadow-[0_1px_2px_rgba(15,23,42,.04)]",
        LIFT, FOCUS,
        variant === "full" ? "gap-3 px-[22px] py-5" : "gap-2.5 p-5",
        o.archived && "opacity-55",
      )}
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <Chip color={OFFER_STATUS[o.status]}>{o.status}</Chip>
        {variant === "full" && <Chip color={segColor}>{o.segment}</Chip>}
        {o.review !== "None" && <Chip color={REVIEW_COLOR[o.review]}>{o.review}</Chip>}
        {o.dueAt && o.status !== "Archived" && <DueBadge at={o.dueAt} now={ws.d.now} done={o.status === "Active"} />}
      </span>
      {variant === "full" ? (
        <span className="block">
          <span className="eyebrow mb-1 block">{serviceName}</span>
          <span className="block text-[18px] font-semibold leading-[1.25] tracking-[-0.015em] text-ink">{o.name}</span>
          {o.short && <span className="mt-1 block text-[15px] text-mute-2">{o.short}</span>}
        </span>
      ) : (
        <span className="block text-[17px] font-semibold leading-[1.25] tracking-[-0.014em] text-ink">{o.name}</span>
      )}
      {o.positioning && <span className="block text-[15px] leading-[1.55] text-ink-3 text-pretty">{o.positioning}</span>}
      <GoalChips ws={ws} o={o} />
      {ac > 0 && <span className="mb-0.5"><Blocks blocks={blocksFor(assets)} /></span>}
      <span className="mt-auto flex w-full items-center gap-3 border-t border-divider pt-3 text-[14px]">
        <span className="font-medium" style={{ color: ac === 0 ? "#8A6A12" : "#475569" }}>{assetLabel}</span>
        {open > 0 && <span className="inline-flex items-center gap-1 text-mute-2"><MessageSquare aria-hidden size={14} />{plural(open, "note")}</span>}
        <span className="flex-1" />
        <span className="text-mute-5">{ws.ago(o.updatedAt)}</span>
        {variant === "full" && <Avatar initials={ws.user(o.ownerId).initials} size={22} title={ws.user(o.ownerId).name} />}
      </span>
    </Link>
  );
}
