import OpenAI from "openai";
import type {
  AnalysisResult,
  CarouselGoal,
  ContentRole,
  DeckPlan,
  LayoutType,
  PlannedSlideRow,
  SlideContent,
  SlideEmphasis,
  SlideType,
  ToneProfile,
  TopicComplexity,
} from "../types";
import {
  DECK_PLAN_JSON_SCHEMA,
  buildFallbackDeckPlan,
  formatDeckPlanForPrompt,
  normalizeAndEnforceDeckPlan,
} from "./deckPlan";
import { alignDeckToPlan } from "./ensureCompleteness";
import {
  formatLayoutDrivenPromptSection,
  formatSingleSlideNumericContract,
  getContractForLayout,
} from "./layoutContracts";
import {
  defaultEmphasisForRole,
  mapContentRoleToTypeLayout,
} from "./layoutRoleMap";
import {
  type SlideValidationError,
  blockingIssuesHaveHighSeverity,
  deckBlockingIssuesClear,
  sortErrorsForPrompt,
  sortIssuesForRegeneration,
  validateDeck,
} from "./slideValidators";

const MODEL = "gpt-4o-mini";

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY ?? "",
  dangerouslyAllowBrowser: true,
});

const CONTENT_ROLES: ContentRole[] = [
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

const EMPHASIS_VALUES: SlideEmphasis[] = [
  "hook",
  "title",
  "body",
  "balanced",
  "close",
];

const LAYOUT_TYPES: LayoutType[] = [
  "hero-typography",
  "big-statement",
  "split-content",
  "feature-list",
  "comparison",
  "contrast-card",
  "cta-final",
];

const SLIDE_TYPES: SlideType[] = [
  "hook",
  "problem",
  "value",
  "example",
  "cta",
];

const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    topic: { type: "string" },
    audience: { type: "string" },
    goal: { type: "string" },
    carouselGoal: {
      type: "string",
      enum: ["educational", "marketing", "storytelling", "awareness"],
    },
    complexity: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    toneProfile: {
      type: "string",
      enum: ["strong", "soft", "neutral"],
    },
    coreMessage: { type: "string" },
    keyPoints: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 7,
    },
    tone: { type: "string" },
    ctaDirection: { type: "string" },
  },
  required: [
    "topic",
    "audience",
    "goal",
    "carouselGoal",
    "complexity",
    "toneProfile",
    "coreMessage",
    "keyPoints",
    "tone",
    "ctaDirection",
  ],
} as const;

/** Phase 2.5: tighter budget; LOW-only issues accept without regen. */
const MAX_REGEN_PER_SLIDE = 1;
const MAX_REGEN_CALLS_TOTAL = 8;

/** Per-slide JSON schema from layout contract + fixed plan role (layout-driven). */
function buildSlideItemSchema(plan: DeckPlan, index: number): Record<string, unknown> {
  const row = plan.slides[index];
  const { layoutType } = mapContentRoleToTypeLayout(row.contentRole);
  const c = getContractForLayout(layoutType);
  const emph = defaultEmphasisForRole(row.contentRole);
  const itemCap =
    layoutType === "comparison" || layoutType === "contrast-card"
      ? c.comparisonSideMaxChars
      : c.bodyItemMaxChars;
  const isContrast = layoutType === "contrast-card";
  const required: string[] = [
    "contentRole",
    "emphasis",
    "visualIntent",
    "title",
    "subtitle",
  ];
  if (isContrast) {
    required.push("contrastLabelA", "contrastLabelB");
  }
  required.push("body", "stats", "ctaText");

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      contentRole: { type: "string", enum: [row.contentRole] },
      emphasis: { type: "string", enum: [emph] },
      visualIntent: { type: "string", maxLength: c.visualIntentMaxChars },
      title: { type: "string", maxLength: c.titleMaxChars },
      subtitle: { type: "string", maxLength: Math.max(c.subtitleMaxChars, 0) },
      ...(isContrast
        ? {
            contrastLabelA: {
              type: "string",
              maxLength: c.contrastLabelMaxChars,
            },
            contrastLabelB: {
              type: "string",
              maxLength: c.contrastLabelMaxChars,
            },
          }
        : {}),
      body: {
        type: "array",
        items: { type: "string", maxLength: itemCap },
        minItems: c.bodyMinItems,
        maxItems: c.bodyMaxItems,
      },
      stats: { type: "string", maxLength: Math.max(c.statsMaxChars, 0) },
      ctaText: { type: "string", maxLength: Math.max(c.ctaMaxChars, 0) },
    },
    required,
  };
}

