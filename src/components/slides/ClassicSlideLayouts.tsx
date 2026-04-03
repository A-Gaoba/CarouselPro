import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import type { BrandConfig, SlideContent } from "../../types";
import {
  bodyLineClass,
  comparisonBodyClass,
  ctaButtonPaddingClass,
  ctaTitlePixelSize,
  scaledLayoutTitle,
  sectionGapClass,
  stackClasses,
  statFontClass,
  subtitleClass,
  verticalDensity,
} from "./slideFit";

type Density = ReturnType<typeof verticalDensity>;

const MAX_ITEMS = 10;

/**
 * Display titles: prefer wrapping at word boundaries; `overflow-wrap:break-word` only for unbreakable overflow.
 * `text-pretty` improves multi-line headline rhythm where supported (no layout change where unsupported).
 */
const TITLE_WRAP =
  "max-w-full min-w-0 break-normal [overflow-wrap:break-word] [word-break:normal] hyphens-manual text-pretty";

const STAT_WRAP =
  "max-w-full min-w-0 break-normal [overflow-wrap:break-word] [word-break:normal] hyphens-manual";

const CTA_LABEL_WRAP =
  // CTA rule: button label is one-line only (no wrapping). If it's too long, it should ellipsize.
  "min-w-0 max-w-full whitespace-nowrap overflow-hidden text-ellipsis break-normal [word-break:normal] hyphens-manual text-start leading-snug";

export type ClassicSlideLabels = {
  keyPoints: string;
  before: string;
  after: string;
  getStarted: string;
};

export const CLASSIC_LAYOUT_TYPES = [
  "hero-typography",
  "big-statement",
  "split-content",
  "feature-list",
  "comparison",
  "contrast-card",
  "cta-final",
] as const;

export type ClassicLayoutType = (typeof CLASSIC_LAYOUT_TYPES)[number];

export function isClassicLayoutType(
  layout: SlideContent["layoutType"]
): layout is ClassicLayoutType {
  return (CLASSIC_LAYOUT_TYPES as readonly string[]).includes(layout);
}

function titleLineClass(text: string, role: "hero" | "section" | "cta"): string {
  const len = text.trim().length;
  const long = len > 80;
  const medium = len > 40;
  if (role === "hero") {
    if (long) return "leading-snug";
    if (medium) return "leading-snug";
    return "leading-[1.02]";
  }
  if (role === "cta") {
    if (long) return "leading-snug";
    if (medium) return "leading-snug";
    return "leading-tight";
  }
  // section (feature, split, comparison)
  if (long) return "leading-tight";
  if (medium) return "leading-snug";
  return "leading-snug";
}

function mainAxisJustify(density: Density): string {
  return density === "compact" || density === "tight"
    ? "justify-start"
    : "justify-center";
}

function compactVerticalClass(density: Density): string {
  return density === "tight" || density === "compact"
    ? "is-compact-vertical"
    : "";
}

