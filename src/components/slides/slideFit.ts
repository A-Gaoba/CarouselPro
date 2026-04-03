import type { LayoutType, SlideContent } from "../../types";

export type VerticalDensity = "airy" | "normal" | "tight" | "compact";

/** Raw character count (analytics / legacy); not used for layout density. */
export function totalTextLength(slide: SlideContent): number {
  const body = (slide.body ?? []).join("");
  return (
    (slide.title?.length ?? 0) +
    (slide.subtitle?.length ?? 0) +
    body.length +
    (slide.stats?.length ?? 0) +
    (slide.ctaText?.length ?? 0)
  );
}

/** Estimated wrapped lines for a block at a given column width (content-area relative). */
function lineBlocks(text: string, charsPerLine: number): number {
  const t = text.trim();
  if (!t.length) return 0;
  return Math.max(1, Math.ceil(t.length / charsPerLine));
}

/**
 * Layout-weighted vertical load: structure + column width + block count — not raw char sum.
 * Higher ⇒ tighter spacing / smaller type tiers in `verticalDensity`.
 */
export function layoutFitLoad(slide: SlideContent): number {
  const t = slide.title ?? "";
  const sub = slide.subtitle ?? "";
  const labelA = slide.contrastLabelA ?? "";
  const labelB = slide.contrastLabelB ?? "";
  const body = slide.body ?? [];
  const stats = slide.stats ?? "";
  const cta = slide.ctaText ?? "";

  switch (slide.layoutType) {
    case "hero-typography": {
      const titleW = lineBlocks(t, 11) * 95;
      const subW = lineBlocks(sub, 30) * 42;
      const body0 = body[0]?.trim()
        ? lineBlocks(body[0], 36) * 28
        : 0;
      return 40 + titleW + subW + body0;
    }

    case "big-statement": {
      const statW = stats.trim() ? lineBlocks(stats, 7) * 88 : 0;
      const titleW = lineBlocks(t, 13) * 85;
      const subW = lineBlocks(sub, 26) * 38;
      const body0 = body[0]?.trim()
        ? lineBlocks(body[0], 28) * 32
        : 0;
      return 35 + statW + titleW + subW + body0;
    }

    case "split-content": {
      let u = lineBlocks(t, 22) * 52 + lineBlocks(sub, 30) * 28;
      for (const line of body) {
        u += lineBlocks(String(line), 22) * 34;
      }
      return 45 + u;
    }

    case "feature-list": {
      const narrow = body.length > 3;
      const cpl = narrow ? 18 : 24;
      // Content-first density: title should not dominate the density classification.
      let u = lineBlocks(t, 24) * 36;
      for (const line of body) {
        u += lineBlocks(String(line), cpl) * 36;
      }
      return 50 + u;
    }

    case "comparison": {
      const a = body[0] ?? "";
      const b = body[1] ?? "";
      return (
        30 +
        // Content-first density: compare body should drive compacting more than title.
        lineBlocks(t, 26) * 30 +
        lineBlocks(a, 14) * 58 +
        lineBlocks(b, 14) * 58
      );
    }

    case "contrast-card": {
      const a = body[0] ?? "";
      const b = body[1] ?? "";
      // Larger stacked cards: subtitle and both sides contribute more to vertical load.
      return (
        25 +
        lineBlocks(t, 24) * 26 +
        lineBlocks(sub, 30) * 18 +
        lineBlocks(labelA, 18) * 18 +
        lineBlocks(a, 20) * 60 +
        lineBlocks(labelB, 18) * 18 +
        lineBlocks(b, 20) * 60
      );
    }

    case "cta-final": {
      return (
        // Content-first density: CTA button label should not be squeezed by title footprint.
        55 +
        lineBlocks(t, 15) * 40 +
        lineBlocks(sub, 22) * 34 +
        lineBlocks(cta, 14) * 42
      );
    }
  }
}

/** Per-layout thresholds (narrow columns / more blocks compact sooner). */
function densityThresholds(layout: LayoutType): {
  airy: number;
  normal: number;
  tight: number;
} {
  switch (layout) {
    case "comparison":
      return { airy: 140, normal: 220, tight: 300 };
    case "contrast-card":
      return { airy: 150, normal: 240, tight: 320 };
    case "cta-final":
      return { airy: 160, normal: 240, tight: 320 };
    case "hero-typography":
      return { airy: 200, normal: 300, tight: 420 };
    case "big-statement":
      return { airy: 180, normal: 280, tight: 400 };
    case "feature-list":
      return { airy: 170, normal: 260, tight: 380 };
    case "split-content":
      return { airy: 190, normal: 280, tight: 400 };
  }
}

/** Main driver: `layoutType` + structural load, not `totalTextLength` alone. */
export function verticalDensity(slide: SlideContent): VerticalDensity {
  const load = layoutFitLoad(slide);
  const th = densityThresholds(slide.layoutType);
  if (load > th.tight) return "compact";
  if (load > th.normal) return "tight";
  if (load > th.airy) return "normal";
  return "airy";
}