function buildCarouselWrapperSchema(plan: DeckPlan): Record<string, unknown> {
  const n = plan.targetSlides;
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      slides: {
        type: "array",
        prefixItems: plan.slides.map((_, i) => buildSlideItemSchema(plan, i)),
        minItems: n,
        maxItems: n,
      },
    },
    required: ["slides"],
  };
}

function coerceCarouselGoal(raw: string): CarouselGoal {
  const t = raw.trim().toLowerCase();
  if (t === "educational" || t === "marketing" || t === "storytelling" || t === "awareness") {
    return t;
  }
  return "awareness";
}

function coerceComplexity(raw: string): TopicComplexity {
  const t = raw.trim().toLowerCase();
  if (t === "low" || t === "high") return t;
  return "medium";
}

function coerceToneProfile(raw: string): ToneProfile {
  const t = raw.trim().toLowerCase();
  if (t === "strong" || t === "soft" || t === "neutral") return t;
  return "neutral";
}

function cleanJsonString(text: string): string {
  const startIndex = text.indexOf("[");
  const endIndex = text.lastIndexOf("]");

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return text.substring(startIndex, endIndex + 1);
  }

  const objStartIndex = text.indexOf("{");
  const objEndIndex = text.lastIndexOf("}");
  if (objStartIndex !== -1 && objEndIndex !== -1 && objEndIndex > objStartIndex) {
    return text.substring(objStartIndex, objEndIndex + 1);
  }

  return text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
}

function coerceLayoutType(raw: string): LayoutType {
  const t = raw.trim().toLowerCase();
  if (LAYOUT_TYPES.includes(t as LayoutType)) return t as LayoutType;
  return "hero-typography";
}

function coerceSlideType(raw: string): SlideType {
  const t = raw.trim().toLowerCase();
  if (SLIDE_TYPES.includes(t as SlideType)) return t as SlideType;
  return "value";
}

function coerceEmphasis(raw: string, role: ContentRole): SlideEmphasis {
  const t = raw.trim().toLowerCase();
  if (EMPHASIS_VALUES.includes(t as SlideEmphasis)) return t as SlideEmphasis;
  return defaultEmphasisForRole(role);
}

function normalizeAnalysis(
  parsed: Record<string, unknown>,
  userInput: string
): AnalysisResult {
  const kp = parsed.keyPoints;
  let keyPoints: string[] = [];
  if (Array.isArray(kp)) {
    keyPoints = kp.map((x) => String(x).trim()).filter(Boolean);
  }
  if (keyPoints.length === 0) {
    keyPoints = [userInput.trim() || "Key idea", "Takeaway two"];
  }
  while (keyPoints.length < 2) {
    keyPoints.push(`Idea ${keyPoints.length + 1}`);
  }
  keyPoints = keyPoints.slice(0, 7);

  return {
    topic: String(parsed.topic || userInput).trim().slice(0, 200) || userInput.substring(0, 50),
    audience: String(parsed.audience || "General Audience").trim().slice(0, 200),
    goal: String(parsed.goal || "Inform and engage").trim().slice(0, 200),
    carouselGoal: coerceCarouselGoal(String(parsed.carouselGoal ?? "awareness")),
    complexity: coerceComplexity(String(parsed.complexity ?? "medium")),
    toneProfile: coerceToneProfile(String(parsed.toneProfile ?? "neutral")),
    coreMessage: String(parsed.coreMessage || userInput).trim().slice(0, 500),
    keyPoints,
    tone: String(parsed.tone || "Professional").trim().slice(0, 120),
    ctaDirection: String(parsed.ctaDirection || "Follow for more").trim().slice(0, 200),
  };
}

