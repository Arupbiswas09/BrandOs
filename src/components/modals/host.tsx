"use client";

import { useApp } from "@/components/app/provider";
import { AssetModal, CloneModal, LinkAssetModal, LinkModal } from "./asset";
import { BrandModal, ClientModal, CtaModal, GoalModal, GoalOffersModal, KitModal, MergeGoalModal, ServiceModal } from "./forms";
import { ConfirmModal, InstallModal, NewModal, ShortcutsModal } from "./misc";
import { OfferModal } from "./offer";
import { ShareModal } from "./share";
import { GroupModal, PersonModal, ReqChangesModal, SendReviewModal } from "./people";

export function ModalHost() {
  const { modal: m } = useApp();
  if (!m) return null;
  switch (m.kind) {
    case "new": return <NewModal />;
    case "client": return <ClientModal draft={m.draft} />;
    case "brand": return <BrandModal draft={m.draft} />;
    case "kit": return <KitModal brandId={m.brandId} />;
    case "service": return <ServiceModal draft={m.draft} />;
    case "offer": return <OfferModal draft={m.draft} />;
    case "asset": return <AssetModal draft={m.draft} step={m.step} />;
    case "clone": return <CloneModal {...m} />;
    case "link": return <LinkModal offerId={m.offerId} />;
    case "linkAsset": return <LinkAssetModal assetId={m.assetId} />;
    case "cta": return <CtaModal draft={m.draft} />;
    case "goal": return <GoalModal {...m} />;
    case "mergeGoal": return <MergeGoalModal {...m} />;
    case "goalOffers": return <GoalOffersModal {...m} />;
    case "person": return <PersonModal draft={m.draft} />;
    case "group": return <GroupModal draft={m.draft} />;
    case "sendReview": return <SendReviewModal item={m.item} id={m.id} />;
    case "reqChanges": return <ReqChangesModal item={m.item} id={m.id} />;
    case "confirm": return <ConfirmModal item={m.item} id={m.id} label={m.label} back={m.back} />;
    case "share": return <ShareModal brandId={m.brandId} />;
    case "install": return <InstallModal />;
    case "shortcuts": return <ShortcutsModal />;
  }
}
