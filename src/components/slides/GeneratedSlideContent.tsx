import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import type { BrandConfig, LayoutType, SlideContent } from "../../types";

function fontSizeForTitle(text: string, base: number, min: number): string {
  const len = text.length;
  if (len < 15) return `${base}px`;
  if (len < 30) return `${Math.max(min, base * 0.82)}px`;
  return `${Math.max(min, base * 0.65)}px`;
}

export interface GeneratedSlideLabels {
  keyPoints: string;
  before: string;
  after: string;
  getStarted: string;
}

const primary = "text-brand-primary";

/** Fixed outer slot: identical for every slide (main inject only). */
function ContentSlot({ children }: { children: ReactNode }) {
  return (
    <div className="slide-main-slot flex min-h-0 w-full flex-1 flex-col justify-center px-4">
      {children}
    </div>
  );
}

/**
 * Shared inner frame: same card, border, padding, and accent for all content modes.
 * Only the children differ per layoutType / content type.
 */
function ContentFrame({ rtl, children }: { rtl: boolean; children: ReactNode }) {
  return (
    <div
      className={`mx-auto w-full max-w-[min(100%,36rem)] rounded-2xl border border-gray-200/80 bg-white/60 px-6 py-8 shadow-sm text-start ${rtl ? "slide-ar-body" : ""}`}
    >
      <div className="mb-6 h-1.5 w-14 rounded-full bg-brand-accent/80 rtl:ms-auto" aria-hidden />
      {children}
    </div>
  );
}

function TitleBlock({
  text,
  rtl,
  sizeBase,
  sizeMin,
  className = "",
}: {
  text: string;
  rtl: boolean;
  sizeBase: number;
  sizeMin: number;
  className?: string;
}) {
  return (
    <p
      className={`font-display font-bold leading-tight tracking-tight ${primary} ${rtl ? "slide-ar-title" : ""} ${className}`}
      style={{ fontSize: fontSizeForTitle(text, sizeBase, sizeMin) }}
    >
      {text}
    </p>
  );
}

function SubtitleBlock({ text, rtl, className = "" }: { text: string; rtl: boolean; className?: string }) {
  return (
    <p
      className={`text-lg font-medium text-brand-primary/55 leading-relaxed ${rtl ? "slide-ar-body" : ""} ${className}`}
    >
      {text}
    </p>
  );
}

/** Hero: title only or title + subtitle (headline emphasis). */
function ModeHero({ slide, rtl }: { slide: SlideContent; rtl: boolean }) {
  return (
    <>
      <TitleBlock text={slide.title} rtl={rtl} sizeBase={72} sizeMin={36} className="leading-[1.05]" />
      {slide.subtitle ? (
        <div className="mt-5 max-w-lg">
          <SubtitleBlock text={slide.subtitle} rtl={rtl} className="text-xl" />
        </div>
      ) : null}
    </>
  );
}

/** Stats / numbers: large figure + optional title + subtitle. */
function ModeStats({ slide, rtl }: { slide: SlideContent; rtl: boolean }) {
  return (
    <>
      {slide.stats ? (
        <div
          className="font-display font-bold tracking-tighter text-brand-accent"
          style={{ fontSize: "clamp(2.5rem, 11vw, 4.25rem)" }}
          dir="ltr"
        >
          {slide.stats}
        </div>
      ) : null}
      <div className={slide.stats ? "mt-5 space-y-3" : "space-y-3"}>
        <TitleBlock text={slide.title} rtl={rtl} sizeBase={48} sizeMin={28} />
        {slide.subtitle ? <SubtitleBlock text={slide.subtitle} rtl={rtl} /> : null}
      </div>
    </>
  );
}

/** Quote-style headline + optional subtitle. */
function ModeQuote({ slide, rtl, quoteOpen, quoteClose }: { slide: SlideContent; rtl: boolean; quoteOpen: string; quoteClose: string }) {
  return (
    <>
      <p
        className={`font-display font-bold italic leading-tight tracking-tight ${primary} ${rtl ? "slide-ar-title" : ""}`}
        style={{ fontSize: fontSizeForTitle(slide.title, 52, 28) }}
      >
        {quoteOpen}
        {slide.title}
        {quoteClose}
      </p>
      {slide.subtitle ? (
        <div className="mt-5 max-w-lg">
          <SubtitleBlock text={slide.subtitle} rtl={rtl} />
        </div>
      ) : null}
    </>
  );
}

