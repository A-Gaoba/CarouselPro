import type { DeckPlan, SlideContent } from "../types";
import { applyRoleMetadata } from "./slideStructuralValidation";

/**
 * Ensures slide count matches plan and each slide's role/layout matches its plan row.
 * No synthesis, truncation, merging, or silent body repair.
 */
export function alignDeckToPlan(
  slides: Omit<SlideContent, "id">[],
  plan: DeckPlan
): Omit<SlideContent, "id">[] {
  const T = plan.targetSlides;
  if (slides.length !== T) {
    throw new Error(
      `Deck size mismatch: expected exactly ${T} slides, received ${slides.length}.`
    );
  }
  return slides.map((s, i) => {
    const row = plan.slides[i];
    if (!row) {
      throw new Error(`Missing plan row for slide index ${i}`);
    }
    return applyRoleMetadata({ ...s }, row.contentRole);
  });
}
