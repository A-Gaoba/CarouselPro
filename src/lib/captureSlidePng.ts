import { toPng } from "html-to-image";

type ToPngOptions = NonNullable<Parameters<typeof toPng>[1]>;

/** Instagram-friendly output; scale is derived from the live DOM width (WYSIWYG). */
export const EXPORT_TARGET_WIDTH = 1080;
export const EXPORT_TARGET_HEIGHT = 1350;

/**
 * Wait until all <img> descendants are decoded (or failed).
 */
export async function waitForImagesInSubtree(root: HTMLElement): Promise<void> {
  const imgs = [...root.querySelectorAll("img")];
  await Promise.all(
    imgs.map(async (img) => {
      if (img.complete && img.naturalWidth > 0) {
        try {
          if ("decode" in img && typeof img.decode === "function") {
            await img.decode();
          }
        } catch {
          /* ignore decode errors */
        }
        return;
      }
      await new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      });
    })
  );
}

/**
 * Wait until element layout size is unchanged for several consecutive frames
 * (settles flex, fonts, and motion layout).
 */
export async function waitForLayoutStable(
  el: HTMLElement,
  stableFrames = 4,
  maxFrames = 120
): Promise<void> {
  let lastW = -1;
  let lastH = -1;
  let stable = 0;

  for (let i = 0; i < maxFrames; i++) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const w = Math.round(el.offsetWidth);
    const h = Math.round(el.offsetHeight);

    if (w < 2 || h < 2) {
      stable = 0;
      continue;
    }

    if (w === lastW && h === lastH) {
      stable++;
      if (stable >= stableFrames) return;
    } else {
      stable = 0;
      lastW = w;
      lastH = h;
    }
  }
}

async function waitForFontsReady(): Promise<void> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
}

const SLIDE_EXPORT_ATTR = "data-slide-export-id";

/**
 * After changing selected slide, wait until the slide ref points at the DOM node
 * for the expected SlideContent.id (avoids capturing during AnimatePresence exit or stale ref).
 */
export async function waitForSlideExportElement(
  getElement: () => HTMLElement | null,
  expectedExportId: string,
  maxFrames = 120
): Promise<HTMLElement> {
  for (let f = 0; f < maxFrames; f++) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const el = getElement();
    const id = el?.getAttribute(SLIDE_EXPORT_ATTR);
    if (el && id === expectedExportId && el.offsetWidth > 2 && el.offsetHeight > 2) {
      return el;
    }
  }
  const el = getElement();
  const id = el?.getAttribute(SLIDE_EXPORT_ATTR);
  if (el && id === expectedExportId) {
    return el;
  }
  throw new Error(
    `Slide DOM not ready for export id "${expectedExportId}" (got "${id ?? "null"}").`
  );
}

/**
 * Prepare DOM for capture (fonts, images, paint) — same node the user sees.
 */
export async function prepareSlideNodeForCapture(el: HTMLElement): Promise<void> {
  await waitForFontsReady();
  await waitForImagesInSubtree(el);
  await waitForLayoutStable(el);
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

/**
 * html-to-image: do NOT pass width/height on the node — that resizes the clone and reflows layout.
 * Use pixelRatio so canvas width ≈ offsetWidth * pixelRatio = EXPORT_TARGET_WIDTH.
 */
export function getSlideToPngOptions(
  el: HTMLElement,
  backgroundColor: string
): ToPngOptions {
  const w = el.offsetWidth;
  if (w < 2) {
    throw new Error("Slide element has invalid width for export.");
  }

  const pixelRatio = EXPORT_TARGET_WIDTH / w;

  return {
    cacheBust: true,
    backgroundColor,
    quality: 1,
    pixelRatio,
    skipFonts: false,
    preferredFontFormat: "woff2",
  };
}

/**
 * Rasterize the live slide DOM to PNG — matches on-screen layout at higher resolution.
 */
export async function captureSlideToPng(
  el: HTMLElement,
  backgroundColor: string
): Promise<string> {
  await prepareSlideNodeForCapture(el);
  const pngOptions = getSlideToPngOptions(el, backgroundColor);
  return toPng(el, pngOptions);
}