function normalizeSlide(
  raw: Record<string, unknown>,
  index: number
): Omit<SlideContent, "id"> {
  const roleStr = String(raw.contentRole ?? "").trim().toLowerCase();
  const hasStrategistRole =
    roleStr && CONTENT_ROLES.includes(roleStr as ContentRole);

  let type: SlideType;
  let layoutType: LayoutType;
  let contentRole: ContentRole | undefined;
  let emphasis: SlideEmphasis | undefined;

  if (hasStrategistRole) {
    contentRole = roleStr as ContentRole;
    const mapped = mapContentRoleToTypeLayout(contentRole);
    type = mapped.type;
    layoutType = mapped.layoutType;
    emphasis = coerceEmphasis(String(raw.emphasis ?? ""), contentRole);
  } else {
    layoutType = coerceLayoutType(String(raw.layoutType ?? ""));
    type = coerceSlideType(String(raw.type ?? ""));
  }

  let body: string[] = [];
  if (Array.isArray(raw.body)) {
    body = raw.body.map((x) => String(x).trim()).filter(Boolean);
  }

  const subtitleRaw = String(raw.subtitle ?? "").trim();
  const contrastLabelARaw = String(
    raw.contrastLabelA ?? ""
  ).trim();
  const contrastLabelBRaw = String(
    raw.contrastLabelB ?? ""
  ).trim();
  const statsRaw = String(raw.stats ?? "").trim();
  const ctaRaw = String(raw.ctaText ?? "").trim();

  const out: Omit<SlideContent, "id"> = {
    type,
    layoutType,
    visualIntent: String(raw.visualIntent ?? "").trim() || `Slide ${index + 1} focus`,
    title: String(raw.title ?? "Slide").trim() || "Slide",
    subtitle: subtitleRaw ? subtitleRaw : undefined,
    body: body.length > 0 ? body : undefined,
    stats: statsRaw ? statsRaw : undefined,
    ctaText: ctaRaw ? ctaRaw : undefined,
    contrastLabelA: contrastLabelARaw ? contrastLabelARaw : undefined,
    contrastLabelB: contrastLabelBRaw ? contrastLabelBRaw : undefined,
  };

  if (contentRole) out.contentRole = contentRole;
  if (emphasis) out.emphasis = emphasis;

  return out;
}

/** Force slide roles/types to match the editorial plan (model drift guard). */
function alignSlideToPlan(
  slide: Omit<SlideContent, "id">,
  planRow: PlannedSlideRow | undefined,
  index: number
): Omit<SlideContent, "id"> {
  if (!planRow) return slide;
  const role = planRow.contentRole;
  const mapped = mapContentRoleToTypeLayout(role);
  const vi = slide.visualIntent?.trim() || planRow.purpose.slice(0, 160);
  return {
    ...slide,
    contentRole: role,
    type: mapped.type,
    layoutType: mapped.layoutType,
    emphasis: defaultEmphasisForRole(role),
    visualIntent: vi || `Slide ${index + 1} focus`,
  };
}

function repairTruncatedJson(text: string): string {
  let cleaned = cleanJsonString(text.trim() || "{}");

  if (cleaned.startsWith("[") && !cleaned.endsWith("]")) {
    const lastObjEnd = cleaned.lastIndexOf("}");
    if (lastObjEnd !== -1) {
      cleaned = cleaned.substring(0, lastObjEnd + 1) + "]";
    } else {
      cleaned = "[]";
    }
  }

  if (cleaned.startsWith("{") && !cleaned.endsWith("}")) {
    const lastObjEnd = cleaned.lastIndexOf("}");
    if (lastObjEnd !== -1) {
      cleaned = cleaned.substring(0, lastObjEnd + 1);
    }
  }

  return cleaned;
}

