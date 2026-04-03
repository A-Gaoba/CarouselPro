import type { BrandConfig, SlideContent } from "../../types";
import { useLanguage } from "../../i18n";
import { ClassicSlideLayouts } from "./ClassicSlideLayouts";

export interface GeneratedSlideLabels {
  keyPoints: string;
  before: string;
  after: string;
  getStarted: string;
}

/**
 * Main content only: layoutType-driven archetypes (ClassicSlideLayouts).
 * Header, footer, and outer canvas are unchanged in BaseSlideTemplate.
 */
export function GeneratedSlideContent({
  slide,
  brand,
  dir,
  labels,
}: {
  slide: SlideContent;
  brand: BrandConfig;
  dir: "ltr" | "rtl";
  labels: GeneratedSlideLabels;
}) {
  const { locale } = useLanguage();
  const rtl = dir === "rtl";
  const lang = locale === "ar" ? "ar" : "en";

  return (
    <div
      lang={lang}
      className="slide-main-slot flex min-h-0 w-full flex-1 flex-col justify-center overflow-hidden px-0"
    >
      <div className="@container/slide slide-classic-fit relative min-w-0">
        <ClassicSlideLayouts
          slide={slide}
          brand={brand}
          labels={labels}
          rtl={rtl}
        />
      </div>
    </div>
  );
}
