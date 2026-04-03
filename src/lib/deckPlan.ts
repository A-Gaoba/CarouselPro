import type {
  AnalysisResult,
  ContentRole,
  DeckArchetype,
  DeckPlan,
  DeckRoleBudget,
  InformationValueType,
  PlannedSlideRow,
} from "../types";

export const DECK_PLAN_VERSION = "deck-plan.v1" as const;

/** Product minimum/maximum deck length (carousels must be > 6 slides). */
export const MIN_DECK_SLIDES = 7;
export const MAX_DECK_SLIDES = 12;

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

/** Allowed narrative value types; no two consecutive slides may share one. */
export const INFORMATION_VALUE_TYPES: InformationValueType[] = [
  "insight",
  "problem",
  "consequence",
  "example",
  "comparison",
  "statistic",
  "solution",
  "action",
];

/** Prefer this order when breaking ties so the deck rotates kinds of value. */
const VALUE_TYPE_ROTATION: InformationValueType[] = [
  ...INFORMATION_VALUE_TYPES,
];

/** Default valueType from editorial role (model may override; server enforces no consecutive dupes). */
export function defaultValueTypeFromRole(role: ContentRole): InformationValueType {
  switch (role) {
    case "hook":
      return "insight";
    case "list":
      return "example";
    case "comparison":
    case "contrast":
      return "comparison";
    case "stat":
      return "statistic";
    case "problem":
      return "problem";
    case "solution":
      return "solution";
    case "cta":
      return "action";
    case "insight":
    default:
      return "insight";
  }
}

function isInformationValueType(s: string): s is InformationValueType {
  return (INFORMATION_VALUE_TYPES as readonly string[]).includes(s);
}

export function coerceValueType(
  raw: unknown,
  role: ContentRole
): InformationValueType {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (t === "stat" || t === "stats") return "statistic";
  if (isInformationValueType(t)) return t;
  return defaultValueTypeFromRole(role);
}

/** Ensures each slide has a valid valueType and never matches the previous slide. */
export function enforceNoConsecutiveDuplicateValueTypes(
  slides: PlannedSlideRow[]
): void {
  for (let i = 0; i < slides.length; i++) {
    slides[i].valueType = coerceValueType(slides[i].valueType, slides[i].contentRole);
  }
  for (let i = 1; i < slides.length; i++) {
    const prev = slides[i - 1].valueType;
    if (slides[i].valueType !== prev) continue;
    const preferred = defaultValueTypeFromRole(slides[i].contentRole);
    if (preferred !== prev) {
      slides[i].valueType = preferred;
      continue;
    }
    const next = VALUE_TYPE_ROTATION.find((v) => v !== prev);
    slides[i].valueType = next ?? "problem";
  }
}

/** OpenAI strict JSON schema for the planning pass. */
export const DECK_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "string", enum: [DECK_PLAN_VERSION] },
    archetype: { type: "string", enum: [...ARCHETYPE_LIST] },
    targetSlides: { type: "integer", minimum: MIN_DECK_SLIDES, maximum: MAX_DECK_SLIDES },
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
          claim: { type: "string" },
          newInformation: { type: "string" },
          dependsOn: { type: "integer", minimum: -1 },
          mustNotRepeat: {
            type: "array",
            items: { type: "string" },
          },
          bridgeToNext: { type: "string" },
          valueType: {
            type: "string",
            enum: [...INFORMATION_VALUE_TYPES],
          },
        },
        required: [
          "index",
          "contentRole",
          "purpose",
          "claim",
          "newInformation",
          "dependsOn",
          "mustNotRepeat",
          "bridgeToNext",
          "valueType",
        ],
      },
      minItems: MIN_DECK_SLIDES,
      maxItems: MAX_DECK_SLIDES,
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