function extractBalancedJson(input: string): string | null {
  const trimmed = input.trim();
  const openObj = trimmed.indexOf("{");
  const openArr = trimmed.indexOf("[");
  const preferObj =
    openObj !== -1 && (openArr === -1 || openObj <= openArr);
  const start = preferObj ? openObj : openArr;
  const openChar = preferObj ? "{" : "[";
  const closeChar = preferObj ? "}" : "]";
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const balanced = extractBalancedJson(t);
    if (balanced) {
      return JSON.parse(balanced);
    }
    const repaired = repairTruncatedJson(t);
    return JSON.parse(repaired);
  }
}

function slidesFromParsed(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.filter((x) => x && typeof x === "object") as Record<
      string,
      unknown
    >[];
  }
  if (parsed && typeof parsed === "object" && "slides" in parsed) {
    const s = (parsed as { slides?: unknown }).slides;
    if (Array.isArray(s)) {
      return s.filter((x) => x && typeof x === "object") as Record<
        string,
        unknown
      >[];
    }
  }
  return [];
}

function ensureSlideCount(
  slides: Omit<SlideContent, "id">[],
  plan: DeckPlan
): Omit<SlideContent, "id">[] {
  const target = plan.targetSlides;
  if (slides.length < target) {
    throw new Error(
      `Incomplete deck: expected ${target} slides, got ${slides.length}. Regenerate or retry.`
    );
  }
  const trimmed =
    slides.length > target
      ? slides.slice(0, target)
      : slides.slice();
  return trimmed.map((s, i) => alignSlideToPlan(s, plan.slides[i], i));
}

async function analyzeInput(userInput: string): Promise<AnalysisResult> {
  const prompt = `Analyze this input for an Instagram carousel. Be concise.

User input:
"${userInput}"

Extract:
- topic: max 10 words
- audience: who this is for
- goal: one short line (what success looks like)
- carouselGoal: one of educational | marketing | storytelling | awareness
- complexity: low (one simple idea, few angles) | medium | high (many angles or nuance)
- toneProfile: strong | soft | neutral (delivery, not brand adjectives)
- coreMessage: single most important takeaway
- keyPoints: 2–7 distinct ideas or facts to cover (no empty strings)
- tone: optional extra voice notes (e.g. professional, playful)
- ctaDirection: what the last slide should ask the viewer to do

Complexity hints:
- low → few key points, narrow topic
- high → broad topic, many key points, or deep explanation needed`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a strategic content analyst. Reply only with JSON matching the schema.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "carousel_analysis",
          strict: true,
          schema: ANALYSIS_JSON_SCHEMA,
        },
      },
      max_tokens: 1024,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    const cleaned = repairTruncatedJson(raw);
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return normalizeAnalysis(parsed, userInput);
  } catch (error) {
    console.error("Analysis Error:", error);
    return {
      topic: userInput.substring(0, 50),
      audience: "General Audience",
      goal: "Inform and engage",
      carouselGoal: "awareness",
      complexity: "medium",
      toneProfile: "neutral",
      coreMessage: userInput,
      keyPoints: [
        userInput.trim() || "Idea one",
        "Idea two",
        "Idea three",
      ],
      tone: "Professional",
      ctaDirection: "Follow for more",
    };
  }
}

