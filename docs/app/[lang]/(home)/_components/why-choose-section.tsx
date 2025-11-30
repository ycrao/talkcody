"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Code, DollarSign, Layers, Shield } from "lucide-react";

const translations = {
  en: {
    badge: "Benefits",
    title: "Why Choose TalkCody",
    subtitle: "The AI coding agent that respects your freedom and privacy",
    benefits: [
      {
        icon: Code,
        title: "Full Open Source",
        description:
          "100% open source codebase. Audit the code, contribute improvements, or fork for your needs. Complete transparency.",
      },
      {
        icon: DollarSign,
        title: "No Inference Markup",
        description:
          "BYOK - Bring Your Own Keys. Pay providers directly at your negotiated rates. Predictable costs, zero lock-in.",
      },
      {
        icon: Layers,
        title: "Model Freedom",
        description:
          "Choose any provider and any model. OpenAI, Anthropic, Google, Ollama, or your own. Switch freely anytime.",
      },
      {
        icon: Shield,
        title: "Privacy First",
        description:
          "All your data is stored locally. Your code, conversations, and settings never leave your machine.",
      },
    ],
  },
  zh: {
    badge: "核心功能",
    title: "为什么选择 TalkCody",
    subtitle: "尊重您的自由和隐私的 AI 编码助手",
    benefits: [
      {
        icon: Code,
        title: "完全开源",
        description:
          "100% 开源代码。审计代码、贡献改进或根据需要分叉。完全透明。",
      },
      {
        icon: DollarSign,
        title: "无推理加价",
        description:
          "BYOK - 自带密钥。直接以您的协商费率向提供商付款。可预测的成本，零锁定。",
      },
      {
        icon: Layers,
        title: "模型自由",
        description:
          "选择任何提供商和任何模型。OpenAI、Anthropic、Google、Ollama 或您自己的。随时自由切换。",
      },
      {
        icon: Shield,
        title: "隐私优先",
        description:
          "所有数据本地存储。您的代码、对话和设置永远不会离开您的设备。",
      },
    ],
  },
};

export function WhyChooseSection({ lang }: { lang: string }) {
  const t = translations[lang as keyof typeof translations] || translations.en;
  const titleRef = useRef(null);
  const cardsRef = useRef(null);
  const isTitleInView = useInView(titleRef, { once: true, margin: "-100px" });
  const areCardsInView = useInView(cardsRef, { once: true, margin: "-100px" });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut",
      },
    },
  };

  return (
    <section className="relative py-16 md:py-24 overflow-hidden bg-black">
      <div className="container relative">
        <div ref={titleRef} className="text-center space-y-6 mb-16">
          {/* Badge - Metallic Style */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={isTitleInView ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/80 backdrop-blur-md border border-zinc-800 text-xs font-medium text-zinc-400 uppercase tracking-wider"
          >
            {t.badge}
          </motion.div>

          <motion.h2
            className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-white"
            initial={{ opacity: 0, y: 30 }}
            animate={isTitleInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.7 }}
          >
            {t.title}
          </motion.h2>
          <motion.p
            className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={isTitleInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            {t.subtitle}
          </motion.p>
        </div>

        <motion.div
          ref={cardsRef}
          className="grid gap-6 md:gap-8 grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          animate={areCardsInView ? "visible" : "hidden"}
        >
          {t.benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <motion.div
                key={benefit.title}
                variants={cardVariants}
                whileHover={{
                  y: -5,
                  transition: { duration: 0.3 },
                }}
                className="group relative rounded-3xl border border-zinc-800 bg-zinc-900/30 p-8 transition-all hover:bg-zinc-900/50 hover:border-zinc-700"
              >
                {/* Metallic Shine Effect */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <div className="relative z-10 flex flex-col gap-6">
                  {/* Icon area */}
                  <div className="inline-flex self-start p-3 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 text-white group-hover:scale-110 transition-transform duration-300 group-hover:border-zinc-600 group-hover:bg-zinc-800">
                    <Icon className="h-6 w-6" />
                  </div>

                  {/* Content area */}
                  <div className="space-y-3">
                    <h3 className="text-xl font-bold text-white tracking-tight">
                      {benefit.title}
                    </h3>
                    <p className="text-zinc-400 leading-relaxed">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