/** List: optional eyebrow (feature-list), title, optional subtitle, variable bullet count. */
function ModeList({
  slide,
  rtl,
  eyebrow,
  numbered,
}: {
  slide: SlideContent;
  rtl: boolean;
  eyebrow?: string;
  numbered: boolean;
}) {
  const items = slide.body ?? [];
  return (
    <>
      {eyebrow ? (
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-primary/40">
          {eyebrow}
        </span>
      ) : null}
      <TitleBlock text={slide.title} rtl={rtl} sizeBase={44} sizeMin={26} />
      {slide.subtitle ? (
        <div className="mt-3 max-w-lg">
          <SubtitleBlock text={slide.subtitle} rtl={rtl} className="text-base" />
        </div>
      ) : null}
      {items.length > 0 ? (
        <ul className={`mt-6 space-y-3 ${rtl ? "pe-0" : ""}`}>
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              {numbered ? (
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-accent/12 text-xs font-bold text-brand-accent">
                  {i + 1}
                </span>
              ) : (
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent" aria-hidden />
              )}
              <p
                className={`min-w-0 flex-1 font-semibold leading-snug text-brand-primary ${items.length > 4 ? "text-sm" : "text-base"} ${rtl ? "slide-ar-body" : ""}`}
              >
                {item}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Before / after — two blocks inside the same content frame. */
function ModeComparison({ slide, rtl, labels }: { slide: SlideContent; rtl: boolean; labels: GeneratedSlideLabels }) {
  return (
    <>
      <p
        className={`mb-5 text-xs font-semibold uppercase tracking-widest text-brand-primary/45 ${rtl ? "slide-ar-body" : ""}`}
      >
        {slide.title}
      </p>
      <div className="relative flex flex-col gap-4">
        <div className="rounded-xl border border-gray-200/90 bg-gray-50/80 px-4 py-4">
          <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-widest text-red-500/90">
            {labels.before}
          </span>
          <p className={`text-base font-semibold italic text-brand-primary/45 ${rtl ? "slide-ar-body" : ""}`}>
            {slide.body?.[0] ?? "—"}
          </p>
        </div>
        <div className="absolute left-1/2 top-1/2 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gray-100 bg-white text-[10px] font-bold text-brand-primary shadow-md">
          VS
        </div>
        <div className="rounded-xl border border-brand-accent/25 bg-white/90 px-4 py-4 shadow-sm">
          <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-widest text-brand-accent">
            {labels.after}
          </span>
          <p className={`text-base font-bold text-brand-primary ${rtl ? "slide-ar-body" : ""}`}>
            {slide.body?.[1] ?? "—"}
          </p>
        </div>
      </div>
    </>
  );
}

/** CTA: logo, headline, subtitle, button — same outer frame as other modes. */
function ModeCta({
  slide,
  brand,
  rtl,
  labels,
}: {
  slide: SlideContent;
  brand: BrandConfig;
  rtl: boolean;
  labels: GeneratedSlideLabels;
}) {
  return (
    <>
      <div className="mb-6 flex h-18 w-18 items-center justify-center rounded-2xl border border-gray-100 bg-white text-3xl shadow-sm">
        {brand.logoUrl ? (
          <img
            src={brand.logoUrl}
            alt=""
            className="h-12 w-12 object-contain"
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
          />
        ) : (
          brand.logo
        )}
      </div>
      <p
        className={`font-display text-2xl font-bold uppercase leading-tight tracking-tight text-brand-primary sm:text-3xl ${rtl ? "slide-ar-title normal-case" : ""}`}
      >
        {slide.title}
      </p>
      {slide.subtitle ? (
        <div className="mt-3 max-w-md">
          <SubtitleBlock text={slide.subtitle} rtl={rtl} />
        </div>
      ) : null}
      <div
        className="mt-8 inline-flex items-center gap-2 rounded-2xl px-7 py-3.5 text-base font-bold text-white shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${brand.accentColor}, ${brand.ctaColor})`,
        }}
      >
        {slide.ctaText ?? labels.getStarted}
        <ArrowRight size={20} strokeWidth={2.25} className={rtl ? "scale-x-[-1]" : undefined} aria-hidden />
      </div>
    </>
  );
}

function ModeFallback({ slide, rtl }: { slide: SlideContent; rtl: boolean }) {
  return (
    <>
      <TitleBlock text={slide.title} rtl={rtl} sizeBase={40} sizeMin={26} />
      {slide.subtitle ? (
        <div className="mt-4">
          <SubtitleBlock text={slide.subtitle} rtl={rtl} className="text-xl" />
        </div>
      ) : null}
    </>
  );
}

function renderInnerByLayout(
  layoutType: LayoutType,
  slide: SlideContent,
  ctx: {
    rtl: boolean;
    quoteOpen: string;
    quoteClose: string;
    labels: GeneratedSlideLabels;
    brand: BrandConfig;
  }
): ReactNode {
  const { rtl, quoteOpen, quoteClose, labels, brand } = ctx;

  switch (layoutType) {
    case "hero-typography":
      return <ModeHero slide={slide} rtl={rtl} />;

    case "big-statement":
      if (slide.stats?.trim()) {
        return <ModeStats slide={slide} rtl={rtl} />;
      }
      return <ModeQuote slide={slide} rtl={rtl} quoteOpen={quoteOpen} quoteClose={quoteClose} />;

    case "split-content":
      return <ModeList slide={slide} rtl={rtl} numbered={false} />;

    case "feature-list":
      return <ModeList slide={slide} rtl={rtl} eyebrow={labels.keyPoints} numbered />;

    case "comparison":
      return <ModeComparison slide={slide} rtl={rtl} labels={labels} />;

    case "cta-final":
      return <ModeCta slide={slide} brand={brand} rtl={rtl} labels={labels} />;

    default:
      return <ModeFallback slide={slide} rtl={rtl} />;
  }
}

/** Single fixed shell (slot + inner card); only the inner composition changes with `layoutType`. */
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
  const rtl = dir === "rtl";
  const quoteOpen = rtl ? "\u00AB" : "\u201C";
  const quoteClose = rtl ? "\u00BB" : "\u201D";

  return (
    <ContentSlot>
      <ContentFrame rtl={rtl}>
        {renderInnerByLayout(slide.layoutType, slide, {
          rtl,
          quoteOpen,
          quoteClose,
          labels,
          brand,
        })}
      </ContentFrame>
    </ContentSlot>
  );
}