async function createDeckPlan(
  analysis: AnalysisResult,
  userInput: string
): Promise<DeckPlan> {
  const prompt = `You are an editorial planner for Instagram carousels. Output JSON matching the schema exactly.

USER INPUT (verbatim context):
${JSON.stringify(userInput)}

ANALYSIS:
- Topic: ${analysis.topic}
- Audience: ${analysis.audience}
- Goal: ${analysis.goal}
- Carousel goal: ${analysis.carouselGoal}
- Complexity: ${analysis.complexity}
- Tone profile: ${analysis.toneProfile}
- Core message: ${analysis.coreMessage}
- Key points: ${analysis.keyPoints.join(" | ")}
- CTA direction: ${analysis.ctaDirection}

TASK:
1) Pick archetype that fits the brief.
2) Set targetSlides between 5 and 12 (start at 5 for simple topics, more for deep/broad).
3) allowedRoles: roles you intend to use (subset of hook, insight, list, comparison, contrast, stat, problem, solution, cta).
4) forbiddenRoles: roles that must not appear (often empty).
5) roleBudget: use hook_max 1, cta_max 1, list_max 2, stat_max 1, comparison_max 1, contrast_max 1 (server enforces).
6) slides: exactly targetSlides items with index 0..targetSlides-1. First slide contentRole hook; last slide contentRole cta. Each row: clear purpose for the writer.

Avoid redundant list/stat/comparison; diversify middle roles where it helps the story.`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a content strategist. Reply only JSON matching the schema.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "deck_plan",
          strict: true,
          schema: DECK_PLAN_JSON_SCHEMA,
        },
      },
      max_tokens: 2048,
    });
    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    const parsed = tryParseJson(raw);
    if (!parsed || typeof parsed !== "object") {
      return buildFallbackDeckPlan(analysis);
    }
    return normalizeAndEnforceDeckPlan(parsed as Record<string, unknown>);
  } catch (e) {
    console.warn("createDeckPlan failed, using fallback:", e);
    return buildFallbackDeckPlan(analysis);
  }
}

function buildSlidesUserPrompt(
  analysis: AnalysisResult,
  brandName: string,
  plan: DeckPlan
): string {
  const keyPointsStr = analysis.keyPoints.join(" | ");
  const slideCount = plan.targetSlides;
  const planBlock = formatDeckPlanForPrompt(plan);

  return `You are a senior carousel content strategist and editor. Build a story-driven Instagram carousel (light SaaS typography style — text only, no images).

BRIEF
Topic: ${analysis.topic}
Audience: ${analysis.audience}
Outcome (goal): ${analysis.goal}
Carousel goal type: ${analysis.carouselGoal}
Complexity: ${analysis.complexity}
Tone profile: ${analysis.toneProfile}
Core message: ${analysis.coreMessage}
Key ideas to cover: ${keyPointsStr}
Voice notes: ${analysis.tone}
CTA direction (last slide): ${analysis.ctaDirection}
Brand name (voice only): "${brandName}"

EDITORIAL PLAN (mandatory — slide order and roles are fixed)
${planBlock}

${formatLayoutDrivenPromptSection(plan)}

SLIDE COUNT: Return exactly ${slideCount} slides in "slides". Not more, not fewer.

STRICT ROLE MATCHING
- Slide at array index i MUST have contentRole exactly equal to the plan row for slide i+1 (same order as SLIDE-BY-SLIDE PLAN).
- Each contentRole implies a fixed layoutType (see LAYOUT STRUCTURE). Write copy that fits that layout’s blocks (hero ≠ list ≠ comparison ≠ CTA).
- visualIntent: one short line echoing the row purpose.

LAYOUT-DRIVEN COPY (mandatory)
- Follow HARD CHARACTER LIMITS above exactly (counts include spaces).
- hook (hero-typography): may be minimal (strong title only, or title + short subtitle).
- problem / solution: must include payoff text (subtitle or one body line); do not output title-only.
- insight (big-statement): must include supporting text (subtitle or one body line); do not output title-only.
- list (feature-list): subtitle must be ""; 2–6 bullets per limits.
- comparison: exactly two body strings (before vs after), each within per-side max.
- contrast (contrast-card): generate contrastLabelA and contrastLabelB as short, topic-aware editorial labels (do not use generic old/new/before/after); generate exactly two body strings (A text / B text), each within per-side max; optional short subtitle allowed.
- stat (big-statement): may be minimal; stats must include a digit. Supporting subtitle/body is optional.
- cta (cta-final): ctaText required; button label must be a short action phrase (1–2 words only); body must be [].
- If a non-hook title is a question (ends with ? or ؟), include answer/payoff text in subtitle or body.
- The last content slide before CTA must resolve the idea; do not end it as an unresolved question.

ANTI-PATTERNS
- Do not change roles from the plan.
- Do not repeat the same headline across slides.
- Do not exceed any max length — validation will reject the deck.

OUTPUT: JSON object { "slides": [ ... ] }. Each slide uses the schema max lengths for its index.`;
}

