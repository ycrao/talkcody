import { DemoVideoSection } from "./_components/demo-video-section";
import { DownloadCtaSection } from "./_components/download-cta-section";
import { FeaturesSection } from "./_components/features-section";
import { Footer } from "./_components/footer";
import { HeroSection } from "./_components/hero-section";
import { WhyChooseSection } from "./_components/why-choose-section";

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <div className="flex flex-col min-h-screen">
      <HeroSection lang={lang} />
      <DemoVideoSection lang={lang} />
      <WhyChooseSection lang={lang} />
      <FeaturesSection lang={lang} />
      <DownloadCtaSection lang={lang} />
      <Footer lang={lang} />
    </div>
  );
}
