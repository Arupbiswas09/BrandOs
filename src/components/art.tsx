/*
 * Hand-drawn SVG illustrations. They take the shell's accent through CSS
 * variables, so inside a brand they pick up that brand's colour.
 */

const A = "var(--bos-accent, #0F2A5F)";
const H = "var(--bos-hl, #7DD3FC)";
const S = "var(--bos-soft, #E0F2FE)";

export type ArtKind = "folder" | "calendar" | "inbox" | "people" | "kit" | "search" | "bin" | "offer" | "rocket";

/** Small spot illustration for empty states (120×96). */
export function SpotArt({ kind, className }: { kind: ArtKind; className?: string }) {
  return (
    <svg viewBox="0 0 120 96" width="120" height="96" aria-hidden className={className} fill="none">
      <ellipse cx="60" cy="86" rx="40" ry="5" fill="#0F172A" opacity=".06" />
      <circle cx="60" cy="46" r="38" fill={S} />
      {SPOTS[kind]}
    </svg>
  );
}

const card = (x: number, y: number, w: number, h: number, r = 6) => <rect x={x} y={y} width={w} height={h} rx={r} fill="#fff" stroke="#CBD5E1" strokeWidth="1.5" />;

const SPOTS: Record<ArtKind, React.ReactNode> = {
  folder: (
    <g>
      <path d="M30 32a5 5 0 0 1 5-5h14l6 6h30a5 5 0 0 1 5 5v30a5 5 0 0 1-5 5H35a5 5 0 0 1-5-5z" fill={A} />
      <path d="M30 42a5 5 0 0 1 5-5h50a5 5 0 0 1 5 5v26a5 5 0 0 1-5 5H35a5 5 0 0 1-5-5z" fill={H} />
      <rect x="40" y="50" width="26" height="4" rx="2" fill="#fff" />
      <rect x="40" y="58" width="16" height="4" rx="2" fill="#fff" opacity=".7" />
    </g>
  ),
  calendar: (
    <g>
      {card(30, 24, 60, 52, 8)}
      <path d="M30 32a8 8 0 0 1 8-8h44a8 8 0 0 1 8 8v8H30z" fill={A} />
      <rect x="42" y="18" width="4" height="12" rx="2" fill="#334155" /><rect x="74" y="18" width="4" height="12" rx="2" fill="#334155" />
      {[0, 1, 2, 3].map((c) => [0, 1].map((r) => <rect key={`${c}${r}`} x={38 + c * 12} y={48 + r * 12} width="8" height="7" rx="2" fill={c === 2 && r === 0 ? A : "#E2E8F0"} />))}
      <circle cx="86" cy="70" r="10" fill={H} /><path d="M86 65v5l3 2" stroke={A} strokeWidth="2" strokeLinecap="round" />
    </g>
  ),
  inbox: (
    <g>
      <path d="M28 52l10-22h44l10 22v18a4 4 0 0 1-4 4H32a4 4 0 0 1-4-4z" fill="#fff" stroke="#CBD5E1" strokeWidth="1.5" />
      <path d="M28 52h20l4 7h16l4-7h20v18a4 4 0 0 1-4 4H32a4 4 0 0 1-4-4z" fill={H} />
      <path d="M50 38l7 7 13-13" stroke={A} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  people: (
    <g>
      <circle cx="46" cy="40" r="10" fill={H} /><path d="M28 72a18 18 0 0 1 36 0z" fill={H} />
      <circle cx="74" cy="36" r="11" fill={A} /><path d="M54 72a20 20 0 0 1 40 0z" fill={A} />
    </g>
  ),
  kit: (
    <g>
      {card(26, 22, 68, 54, 8)}
      <circle cx="42" cy="38" r="8" fill={A} /><circle cx="60" cy="38" r="8" fill={H} /><circle cx="78" cy="38" r="8" fill="#E2E8F0" />
      <text x="36" y="66" fontFamily="Inter, sans-serif" fontSize="16" fontWeight="700" fill="#0F172A">Aa</text>
      <rect x="62" y="56" width="22" height="4" rx="2" fill="#CBD5E1" /><rect x="62" y="64" width="14" height="4" rx="2" fill="#E2E8F0" />
    </g>
  ),
  search: (
    <g>
      {card(26, 26, 50, 46)}
      <rect x="34" y="36" width="30" height="4" rx="2" fill="#E2E8F0" /><rect x="34" y="46" width="22" height="4" rx="2" fill="#E2E8F0" /><rect x="34" y="56" width="26" height="4" rx="2" fill="#E2E8F0" />
      <circle cx="74" cy="52" r="14" fill="#fff" stroke={A} strokeWidth="4" />
      <path d="M84 62l10 10" stroke={A} strokeWidth="5" strokeLinecap="round" />
    </g>
  ),
  bin: (
    <g>
      <rect x="40" y="36" width="40" height="40" rx="5" fill={H} />
      <rect x="34" y="28" width="52" height="8" rx="3" fill={A} /><rect x="52" y="22" width="16" height="6" rx="2" fill={A} />
      <path d="M52 46v20M60 46v20M68 46v20" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  offer: (
    <g>
      {card(24, 30, 44, 40)}{card(40, 22, 44, 40)}
      <path d="M40 30a8 8 0 0 1 8-8h28a8 8 0 0 1 8 8v2H40z" fill={A} />
      <rect x="48" y="40" width="26" height="4" rx="2" fill="#CBD5E1" /><rect x="48" y="48" width="18" height="4" rx="2" fill="#E2E8F0" />
      <circle cx="86" cy="64" r="11" fill={H} /><path d="M81 64l4 4 7-8" stroke={A} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  rocket: (
    <g>
      <path d="M60 16c12 8 16 24 12 40H48c-4-16 0-32 12-40z" fill="#fff" stroke="#CBD5E1" strokeWidth="1.5" />
      <circle cx="60" cy="36" r="6" fill={H} stroke={A} strokeWidth="2" />
      <path d="M48 48l-8 12h10zM72 48l8 12H70z" fill={A} />
      <path d="M54 58h12l-6 16z" fill={H} />
    </g>
  ),
};

/** The large illustration on the sign-in and setup pages. */
export function HeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 400" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id="hero-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7DD3FC" /><stop offset="1" stopColor="#3B82F6" /></linearGradient>
        <filter id="hero-s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="#020617" floodOpacity=".35" /></filter>
      </defs>
      <g stroke="#FFFFFF" strokeOpacity=".07">{Array.from({ length: 9 }, (_, i) => <path key={i} d={`M0 ${i * 50}H480M${i * 60} 0V400`} />)}</g>
      <circle cx="380" cy="80" r="70" fill="url(#hero-g)" opacity=".25" />
      <circle cx="70" cy="330" r="50" fill="#7DD3FC" opacity=".12" />

      {/* brand kit card */}
      <g filter="url(#hero-s)">
        <rect x="60" y="70" width="230" height="170" rx="18" fill="#fff" />
        <rect x="80" y="90" width="44" height="44" rx="11" fill="#0F2A5F" />
        <text x="102" y="119" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="18" fontWeight="700" fill="#fff">B</text>
        <rect x="136" y="96" width="96" height="10" rx="5" fill="#0F172A" /><rect x="136" y="114" width="64" height="8" rx="4" fill="#CBD5E1" />
        {["#0F2A5F", "#1D4ED8", "#7DD3FC", "#E0F2FE"].map((c, i) => <g key={c}><rect x={80 + i * 50} y="152" width="40" height="40" rx="10" fill={c} stroke="#E2E8F0" /><rect x={80 + i * 50} y="200" width="34" height="6" rx="3" fill="#E2E8F0" /></g>)}
        <rect x="80" y="216" width="80" height="6" rx="3" fill="#F1F5F9" />
      </g>

      {/* approval card */}
      <g filter="url(#hero-s)">
        <rect x="230" y="200" width="200" height="120" rx="16" fill="#fff" />
        <rect x="250" y="220" width="36" height="36" rx="9" fill="#E0F2FE" />
        <text x="268" y="243" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="11" fontWeight="700" fill="#0F2A5F">LP</text>
        <rect x="298" y="224" width="100" height="9" rx="4.5" fill="#0F172A" /><rect x="298" y="241" width="70" height="7" rx="3.5" fill="#CBD5E1" />
        <rect x="250" y="274" width="84" height="28" rx="8" fill="#1F7A55" />
        <path d="M264 288l5 5 9-10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="282" y="285" width="40" height="6" rx="3" fill="#fff" opacity=".85" />
        <rect x="344" y="274" width="66" height="28" rx="8" fill="#fff" stroke="#E2E8F0" />
      </g>

      {/* calendar chip */}
      <g filter="url(#hero-s)">
        <rect x="320" y="110" width="120" height="58" rx="14" fill="#0B1B3A" />
        <circle cx="344" cy="139" r="11" fill="#7DD3FC" /><path d="M344 133v6l4 3" stroke="#0B1B3A" strokeWidth="2" strokeLinecap="round" />
        <rect x="364" y="130" width="60" height="7" rx="3.5" fill="#fff" /><rect x="364" y="144" width="40" height="6" rx="3" fill="#7DD3FC" opacity=".6" />
      </g>

      {/* avatars */}
      <g>
        {[["#7DD3FC", "PR"], ["#BFDBFE", "TA"], ["#E0F2FE", "IB"]].map(([c, t], i) => (
          <g key={t}><circle cx={90 + i * 26} cy="290" r="18" fill={c} stroke="#0F2A5F" strokeWidth="3" /><text x={90 + i * 26} y="295" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700" fill="#0B1B3A">{t}</text></g>
        ))}
      </g>
    </svg>
  );
}

/** Wide banner art for the dashboard welcome (decorative). */
export function WaveArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 120" className={className} aria-hidden fill="none">
      <circle cx="250" cy="60" r="56" fill={S} />
      <rect x="196" y="30" width="72" height="52" rx="10" fill="#fff" stroke="#CBD5E1" strokeWidth="1.5" />
      <rect x="206" y="42" width="14" height="14" rx="4" fill={A} /><rect x="226" y="44" width="32" height="5" rx="2.5" fill="#CBD5E1" /><rect x="226" y="52" width="20" height="4" rx="2" fill="#E2E8F0" />
      <rect x="206" y="64" width="52" height="8" rx="4" fill={H} />
      <rect x="244" y="54" width="60" height="44" rx="10" fill={A} />
      <path d="M258 76l7 7 13-14" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="190" cy="92" r="8" fill={H} /><circle cx="300" cy="28" r="5" fill={H} />
    </svg>
  );
}