function parseSlidesFromModelText(
  text: string,
  analysis: AnalysisResult,
  plan: DeckPlan
): Omit<SlideContent, "id">[] | null {
  try {
    const parsed = tryParseJson(text);
    const rawSlides = slidesFromParsed(parsed);
    if (rawSlides.length === 0) return null;
    const slides = rawSlides.map((row, i) =>
      alignSlideToPlan(normalizeSlide(row, i), plan.slides[i], i)
    );
    return ensureSlideCount(slides, plan);
  } catch (e) {
    console.error("parseSlidesFromModelText:", e);
    if (
      e instanceof Error &&
      (e.message.includes("Incomplete deck") ||
        e.message.includes("Deck size mismatch"))
    ) {
      throw e;
    }
    return null;
  }
}

function normalizeSlideOutput(
  slide: Omit<SlideContent, "id">
): Omit<SlideContent, "id"> {
  const body = slide.body?.map((x) => String(x).trim()).filter(Boolean);
  let cta = slide.ctaText?.trim() || "";
  if (cta) {
    const parts = cta.split(/\s+/).filter(Boolean);
    if (parts.length > 2) {
      cta = parts.slice(0, 2).join(" ");
    }
  }
  return {
    ...slide,
    title: String(slide.title ?? "").trim(),
    subtitle: slide.subtitle?.trim() || undefined,
    visualIntent: String(slide.visualIntent ?? "").trim(),
    body: body?.length ? body : undefined,
    stats: slide.stats?.trim() || undefined,
    ctaText: cta || undefined,
    contrastLabelA: slide.contrastLabelA?.trim() || undefined,
    contrastLabelB: slide.contrastLabelB?.trim() || undefined,
  };
}

async function regenerateSingleSlide(
  index: number,
  plan: DeckPlan,
  analysis: AnalysisResult,
  brandName: string,
  deck: Omit<SlideContent, "id">[],
  errors: SlideValidationError[]
): Promise<Omit<SlideContent, "id"> | null> {
  const row = plan.slides[index];
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      slides: {
        type: "array",
        items: buildSlideItemSchema(plan, index),
        minItems: 1,
        maxItems: 1,
      },
    },
    required: ["slides"],
  };

  const otherTitles = deck
    .map((s, i) => (i !== index ? String(s.title ?? "").trim() : ""))
    .filter(Boolean);

  const prioritizedErrors = sortErrorsForPrompt(errors);
  const layoutBlock = formatSingleSlideNumericContract(plan, index);
  const currentTitle = String(deck[index]?.title ?? "").trim();

  const userPrompt = `Regenerate ONLY slide ${index + 1} of ${plan.targetSlides} (Instagram carousel).

${layoutBlock}

VALIDATION ISSUES (fix in order of severity — HIGH first):
${JSON.stringify(prioritizedErrors, null, 2)}

CURRENT TITLE (replace if it caused duplication or generic/length errors): "${currentTitle}"

PLAN ROW
- contentRole: ${row.contentRole}
- purpose: ${row.purpose}

BRIEF
- Topic: ${analysis.topic}
- Core message: ${analysis.coreMessage}
- Key ideas: ${analysis.keyPoints.join(" | ")}
- CTA direction (final slide): ${analysis.ctaDirection}
- Brand name (voice): "${brandName}"

ANTI-REPEAT
- Do not reuse any existing slide title from this deck: ${otherTitles.length ? otherTitles.map((t) => JSON.stringify(t)).join(", ") : "(none yet)"}
- Stat slides: stats must contain a digit. Final slide: non-empty ctaText within max length.
- Non-hook question slides must include payoff text (subtitle/body).
- CTA button label must stay short (1–3 words).

Return JSON only: { "slides": [ one object matching schema ] }`;

  const runStructured = () =>
    openai.chat.completions.create({
      model: MODEL,
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "You fix one carousel slide. Obey every max length in the user message. Output JSON only; no markdown. Do not repeat forbidden titles.",
        },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "carousel_slide_regen",
          strict: true,
          schema,
        },
      },
      max_tokens: 1024,
    });

  const runLoose = () =>
    openai.chat.completions.create({
      model: MODEL,
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "You fix one carousel slide. Obey character limits in the user message. Output JSON: {\"slides\":[ one object ]}. No markdown.",
        },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1024,
    });

  let completion: Awaited<ReturnType<typeof runStructured>>;
  try {
    completion = await runStructured();
  } catch (e) {
    console.warn("regen json_schema failed; using json_object:", e);
    completion = await runLoose();
  }

  try {
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    const parsed = text ? tryParseJson(text) : null;
    const rows = slidesFromParsed(parsed);
    if (rows.length < 1) {
      console.warn(`Regeneration parse: no slide for index ${index + 1}`);
      return null;
    }
    const normalized = normalizeSlide(rows[0], index);
    return alignSlideToPlan(normalized, plan.slides[index], index);
  } catch (e) {
    console.warn(`Regeneration parse failed for slide ${index + 1}:`, e);
    return null;
  }
}

