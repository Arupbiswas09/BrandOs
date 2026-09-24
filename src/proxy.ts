import { NextResponse, type NextRequest } from "next/server";

/*
 * A strict Content-Security-Policy with a fresh nonce on every page load.
 *
 * Next.js reads the nonce from the request's CSP header and puts it on its
 * own scripts, so only scripts we ship can run ('strict-dynamic' lets them
 * load the chunks they need). Nothing else from the page can run script,
 * which blunts cross-site scripting.
 *
 * Styles allow 'unsafe-inline' because the UI sets brand colours through
 * style attributes, which a nonce cannot cover. Google Fonts is allowed for
 * the Brand Kit's font previews. Everything else stays on this origin.
 *
 * The other security headers live in next.config.ts; /sw.js has its own CSP.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    // React needs eval in development only, for its error overlays and stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    // Hot reload talks over a websocket in development.
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Google sign-in posts to accounts.google.com.
    "form-action 'self' https://accounts.google.com",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not API routes, build output, the service worker or static files.
      source: "/((?!api/|_next/static|_next/image|sw\\.js|icons/|favicon\\.ico|robots\\.txt|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|txt|xml|js|css|woff2?)$).*)",
      // Prefetches do not render a document, so they do not need a nonce.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
