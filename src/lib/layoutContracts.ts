import type { ContentRole, DeckPlan, LayoutType } from "../types";
import { mapContentRoleToTypeLayout } from "./layoutRoleMap";

/**
 * Layout-driven copy limits — single source of truth for prompts, JSON schema, and validators.
 * Values align with prior UI-safe caps (Phase 1 rendering).
 */
export interface LayoutContract {
  titleMaxChars: number;
  /** 0 = field must be empty string in API output */
  subtitleMaxChars: number;
  bodyMinItems: number;
  bodyMaxItems: number;
  bodyItemMaxChars: number;
  /** 0 = must be empty unless role-specific rules say otherwise */
  statsMaxChars: number;
  /** 0 = must be empty except on CTA slide */
  ctaMaxChars: number;
  visualIntentMaxChars: number;
  /** contrast-card only: short semantic labels for the two states */
  contrastLabelMaxChars: number;
  /** comparison body strings (before / after), each */
  comparisonSideMaxChars: number;
}

export const LAYOUT_CONTRACTS: Record<LayoutType, LayoutContract> = {
  "hero-typography": {
    titleMaxChars: 120,
    subtitleMaxChars: 180,
    bodyMinItems: 0,
    bodyMaxItems: 1,
    bodyItemMaxChars: 140,
    statsMaxChars: 0,
    ctaMaxChars: 0,
    visualIntentMaxChars: 160,
    contrastLabelMaxChars: 0,
    comparisonSideMaxChars: 140,
  },
  "big-statement": {
    titleMaxChars: 120,
    subtitleMaxChars: 200,
    bodyMinItems: 0,
    bodyMaxItems: 1,
    bodyItemMaxChars: 160,
    statsMaxChars: 42,
    ctaMaxChars: 0,
    visualIntentMaxChars: 160,
    contrastLabelMaxChars: 0,
    comparisonSideMaxChars: 160,
  },
  "split-content": {
    titleMaxChars: 120,
    subtitleMaxChars: 160,
    bodyMinItems: 2,
    bodyMaxItems: 6,
    bodyItemMaxChars: 110,
    statsMaxChars: 0,
    ctaMaxChars: 0,
    visualIntentMaxChars: 160,
    contrastLabelMaxChars: 0,
    comparisonSideMaxChars: 110,
  },
  "feature-list": {
    titleMaxChars: 120,
    subtitleMaxChars: 0,
    bodyMinItems: 2,
    bodyMaxItems: 6,
    bodyItemMaxChars: 100,
    statsMaxChars: 0,
    ctaMaxChars: 0,
    visualIntentMaxChars: 160,
    contrastLabelMaxChars: 0,
    comparisonSideMaxChars: 100,
  },
  comparison: {
    titleMaxChars: 100,
    subtitleMaxChars: 0,
    bodyMinItems: 2,
    bodyMaxItems: 2,
    bodyItemMaxChars: 130,
    statsMaxChars: 0,
    ctaMaxChars: 0,
    visualIntentMaxChars: 160,
    contrastLabelMaxChars: 0,
    comparisonSideMaxChars: 130,
  },
  "contrast-card": {
    titleMaxChars: 110,
    subtitleMaxChars: 90,
    bodyMinItems: 2,
    bodyMaxItems: 2,
    bodyItemMaxChars: 140,
    statsMaxChars: 0,
    ctaMaxChars: 0,
    visualIntentMaxChars: 160,
    contrastLabelMaxChars: 42,
    comparisonSideMaxChars: 140,
  },
  "cta-final": {
    titleMaxChars: 100,
    subtitleMaxChars: 160,
    bodyMinItems: 0,
    bodyMaxItems: 0,
    bodyItemMaxChars: 0,
    statsMaxChars: 0,
    ctaMaxChars: 110,
    visualIntentMaxChars: 160,
    contrastLabelMaxChars: 0,
    comparisonSideMaxChars: 0,
  },
};

export function getContractForLayout(layoutType: LayoutType): LayoutContract {
  return LAYOUT_CONTRACTS[layoutType];
}

export function getContractForContentRole(role: ContentRole): LayoutContract {
  const { layoutType } = mapContentRoleToTypeLayout(role);
  return getContractForLayout(layoutType);
}

/** Human-readable line per layout (editorial). */
export function layoutConstraintLine(layoutType: LayoutType): string {
  const c = LAYOUT_CONTRACTS[layoutType];
  switch (layoutType) {
    case "hero-typography":
      return `hero-typography: title ≤${c.titleMaxChars} chars; subtitle ≤${c.subtitleMaxChars} or empty; 0–1 body lines ≤${c.bodyItemMaxChars} chars each; stats/cta must be empty.`;
    case "big-statement":
      return `big-statement: title ≤${c.titleMaxChars}; subtitle ≤${c.subtitleMaxChars} or empty; stats ≤${c.statsMaxChars} (include a digit for stat slides); 0–1 body line ≤${c.bodyItemMaxChars}.`;
    case "split-content":
      return `split-content: title ≤${c.titleMaxChars}; subtitle ≤${c.subtitleMaxChars} or empty; ${c.bodyMinItems}–${c.bodyMaxItems} bullets ≤${c.bodyItemMaxChars} chars each.`;
    case "feature-list":
      return `feature-list: title ≤${c.titleMaxChars}; subtitle must be empty; ${c.bodyMinItems}–${c.bodyMaxItems} bullets ≤${c.bodyItemMaxChars} chars each.`;
    case "comparison":
      return `comparison: title ≤${c.titleMaxChars}; exactly 2 body strings (before/after), each ≤${c.comparisonSideMaxChars} chars, similar length.`;
    case "contrast-card":
      return `contrast-card: title ≤${c.titleMaxChars}; subtitle ≤${c.subtitleMaxChars} or empty; contrastLabelA/B ≤${c.contrastLabelMaxChars} chars (must be specific, not generic); exactly 2 body strings (A/B), each ≤${c.comparisonSideMaxChars} chars, similar length.`;
    case "cta-final":
      return `cta-final: title ≤${c.titleMaxChars}; subtitle ≤${c.subtitleMaxChars} or empty; ctaText (button) ≤${c.ctaMaxChars} chars, required; body empty.`;
  }
}

