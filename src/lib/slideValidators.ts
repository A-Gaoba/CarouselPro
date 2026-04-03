import type { ContentRole, DeckPlan, SlideContent } from "../types";
import { getContractForLayout } from "./layoutContracts";
import { mapContentRoleToTypeLayout } from "./layoutRoleMap";
import { bodyItemCount, isStatMeaningful } from "./slideStructuralValidation";

export type SlideValidationErrorCode =
  | "TITLE_TOO_LONG"
  | "SUBTITLE_TOO_LONG"
  | "SUBTITLE_NOT_ALLOWED"
  | "BODY_ITEM_TOO_LONG"
  | "BODY_COUNT_LOW"
  | "BODY_COUNT_HIGH"
  | "STAT_TOO_LONG"
  | "STAT_NOT_ALLOWED"
  | "STAT_REQUIRED"
  | "STAT_INVALID"
  | "CTA_TEXT_MISSING"
  | "CTA_TOO_LONG"
  | "CTA_LABEL_TOO_WORDY"
  | "CTA_NOT_ALLOWED"
  | "VISUAL_INTENT_TOO_LONG"
  | "CONTENT_ROLE_MISMATCH"
  | "LAST_SLIDE_CTA_INVALID"
  | "SLIDE_COUNT_MISMATCH"
  | "DUPLICATE_TITLE"
  | "GENERIC_TITLE"
  | "CONTRAST_LABEL_MISSING"
  | "CONTRAST_LABEL_TOO_LONG"
  | "CONTRAST_LABEL_GENERIC"
  | "QUESTION_WITHOUT_ANSWER"
  | "LAST_CONTENT_QUESTION"
  | "ROLE_SUPPORT_TEXT_REQUIRED";

/** Regeneration priority: HIGH and MEDIUM trigger repair; LOW accepts with optional warning. */
export type ValidationSeverity = "high" | "medium" | "low";

export interface SlideValidationError {
  code: SlideValidationErrorCode;
  field?: string;
  max?: number;
  min?: number;
  actual?: number;
  message: string;
}

export interface DeckValidationIssue {
  index: number;
  errors: SlideValidationError[];
}

/** Placeholder / empty titles — LOW severity (do not burn regen budget). */
const GENERIC_TITLE_KEYS = new Set([
  "slide",
  "title",
  "untitled",
  "carousel",
  "new slide",
  "tap here",
  "swipe",
  "instagram",
]);

