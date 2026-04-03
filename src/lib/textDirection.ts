import type { SlideContent } from "../types";

/** Arabic and Arabic Presentation Forms + common punctuation used with Arabic script */
const ARABIC_SCRIPT =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function textContainsArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}

function collectSlideText(slide: SlideContent): string {
  const parts = [
    slide.title,
    slide.subtitle ?? "",
    slide.stats ?? "",
    slide.ctaText ?? "",
    ...(slide.body ?? []),
  ];
  return parts.join("\n");
}

/**
 * Slide reading direction from content: Arabic script → RTL, otherwise LTR.
 * Export and preview use the same `dir` on the slide root.
 */
export function getSlideDir(slide: SlideContent): "ltr" | "rtl" {
  return textContainsArabicScript(collectSlideText(slide)) ? "rtl" : "ltr";
}