/** Numeric limits per slide for prompts (replaces vague “keep it short”). */
export function formatNumericDeckConstraints(plan: DeckPlan): string {
  const lines = plan.slides.map((row, i) => {
    const { layoutType } = mapContentRoleToTypeLayout(row.contentRole);
    const c = getContractForLayout(layoutType);
    const parts = [
      `Slide ${i + 1} [${row.contentRole} → ${layoutType}]`,
      `title max ${c.titleMaxChars} chars`,
      `visualIntent max ${c.visualIntentMaxChars} chars`,
    ];
    if (c.subtitleMaxChars > 0) {
      parts.push(`subtitle max ${c.subtitleMaxChars} chars or ""`);
    } else {
      parts.push(`subtitle must be ""`);
    }
    parts.push(
      `body: min ${c.bodyMinItems} max ${c.bodyMaxItems} items; each item max ${
        layoutType === "comparison" || layoutType === "contrast-card"
          ? c.comparisonSideMaxChars
          : c.bodyItemMaxChars
      } chars (comparison: each side max ${c.comparisonSideMaxChars})`
    );
    if (c.contrastLabelMaxChars > 0) {
      parts.push(`contrastLabelA/B max ${c.contrastLabelMaxChars} chars`);
    }
    if (c.statsMaxChars > 0) {
      parts.push(`stats max ${c.statsMaxChars} chars ("" if none)`);
    } else {
      parts.push(`stats must be ""`);
    }
    if (c.ctaMaxChars > 0) {
      parts.push(`ctaText max ${c.ctaMaxChars} chars (required on this slide)`);
    } else {
      parts.push(`ctaText must be ""`);
    }
    return `  - ${parts.join("; ")}`;
  });
  return ["HARD CHARACTER LIMITS (schema-enforced — do not exceed):", ...lines].join("\n");
}

/** Plan-wide block for slide-generation prompts: role → layout → rules. */
export function formatLayoutDrivenPromptSection(plan: DeckPlan): string {
  const lines = plan.slides.map((row, i) => {
    const { layoutType } = mapContentRoleToTypeLayout(row.contentRole);
    return `  Slide ${i + 1}: (${row.contentRole} → ${layoutType}) ${layoutConstraintLine(layoutType)}`;
  });
  return [
    "LAYOUT STRUCTURE (each slide maps to a fixed layoutType — write copy within limits):",
    ...lines,
    "",
    formatNumericDeckConstraints(plan),
  ].join("\n");
}

/** Single-slide numeric limits for regeneration prompts (mirrors deck constraint row). */
export function formatSingleSlideNumericContract(
  plan: DeckPlan,
  index: number
): string {
  const row = plan.slides[index];
  if (!row) return "";
  const { layoutType } = mapContentRoleToTypeLayout(row.contentRole);
  const c = getContractForLayout(layoutType);
  const lines = [
    `Slide ${index + 1} (${row.contentRole} → ${layoutType})`,
    `- title: max ${c.titleMaxChars} characters`,
    `- visualIntent: max ${c.visualIntentMaxChars} characters`,
    c.subtitleMaxChars > 0
      ? `- subtitle: max ${c.subtitleMaxChars} chars or ""`
      : `- subtitle: must be ""`,
    `- body: ${c.bodyMinItems}–${c.bodyMaxItems} items; each item max ${
      layoutType === "comparison" || layoutType === "contrast-card"
        ? c.comparisonSideMaxChars
        : c.bodyItemMaxChars
    } chars`,
    c.statsMaxChars > 0
      ? `- stats: max ${c.statsMaxChars} chars; stat slides must include a digit`
      : `- stats: must be ""`,
    c.ctaMaxChars > 0
      ? `- ctaText: required, max ${c.ctaMaxChars} chars`
      : `- ctaText: must be ""`,
    c.contrastLabelMaxChars > 0
      ? `- contrastLabelA: required, max ${c.contrastLabelMaxChars} chars`
      : `- contrastLabelA: must be empty string`,
    c.contrastLabelMaxChars > 0
      ? `- contrastLabelB: required, max ${c.contrastLabelMaxChars} chars`
      : `- contrastLabelB: must be empty string`,
  ];
  return ["LAYOUT LIMITS FOR THIS SLIDE (do not exceed):", ...lines.map((l) => `  ${l}`)].join(
    "\n"
  );
}
