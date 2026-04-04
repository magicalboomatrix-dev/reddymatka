import { headers } from 'next/headers';
import Footer from "./components/Footer";
import AuthGate from "./components/AuthGate";
import { AuthProvider } from "./lib/AuthContext";
import "./globals.css";

import { Exo_2, Mona_Sans } from "next/font/google";

const exo2 = Exo_2({
  subsets: ["latin"],
  variable: "--font-exo-2",
  display: "swap",
});

const monaSans = Mona_Sans({
  subsets: ["latin"],
  variable: "--font-mona-sans",
  display: "swap",
});

export const metadata = {
  title: "REDDYMATKA",
  description: "REDDYMATKA user application",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#111111",
};

export default async function RootLayout({ children }) {
  // Read the per-request nonce injected by middleware.ts.
  // Next.js uses this nonce automatically for its own hydration script tags,
  // satisfying the nonce-based script-src CSP in production.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <link rel="apple-touch-icon" href="/icons/REDDYMATKA_icon_192.png" />
      </head>

      <body
        className={`${exo2.variable} ${monaSans.variable} flex min-h-screen justify-center bg-[#eef1f5] text-[#171717] antialiased`}
        {...(nonce ? { 'data-nonce': nonce } : {})}
      >
        <AuthProvider>
          <div className="relative flex w-full max-w-[430px] flex-col overflow-x-hidden bg-white">
            <AuthGate>
              {children}
              <Footer />
            </AuthGate>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}