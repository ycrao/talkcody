import type { ReactNode } from "react";
import Script from "next/script";
import "./[lang]/global.css";
import { Inter, Space_Grotesk } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true, // Primary body font - preload for faster FCP
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
  preload: false, // Heading font only - defer to not block LCP
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      lang="en"
    >
      <head>
        {/* Preconnect to critical third-party origins */}
        <link rel="preconnect" href="https://cdn.talkcody.com" />
        <link rel="dns-prefetch" href="https://cdn.talkcody.com" />
        {/* Preconnect to analytics (if used) */}
        <link rel="preconnect" href="https://cloud.umami.is" />
        <link rel="dns-prefetch" href="https://cloud.umami.is" />
      </head>
      <body className="flex flex-col min-h-screen font-sans antialiased bg-fd-background text-fd-foreground">
        {children}
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <Script
            defer
            src="https://cloud.umami.is/script.js"
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
