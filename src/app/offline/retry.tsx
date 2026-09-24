"use client";

export function RetryButton() {
  return (
    <button type="button" onClick={() => location.reload()} className="rounded-[9px] bg-[#0F2A5F] px-5 py-2.5 text-[15px] font-semibold text-white hover:brightness-110">
      Try again
    </button>
  );
}
