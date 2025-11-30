"use client";

import {
  Layers,
  Mic,
  Sparkles,
  Check,
  Image as ImageIcon,
  MessageSquare,
  Puzzle,
  Plug,
  Share2,
  Code2,
  Zap,
  Database,
  Cpu,
  Wrench
} from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const translations = {
  en: {
    badge: "Features",
    sectionTitle: "Engineered for Performance",
    sectionSubtitle: "A complete toolkit for the modern developer.",
    features: {
        multiModel: {
            title: "Multi-Model Freedom",
            desc: "Switch between OpenAI, Anthropic, and Local models instantly.",
        },
        multiModal: {
            title: "Multi-Modal Input",
            desc: "Voice, Images, Text. Code naturally.",
        },
        mcp: {
            title: "MCP Support",
            desc: "Extend capabilities with Model Context Protocol.",
        },
        marketplace: {
            title: "Agent Marketplace",
            desc: "Discover and share specialized AI agents.",
        },
        skills: {
            title: "Skills System",
            desc: "Modular skills to enhance agent capabilities.",
        },
        local: {
            title: "Privacy First",
            desc: "Run local LLMs. Your code stays on your machine.",
        },
        fast: {
             title: "Lightning Fast",
             desc: "Built with Rust and Tauri for native performance.",
        }
    }
  },
  zh: {
    badge: "产品特性",
    sectionTitle: "为性能而生",
    sectionSubtitle: "现代开发者的完整工具箱。",
    features: {
        multiModel: {
            title: "多模型自由",
            desc: "在 OpenAI、Anthropic 和本地模型之间即时切换。",
        },
        multiModal: {
            title: "多模态输入",
            desc: "语音、图像、文本。自然地编写代码。",
        },
        mcp: {
            title: "MCP 支持",
            desc: "通过模型上下文协议扩展功能。",
        },
        marketplace: {
            title: "Agent 市场",
            desc: "发现并分享专业的 AI 代理。",
        },
        skills: {
            title: "技能系统",
            desc: "模块化技能，增强 Agent 能力。",
        },
        local: {
            title: "隐私至上",
            desc: "运行本地 LLM。您的代码保留在您的机器上。",
        },
        fast: {
             title: "极速体验",
             desc: "基于 Rust 和 Tauri 构建，拥有原生性能。",
        }
    }
  },
};

// Bento Grid Item Component
function BentoItem({
  title,
  description,
  icon: Icon,
  className,
  children,
  delay = 0,
}: {
  title: string;
  description: string;
  icon?: any;
  className?: string;
  children?: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6 hover:border-zinc-700 transition-colors",
        className
      )}
    >
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center gap-3 mb-4">
           {Icon && <div className="p-2 rounded-lg bg-zinc-800/80 text-white"><Icon className="w-5 h-5" /></div>}
           <h3 className="text-xl font-bold text-zinc-100">{title}</h3>
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed mb-4">{description}</p>
        <div className="mt-auto">{children}</div>
      </div>
      
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </motion.div>
  );
}

export function FeaturesSection({ lang }: { lang: string }) {
  const t = translations[lang as keyof typeof translations] || translations.en;

  return (
    <section className="container py-24 relative">
        {/* Background Grid */}
        <div className="absolute inset-0 -z-10 h-full w-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      <div className="text-center space-y-4 mb-16">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white">
          {t.sectionTitle}
        </h2>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
          {t.sectionSubtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl mx-auto">
        
        {/* Large Item - Multi Model */}
        <BentoItem
          title={t.features.multiModel.title}
          description={t.features.multiModel.desc}
          icon={Layers}
          className="md:col-span-2 md:row-span-2 min-h-[400px]"
        >
            <div className="relative w-full h-full min-h-[200px] bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden flex items-center justify-center">
                {/* Abstract representation of models switching */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,120,120,0.1),rgba(0,0,0,0))]" />
                <div className="grid grid-cols-2 gap-4 p-8 w-full">
                     {['GPT-5', 'Claude 4.5', 'Gemini 3', 'GLM 4.6','MiniMax M2','Kimi K2'].map((model, i) => (
                         <div key={model} className="bg-zinc-900 border border-zinc-700/50 p-4 rounded-lg flex items-center justify-between">
                             <span className="text-zinc-300 font-mono text-sm">{model}</span>
                             <div className={`w-2 h-2 rounded-full ${i === 1 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-zinc-700'}`} />
                         </div>
                     ))}
                </div>
            </div>
        </BentoItem>

        {/* Tall Item - Marketplace */}
        <BentoItem
          title={t.features.marketplace.title}
          description={t.features.marketplace.desc}
          icon={Share2}
          className="md:row-span-2 bg-zinc-900/80"
          delay={0.1}
        >
             <div className="relative w-full h-full min-h-[200px] flex flex-col gap-3 pt-4">
                 {[1, 2, 3].map((_, i) => (
                     <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-950/50 border border-zinc-800/50">
                         <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center">
                             <Puzzle className="w-4 h-4 text-zinc-400" />
                         </div>
                         <div className="h-2 w-24 bg-zinc-800 rounded" />
                     </div>
                 ))}
             </div>
        </BentoItem>

        {/* Standard Item - Multi Modal */}
        <BentoItem
          title={t.features.multiModal.title}
          description={t.features.multiModal.desc}
          icon={Mic}
          delay={0.2}
        >
             <div className="flex gap-4 mt-4 opacity-50 grayscale">
                 <ImageIcon className="w-8 h-8" />
                 <Mic className="w-8 h-8" />
                 <Code2 className="w-8 h-8" />
             </div>
        </BentoItem>

        {/* Standard Item - MCP */}
        <BentoItem
          title={t.features.mcp.title}
          description={t.features.mcp.desc}
          icon={Plug}
          delay={0.3}
        />

        {/* NEW Item - Skills Marketplace */}
        <BentoItem
            title={t.features.skills.title}
            description={t.features.skills.desc}
            icon={Wrench}
            delay={0.35}
        />

         {/* Wide Item - Privacy & Speed */}
        <BentoItem
            title={t.features.fast.title}
            description={t.features.fast.desc}
            icon={Zap}
            className="md:col-span-3"
            delay={0.4}
        >
             <div className="h-2 w-full bg-zinc-800 rounded-full mt-4 overflow-hidden">
                 <div className="h-full w-2/3 bg-white rounded-full animate-pulse" />
             </div>
        </BentoItem>

      </div>
    </section>
  );
}
