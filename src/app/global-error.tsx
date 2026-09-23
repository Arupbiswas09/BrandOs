"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F7F9F8", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontWeight: 500 }}>BrandOS could not start</h1>
          <p style={{ color: "#4F5D57" }}>Try again in a moment. Nothing you saved is lost.</p>
          <button onClick={reset} style={{ background: "#2D4A5C", color: "#fff", border: 0, borderRadius: 9, padding: "10px 20px", fontSize: 14, cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
