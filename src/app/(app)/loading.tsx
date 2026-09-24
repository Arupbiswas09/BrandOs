/**
 * The page skeleton: a white header band, a row of stat cards, then the
 * two-column card layout most pages use. Shapes only, no spinners.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-12 pt-8 sm:px-8 sm:pt-10 lg:pb-[88px]" aria-busy="true">
      <span role="status" className="sr-only">Loading…</span>
      <div aria-hidden>
        <div className="head-band -mt-8 mb-6 pb-6 pt-8 sm:-mt-10 sm:pt-10">
          <div className="skel mb-3 h-3 w-24" />
          <div className="skel mb-3 h-8 w-72 max-w-full" />
          <div className="skel h-4 w-[460px] max-w-full" />
          <div className="mt-6 flex gap-5">
            {[80, 96, 72].map((w, i) => <div key={i} className="skel h-3.5" style={{ width: w }} />)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-line bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="skel h-3.5 w-24" />
                <div className="skel h-8 w-8 rounded-lg" />
              </div>
              <div className="skel mt-2 h-7 w-14" />
              <div className="skel mt-3 h-3 w-20" />
            </div>
          ))}
        </div>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.55fr_1fr]">
          <div className="rounded-xl border border-line bg-white px-5 py-4">
            <div className="mb-4 flex gap-5 border-b border-divider pb-3">
              {[110, 84, 104].map((w, i) => <div key={i} className="skel h-3.5" style={{ width: w }} />)}
            </div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 border-t border-divider py-3 first:border-t-0">
                <div className="skel h-2 w-2 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="skel h-3.5" style={{ width: `${70 - i * 7}%` }} />
                  <div className="skel mt-2 h-3" style={{ width: `${45 - i * 4}%` }} />
                </div>
                <div className="skel hidden h-5 w-16 rounded-md sm:block" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-5">
            {[3, 4].map((n, c) => (
              <div key={c} className="rounded-xl border border-line bg-white px-5 py-4">
                <div className="skel mb-4 h-4 w-28" />
                {Array.from({ length: n }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <div className="skel h-8 w-8 flex-none rounded-md" />
                    <div className="min-w-0 flex-1">
                      <div className="skel h-3.5 w-3/5" />
                      <div className="skel mt-2 h-3 w-2/5" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