const DENSITY_STACK: Record<
  VerticalDensity,
  { hero: string; section: string; cta: string }
> = {
  airy: { hero: "space-y-8", section: "space-y-10", cta: "gap-12" },
  normal: { hero: "space-y-6", section: "space-y-8", cta: "gap-10" },
  tight: { hero: "space-y-5", section: "space-y-6", cta: "gap-8" },
  compact: { hero: "space-y-4", section: "space-y-5", cta: "gap-6" },
};

const DENSITY_GAP: Record<VerticalDensity, string> = {
  airy: "gap-10",
  normal: "gap-8",
  tight: "gap-6",
  compact: "gap-4",
};

export function stackClasses(
  layout: "hero" | "section" | "cta",
  density: VerticalDensity
): string {
  const row = DENSITY_STACK[density];
  if (layout === "hero") return row.hero;
  if (layout === "section") return row.section;
  return row.cta;
}

export function sectionGapClass(density: VerticalDensity): string {
  return DENSITY_GAP[density];
}

function estimatedWrapLines(text: string, charsPerLine: number): number {
  if (!text.length) return 1;
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

/**
 * Extra scale-down when implied line count is high (4:5 portrait; avoids vertical spill).
 */
export function wrapLoadFactor(text: string, charsPerLine: number): number {
  const lines = estimatedWrapLines(text, charsPerLine);
  if (lines <= 2) return 1;
  if (lines <= 3) return 0.9;
  if (lines <= 4) return 0.82;
  if (lines <= 5) return 0.74;
  if (lines <= 6) return 0.66;
  if (lines <= 8) return 0.58;
  if (lines <= 10) return 0.52;
  return 0.46;
}

/** Core pixel value from character-length tiers (before wrap load). */
export function scaledPixelValue(text: string, base: number, min: number): number {
  const len = (text ?? "").length;
  let factor = 1;
  if (len > 14) factor *= 0.94;
  if (len > 22) factor *= 0.92;
  if (len > 32) factor *= 0.9;
  if (len > 44) factor *= 0.88;
  if (len > 56) factor *= 0.85;
  if (len > 72) factor *= 0.82;
  if (len > 90) factor *= 0.8;
  if (len > 110) factor *= 0.78;
  if (len > 130) factor *= 0.76;
  if (len > 160) factor *= 0.74;
  if (len > 200) factor *= 0.72;
  if (len > 260) factor *= 0.7;
  if (len > 320) factor *= 0.68;
  return Math.max(min, Math.round(base * factor));
}

export function getScaledPixelSize(text: string, base: number, min: number): string {
  return `${scaledPixelValue(text, base, min)}px`;
}

const LAYOUT_CHARS: Record<"hero" | "big" | "split" | "feature" | "compare" | "cta", number> = {
  hero: 11,
  big: 13,
  split: 20,
  feature: 22,
  compare: 26,
  cta: 15,
};

/** Per-layout hard caps for title pixel size (content-first: non-hero titles are smaller). */
const LAYOUT_TITLE_MAX: Record<keyof typeof LAYOUT_CHARS, number> = {
  hero: 64,
  big: 60,
  split: 46,
  feature: 40,
  compare: 34,
  cta: 34,
};

/**
 * Title size: character tiers × wrap load for that layout’s effective title width.
 */
export function scaledLayoutTitle(
  text: string,
  base: number,
  min: number,
  layout: keyof typeof LAYOUT_CHARS
): string {
  const lines = estimatedWrapLines(text, LAYOUT_CHARS[layout]);

  // Base scaling from character length.
  let v = scaledPixelValue(text, base, min);

  // Line-aware tiers: shrink more aggressively as lines increase.
  if (lines === 2) {
    v *= 0.9;
  } else if (lines === 3) {
    v *= 0.8;
  } else if (lines >= 4) {
    v *= 0.7;
  }

  // Apply wrap load factor (accounts for tighter effective column widths).
  v = v * wrapLoadFactor(text, LAYOUT_CHARS[layout]);

  // Clamp between per-layout max and min.
  v = Math.min(LAYOUT_TITLE_MAX[layout], v);
  v = Math.max(min, Math.round(v));

  // Approximate visual dominance guard for non-hero layouts:
  // avoid titles consuming more than ~40% of a 1350px export height.
  if (layout !== "hero" && layout !== "big") {
    const approxHeight = lines * v * 1.1; // 1.1 ≈ line-height multiplier
    const maxBlock = 540; // 40% of 1350px
    if (approxHeight > maxBlock && approxHeight > 0) {
      const factor = maxBlock / approxHeight;
      v = Math.max(min, Math.floor(v * factor));
    }
  }

  return `${v}px`;
}

/** Subtitle tiers — hero/big cap long copy harder than body. */
export function subtitleClass(
  text: string | undefined,
  size: "hero" | "big" | "body"
): string {
  const len = (text ?? "").length;
  if (size === "hero") {
    if (len > 220) return "text-sm leading-snug";
    if (len > 140) return "text-base leading-snug";
    if (len > 100) return "text-base leading-snug";
    if (len > 55) return "text-lg leading-snug";
    return "text-2xl leading-relaxed";
  }
  if (size === "big") {
    if (len > 180) return "text-sm leading-snug";
    if (len > 90) return "text-base leading-snug";
    if (len > 45) return "text-lg leading-snug";
    return "text-xl leading-relaxed";
  }
  return len > 120 ? "text-sm leading-snug" : len > 80 ? "text-base leading-snug" : "text-xl";
}

export function statFontClass(stats: string): string {
  const len = stats.length;
  if (len > 20) return "slide-classic-stat-num slide-classic-stat-num--xs";
  if (len > 12) return "slide-classic-stat-num slide-classic-stat-num--sm";
  if (len > 6) return "slide-classic-stat-num slide-classic-stat-num--md";
  return "slide-classic-stat-num";
}

export type BodyLineLayout = "split" | "feature";

/** Safer than Tailwind `break-words` (overflow-wrap:anywhere): prefer word boundaries, break only unbreakable overflow. */
const BODY_WRAP_SAFE =
  "min-w-0 max-w-full break-normal [overflow-wrap:break-word] [word-break:normal] hyphens-manual";

export function bodyLineClass(
  text: string,
  compact: boolean,
  density: VerticalDensity,
  bodyLayout: BodyLineLayout
): string {
  const long = text.length > 90;
  const veryLong = text.length > 200;
  // For feature-list we want single-column cards to use the wider typography tier.
  // Narrow typography should depend on actual column mode (`compact`), not on layout identity alone.
  const narrowCol = compact;
  // Keep feature-list typography unchanged; only slightly increase non-feature (split-content) body tier.
  const base =
    bodyLayout === "feature"
      ? narrowCol
        ? "text-sm"
        : "text-lg"
      : narrowCol
        ? "text-sm"
        : "text-xl";
  if (veryLong || (density === "compact" && text.length > 100)) {
    return `${BODY_WRAP_SAFE} font-bold leading-snug text-brand-primary text-xs`;
  }
  if (long || density === "compact" || (bodyLayout === "split" && text.length > 70)) {
    return `${BODY_WRAP_SAFE} font-bold leading-snug text-brand-primary text-sm`;
  }
  return `${BODY_WRAP_SAFE} font-bold leading-snug text-brand-primary ${base}`;
}

export function ctaTitlePixelSize(title: string): string {
  return scaledLayoutTitle(title, 48, 14, "cta");
}

/** Narrow columns (~half slide): use line pressure at 14ch for class tiers. */
export function comparisonBodyClass(
  text: string,
  side: "before" | "after"
): string {
  const lines = estimatedWrapLines(text, 14);
  const len = text.length;
  const tone =
    side === "before"
      ? "italic text-brand-primary/40"
      : "font-black text-brand-primary";
  if (lines > 12 || len > 240) {
    return `min-w-0 max-w-full break-normal [overflow-wrap:break-word] [word-break:normal] hyphens-manual text-[11px] font-bold leading-tight ${tone}`;
  }
  if (lines > 8 || len > 180) {
    return `min-w-0 max-w-full break-normal [overflow-wrap:break-word] [word-break:normal] hyphens-manual text-xs font-bold leading-snug ${tone}`;
  }
  if (len > 140) {
    return `min-w-0 max-w-full break-normal [overflow-wrap:break-word] [word-break:normal] hyphens-manual text-xs font-bold leading-snug ${tone}`;
  }
  if (len > 100) {
    return `min-w-0 max-w-full break-normal [overflow-wrap:break-word] [word-break:normal] hyphens-manual text-sm font-bold leading-snug ${tone}`;
  }
  if (len > 55) {
    return `min-w-0 max-w-full break-normal [overflow-wrap:break-word] [word-break:normal] hyphens-manual text-base font-bold leading-snug ${tone}`;
  }
  return `min-w-0 max-w-full break-normal [overflow-wrap:break-word] [word-break:normal] hyphens-manual text-xl leading-snug ${tone}`;
}

export function ctaButtonPaddingClass(
  label: string,
  density: VerticalDensity
): string {
  const len = label.length;
  if (density === "compact") {
    if (len > 85) return "gap-2 px-3 py-2 text-xs sm:px-4 sm:text-sm";
    if (len > 50) return "gap-2 px-4 py-2.5 text-sm";
  }
  if (len > 95) return "gap-2 px-4 py-2.5 text-xs sm:px-5 sm:text-sm";
  if (len > 70) return "gap-2 px-5 py-3 text-sm sm:text-base";
  if (len > 42) return "gap-3 px-6 py-3.5 text-sm sm:text-base";
  // Default CTA: reduce vertical footprint so titles don't push the button into cramped space.
  return "gap-3 !px-10 !py-4 !text-lg sm:!text-xl";
}
