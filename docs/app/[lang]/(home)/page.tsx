import dynamic from "next/dynamic";
import { HeroSection } from "./_components/hero-section";
import { Footer } from "./_components/footer";

// Lazy load below-the-fold components to improve LCP
const DemoVideoSection = dynamic(
  () => import("./_components/demo-video-section").then((mod) => ({ default: mod.DemoVideoSection })),
  { ssr: true }
);

const WhyChooseSection = dynamic(
  () => import("./_components/why-choose-section").then((mod) => ({ default: mod.WhyChooseSection })),
  { ssr: true }
);

const FeaturesSection = dynamic(
  () => import("./_components/features-section").then((mod) => ({ default: mod.FeaturesSection })),
  { ssr: true }
);

const DownloadCtaSection = dynamic(
  () => import("./_components/download-cta-section").then((mod) => ({ default: mod.DownloadCtaSection })),
  { ssr: true }
);

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <div className="flex flex-col min-h-screen">
      {/* Critical above-the-fold content */}
      <HeroSection lang={lang} />

      {/* Below-the-fold content - lazy loaded */}
      <DemoVideoSection lang={lang} />
      <WhyChooseSection lang={lang} />
      <FeaturesSection lang={lang} />
      <DownloadCtaSection lang={lang} />
      <Footer lang={lang} />
    </div>
  );
}
