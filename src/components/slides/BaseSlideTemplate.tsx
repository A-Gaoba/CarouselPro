import { forwardRef, type ReactNode } from "react";
import { Globe, MessageCircle, Share2 } from "lucide-react";
import type { BrandConfig } from "../../types";

export interface BaseSlideTemplateProps {
  brand: BrandConfig;
  index: number;
  total: number;
  children: ReactNode;
  /** e.g. layoutType for generated slides; optional for preview */
  dataLayoutType?: string;
  /** Stable id for export sync (matches SlideContent.id) */
  slideExportId?: string;
  /**
   * Direction for the main content region only. Header/footer/chrome stay fixed (LTR layout).
   */
  contentDir?: "ltr" | "rtl";
  className?: string;
}

/**
 * Shared visual shell: dot field, header (logo, name, progress, share),
 * main injection region, footer (website, whatsapp, slide index).
 * Chrome is always laid out like English (LTR); only `contentDir` affects the main slot.
 */
export const BaseSlideTemplate = forwardRef<HTMLDivElement, BaseSlideTemplateProps>(
  function BaseSlideTemplate(
    {
      brand,
      index,
      total,
      children,
      dataLayoutType,
      slideExportId,
      contentDir = "ltr",
      className = "",
    },
    ref
  ) {
    const contentRtl = contentDir === "rtl";

    return (
      <div
        ref={ref}
        dir="ltr"
        lang="en"
        data-layout-type={dataLayoutType}
        data-slide-export-id={slideExportId}
        className={`slide-canvas slide-template-surface select-none rounded-[24px] border border-gray-200/90 shadow-[0_24px_48px_-16px_rgba(15,23,42,0.09),0_12px_24px_-10px_rgba(15,23,42,0.04)] ${className}`}
      >
        <div
          className="pointer-events-none absolute inset-0 z-0 rounded-[24px] slide-template-dots opacity-[0.5]"
          aria-hidden
        />

        <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 px-8 pb-5 pt-8">
          <div className="flex min-w-0 items-center gap-3 text-start">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200/80 bg-white text-lg shadow-sm"
              style={{ boxShadow: `0 1px 2px ${brand.primaryColor}08` }}
            >
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt=""
                  className="h-7 w-7 object-contain"
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span aria-hidden>{brand.logo}</span>
              )}
            </div>
            <span
              dir="auto"
              className="break-words font-display text-[17px] font-semibold tracking-tight text-brand-primary"
            >
              {brand.name}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <div
              className="flex items-center gap-1.5"
              dir="ltr"
              role="presentation"
              aria-label={`Slide ${index + 1} of ${total}`}
            >
              {Array.from({ length: total }).map((_, i) => (
                <div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: i === index ? brand.accentColor : `${brand.primaryColor}18`,
                    opacity: i === index ? 1 : 0.45,
                    transform: i === index ? "scale(1.35)" : "scale(1)",
                  }}
                />
              ))}
            </div>
            <span className="text-gray-300" aria-hidden title="Share">
              <Share2 size={16} strokeWidth={1.75} />
            </span>
          </div>
        </header>

        <main
          dir={contentDir}
          lang={contentRtl ? "ar" : "en"}
          className={`slide-main-inject ${contentRtl ? "slide-main-rtl" : ""}`}
        >
          {children}
        </main>

        <footer className="relative z-10 mt-auto shrink-0 px-8 pb-8 pt-2">
          <div
            className="mb-5 h-px w-full"
            style={{ backgroundColor: `${brand.primaryColor}12` }}
          />
          <div className="flex w-full items-center gap-x-3 sm:gap-x-5" dir="ltr">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Globe size={11} className="shrink-0 opacity-50" strokeWidth={2} aria-hidden />
              <span
                dir="ltr"
                className="min-w-0 truncate text-start text-[10px] font-medium leading-tight tracking-wide text-gray-400/95 sm:text-[11px]"
                title={brand.website?.trim() || undefined}
              >
                {brand.website?.trim() || "—"}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <MessageCircle size={11} className="shrink-0 opacity-50" strokeWidth={2} aria-hidden />
              <span
                dir="ltr"
                className="whitespace-nowrap text-start text-[10px] font-medium leading-tight tracking-wide text-gray-400/95 sm:text-[11px]"
              >
                {brand.whatsapp?.trim() || "—"}
              </span>
            </div>
            <span
              dir="ltr"
              className="shrink-0 whitespace-nowrap text-[10px] font-semibold tabular-nums text-gray-500/90 sm:text-[11px]"
            >
              {index + 1} / {total}
            </span>
          </div>
        </footer>
      </div>
    );
  }
);

BaseSlideTemplate.displayName = "BaseSlideTemplate";
