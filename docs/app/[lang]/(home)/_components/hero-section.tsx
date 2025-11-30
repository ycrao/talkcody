"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { detectPlatform, getDownloadInfo } from "@/lib/download-utils";
import type { Platform } from "@/lib/download-utils";
import { Button } from "@/components/ui/button";
import { ArrowRight, Terminal } from "lucide-react";
import { NeuralBackground } from "./neural-background";

const translations = {
  en: {
    title: "TalkCody",
    tagline: "Free and Open Source AI Coding Agent",
    description:
      "Generate correct code as quickly and cost-effectively as possible. The next generation of AI-powered development.",
    download: "Download",
    downloadFor: "Download for",
    documentation: "Documentation",
  },
  zh: {
    title: "TalkCody",
    tagline: "免费开源的 AI 编码助手",
    description:
      "用最低的成本，最快的速度生成正确代码。下一代 AI 驱动的开发工具。",
    download: "下载",
    downloadFor: "下载",
    documentation: "查看文档",
  },
};

export function HeroSection({ lang }: { lang: string }) {
  const t = translations[lang as keyof typeof translations] || translations.en;
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedPlatform = localStorage.getItem('talkcody-platform') as Platform | null;
    if (savedPlatform && savedPlatform !== 'unknown') {
      setPlatform(savedPlatform);
    } else {
      setPlatform(detectPlatform());
    }
  }, []);

  const downloadInfo = getDownloadInfo(platform);
  const downloadButtonText = mounted
    ? downloadInfo.available && platform !== "unknown"
      ? `${t.downloadFor} ${downloadInfo.displayName}`
      : t.download
    : t.download;

  const downloadHref = mounted
    ? downloadInfo.available
      ? downloadInfo.downloadUrl
      : `/${lang}/docs/introduction/client-downloads`
    : `/${lang}/docs/introduction/client-downloads`;

  return (
    <section className="relative flex flex-col justify-center min-h-[90vh] overflow-hidden bg-black pt-20 pb-32">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <NeuralBackground />
        {/* Monochrome Gradient Orbs */}
        <div className="absolute top-[-20%] left-[20%] w-[60%] h-[60%] bg-white/5 blur-[150px] rounded-full pointer-events-none" />
      </div>

      <div className="container relative z-10 max-w-6xl mx-auto px-4">
        <div className="flex flex-col items-center text-center space-y-12">
          
          {/* Badge - Metallic Style */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-900/80 backdrop-blur-md border border-zinc-800 text-sm font-medium text-zinc-300 shadow-lg shadow-zinc-900/50"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            Code is cheap,show me your talk.
          </motion.div>

          {/* Main Title */}
          <div className="space-y-6 max-w-5xl">
            <motion.h1
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="text-6xl sm:text-7xl md:text-8xl lg:text-[7rem] font-bold tracking-tighter leading-[0.9]"
            >
              <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-zinc-200 to-zinc-500">
                {t.title}
              </span>
            </motion.h1>
            <motion.h2
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ duration: 0.7, delay: 0.2 }}
               className="text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight text-zinc-400"
            >
               {t.tagline}
            </motion.h2>
          </div>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="text-lg sm:text-xl text-zinc-500 max-w-2xl leading-relaxed font-light"
          >
            {t.description}
          </motion.p>

          {/* Buttons - Monochrome / Metallic */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="flex flex-col sm:flex-row gap-5 w-full sm:w-auto"
          >
            <Button
              asChild
              size="lg"
              className="h-14 px-8 text-base rounded-full bg-white text-black hover:bg-zinc-200 hover:scale-105 transition-all duration-300 font-semibold shadow-[0_0_20px_rgba(255,255,255,0.15)]"
            >
              <Link href={downloadHref}>
                <div className="flex items-center gap-2">
                    {downloadButtonText}
                    <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-14 px-8 text-base rounded-full bg-black text-white border border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 transition-all duration-300 font-medium"
            >
              <Link href={`/${lang}/docs`}>
                <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-zinc-400" />
                    {t.documentation}
                </div>
              </Link>
            </Button>
          </motion.div>

          {/* Tech Stack - Clean Monochrome */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
            className="pt-12 flex flex-col items-center gap-4"
          >
             <span className="text-xs uppercase tracking-[0.2em] text-zinc-600">Powered By</span>
             <div className="flex items-center gap-8 text-zinc-500 grayscale opacity-60 hover:opacity-100 transition-opacity duration-500">
                 {/* Using text since we don't have icons handy, cleaner look */}
                <span className="font-mono font-bold text-sm">TAURI</span>
                <span className="w-1 h-1 rounded-full bg-zinc-800" />
                <span className="font-mono font-bold text-sm">RUST</span>
                <span className="w-1 h-1 rounded-full bg-zinc-800" />
                <span className="font-mono font-bold text-sm">VERCEL AI</span>
             </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
