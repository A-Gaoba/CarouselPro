import type {
  AnalysisResult,
  ContentRole,
  DeckArchetype,
  DeckPlan,
  DeckRoleBudget,
  PlannedSlideRow,
} from "../types";

export const DECK_PLAN_VERSION = "deck-plan.v1" as const;

/** Phase 1 product caps — enforced after every plan parse. */
export const DEFAULT_ROLE_BUDGET: DeckRoleBudget = {
  hook_max: 1,
  cta_max: 1,
  list_max: 2,
  stat_max: 1,
  comparison_max: 1,
  contrast_max: 0,
};

const CONTENT_ROLES_LIST: ContentRole[] = [
  "hook",
  "insight",
  "list",
  "comparison",
  "contrast",
  "stat",
  "problem",
  "solution",
  "cta",
];

const ARCHETYPE_LIST: DeckArchetype[] = [
  "micro-tip",
  "educational",
  "myth-busting",
  "story",
  "breakdown",
  "promotion",
];

/** OpenAI strict JSON schema for the planning pass. */
export const DECK_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "string", enum: [DECK_PLAN_VERSION] },
    archetype: { type: "string", enum: [...ARCHETYPE_LIST] },
    targetSlides: { type: "integer", minimum: 5, maximum: 12 },
    allowedRoles: {
      type: "array",
      items: { type: "string", enum: [...CONTENT_ROLES_LIST] },
    },
    forbiddenRoles: {
      type: "array",
      items: { type: "string", enum: [...CONTENT_ROLES_LIST] },
    },
    roleBudget: {
      type: "object",
      additionalProperties: false,
      properties: {
        hook_max: { type: "integer" },
        cta_max: { type: "integer" },
        list_max: { type: "integer" },
        stat_max: { type: "integer" },
        comparison_max: { type: "integer" },
        contrast_max: { type: "integer" },
      },
      required: [
        "hook_max",
        "cta_max",
        "list_max",
        "stat_max",
        "comparison_max",
        "contrast_max",
      ],
    },
    slides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer", minimum: 0 },
          contentRole: { type: "string", enum: [...CONTENT_ROLES_LIST] },
          purpose: { type: "string" },
        },
        required: ["index", "contentRole", "purpose"],
      },
      minItems: 5,
      maxItems: 12,
    },
  },
  required: [
    "version",
    "archetype",
    "targetSlides",
    "allowedRoles",
    "forbiddenRoles",
    "roleBudget",
    "slides",
  ],
} as const;

function coerceContentRole(raw: string): ContentRole {
  const t = raw.trim().toLowerCase();
  return CONTENT_ROLES_LIST.includes(t as ContentRole)
    ? (t as ContentRole)
    : "insight";
}