function normalizeDependsOn(raw: unknown, index: number): number {
  if (index === 0) return -1;
  const n = Number(raw);
  if (!Number.isInteger(n)) return index - 1;
  // Hard guard: dependency must always refer to a previous slide.
  if (n < 0 || n >= index) return index - 1;
  return n;
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
  const t = clamp(target, MIN_DECK_SLIDES, MAX_DECK_SLIDES);
  if (slides.length === 0) {
    return Array.from({ length: t }, (_, i) => {
      const role: ContentRole =
        i === 0 ? "hook" : i === t - 1 ? "cta" : "insight";
      return {
        index: i,
        contentRole: role,
        valueType: defaultValueTypeFromRole(role),
        purpose:
          i === 0
            ? "Hook the reader"
            : i === t - 1
              ? "Close with a clear action"
              : `Develop the narrative (${i + 1})`,
        claim:
          i === 0
            ? "Introduce the core tension."
            : i === t - 1
              ? "Convert interest into a clear action."
              : `Deliver the key point for beat ${i + 1}.`,
        newInformation:
          i === 0
            ? "Frames the topic and why it matters now."
            : i === t - 1
              ? "Adds final action path."
              : `Adds one new narrative layer for beat ${i + 1}.`,
        dependsOn: i === 0 ? -1 : i - 1,
        mustNotRepeat: [],
        bridgeToNext:
          i === t - 1 ? "End of story." : `Prepares context for slide ${i + 2}.`,
      };
    });
  }
  if (slides.length >= t) {
    const out = slides.slice(0, t).map((s, i) => {
      const role = coerceContentRole(String(s.contentRole));
      return {
        ...s,
        index: i,
        purpose: String(s.purpose || "").slice(0, 300) || `Slide ${i + 1}`,
        contentRole: role,
        valueType: coerceValueType(s.valueType, role),
        claim: String(s.claim || "").slice(0, 300) || `Claim for slide ${i + 1}.`,
        newInformation:
          String(s.newInformation || "").slice(0, 300) ||
          `New value added on slide ${i + 1}.`,
        dependsOn: normalizeDependsOn(s.dependsOn, i),
        mustNotRepeat: Array.isArray(s.mustNotRepeat)
          ? s.mustNotRepeat.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
          : [],
        bridgeToNext:
          String(s.bridgeToNext || "").slice(0, 300) ||
          (i === t - 1 ? "End of story." : `Bridge into slide ${i + 2}.`),
      };
    });
    return out;
  }
  const out = slides.map((s, i) => {
    const role = coerceContentRole(String(s.contentRole));
    return {
      ...s,
      index: i,
      purpose: String(s.purpose || "").slice(0, 300) || `Slide ${i + 1}`,
      contentRole: role,
      valueType: coerceValueType(s.valueType, role),
      claim: String(s.claim || "").slice(0, 300) || `Claim for slide ${i + 1}.`,
      newInformation:
        String(s.newInformation || "").slice(0, 300) ||
        `New value added on slide ${i + 1}.`,
      dependsOn: normalizeDependsOn(s.dependsOn, i),
      mustNotRepeat: Array.isArray(s.mustNotRepeat)
        ? s.mustNotRepeat.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
        : [],
      bridgeToNext:
        String(s.bridgeToNext || "").slice(0, 300) ||
        (i === t - 1 ? "End of story." : `Bridge into slide ${i + 2}.`),
    };
  });
  while (out.length < t) {
    const i = out.length;
    const isLast = i === t - 1;
    const role: ContentRole = isLast ? "cta" : "insight";
    out.push({
      index: i,
      contentRole: role,
      valueType: defaultValueTypeFromRole(role),
      purpose: isLast ? "Call to action" : `Bridge idea ${i + 1}`,
      claim: isLast ? "Ask for a concrete next step." : `Claim for slide ${i + 1}.`,
      newInformation: isLast
        ? "Introduces final action."
        : `New value for slide ${i + 1}.`,
      dependsOn: i === 0 ? -1 : i - 1,
      mustNotRepeat: [],
      bridgeToNext: isLast ? "End of story." : `Prepares slide ${i + 2}.`,
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
    Number(raw.targetSlides) || MIN_DECK_SLIDES,
    MIN_DECK_SLIDES,
    MAX_DECK_SLIDES
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
    const role = coerceContentRole(String(o.contentRole ?? "insight"));
    return {
      index: Number(o.index) >= 0 ? Number(o.index) : i,
      contentRole: role,
      valueType: coerceValueType(o.valueType, role),
      purpose: String(o.purpose ?? "").slice(0, 300) || `Slide ${i + 1}`,
      claim: String(o.claim ?? "").slice(0, 300) || `Claim for slide ${i + 1}`,
      newInformation:
        String(o.newInformation ?? "").slice(0, 300) ||
        `New value for slide ${i + 1}`,
      dependsOn: normalizeDependsOn(o.dependsOn, i),
      mustNotRepeat: Array.isArray(o.mustNotRepeat)
        ? o.mustNotRepeat.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
        : [],
      bridgeToNext:
        String(o.bridgeToNext ?? "").slice(0, 300) ||
        (i === targetSlides - 1 ? "End of story." : `Bridge into slide ${i + 2}`),
    };
  });
  slides.sort((a, b) => a.index - b.index);

  slides = resizeSlidesToTarget(slides, targetSlides);
  targetSlides = slides.length;

  slides.forEach((s, i) => {
    s.index = i;
    s.dependsOn = normalizeDependsOn(s.dependsOn, i);
    if (s.contentRole === "cta" && i > 0) s.dependsOn = i - 1;
    s.mustNotRepeat = Array.isArray(s.mustNotRepeat)
      ? s.mustNotRepeat.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
      : [];
    if (!s.claim?.trim()) s.claim = `Claim for slide ${i + 1}`;
    if (!s.newInformation?.trim()) s.newInformation = `New value for slide ${i + 1}`;
    if (!s.bridgeToNext?.trim()) {
      s.bridgeToNext = i === targetSlides - 1 ? "End of story." : `Bridge into slide ${i + 2}`;
    }
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

  slides.forEach((s) => {
    s.valueType = coerceValueType(s.valueType, s.contentRole);
  });
  enforceNoConsecutiveDuplicateValueTypes(slides);

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
      ? MIN_DECK_SLIDES
      : analysis.complexity === "high"
        ? 9
        : 7;
  const target = clamp(n, MIN_DECK_SLIDES, MAX_DECK_SLIDES);
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
      valueType: defaultValueTypeFromRole(role),
      purpose:
        i === 0
          ? "Pattern interrupt — state the tension"
          : i === target - 1
            ? analysis.ctaDirection.slice(0, 200)
            : role === "list"
              ? "Deliver structured takeaways from the brief"
              : "Explain one beat of the core message",
      claim:
        i === 0
          ? `Core tension in ${analysis.topic}`.slice(0, 280)
          : i === target - 1
            ? "Take the next step now."
            : `One meaningful claim about ${analysis.topic}`.slice(0, 280),
      newInformation:
        i === 0
          ? "Introduces why this topic matters."
          : i === target - 1
            ? "Converts understanding into action."
            : `Adds a distinct angle from key points: ${analysis.keyPoints[(i - 1) % analysis.keyPoints.length]}`.slice(
                0,
                280
              ),
      dependsOn: i === 0 ? -1 : i - 1,
      mustNotRepeat:
        i <= 1
          ? []
          : [
              analysis.coreMessage.slice(0, 80),
              ...slides.slice(0, i).map((x) => x.claim.slice(0, 70)),
            ].slice(0, 8),
      bridgeToNext:
        i === target - 1
          ? "End of story."
          : `Sets up slide ${i + 2} with a stronger reason to continue.`,
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
      `  Slide ${s.index + 1}: contentRole MUST be "${s.contentRole}" — ${s.purpose}
    valueType (kind of value this slide adds): ${s.valueType}
    claim: ${s.claim}
    newInformation: ${s.newInformation}
    dependsOn: ${s.dependsOn}
    mustNotRepeat: ${s.mustNotRepeat.length ? s.mustNotRepeat.join(" | ") : "(none)"}
    bridgeToNext: ${s.bridgeToNext}`
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
