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
  description: "REDDYMATKA  user application",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#111111",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <link rel="apple-touch-icon" href="/icons/REDDYMATKA_icon_192.png" />
      </head>

      <body
        className={`${exo2.variable} ${monaSans.variable} flex min-h-screen justify-center bg-[#eef1f5] text-[#171717] antialiased`}
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