function coerceArchetype(raw: string): DeckArchetype {
  const t = raw.trim().toLowerCase();
  return ARCHETYPE_LIST.includes(t as DeckArchetype)
    ? (t as DeckArchetype)
    : "educational";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function demoteExcess(
  slides: PlannedSlideRow[],
  role: ContentRole,
  max: number
): void {
  let n = 0;
  for (let i = 0; i < slides.length; i++) {
    if (slides[i].contentRole !== role) continue;
    n++;
    if (n > max) slides[i].contentRole = "insight";
  }
}

function resizeSlidesToTarget(
  slides: PlannedSlideRow[],
  target: number
): PlannedSlideRow[] {
  const t = clamp(target, 5, 12);
  if (slides.length === 0) {
    return Array.from({ length: t }, (_, i) => ({
      index: i,
      contentRole:
        i === 0 ? "hook" : i === t - 1 ? "cta" : ("insight" as ContentRole),
      purpose:
        i === 0
          ? "Hook the reader"
          : i === t - 1
            ? "Close with a clear action"
            : `Develop the narrative (${i + 1})`,
    }));
  }
  if (slides.length >= t) {
    const out = slides.slice(0, t).map((s, i) => ({
      ...s,
      index: i,
      purpose: String(s.purpose || "").slice(0, 300) || `Slide ${i + 1}`,
      contentRole: coerceContentRole(String(s.contentRole)),
    }));
    return out;
  }
  const out = slides.map((s, i) => ({
    ...s,
    index: i,
    purpose: String(s.purpose || "").slice(0, 300) || `Slide ${i + 1}`,
    contentRole: coerceContentRole(String(s.contentRole)),
  }));
  while (out.length < t) {
    const i = out.length;
    const isLast = i === t - 1;
    out.push({
      index: i,
      contentRole: isLast ? "cta" : "insight",
      purpose: isLast ? "Call to action" : `Bridge idea ${i + 1}`,
    });
  }
  return out;
}

/**
 * Parse model output, resize to targetSlides, enforce hook/cta boundaries,
 * role budgets, forbidden/allowed roles. Idempotent.
 */
export function normalizeAndEnforceDeckPlan(raw: Record<string, unknown>): DeckPlan {
  const archetype = coerceArchetype(String(raw.archetype ?? "educational"));
  let targetSlides = clamp(
    Number(raw.targetSlides) || 7,
    5,
    12
  );

  const allowedRaw = Array.isArray(raw.allowedRoles) ? raw.allowedRoles : [];
  const allowedRoles: ContentRole[] = allowedRaw.length
    ? allowedRaw.map((x) => coerceContentRole(String(x)))
    : [...CONTENT_ROLES_LIST];

  const forbiddenRaw = Array.isArray(raw.forbiddenRoles)
    ? raw.forbiddenRoles
    : [];
  const forbiddenRoles = forbiddenRaw.map((x) =>
    coerceContentRole(String(x))
  );

  const slidesRaw = Array.isArray(raw.slides) ? raw.slides : [];
  let slides: PlannedSlideRow[] = slidesRaw.map((item, i) => {
    const o = item as Record<string, unknown>;
    return {
      index: Number(o.index) >= 0 ? Number(o.index) : i,
      contentRole: coerceContentRole(String(o.contentRole ?? "insight")),
      purpose: String(o.purpose ?? "").slice(0, 300) || `Slide ${i + 1}`,
    };
  });
  slides.sort((a, b) => a.index - b.index);

  slides = resizeSlidesToTarget(slides, targetSlides);
  targetSlides = slides.length;

  slides.forEach((s, i) => {
    s.index = i;
  });

  const budget = { ...DEFAULT_ROLE_BUDGET };

  slides[0].contentRole = "hook";
  slides[targetSlides - 1].contentRole = "cta";

  for (let i = 1; i < targetSlides; i++) {
    if (slides[i].contentRole === "hook") slides[i].contentRole = "insight";
  }
  for (let i = 0; i < targetSlides - 1; i++) {
    if (slides[i].contentRole === "cta") slides[i].contentRole = "insight";
  }

  demoteExcess(slides, "list", budget.list_max);
  demoteExcess(slides, "stat", budget.stat_max);
  demoteExcess(slides, "comparison", budget.comparison_max);
  demoteExcess(slides, "contrast", budget.contrast_max);

  const forbidden = new Set(forbiddenRoles);
  const allowed = new Set(allowedRoles);

  const applyForbiddenAllowed = () => {
    for (const s of slides) {
      if (forbidden.has(s.contentRole)) s.contentRole = "insight";
      if (!allowed.has(s.contentRole)) s.contentRole = "insight";
    }
    slides[0].contentRole = "hook";
    slides[targetSlides - 1].contentRole = "cta";
    for (let i = 1; i < targetSlides; i++) {
      if (slides[i].contentRole === "hook") slides[i].contentRole = "insight";
    }
    for (let i = 0; i < targetSlides - 1; i++) {
      if (slides[i].contentRole === "cta") slides[i].contentRole = "insight";
    }
  };

  applyForbiddenAllowed();
  demoteExcess(slides, "list", budget.list_max);
  demoteExcess(slides, "stat", budget.stat_max);
  demoteExcess(slides, "comparison", budget.comparison_max);
  demoteExcess(slides, "contrast", budget.contrast_max);

  return {
    version: DECK_PLAN_VERSION,
    archetype,
    targetSlides,
    allowedRoles: [...new Set(allowedRoles)],
    forbiddenRoles: [...new Set(forbiddenRoles)],
    roleBudget: budget,
    slides,
  };
}

/** Deterministic plan when the planning API fails. */
export function buildFallbackDeckPlan(analysis: AnalysisResult): DeckPlan {
  const n =
    analysis.complexity === "low"
      ? 5
      : analysis.complexity === "high"
        ? 9
        : 7;
  const target = clamp(n, 5, 12);
  const slides: PlannedSlideRow[] = [];
  for (let i = 0; i < target; i++) {
    let role: ContentRole;
    if (i === 0) role = "hook";
    else if (i === target - 1) role = "cta";
    else if (i === Math.floor(target / 2)) role = "list";
    else if (i === 1) role = "insight";
    else role = "insight";
    slides.push({
      index: i,
      contentRole: role,
      purpose:
        i === 0
          ? "Pattern interrupt — state the tension"
          : i === target - 1
            ? analysis.ctaDirection.slice(0, 200)
            : role === "list"
              ? "Deliver structured takeaways from the brief"
              : "Explain one beat of the core message",
    });
  }
  return normalizeAndEnforceDeckPlan({
    version: DECK_PLAN_VERSION,
    archetype: "educational",
    targetSlides: target,
    allowedRoles: [...CONTENT_ROLES_LIST],
    forbiddenRoles: [],
    roleBudget: { ...DEFAULT_ROLE_BUDGET },
    slides,
  });
}

export function formatDeckPlanForPrompt(plan: DeckPlan): string {
  const lines = plan.slides.map(
    (s) =>
      `  Slide ${s.index + 1}: contentRole MUST be "${s.contentRole}" — ${s.purpose}`
  );
  return [
    `ARCHETYPE: ${plan.archetype}`,
    `TARGET SLIDES: ${plan.targetSlides} (exactly)`,
    `ALLOWED ROLES: ${plan.allowedRoles.join(", ")}`,
    plan.forbiddenRoles.length
      ? `FORBIDDEN ROLES: ${plan.forbiddenRoles.join(", ")}`
      : "FORBIDDEN ROLES: (none)",
    `ROLE BUDGET (do not exceed across deck): hook≤${plan.roleBudget.hook_max} cta≤${plan.roleBudget.cta_max} list≤${plan.roleBudget.list_max} stat≤${plan.roleBudget.stat_max} comparison≤${plan.roleBudget.comparison_max} contrast≤${plan.roleBudget.contrast_max}`,
    "FLOW TARGET: hook -> context/clarification -> contrast/proof -> insight/takeaway -> CTA",
    "SLIDE-BY-SLIDE PLAN:",
    ...lines,
  ].join("\n");
}