function acceptDeckWithOptionalWarnings(
  slides: Omit<SlideContent, "id">[],
  plan: DeckPlan,
  reason: string
): Omit<SlideContent, "id">[] {
  const issues = validateDeck(slides, plan);
  if (issues.length > 0) {
    console.warn(`[carousel] ${reason}`, issues);
  }
  return slides.map(normalizeSlideOutput);
}

async function finalizeDeckWithRegeneration(
  initial: Omit<SlideContent, "id">[],
  plan: DeckPlan,
  analysis: AnalysisResult,
  brandName: string
): Promise<Omit<SlideContent, "id">[]> {
  let slides = alignDeckToPlan(initial, plan);
  const regenPerIndex = new Array(plan.targetSlides).fill(0);
  let totalRegenCalls = 0;

  while (totalRegenCalls < MAX_REGEN_CALLS_TOTAL) {
    const issues = validateDeck(slides, plan);
    if (issues.length === 0) {
      return slides.map(normalizeSlideOutput);
    }

    const structural = issues.find((i) => i.index === -1);
    if (structural) {
      throw new Error(structural.errors[0]?.message ?? "Deck validation failed.");
    }

    if (deckBlockingIssuesClear(issues)) {
      return acceptDeckWithOptionalWarnings(
        slides,
        plan,
        "Accepted deck with LOW-severity validation notes only."
      );
    }

    const ordered = sortIssuesForRegeneration(issues);
    const candidate = ordered.find(
      (i) => regenPerIndex[i.index] < MAX_REGEN_PER_SLIDE
    );

    if (!candidate) {
      if (!blockingIssuesHaveHighSeverity(issues)) {
        return acceptDeckWithOptionalWarnings(
          slides,
          plan,
          "Partial accept: regen budget exhausted; no HIGH-severity issues remain."
        );
      }
      throw new Error(
        `Carousel validation failed after regeneration attempts: ${JSON.stringify(issues, null, 2)}`
      );
    }

    const idx = candidate.index;
    regenPerIndex[idx] += 1;
    totalRegenCalls += 1;

    const replacement = await regenerateSingleSlide(
      idx,
      plan,
      analysis,
      brandName,
      slides,
      candidate.errors
    );
    if (replacement) {
      slides[idx] = replacement;
    }
  }

  const finalIssues = validateDeck(slides, plan);
  if (finalIssues.length === 0) {
    return slides.map(normalizeSlideOutput);
  }
  if (structuralFailure(finalIssues)) {
    throw new Error(
      finalIssues[0]?.errors[0]?.message ?? "Deck validation failed."
    );
  }
  if (deckBlockingIssuesClear(finalIssues)) {
    return acceptDeckWithOptionalWarnings(
      slides,
      plan,
      "Accepted after regen budget: LOW-only issues remain."
    );
  }
  if (!blockingIssuesHaveHighSeverity(finalIssues)) {
    return acceptDeckWithOptionalWarnings(
      slides,
      plan,
      "Partial accept after regen budget: MEDIUM issues only."
    );
  }
  throw new Error(
    `Exceeded regeneration budget with HIGH-severity issues: ${JSON.stringify(finalIssues, null, 2)}`
  );
}

