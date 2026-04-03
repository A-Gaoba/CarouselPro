/**
 * Worst-case checks for slide-fit heuristics (run: `npm run test:fit`).
 * Verifies monotonic scaling and floor sizes — not DOM measurement.
 */
import type { SlideContent } from "../../types";
import {
  bodyLineClass,
  comparisonBodyClass,
  ctaButtonPaddingClass,
  ctaTitlePixelSize,
  scaledLayoutTitle,
  scaledPixelValue,
  subtitleClass,
  totalTextLength,
  verticalDensity,
  wrapLoadFactor,
} from "./slideFit";

function px(s: string): number {
  return Number.parseFloat(s.replace("px", ""));
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`slideFit invariant failed: ${msg}`);
}

/** Longest plausible generated strings — stress scaling + density. */
const LONG_TITLE = "word ".repeat(45).trim();
const LONG_SUB =
  "Supporting line that keeps going with more detail than a typical subtitle should carry. ".repeat(
    3
  );
const LONG_COMPARE =
  "Before or after column text that must wrap many times without overflowing the comparison card area in portrait layout. ".repeat(
    2
  );
const LONG_CTA =
  "Get started with this action label that is unreasonably long for a button but must still fit visually. ".repeat(
    2
  );

const WORST_SLIDES: SlideContent[] = [
  {
    id: "w-hero",
    type: "hook",
    layoutType: "hero-typography",
    visualIntent: LONG_TITLE,
    title: LONG_TITLE,
    subtitle: LONG_SUB,
  },
  {
    id: "w-big",
    type: "value",
    layoutType: "big-statement",
    visualIntent: "x",
    title: LONG_TITLE,
    subtitle: LONG_SUB,
    stats: "99.9%",
  },
  {
    id: "w-split",
    type: "value",
    layoutType: "split-content",
    visualIntent: "x",
    title: LONG_TITLE,
    subtitle: LONG_SUB,
    body: Array.from({ length: 6 }, () => LONG_COMPARE),
  },
  {
    id: "w-feature",
    type: "value",
    layoutType: "feature-list",
    visualIntent: "x",
    title: LONG_TITLE,
    body: Array.from({ length: 6 }, () => LONG_COMPARE),
  },
  {
    id: "w-compare",
    type: "value",
    layoutType: "comparison",
    visualIntent: "x",
    title: LONG_TITLE,
    body: [LONG_COMPARE, LONG_COMPARE],
  },
  {
    id: "w-cta",
    type: "cta",
    layoutType: "cta-final",
    visualIntent: "x",
    title: LONG_TITLE,
    subtitle: LONG_SUB,
    ctaText: LONG_CTA,
  },
];

export function runSlideFitWorstCaseChecks(): void {
  assert(wrapLoadFactor("x".repeat(500), 12) < 0.5, "wrap factor should shrink for huge text");
  assert(
    wrapLoadFactor("abc", 12) === 1,
    "wrap factor should be 1 for short text"
  );

  let prev = Infinity;
  for (const n of [5, 20, 60, 120, 200, 400]) {
    const t = "x".repeat(n);
    const v = px(scaledLayoutTitle(t, 84, 18, "hero"));
    assert(v <= prev + 0.001, "hero title px should not grow with length");
    prev = v;
  }

  assert(
    px(scaledLayoutTitle(LONG_TITLE, 84, 18, "hero")) <=
      px(scaledLayoutTitle("short", 84, 18, "hero")),
    "long hero title should be <= short title size"
  );

  assert(
    px(scaledLayoutTitle(LONG_TITLE, 48, 14, "cta")) >= 14,
    "cta title respects min px"
  );

  assert(
    scaledPixelValue(LONG_TITLE, 84, 18) >= 18,
    "scaledPixelValue respects floor"
  );

  for (const slide of WORST_SLIDES) {
    const t = totalTextLength(slide);
    const d = verticalDensity(slide);
    assert(
      ["airy", "normal", "tight", "compact"].includes(d),
      `density for ${slide.layoutType} (load=${t})`
    );
    subtitleClass(slide.subtitle, "hero");
    subtitleClass(slide.subtitle, "big");
    if (slide.body) {
      for (const line of slide.body) {
        bodyLineClass(line, slide.body.length > 3, d, "split");
        comparisonBodyClass(line, "before");
        comparisonBodyClass(line, "after");
      }
    }
    if (slide.ctaText) {
      ctaButtonPaddingClass(slide.ctaText, d);
    }
    ctaTitlePixelSize(slide.title);
  }

  // eslint-disable-next-line no-console
  console.log("slideFit worst-case invariants: OK");
}

runSlideFitWorstCaseChecks();
