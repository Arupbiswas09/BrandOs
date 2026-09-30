"use client";

// Replaces the root layout, so the app's stylesheet may be missing: everything here is inline.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Inter, system-ui, -apple-system, sans-serif", background: "#F7F9F8", color: "#101614", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 440, width: "100%", background: "#fff", border: "1px solid #E1E7E4", borderRadius: 16, padding: "40px 28px", boxShadow: "0 1px 2px rgba(16, 22, 20,.04)" }}>
          <div aria-hidden style={{ width: 56, height: 56, margin: "0 auto 16px", borderRadius: 14, background: "#2D4A5C", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 24 }}>B</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 8px" }}>BrandOS could not start</h1>
          <p style={{ color: "#46534D", fontSize: 15, lineHeight: 1.55, margin: "0 0 24px" }}>Try again in a moment. Nothing you saved is lost.</p>
          <button type="button" onClick={() => retry()} style={{ background: "#2D4A5C", color: "#fff", border: 0, borderRadius: 9, padding: "10px 20px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
