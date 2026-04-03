import type { BrandConfig, CarouselHistoryItem, SlideContent } from "../types";

const STORAGE_KEY = "carouselpro_history_v1";
export const HISTORY_MAX_ITEMS = 50;

function isSlideContent(x: unknown): x is SlideContent {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.type === "string" &&
    typeof o.layoutType === "string" &&
    typeof o.visualIntent === "string" &&
    typeof o.title === "string"
  );
}

function isBrandConfig(x: unknown): x is BrandConfig {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.primaryColor === "string" &&
    typeof o.secondaryColor === "string" &&
    typeof o.accentColor === "string" &&
    typeof o.ctaColor === "string"
  );
}

function parseItem(raw: unknown): CarouselHistoryItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.prompt !== "string") return null;
  if (typeof o.createdAt !== "string") return null;
  if (typeof o.slideCount !== "number" || !Number.isFinite(o.slideCount)) return null;
  if (!Array.isArray(o.slides) || !o.slides.every(isSlideContent)) return null;
  if (!isBrandConfig(o.brand)) return null;
  const previewTitle =
    typeof o.previewTitle === "string" ? o.previewTitle : undefined;
  return {
    id: o.id,
    prompt: o.prompt,
    slides: o.slides as SlideContent[],
    brand: o.brand,
    createdAt: o.createdAt,
    slideCount: o.slideCount,
    previewTitle,
  };
}

export function loadHistory(): CarouselHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseItem).filter((x): x is CarouselHistoryItem => x !== null);
  } catch {
    return [];
  }
}

function saveHistory(items: CarouselHistoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("carouselHistory: failed to save", e);
  }
}

/**
 * Append a successful generation (once per completed generate — not tied to export).
 * Newest first, capped at HISTORY_MAX_ITEMS.
 */
export function addGenerationToHistory(input: {
  prompt: string;
  slides: SlideContent[];
  brand: BrandConfig;
}): CarouselHistoryItem {
  const slides = JSON.parse(JSON.stringify(input.slides)) as SlideContent[];
  const brand = JSON.parse(JSON.stringify(input.brand)) as BrandConfig;
  const prompt = input.prompt.trim();

  const item: CarouselHistoryItem = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    prompt,
    slides,
    brand,
    slideCount: slides.length,
    previewTitle: slides[0]?.title?.slice(0, 120),
  };

  const prev = loadHistory();
  const next = [item, ...prev].slice(0, HISTORY_MAX_ITEMS);
  saveHistory(next);
  return item;
}

export function deleteHistoryItem(id: string): CarouselHistoryItem[] {
  const next = loadHistory().filter((h) => h.id !== id);
  saveHistory(next);
  return next;
}

export function clearAllHistory(): void {
  saveHistory([]);
}