function structuralFailure(issues: ReturnType<typeof validateDeck>): boolean {
  return issues.some((i) => i.index === -1);
}

async function generateSlidesFromAnalysis(
  analysis: AnalysisResult,
  brandName: string,
  plan: DeckPlan
): Promise<Omit<SlideContent, "id">[]> {
  const slideCount = plan.targetSlides;
  const userPrompt = buildSlidesUserPrompt(analysis, brandName, plan);
  const schema = buildCarouselWrapperSchema(plan);
  const systemStrict = `You are a premium carousel designer. Output JSON only. Exactly ${slideCount} slides in "slides". Each slide must include contentRole and emphasis. Slide i contentRole MUST match the editorial plan row i. Each role maps to a fixed layout — shape fields (body length, stats, ctaText) to that layout. Enums must match the schema.`;
  const systemLoose = `You are a premium carousel designer. Reply with a single JSON object: {"slides":[...]} with exactly ${slideCount} slides. Match each slide's contentRole to the provided plan in order; each role implies a layout — fit copy to that layout. Each slide: contentRole, emphasis, visualIntent, title, subtitle, body (array), stats, ctaText, contrastLabelA, contrastLabelB. No markdown.`;

  const runStructured = () =>
    openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemStrict },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "carousel_slides",
          strict: true,
          schema,
        },
      },
      max_tokens: 8192,
    });

  const runJsonObject = () =>
    openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemLoose },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 8192,
    });

  let completion: Awaited<ReturnType<typeof runStructured>>;
  try {
    completion = await runStructured();
  } catch (e) {
    console.warn("json_schema request failed; using json_object:", e);
    completion = await runJsonObject();
  }

  const content = completion.choices[0]?.message?.content?.trim() ?? "";
  if (completion.choices[0]?.finish_reason === "length") {
    console.warn("Slides response may be truncated (structured output).");
  }

  let slides = content ? parseSlidesFromModelText(content, analysis, plan) : null;

  if (!slides) {
    console.warn("Slides parse failed; retrying with json_object mode.");
    const fb = await runJsonObject();
    const fbText = fb.choices[0]?.message?.content?.trim() ?? "";
    slides = fbText ? parseSlidesFromModelText(fbText, analysis, plan) : null;
  }

  if (!slides) {
    throw new Error(
      "The AI returned slides we could not parse. Please try again."
    );
  }

  return slides;
}

export async function generateCarouselContent(
  userInput: string,
  brandName: string
): Promise<SlideContent[]> {
  const maxRetries = 2;
  let lastError: unknown = null;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const truncatedInput = userInput.substring(0, 5000);
      const analysis = await analyzeInput(truncatedInput);
      const plan = await createDeckPlan(analysis, truncatedInput);
      const rawSlides = await generateSlidesFromAnalysis(analysis, brandName, plan);
      const slides = await finalizeDeckWithRegeneration(
        rawSlides,
        plan,
        analysis,
        brandName
      );

      return slides.map((slide, index) => ({
        ...slide,
        id: `slide-${index}`,
      }));
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      lastError = error;
      if (i < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to generate carousel after multiple attempts.");
}
