"use client";

import { Play } from "lucide-react";
import { useState, useRef } from "react";
import { motion, useInView } from "framer-motion";

const translations = {
  en: {
    title: "See TalkCody in Action",
    subtitle: "Watch how TalkCody helps you write better code faster",
    playVideo: "Play Demo Video",
    videoPlaceholder: "Demo video coming soon",
  },
  zh: {
    title: "观看 TalkCody 实战",
    subtitle: "了解 TalkCody 如何帮助您更快地编写更好的代码",
    playVideo: "播放演示视频",
    videoPlaceholder: "演示视频即将推出",
  },
};

export function DemoVideoSection({ lang }: { lang: string }) {
  const t = translations[lang as keyof typeof translations] || translations.en;
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);
  const isVideoInView = useInView(videoRef, { once: true, margin: "-100px" });

  return (
    <section className="container py-12 md:py-24">
      <div
        ref={videoRef}
        className="relative max-w-5xl mx-auto"
      >
        <motion.div
          className="relative"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isVideoInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
            {/* Flowing Border Effect Container */}
            <div className="relative p-[1px] rounded-2xl overflow-hidden bg-zinc-800">
                {/* The Animated Border */}
                <div className="absolute inset-0 bg-[conic-gradient(from_90deg_at_50%_50%,#00000000_50%,#ffffff_100%)] animate-[spin_4s_linear_infinite] opacity-20" />
                
                {/* Inner Content */}
                <div className="relative rounded-2xl bg-black overflow-hidden border border-zinc-800/50 shadow-2xl shadow-black">
                    
                    {/* Video Placeholder */}
                    <div className="aspect-video flex items-center justify-center bg-zinc-950 relative group cursor-pointer" onClick={() => setIsPlaying(!isPlaying)}>
                         {/* Subtle Grid Background */}
                         <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:40px_40px]" />
                         
                         {/* Play Button */}
                         <div className="relative z-10 w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform duration-300">
                             <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                                 <Play className="w-6 h-6 text-black ml-1" fill="currentColor" />
                             </div>
                         </div>

                         {/* Text */}
                         <p className="absolute bottom-8 text-zinc-500 font-mono text-sm tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                             {t.playVideo}
                         </p>
                    </div>
                </div>
            </div>
            
            {/* Reflection/Glow at the bottom */}
            <div className="absolute -bottom-4 left-[5%] right-[5%] h-12 bg-white/5 blur-3xl rounded-[100%] opacity-20" />
        </motion.div>
      </div>
    </section>
  );
}
