import type { BrandConfig } from "../../types";
import { BaseSlideTemplate } from "./BaseSlideTemplate";

/** Live brand styling preview — placeholder main area only. */
export function BrandPreviewSlide({
  brand,
  previewIndex = 2,
  previewTotal = 8,
  dir = "ltr",
  previewPlaceholder = "Content will be inserted here",
}: {
  brand: BrandConfig;
  /** Which dot appears active in the preview */
  previewIndex?: number;
  /** How many dots to show in the preview strip */
  previewTotal?: number;
  /** Match UI language direction */
  dir?: "ltr" | "rtl";
  previewPlaceholder?: string;
}) {
  return (
    <BaseSlideTemplate
      brand={brand}
      index={previewIndex}
      total={previewTotal}
      dataLayoutType="preview"
      dir={dir}
    >
      <div
        className={`slide-main-slot flex min-h-[min(36vh,240px)] w-full flex-1 flex-col px-4 ${dir === "rtl" ? "items-end justify-center" : "items-center justify-center"}`}
      >
        <p
          className={`max-w-[16rem] text-[13px] font-medium leading-relaxed text-gray-400/50 ${dir === "rtl" ? "w-full text-end slide-ar-body" : "text-center"}`}
        >
          {previewPlaceholder}
        </p>
      </div>
    </BaseSlideTemplate>
  );
}