export function ClassicSlideLayouts({
  slide,
  brand,
  labels,
  rtl,
}: {
  slide: SlideContent;
  brand: BrandConfig;
  labels: ClassicSlideLabels;
  rtl: boolean;
}) {
  const dirAttr = rtl ? "rtl" : "ltr";
  const quoteOpen = rtl ? "\u00AB" : "\u201C";
  const quoteClose = rtl ? "\u00BB" : "\u201D";

  const density = verticalDensity(slide);
  const gapSection = sectionGapClass(density);
  const justify = mainAxisJustify(density);

  switch (slide.layoutType) {
    case "hero-typography": {
      const pillLabel =
        slide.visualIntent?.trim().slice(0, 28) || "Premium Guide";
      const titlePx = scaledLayoutTitle(slide.title, 84, 18, "hero");
      return (
        <div
          dir={dirAttr}
          className={`slide-content-container slide-classic-scene ${compactVerticalClass(density)} flex min-h-0 w-full min-w-0 flex-col ${stackClasses("hero", density)} ${justify} text-start`}
        >
          <div className="bg-blob pointer-events-none absolute end-0 top-0 h-72 w-72 opacity-[0.12] bg-brand-accent max-md:h-56 max-md:w-56" />
          <div className="bg-blob pointer-events-none absolute bottom-0 start-0 h-56 w-56 opacity-[0.08] bg-brand-cta max-md:h-44 max-md:w-44" />
          <div
            className={`px-8 flex min-h-0 w-full flex-1 flex-col ${stackClasses(
              "hero",
              density
            )}`}
          >
            <div className="brand-pill relative z-10 shrink-0 self-start">
              <Sparkles size={14} className="text-brand-accent" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary/60">
                {pillLabel}
              </span>
            </div>

            <h3
              className={`slide-classic-hero-title relative z-10 shrink-0 font-display font-black ${titleLineClass(slide.title, "hero")} tracking-tight text-brand-primary ${TITLE_WRAP}`}
              style={{ fontSize: titlePx }}
            >
              {slide.title}
            </h3>

            {slide.subtitle ? (
              <p
                className={`slide-classic-hero-sub max-w-full font-medium text-brand-primary/60 relative z-10 sm:max-w-md ${subtitleClass(slide.subtitle, "hero")}`}
              >
                {slide.subtitle}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    case "big-statement": {
      const titleQuoted = `${quoteOpen}${slide.title}${quoteClose}`;
      const titlePx = scaledLayoutTitle(titleQuoted, 72, 18, "big");
      const statCls = slide.stats?.trim()
        ? statFontClass(slide.stats.trim())
        : "";
      return (
        <div
          dir={dirAttr}
          className={`slide-content-container slide-classic-scene ${compactVerticalClass(density)} relative flex min-h-0 w-full min-w-0 flex-col items-center text-center`}
        >
          <div
            className="bg-grid pointer-events-none opacity-[0.04]"
            style={{ "--grid-color": "var(--brand-accent)" } as CSSProperties}
          />
          <div
            className={`px-8 flex min-h-0 w-full max-w-[36rem] flex-1 flex-col items-center justify-center text-center mx-auto ${stackClasses(
              "section",
              density
            )}`}
          >
            {slide.stats?.trim() ? (
              <div
                className={`${statCls} font-display relative z-10 max-w-[min(100%,36rem)] shrink-0 font-black tracking-tighter text-brand-accent ${STAT_WRAP}`}
              >
                {slide.stats}
              </div>
            ) : null}

            <h3
              className={`slide-classic-big-title max-w-[95%] shrink-0 font-display font-black italic leading-snug tracking-tight text-brand-primary ${TITLE_WRAP}`}
              style={{ fontSize: titlePx }}
            >
              {titleQuoted}
            </h3>

            {slide.subtitle ? (
              <p
                className={`slide-classic-big-sub relative z-10 mx-auto max-w-[min(100%,36rem)] font-medium text-brand-primary/50 ${subtitleClass(slide.subtitle, "big")}`}
              >
                {slide.subtitle}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    case "split-content": {
      const items = (slide.body ?? []).slice(0, MAX_ITEMS);
      const isCompact = items.length > 3;
      const titlePx = scaledLayoutTitle(slide.title, 56, 18, "split");
      const panelPad = density === "compact" ? "p-4" : "p-5 sm:p-6";
      return (
        <div
          dir={dirAttr}
          className={`slide-content-container slide-classic-scene ${compactVerticalClass(density)} flex min-h-0 w-full min-w-0 flex-col ${gapSection} text-start`}
        >
          <div className={`px-8 flex min-h-0 w-full flex-1 flex-col ${gapSection}`}>
            <div
              className={
                density === "compact" ? "shrink-0 space-y-3" : "shrink-0 space-y-4"
              }
            >
              <div className="h-2 w-16 rounded-full bg-accent-gradient" />
              <h3
                className={`slide-classic-split-title font-display font-black ${titleLineClass(slide.title, "section")} tracking-tight text-brand-primary ${TITLE_WRAP}`}
                style={{ fontSize: titlePx }}
              >
                {slide.title}
              </h3>
              {slide.subtitle ? (
                <p
                  className={`font-medium text-brand-primary/60 ${subtitleClass(slide.subtitle, "body")}`}
                >
                  {slide.subtitle}
                </p>
              ) : null}
            </div>

            <div
              className={`grid min-h-0 min-w-0 flex-1 ${isCompact ? "grid-cols-2" : "grid-cols-1"} ${density === "compact" ? "gap-2" : "gap-3"}`}
            >
              {items.map((item, i) => (
                <div
                  key={i}
                  className={`glass-panel flex min-h-0 min-w-0 items-start gap-3 ${panelPad}`}
                >
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-accent/15 text-brand-accent">
                    <CheckCircle2 size={16} />
                  </div>
                  <p className={bodyLineClass(item, isCompact, density, "split")}>
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case "feature-list": {
      const items = (slide.body ?? []).slice(0, MAX_ITEMS);
      const itemCount = items.length;
      const avgLen =
        itemCount > 0
          ? items.reduce((acc, x) => acc + String(x ?? "").trim().length, 0) /
            itemCount
          : 0;
      const maxLen =
        itemCount > 0
          ? Math.max(...items.map((x) => String(x ?? "").trim().length))
          : 0;

      // Grid rule: prioritize readability.
      // - 5+ items: force single column.
      // - 4 items: allow 2 columns only when content is short enough.
      // - <=3 items: use 1 column (grid stays readable; avoids cramped 2-col cards).
      const allowTwoColumns = itemCount === 4 && avgLen <= 92 && maxLen <= 155;
      const compactCards = allowTwoColumns;

      // Title should support list content; reduce its visual footprint further.
      const titlePx = scaledLayoutTitle(slide.title, 40, 15, "feature");
      const sectionSpaceY =
        density === "airy"
          ? "space-y-2"
          : density === "normal"
            ? "space-y-2"
            : density === "tight"
              ? "space-y-1.5"
              : "space-y-1";
      return (
        <div
          dir={dirAttr}
          className={`slide-content-container slide-classic-scene ${compactVerticalClass(density)} flex min-h-0 w-full min-w-0 flex-col ${sectionSpaceY} justify-start text-start`}
        >
          <div
            className={`px-8 flex min-h-0 w-full flex-1 flex-col ${sectionSpaceY} justify-start text-start`}
          >
            <div className="shrink-0 space-y-0.5">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-primary/40">
                {labels.keyPoints}
              </span>
              <h3
                className={`slide-classic-feature-title font-display font-black ${titleLineClass(slide.title, "section")} tracking-tight text-brand-primary ${TITLE_WRAP}`}
                style={{ fontSize: titlePx }}
              >
                {slide.title}
              </h3>
            </div>

            <div
              className={`grid min-h-0 min-w-0 flex-1 grid-cols-1 ${
                allowTwoColumns ? "@[22rem]/slide:grid-cols-2" : ""
              } ${allowTwoColumns ? "gap-2" : density === "compact" ? "gap-2" : "gap-3"}`}
            >
              {items.map((item, i) => (
                <div
                  key={i}
                  className={`rounded-[24px] border shadow-sm w-full flex flex-row items-center justify-start gap-2 py-1.5 px-3 bg-white/70 border-black/10`}
                >
                  {/* Badge is secondary: small + light footprint */}
                  <div className="flex-none flex h-5 w-5 shrink-0 items-center justify-center rounded-xl bg-brand-accent/15 text-brand-accent">
                    <span className="text-[9px] font-black leading-none">{i + 1}</span>
                  </div>
                  <p
                    className={`w-full flex-1 text-start ${bodyLineClass(
                      item,
                      compactCards,
                      density,
                      "feature"
                    )}`}
                  >
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case "comparison": {
      const titlePx = scaledLayoutTitle(slide.title, 30, 12, "compare");
      const cardPad =
        density === "compact" ? "p-3 sm:p-4" : "p-3 sm:p-4 md:p-5";
      const vsSize =
        density === "compact"
          ? "h-9 w-9 min-h-9 min-w-9 text-[9px]"
          : "h-11 w-11 min-h-11 min-w-11 text-[10px]";
      const comparisonGap =
        density === "airy"
          ? "gap-6"
          : density === "normal"
            ? "gap-5"
            : density === "tight"
              ? "gap-4"
              : "gap-3";
      return (
        <div
          dir={dirAttr}
          className={`slide-content-container slide-classic-scene ${compactVerticalClass(density)} flex min-h-0 w-full min-w-0 flex-col ${comparisonGap} text-start`}
        >
          <div
            className={`px-8 flex min-h-0 w-full flex-1 flex-col ${comparisonGap} text-start`}
          >
            <div className="shrink-0 space-y-1 text-center">
              <h3
                className={`slide-classic-compare-header font-display font-black uppercase ${titleLineClass(slide.title, "section")} tracking-tight text-brand-primary ${TITLE_WRAP}`}
                style={{ fontSize: titlePx }}
              >
                {slide.title}
              </h3>
              <div className="mx-auto h-1 w-24 rounded-full bg-accent-gradient" />
            </div>

            <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col items-stretch gap-2 @[22rem]/slide:flex-row">
              <div
                className={`comparison-card relative flex min-h-0 w-full min-w-0 flex-1 flex-col border-brand-primary/10 bg-gray-50/50 @[22rem]/slide:min-w-[11rem] ${cardPad}`}
              >
                <div className="absolute start-0 top-0 h-full w-1 bg-red-400/30" />
                <span className="mb-1.5 block shrink-0 text-[10px] font-black uppercase tracking-widest text-red-500 sm:mb-2">
                  {labels.before}
                </span>
                <p
                  className={`w-full min-h-0 flex-1 ${comparisonBodyClass(
                    slide.body?.[0] ?? "—",
                    "before"
                  )}`}
                >
                  {slide.body?.[0] ?? "—"}
                </p>
              </div>

              <div className="flex w-full shrink-0 flex-col items-center justify-center self-center px-0.5 py-1 @[22rem]/slide:w-auto @[22rem]/slide:self-stretch @[22rem]/slide:py-0">
                <div
                  className={`flex items-center justify-center rounded-full border border-gray-100 bg-white font-black italic leading-none text-black shadow-xl ${vsSize}`}
                >
                  VS
                </div>
              </div>

              <div
                className={`comparison-card glass-panel relative flex min-h-0 w-full min-w-0 flex-1 flex-col border-brand-accent shadow-lg @[22rem]/slide:min-w-[11rem] ${cardPad}`}
              >
                <div className="absolute start-0 top-0 h-full w-1 bg-brand-accent" />
                <span className="mb-1.5 block shrink-0 text-[10px] font-black uppercase tracking-widest text-brand-accent sm:mb-2">
                  {labels.after}
                </span>
                <p
                  className={`w-full min-h-0 flex-1 ${comparisonBodyClass(
                    slide.body?.[1] ?? "—",
                    "after"
                  )}`}
                >
                  {slide.body?.[1] ?? "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    case "contrast-card": {
      const titlePx = scaledLayoutTitle(slide.title, 32, 12, "compare");

      const cardPad =
        density === "compact" ? "p-4 sm:p-5" : "p-4 sm:p-5 md:p-6";

      const vsSize =
        density === "compact"
          ? "h-9 w-9 min-h-9 min-w-9 text-[9px]"
          : "h-11 w-11 min-h-11 min-w-11 text-[10px]";

      const contrastGap =
        density === "airy"
          ? "gap-6"
          : density === "normal"
            ? "gap-5"
            : density === "tight"
              ? "gap-4"
              : "gap-3";

      const beforeText = slide.body?.[0] ?? "—";
      const afterText = slide.body?.[1] ?? "—";
      const labelA = slide.contrastLabelA?.trim() || labels.before;
      const labelB = slide.contrastLabelB?.trim() || labels.after;

      const bodySizeFor = (s: string): string => {
        const len = String(s ?? "").trim().length;
        if (len > 180) return "text-sm";
        if (len > 120) return "text-base sm:text-lg";
        return "text-lg sm:text-xl";
      };

      const warmBodySize = bodySizeFor(beforeText);
      const coolBodySize = bodySizeFor(afterText);

      const BODY_WRAP =
        "min-w-0 max-w-full break-normal [overflow-wrap:break-word] [word-break:normal] hyphens-manual";

      return (
        <div
          dir={dirAttr}
          className={`slide-content-container slide-classic-scene ${compactVerticalClass(density)} flex min-h-0 w-full min-w-0 flex-col ${contrastGap} text-start`}
        >
          <div className={`px-8 flex min-h-0 w-full flex-1 flex-col ${contrastGap}`}>
            <div className="shrink-0 space-y-2 text-center">
              <h3
                className={`slide-classic-compare-header font-display font-black uppercase ${titleLineClass(slide.title, "section")} tracking-tight text-brand-primary ${TITLE_WRAP}`}
                style={{ fontSize: titlePx }}
              >
                {slide.title}
              </h3>
              <div className="mx-auto h-px w-20 rounded-full bg-accent-gradient opacity-80" />
              {slide.subtitle?.trim() ? (
                <p
                  className={`mx-auto max-w-[36rem] font-medium text-brand-primary/60 leading-snug tracking-tight ${TITLE_WRAP} text-sm sm:text-base line-clamp-2`}
                >
                  {slide.subtitle}
                </p>
              ) : null}
            </div>

            <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col items-stretch gap-3 justify-start">
              <div
                className={`contrast-compare-card relative flex min-h-0 w-full flex-1 flex-col rounded-[32px] border border-gray-200/70 bg-gray-50/60 shadow-sm overflow-visible ${cardPad}`}
              >
                <div className="absolute start-0 top-0 h-full w-1 rounded-l-[32px] bg-red-400/30" />
                <span className="mb-1.5 block shrink-0 text-[10px] font-black uppercase tracking-widest text-red-500 sm:mb-2">
                  {labelA}
                </span>
                <p
                  className={`${BODY_WRAP} ${warmBodySize} font-black italic leading-snug text-brand-primary/60 whitespace-pre-line line-clamp-2`}
                >
                  {beforeText}
                </p>
              </div>

              <div
                className={`relative z-10 self-center flex items-center justify-center rounded-full border border-gray-200/80 bg-white/90 shadow-xl backdrop-blur ${vsSize}`}
              >
                VS
              </div>

              <div
                className={`contrast-compare-card relative flex min-h-0 w-full flex-1 flex-col rounded-[32px] border border-brand-accent/20 bg-white/70 shadow-sm overflow-visible ${cardPad}`}
              >
                <div className="absolute start-0 top-0 h-full w-1 rounded-l-[32px] bg-brand-accent/80" />
                <span className="mb-1.5 block shrink-0 text-[10px] font-black uppercase tracking-widest text-brand-accent sm:mb-2">
                  {labelB}
                </span>
                <p
                  className={`${BODY_WRAP} ${coolBodySize} font-black leading-snug text-brand-accent/95 whitespace-pre-line line-clamp-2`}
                >
                  {afterText}
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    case "cta-final": {
      // CTA rule: button must contain ONLY a short label; title/supporting text come from separate fields.
      let ctaLabel = slide.ctaText?.trim() || labels.getStarted;
      ctaLabel = ctaLabel.replace(/\s+/g, " ");
      const firstClause = ctaLabel.split(/[:;,.!?—–-]/)[0]?.trim() || "";
      if (firstClause.length >= 3) ctaLabel = firstClause;
      if (ctaLabel.length > 42) ctaLabel = ctaLabel.slice(0, 42).trim();

      const ctaTitle = slide.title?.trim() || "";
      // Supporting text should not reuse the full title; prefer subtitle, then visualIntent.
      const supportingText =
        slide.subtitle?.trim() || slide.visualIntent?.trim() || "";

      const titlePx = ctaTitlePixelSize(ctaTitle);
      const logoBox =
        density === "compact" ? "h-20 w-20 text-3xl" : "h-24 w-24 text-4xl";
      const imgBox = density === "compact" ? "h-14 w-14" : "h-16 w-16";
      const btnPad = ctaButtonPaddingClass(ctaLabel, density);
      const ctaGap =
        density === "airy"
          ? "gap-8"
          : density === "normal"
            ? "gap-7"
            : density === "tight"
              ? "gap-6"
              : "gap-5";
      return (
        <div
          dir={dirAttr}
          className={`slide-content-container slide-classic-scene ${compactVerticalClass(density)} relative flex min-h-0 w-full min-w-0 flex-col items-center ${ctaGap} justify-start text-center`}
        >
          <div
            className="bg-pattern pointer-events-none opacity-[0.04]"
            style={{ "--pattern-color": "var(--brand-accent)" } as CSSProperties}
          />
          <div
            className={`px-8 flex min-h-0 w-full flex-1 flex-col items-center ${ctaGap} justify-start text-center`}
          >
            <div
              className={`relative z-10 flex shrink-0 items-center justify-center rounded-[32px] border border-gray-50 bg-white shadow-xl ${logoBox} mt-2 mb-6 p-2 sm:mt-3 sm:mb-7 sm:p-3`}
            >
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  className={`${imgBox} object-contain`}
                  alt=""
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span aria-hidden>{brand.logo}</span>
              )}
            </div>

            {/* 1) Title */}
            <h3
              className={`relative z-10 font-display font-black tracking-tight text-brand-primary ${TITLE_WRAP} leading-snug`}
              style={{ fontSize: titlePx }}
            >
              {ctaTitle}
            </h3>

            {/* 2) Supporting text (max 2 lines, centered) */}
            <p
              className={`relative z-10 max-w-[32rem] line-clamp-2 font-display font-medium text-brand-primary/70 leading-snug tracking-tight ${TITLE_WRAP} text-sm sm:text-base`}
            >
              {supportingText}
            </p>

            {/* 3) Button */}
            <button
              type="button"
              className={`cta-button bg-accent-gradient relative z-10 min-h-0 min-w-0 max-w-full shrink-0 ${btnPad}`}
              tabIndex={-1}
            >
              <span className={CTA_LABEL_WRAP}>
                {ctaLabel}
              </span>
              <ArrowRight
                size={24}
                className="shrink-0 rtl:scale-x-[-1]"
                aria-hidden
              />
            </button>
          </div>
        </div>
      );
    }

  }
}
