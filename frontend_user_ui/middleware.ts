import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * CSP Nonce Middleware
 *
 * Generates a cryptographic nonce per request and injects it into the
 * Content-Security-Policy response header.  The nonce is also forwarded
 * in the x-nonce request header so the root Server Component (layout.js)
 * can pass it to trusted <script nonce={nonce}> elements.
 *
 * Key security properties:
 *   • script-src uses 'nonce-{nonce}' — inline scripts only execute when
 *     they carry the matching nonce attribute.
 *   • 'unsafe-eval' is removed entirely — production Next.js bundles never
 *     need it; removing it blocks eval(), Function(), and setTimeout(string).
 *   • 'unsafe-inline' for scripts is intentionally absent from production.
 *     The nonce replaces it: Next.js hydration inline scripts set their nonce
 *     automatically when the header is present.
 *   • style-src keeps 'unsafe-inline' because Tailwind generates inline styles
 *     and there is no build-time hash extraction configured.
 */

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace('/api', '');

function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    // Development: allow hot-reload/eval tooling
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`
    // Production: nonce only — no unsafe-inline, no unsafe-eval
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    "default-src 'self'",
    `connect-src 'self' ${API_URL} wss: ws:`,
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
    "font-src 'self' https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob: https:",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';
  const csp = buildCsp(nonce, isDev);

  // Forward the nonce to the Server Component tree via a request header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set the CSP on the response (this is what the browser reads)
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

// Run middleware on all routes except static assets and API routes
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|images/|sw.js|manifest.json).*)',
  ],
};
