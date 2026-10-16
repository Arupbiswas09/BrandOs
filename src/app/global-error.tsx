"use client";

// Replaces the root layout, so the app's stylesheet may be missing: everything here is inline,
// matching the design system by hand (surface card, 12px card radius, a 40px primary button with an 8px radius).
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: "#F7F9F8", color: "#101614", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 440, width: "100%", background: "#FCFDFC", border: "1px solid #E1E7E4", borderRadius: 12, padding: "40px 28px", boxShadow: "0 1px 2px rgba(16,22,20,.05)" }}>
          <div aria-hidden style={{ width: 48, height: 48, margin: "0 auto 16px", borderRadius: 12, background: "#2D4A5C", color: "#FFFFFF", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 20 }}>B</div>
          <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 8px" }}>BrandOS could not start</h1>
          <p style={{ color: "#3E4A45", fontSize: 15, lineHeight: 1.55, margin: "0 0 24px" }}>Try again in a moment. Nothing you saved is lost.</p>
          <button type="button" onClick={() => retry()} style={{ background: "#2D4A5C", color: "#FFFFFF", border: "1px solid transparent", borderRadius: 8, height: 40, padding: "0 16px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
