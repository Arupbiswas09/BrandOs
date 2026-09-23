export default function Loading() {
  return (
    <div className="mx-auto max-w-[1060px] px-4 pt-10 sm:px-8" aria-busy="true" aria-label="Loading">
      <div className="mb-3 h-3 w-24 animate-pulse rounded bg-avatar" />
      <div className="mb-8 h-9 w-72 max-w-full animate-pulse rounded-lg bg-avatar" />
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-[14px] bg-white" />)}
      </div>
    </div>
  );
}
