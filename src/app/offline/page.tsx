import type { Metadata } from "next";
import { RetryButton } from "./retry";

export const metadata: Metadata = { title: "Offline" };
// Rendered per request like every page, so its scripts carry the CSP nonce.
// The service worker caches the page together with its matching CSP header.

export default function Offline() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-wash px-6">
      <div className="max-w-[380px] text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#2D4A5C] text-[20px] font-bold text-white">B</div>
        <h1 className="display m-0 mb-2 text-[34px]">You are offline</h1>
        <p className="mb-6 mt-0 text-[16px] leading-[1.55] text-mute-1">BrandOS needs a connection to show your clients and assets. Nothing you saved is lost — it is all on the server.</p>
        <RetryButton />
      </div>
    </main>
  );
}
