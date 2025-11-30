import type { ReactNode } from "react";
import "./[lang]/global.css";
import { Inter, Space_Grotesk } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      lang="en"
    >
      <body className="flex flex-col min-h-screen font-sans antialiased bg-fd-background text-fd-foreground">{children}</body>
    </html>
  );
}