export function normTitleKey(t: string): string {
  return String(t ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normContrastLabelKey(t: string): string {
  return String(t ?? "")
    .trim()
    .toLowerCase()
    // normalize punctuation/symbols while keeping Arabic letters
    .replace(/[^a-z0-9\u0600-\u06FF]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_CONTRAST_LABEL_KEYS = new Set([
  "before",
  "after",
  "old",
  "new",
  "old way",
  "new way",
  "old new",
  "new old",
  "قديم",
  "جديد",
  "قبل",
  "بعد",
]);

export function severityForCode(code: SlideValidationErrorCode): ValidationSeverity {
  switch (code) {
    case "SLIDE_COUNT_MISMATCH":
    case "CONTENT_ROLE_MISMATCH":
    case "LAST_SLIDE_CTA_INVALID":
    case "CTA_TEXT_MISSING":
    case "STAT_REQUIRED":
    case "STAT_INVALID":
    case "BODY_COUNT_LOW":
    case "STAT_NOT_ALLOWED":
    case "CTA_NOT_ALLOWED":
    case "DUPLICATE_TITLE":
    case "QUESTION_WITHOUT_ANSWER":
    case "LAST_CONTENT_QUESTION":
    case "ROLE_SUPPORT_TEXT_REQUIRED":
      return "high";
    case "TITLE_TOO_LONG":
    case "BODY_COUNT_HIGH":
    case "BODY_ITEM_TOO_LONG":
    case "CTA_TOO_LONG":
    case "CTA_LABEL_TOO_WORDY":
      return "medium";
    case "CONTRAST_LABEL_TOO_LONG":
      return "medium";
    case "CONTRAST_LABEL_MISSING":
    case "CONTRAST_LABEL_GENERIC":
      return "high";
    case "GENERIC_TITLE":
      return "low";
    default:
      return "low";
  }
}

export function issueMaxSeverity(issue: DeckValidationIssue): ValidationSeverity {
  let worst: ValidationSeverity = "low";
  for (const e of issue.errors) {
    const s = severityForCode(e.code);
    if (s === "high") return "high";
    if (s === "medium") worst = "medium";
  }
  return worst;
}

/** True if this slide should be considered for regeneration (any HIGH or MEDIUM error). */
export function issueNeedsRegeneration(issue: DeckValidationIssue): boolean {
  return issue.errors.some((e) => {
    const s = severityForCode(e.code);
    return s === "high" || s === "medium";
  });
}

/** True if deck has no HIGH/MEDIUM issues (LOW-only or clean). */
export function deckBlockingIssuesClear(issues: DeckValidationIssue[]): boolean {
  return !issues.some(
    (i) => i.index >= 0 && issueNeedsRegeneration(i)
  );
}

/** True if any slide still has a HIGH-severity error that would trigger regen. */
export function blockingIssuesHaveHighSeverity(
  issues: DeckValidationIssue[]
): boolean {
  return issues.some(
    (i) =>
      i.index >= 0 &&
      issueNeedsRegeneration(i) &&
      issueMaxSeverity(i) === "high"
  );
}

function severityRank(s: ValidationSeverity): number {
  if (s === "high") return 0;
  if (s === "medium") return 1;
  return 2;
}

/**
 * Worst slides first: HIGH before MEDIUM, then more errors, then lower index.
 */
export function sortIssuesForRegeneration(
  issues: DeckValidationIssue[]
): DeckValidationIssue[] {
  return issues
    .filter((i) => i.index >= 0 && issueNeedsRegeneration(i))
    .slice()
    .sort((a, b) => {
      const ra = severityRank(issueMaxSeverity(a));
      const rb = severityRank(issueMaxSeverity(b));
      if (ra !== rb) return ra - rb;
      if (b.errors.length !== a.errors.length) return b.errors.length - a.errors.length;
      return a.index - b.index;
    });
}

/** Errors most important for the model first (HIGH → MEDIUM → LOW). */
export function sortErrorsForPrompt(errors: SlideValidationError[]): SlideValidationError[] {
  return errors.slice().sort((a, b) => {
    const ra = severityRank(severityForCode(a.code));
    const rb = severityRank(severityForCode(b.code));
    if (ra !== rb) return ra - rb;
    return a.code.localeCompare(b.code);
  });
}

function pushIssue(
  issues: DeckValidationIssue[],
  index: number,
  err: SlideValidationError
): void {
  const found = issues.find((x) => x.index === index);
  if (found) {
    found.errors.push(err);
  } else {
    issues.push({ index, errors: [err] });
  }
}

/**
 * Validate one slide against plan row + layout contract. No mutation.
 */
export function validateSlide(
  slide: Omit<SlideContent, "id">,
  index: number,
  plan: DeckPlan
): SlideValidationError[] {
  const row = plan.slides[index];
  if (!row) {
    return [
      {
        code: "CONTENT_ROLE_MISMATCH",
        message: `No plan row for slide index ${index}`,
      },
    ];
  }

  const role = slide.contentRole ?? row.contentRole;
  if (role !== row.contentRole) {
    return [
      {
        code: "CONTENT_ROLE_MISMATCH",
        message: `Expected contentRole "${row.contentRole}", got "${slide.contentRole}"`,
      },
    ];
  }

  const { layoutType } = mapContentRoleToTypeLayout(row.contentRole);
  if (slide.layoutType !== layoutType) {
    return [
      {
        code: "CONTENT_ROLE_MISMATCH",
        message: `Expected layoutType "${layoutType}" for role ${row.contentRole}`,
      },
    ];
  }

  const c = getContractForLayout(layoutType);
  const errors: SlideValidationError[] = [];

  const title = String(slide.title ?? "").trim();
  if (title.length > c.titleMaxChars) {
    errors.push({
      code: "TITLE_TOO_LONG",
      field: "title",
      max: c.titleMaxChars,
      actual: title.length,
      message: `Title exceeds ${c.titleMaxChars} characters (got ${title.length}).`,
    });
  }

  const titleKey = normTitleKey(title);
  if (titleKey.length > 0) {
    if (titleKey.length <= 1) {
      errors.push({
        code: "GENERIC_TITLE",
        field: "title",
        message: "Title is too short or empty; use a specific, human headline.",
      });
    } else if (GENERIC_TITLE_KEYS.has(titleKey)) {
      errors.push({
        code: "GENERIC_TITLE",
        field: "title",
        message: `Title "${title}" is too generic; use specific copy for this slide.`,
      });
    }
  }

  const vi = String(slide.visualIntent ?? "").trim();
  if (vi.length > c.visualIntentMaxChars) {
    errors.push({
      code: "VISUAL_INTENT_TOO_LONG",
      field: "visualIntent",
      max: c.visualIntentMaxChars,
      actual: vi.length,
      message: `visualIntent exceeds ${c.visualIntentMaxChars} characters.`,
    });
  }

  const sub = String(slide.subtitle ?? "").trim();
  if (c.subtitleMaxChars === 0 && sub.length > 0) {
    errors.push({
      code: "SUBTITLE_NOT_ALLOWED",
      field: "subtitle",
      max: 0,
      actual: sub.length,
      message: "Subtitle must be empty for this layout.",
    });
  } else if (sub.length > c.subtitleMaxChars) {
    errors.push({
      code: "SUBTITLE_TOO_LONG",
      field: "subtitle",
      max: c.subtitleMaxChars,
      actual: sub.length,
      message: `Subtitle exceeds ${c.subtitleMaxChars} characters.`,
    });
  }

  // Question slides must not be empty; last content slide may not end on a bare question.
  const isQuestionTitle = /[؟?]\s*$/.test(title);

  // contrast-card semantic labels: must be specific, short, and not generic.
  if (layoutType === "contrast-card") {
    const labelA = String(slide.contrastLabelA ?? "").trim();
    const labelB = String(slide.contrastLabelB ?? "").trim();

    if (!labelA) {
      errors.push({
        code: "CONTRAST_LABEL_MISSING",
        field: "contrastLabelA",
        message: "contrastLabelA is required for contrast-card.",
      });
    } else if (labelA.length > c.contrastLabelMaxChars) {
      errors.push({
        code: "CONTRAST_LABEL_TOO_LONG",
        field: "contrastLabelA",
        max: c.contrastLabelMaxChars,
        actual: labelA.length,
        message: `contrastLabelA exceeds ${c.contrastLabelMaxChars} characters.`,
      });
    } else {
      const keyA = normContrastLabelKey(labelA);
      if (GENERIC_CONTRAST_LABEL_KEYS.has(keyA)) {
        errors.push({
          code: "CONTRAST_LABEL_GENERIC",
          field: "contrastLabelA",
          message: `contrastLabelA "${labelA}" is too generic; use a topic-aware editorial label.`,
        });
      }
    }

    if (!labelB) {
      errors.push({
        code: "CONTRAST_LABEL_MISSING",
        field: "contrastLabelB",
        message: "contrastLabelB is required for contrast-card.",
      });
    } else if (labelB.length > c.contrastLabelMaxChars) {
      errors.push({
        code: "CONTRAST_LABEL_TOO_LONG",
        field: "contrastLabelB",
        max: c.contrastLabelMaxChars,
        actual: labelB.length,
        message: `contrastLabelB exceeds ${c.contrastLabelMaxChars} characters.`,
      });
    } else {
      const keyB = normContrastLabelKey(labelB);
      if (GENERIC_CONTRAST_LABEL_KEYS.has(keyB)) {
        errors.push({
          code: "CONTRAST_LABEL_GENERIC",
          field: "contrastLabelB",
          message: `contrastLabelB "${labelB}" is too generic; use a topic-aware editorial label.`,
        });
      }
    }
  }

  const nBody = bodyItemCount(slide);
  if (nBody < c.bodyMinItems) {
    errors.push({
      code: "BODY_COUNT_LOW",
      field: "body",
      min: c.bodyMinItems,
      actual: nBody,
      message: `Body needs at least ${c.bodyMinItems} non-empty items (got ${nBody}).`,
    });
  }
  if (nBody > c.bodyMaxItems) {
    errors.push({
      code: "BODY_COUNT_HIGH",
      field: "body",
      max: c.bodyMaxItems,
      actual: nBody,
      message: `Body may have at most ${c.bodyMaxItems} items (got ${nBody}).`,
    });
  }

  const hasSupportText =
    sub.length > 0 ||
    (slide.body ?? []).some((line) => String(line).trim().length > 0);

  // Role-aware completeness:
  // insight/problem/solution slides should not be title-only.
  const roleNeedsSupport =
    row.contentRole === "insight" ||
    row.contentRole === "problem" ||
    row.contentRole === "solution";
  if (roleNeedsSupport && !hasSupportText) {
    errors.push({
      code: "ROLE_SUPPORT_TEXT_REQUIRED",
      field: "subtitle",
      message:
        `Slides with contentRole "${row.contentRole}" must include supporting text in subtitle or body (not title-only).`,
    });
  }

              const itemMax =
                layoutType === "comparison" || layoutType === "contrast-card"
                  ? c.comparisonSideMaxChars
                  : c.bodyItemMaxChars;
  (slide.body ?? []).forEach((line, i) => {
    const t = String(line).trim();
    if (!t) return;
    if (t.length > itemMax) {
      errors.push({
        code: "BODY_ITEM_TOO_LONG",
        field: `body[${i}]`,
        max: itemMax,
        actual: t.length,
        message: `Body item ${i + 1} exceeds ${itemMax} characters.`,
      });
    }
  });

  const stats = String(slide.stats ?? "").trim();
  if (c.statsMaxChars === 0 && stats.length > 0) {
    errors.push({
      code: "STAT_NOT_ALLOWED",
      field: "stats",
      message: "stats must be empty for this layout.",
    });
  } else if (stats.length > c.statsMaxChars) {
    errors.push({
      code: "STAT_TOO_LONG",
      field: "stats",
      max: c.statsMaxChars,
      actual: stats.length,
      message: `stats exceeds ${c.statsMaxChars} characters.`,
    });
  }

  if (row.contentRole === "stat") {
    if (!stats) {
      errors.push({
        code: "STAT_REQUIRED",
        field: "stats",
        message: "stat slide requires a non-empty stats field with at least one digit.",
      });
    } else if (!isStatMeaningful(stats)) {
      errors.push({
        code: "STAT_INVALID",
        field: "stats",
        message: "stat slide requires stats containing a digit (e.g. 3×, 40%, 2024).",
      });
    }
  }

  const cta = String(slide.ctaText ?? "").trim();
  if (c.ctaMaxChars === 0 && cta.length > 0) {
    errors.push({
      code: "CTA_NOT_ALLOWED",
      field: "ctaText",
      message: "ctaText must be empty except on the final CTA slide.",
    });
  } else if (cta.length > c.ctaMaxChars) {
    errors.push({
      code: "CTA_TOO_LONG",
      field: "ctaText",
      max: c.ctaMaxChars,
      actual: cta.length,
      message: `ctaText exceeds ${c.ctaMaxChars} characters.`,
    });
  }

  const isLast = index === plan.targetSlides - 1;
  if (isLast) {
    if (row.contentRole !== "cta") {
      errors.push({
        code: "LAST_SLIDE_CTA_INVALID",
        message: "Last slide in plan must be contentRole cta.",
      });
    }
    if (!cta) {
      errors.push({
        code: "CTA_TEXT_MISSING",
        field: "ctaText",
        message: "Final slide requires non-empty ctaText.",
      });
    }
  }

  // CTA button should be a short action label (1–3 words).
  if (row.contentRole === "cta" && cta) {
    const wordCount = cta.split(/\s+/).filter(Boolean).length;
    if (wordCount > 2) {
      errors.push({
        code: "CTA_LABEL_TOO_WORDY",
        field: "ctaText",
        message:
          "CTA button label must be short (1–2 words); keep longer phrasing in the subtitle.",
      });
    }
  }

  // Question-only slides are not allowed: ensure some answer/explanation text exists.
  if (isQuestionTitle && row.contentRole !== "hook") {
    if (!hasSupportText) {
      errors.push({
        code: "QUESTION_WITHOUT_ANSWER",
        field: "title",
        message:
          "Non-hook question slides must include an answer, hint, or follow-up explanation.",
      });
    }
  }

  // The last content slide before CTA must not end on a bare question.
  const lastContentIndex = plan.targetSlides - 2;
  if (index === lastContentIndex && isQuestionTitle && row.contentRole !== "cta") {
    errors.push({
      code: "LAST_CONTENT_QUESTION",
      field: "title",
      message:
        "The last content slide before the CTA must resolve the idea, not end on a bare question.",
    });
  }

  return errors;
}

export function validateDeck(
  slides: Omit<SlideContent, "id">[],
  plan: DeckPlan
): DeckValidationIssue[] {
  const issues: DeckValidationIssue[] = [];
  if (slides.length !== plan.targetSlides) {
    issues.push({
      index: -1,
      errors: [
        {
          code: "SLIDE_COUNT_MISMATCH",
          field: "slides",
          min: plan.targetSlides,
          actual: slides.length,
          message: `Expected ${plan.targetSlides} slides, got ${slides.length}.`,
        },
      ],
    });
    return issues;
  }
  slides.forEach((s, i) => {
    const e = validateSlide(s, i, plan);
    if (e.length) issues.push({ index: i, errors: e });
  });

  const seen = new Map<string, number>();
  slides.forEach((s, i) => {
    const key = normTitleKey(String(s.title ?? ""));
    if (!key) return;
    const firstIdx = seen.get(key);
    if (firstIdx !== undefined) {
      // The final CTA slide is static; never force regeneration of it.
      if (i === plan.targetSlides - 1) return;
      pushIssue(issues, i, {
        code: "DUPLICATE_TITLE",
        field: "title",
        message: `Title duplicates slide ${firstIdx + 1}; write a distinct headline for slide ${i + 1}.`,
      });
    } else {
      seen.set(key, i);
    }
  });

  return issues;
}
