import { forwardRef } from "react";
import type { BrandConfig, SlideContent } from "../../types";
import { useLanguage } from "../../i18n";
import { getSlideDir } from "../../lib/textDirection";
import { BaseSlideTemplate } from "./BaseSlideTemplate";
import { GeneratedSlideContent } from "./GeneratedSlideContent";

export interface GeneratedSlideProps {
  slide: SlideContent;
  brand: BrandConfig;
  index: number;
  total: number;
}

export const GeneratedSlide = forwardRef<HTMLDivElement, GeneratedSlideProps>(
  function GeneratedSlide({ slide, brand, index, total }, ref) {
    const { messages } = useLanguage();
    const contentDir = getSlideDir(slide);

    return (
      <BaseSlideTemplate
        ref={ref}
        brand={brand}
        index={index}
        total={total}
        dataLayoutType={slide.layoutType}
        slideExportId={slide.id}
        contentDir={contentDir}
      >
        <GeneratedSlideContent
          slide={slide}
          brand={brand}
          dir={contentDir}
          labels={messages.slides}
        />
      </BaseSlideTemplate>
    );
  }
);

GeneratedSlide.displayName = "GeneratedSlide";
