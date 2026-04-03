import OpenAI from "openai";
import type {
  AnalysisResult,
  CarouselGoal,
  ContentLanguage,
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
  MIN_DECK_SLIDES,
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
import {
  ctaPassesLocalizedSemanticCheck,
  highestSemanticSeverity,
  semanticIssuesBySlide,
  type SemanticIssue,
  type SemanticValidationResult,
  validateDeckSemantics,
} from "./semanticValidators";

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
const MAX_REGEN_CALLS_TOTAL = 1;
const MAX_SEGMENT_REGEN_CALLS = 0;
const MAX_CTA_RESCUE_CALLS = 1;
const EARLY_WHOLE_DECK_RETRY_ERROR = "EARLY_WHOLE_DECK_RETRY";

const SEMANTIC_CRITIC_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["pass", "revise"] },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          slide: { type: "integer", minimum: 0 },
          type: {
            type: "string",
            enum: ["redundant", "empty", "weak", "invalid_role", "no_progression"],
          },
          reason: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["slide", "type", "reason", "severity"],
      },
    },
  },
  required: ["verdict", "issues"],
} as const;

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

/** Arabic script ranges (letters); used for heuristic language detection. */
const ARABIC_SCRIPT_CHARS =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

function detectContentLanguage(text: string): ContentLanguage {
  const s = text.trim();
  if (!s) return "en";
  const arabic = (s.match(ARABIC_SCRIPT_CHARS) || []).length;
  const latin = (s.match(/[a-zA-Z]/g) || []).length;
  const letters = arabic + latin;
  if (letters === 0) return "en";
  if (arabic > latin) return "ar";
  if (latin > arabic) return "en";
  if (arabic > 0) return "ar";
  return "en";
}

/** Infer carousel output language from raw input and extracted analysis fields. */
function inferLanguageFromAnalysisInputs(
  userInput: string,
  topic: string,
  keyPoints: string[],
  coreMessage: string
): ContentLanguage {
  const combined = [userInput, topic, coreMessage, ...keyPoints].join("\n");
  return detectContentLanguage(combined);
}

/** Shared language rules for all slide-generation and regen prompts. */
function formatLanguageConstraintsForPrompt(analysis: AnalysisResult): string {
  if (analysis.language === "ar") {
    return `LANGUAGE (MANDATORY)
Target language: Arabic (ar).
- Write ALL content in Arabic. Do NOT use English.
- Output must be entirely in the target language. Mixing languages is not allowed.`;
  }
  return `LANGUAGE (MANDATORY)
Target language: English (en).
- Write ALL content in English.
- Output must be entirely in the target language. Mixing languages is not allowed.`;
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

  const topic =
    String(parsed.topic || userInput).trim().slice(0, 200) ||
    userInput.substring(0, 50);
  const coreMessage = String(parsed.coreMessage || userInput)
    .trim()
    .slice(0, 500);
  const language = inferLanguageFromAnalysisInputs(
    userInput,
    topic,
    keyPoints,
    coreMessage
  );

  return {
    topic,
    audience: String(parsed.audience || "General Audience").trim().slice(0, 200),
    goal: String(parsed.goal || "Inform and engage").trim().slice(0, 200),
    carouselGoal: coerceCarouselGoal(String(parsed.carouselGoal ?? "awareness")),
    complexity: coerceComplexity(String(parsed.complexity ?? "medium")),
    toneProfile: coerceToneProfile(String(parsed.toneProfile ?? "neutral")),
    coreMessage,
    keyPoints,
    tone: String(parsed.tone || "Professional").trim().slice(0, 120),
    ctaDirection: String(parsed.ctaDirection || "Follow for more").trim().slice(0, 200),
    language,
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

Language:
- Write topic, keyPoints, coreMessage, and ctaDirection in the SAME language as the user input (Arabic if the input is Arabic; English if the input is English).

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
    const topic = userInput.substring(0, 50);
    const keyPoints = [
      userInput.trim() || "Idea one",
      "Idea two",
      "Idea three",
    ];
    const coreMessage = userInput;
    return {
      topic,
      audience: "General Audience",
      goal: "Inform and engage",
      carouselGoal: "awareness",
      complexity: "medium",
      toneProfile: "neutral",
      coreMessage,
      keyPoints,
      tone: "Professional",
      ctaDirection: "Follow for more",
      language: inferLanguageFromAnalysisInputs(
        userInput,
        topic,
        keyPoints,
        coreMessage
      ),
    };
  }
}

async function createDeckPlan(
  analysis: AnalysisResult,
  userInput: string
): Promise<DeckPlan> {
  const planLang =
    analysis.language === "ar"
      ? "Arabic"
      : "English";
  const prompt = `You are an editorial planner for Instagram carousels. Output JSON matching the schema exactly.

USER INPUT (verbatim context):
${JSON.stringify(userInput)}

TARGET LANGUAGE FOR PLAN TEXT: ${analysis.language} (${planLang})
Write every slide row field that will guide the writer (purpose, claim, newInformation, mustNotRepeat items, bridgeToNext) in ${planLang}. Do not write those fields in a different language than the user's content.

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
2) Set targetSlides between 7 and 12 (minimum 7 slides; never 6 or fewer).
3) allowedRoles: roles you intend to use (subset of hook, insight, list, comparison, contrast, stat, problem, solution, cta).
4) forbiddenRoles: roles that must not appear (often empty).
5) roleBudget: use hook_max 1, cta_max 1, list_max 2, stat_max 1, comparison_max 1, contrast_max 1 (server enforces).
6) slides: exactly targetSlides items with index 0..targetSlides-1. First slide contentRole hook; last slide contentRole cta.
7) For EACH slide row include semantic fields:
   - purpose: execution direction for writer
   - claim: concrete statement this slide makes
   - newInformation: what NEW value this slide adds vs earlier slides
   - dependsOn: prior slide index this builds on (-1 for opener)
   - mustNotRepeat: concepts this slide must avoid repeating
   - bridgeToNext: what this slide sets up for the next one
   - valueType: exactly one of insight | problem | consequence | example | comparison | statistic | solution | action — the kind of narrative value this slide introduces (orthogonal to contentRole). No two consecutive slides may use the same valueType.
8) dependsOn MUST be -1 for index 0; for all other slides it MUST be a previous index (< current index), never self.

Avoid filler rows. Every middle slide must advance narrative logic and avoid semantic repetition. Vary valueType across the deck so each slide adds a different kind of value than the slide before it.`;

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
  const semanticGuardrails = plan.slides
    .map(
      (row, i) =>
        `Slide ${i + 1} semantic target:
- valueType: ${row.valueType} (${
          i > 0
            ? `must differ from previous slide (${plan.slides[i - 1].valueType})`
            : "opening slide"
        })
- claim: ${row.claim}
- newInformation: ${row.newInformation}
- dependsOn: ${row.dependsOn}
- mustNotRepeat: ${row.mustNotRepeat.length ? row.mustNotRepeat.join(" | ") : "(none)"}
- bridgeToNext: ${row.bridgeToNext}`
    )
    .join("\n");
  const priorCoverageGuide = plan.slides
    .map((row, i) => {
      const prevClaims = plan.slides
        .slice(0, i)
        .map((x) => x.claim)
        .filter(Boolean)
        .join(" | ");
      return `Slide ${i + 1} previous coverage summary: ${prevClaims || "(none - opener)"}`;
    })
    .join("\n");

  return `You are a senior content strategist and storytelling expert specialized in high-quality Instagram carousels.

${formatLanguageConstraintsForPrompt(analysis)}

Your task is to generate a FULL carousel that reads as ONE connected story, not separate slides.

CORE RULE (CRITICAL)
This is NOT a collection of slides.
This is a STORY.
Each slide MUST:
- build on the previous one
- introduce NEW information
- move the narrative forward
If a slide repeats the same idea, it is wrong and must be rewritten.

STORY STRUCTURE
Follow this progression while honoring the fixed editorial plan:
1) Hook -> introduce tension or idea
2) Context -> explain why this matters
3) Expansion -> deepen understanding
4) Problem/contrast -> show what goes wrong
5) Solution -> provide method or approach
6) CTA -> clear action

THINKING STEP (MANDATORY)
Before writing slides, internally plan:
- the main idea
- progression of ideas
- what each slide adds
Do NOT output your thinking.

BRIEF
Detected output language: ${analysis.language} (${analysis.language === "ar" ? "Arabic" : "English"})
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

EDITORIAL PLAN (MANDATORY — ORDER, ROLES, AND SLIDE COUNT ARE FIXED)
${planBlock}

SEMANTIC PLAN TARGETS (MANDATORY)
${semanticGuardrails}

PREVIOUS COVERAGE SUMMARY (MANDATORY FOR SEMANTIC DELTA)
${priorCoverageGuide}

SEMANTIC RULES
- Each slide must answer a different question.
- Each slide must add NEW value.
- INFORMATION VALUE TYPE (from plan valueType): each slide must introduce a different kind of value than the previous slide — insight, problem, consequence, example, comparison, statistic, solution, or action. Never use the same valueType twice in a row.
- Avoid repeating previous claims, even with different wording.
- Respect mustNotRepeat concepts from the plan row.
- dependsOn means the slide must connect to that earlier slide explicitly.
- bridgeToNext means the slide should naturally prepare the next slide.

STRICT ROLE MATCHING
- Slide at array index i MUST have contentRole exactly equal to the plan row for slide i+1.
- Each contentRole implies a fixed layoutType; write copy that fits that layout.
- visualIntent: one short line echoing the row purpose.

ROLE ENFORCEMENT
- Hook: must include meaningful context (not empty).
- Problem: must include specific consequences, costs, or risks.
- Solution: must describe HOW (steps, method, mechanism), not only what.
- CTA: must include a clear, direct imperative request and feel like the natural conclusion from previous slides.
- CTA must end in an explicit action ask (${
    analysis.language === "ar"
      ? "examples in Arabic: تابع الآن / ابدأ اليوم / راسلنا"
      : "e.g. Follow now / Start today / DM us"
  }).
- CTA must NOT be only a summary, reflection, or generic closing statement.
${
  analysis.language === "ar"
    ? `
ARABIC ROLE QUALITY (MANDATORY — Arabic decks)
- Problem (مشكلة): state concrete pain, risk, cost, delay, or friction in Arabic (not a vague headline).
- Solution (حل): describe steps, method, or how-to in Arabic (mechanism, not slogans).
- CTA (دعوة لاتخاذ إجراء): end the story with a direct Arabic imperative; ctaText must read as a command (e.g. تابع الآن، ابدأ الآن، جرّب الآن، اكتشف المزيد، تواصل معنا) — 1–2 words on the button, verb-led.
`
    : ""
}

${formatLayoutDrivenPromptSection(plan)}

LAYOUT-DRIVEN COPY (MANDATORY)
- Follow HARD CHARACTER LIMITS exactly (counts include spaces).
- hook (hero-typography): title + meaningful context via subtitle/body when needed.
- problem / solution: must include payoff/supporting text; no title-only slide.
- insight (big-statement): must include supporting text; no title-only slide.
- list (feature-list): subtitle must be ""; 2–6 bullets per limits.
- comparison: exactly two body strings (before vs after), each within per-side max.
- contrast (contrast-card): generate specific contrastLabelA/B; exactly two body strings (A/B), each within per-side max.
- stat (big-statement): stats must include a digit.
- cta (cta-final): title is a short closing line; ctaText required — ${
    analysis.language === "ar"
      ? "Arabic imperative opening (e.g. تابع، ابدأ، جرّب، اكتشف، تواصل، احجز); 1–2 words only"
      : "MUST start with an imperative verb (1–2 words only)"
  }; body must be [] or minimal.
- If a non-hook title is a question, include answer/payoff text in subtitle or body.
- The last content slide before CTA must resolve the idea.

ANTI-PATTERNS (FORBIDDEN)
- repeating the same idea in different words
- empty slides
- weak middle slides
- disconnected CTA
- generic statements

FINAL CHECK (MANDATORY)
Before returning:
- ensure no redundancy
- ensure logical flow
- ensure CTA is actionable
If not, fix internally before output.

SLIDE COUNT: Return exactly ${slideCount} slides in "slides". Minimum allowed: ${MIN_DECK_SLIDES} (never 6 or fewer).
OUTPUT: JSON object { "slides": [ ... ] } only.`;
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

function summarizeSlidesForCritic(slides: Omit<SlideContent, "id">[]): string {
  return slides
    .map((s, i) => {
      const body = (s.body ?? []).join(" | ");
      return `Slide ${i + 1} [${s.contentRole ?? "unknown"}]
- title: ${s.title}
- subtitle: ${s.subtitle ?? ""}
- body: ${body}
- stats: ${s.stats ?? ""}
- cta: ${s.ctaText ?? ""}`;
    })
    .join("\n");
}

function coerceSemanticType(
  raw: string
): "redundant" | "empty" | "weak" | "invalid_role" | "no_progression" {
  const t = raw.trim().toLowerCase();
  if (
    t === "redundant" ||
    t === "empty" ||
    t === "weak" ||
    t === "invalid_role" ||
    t === "no_progression"
  ) {
    return t;
  }
  return "weak";
}

function coerceSemanticSeverity(raw: string): "high" | "medium" | "low" {
  const t = raw.trim().toLowerCase();
  if (t === "high" || t === "medium" || t === "low") return t;
  return "medium";
}

function normalizeSemanticResult(parsed: unknown): SemanticValidationResult {
  if (!parsed || typeof parsed !== "object") {
    return { verdict: "pass", issues: [] };
  }
  const p = parsed as Record<string, unknown>;
  const issuesRaw = Array.isArray(p.issues) ? p.issues : [];
  const issues: SemanticIssue[] = issuesRaw
    .map((row) => {
      const r = row as Record<string, unknown>;
      const slide = Math.max(0, Number(r.slide) || 0);
      const reason = String(r.reason ?? "").trim();
      if (!reason) return null;
      return {
        slide,
        type: coerceSemanticType(String(r.type ?? "weak")),
        reason: reason.slice(0, 300),
        severity: coerceSemanticSeverity(String(r.severity ?? "medium")),
      } as SemanticIssue;
    })
    .filter((x): x is SemanticIssue => Boolean(x));

  return {
    verdict: issues.length > 0 ? "revise" : "pass",
    issues,
  };
}

function mergeSemanticResults(
  localResult: SemanticValidationResult,
  criticResult: SemanticValidationResult
): SemanticValidationResult {
  const key = (x: SemanticIssue) => `${x.slide}:${x.type}:${x.reason}`;
  const seen = new Set<string>();
  const merged: SemanticIssue[] = [];
  for (const issue of [...localResult.issues, ...criticResult.issues]) {
    const k = key(issue);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(issue);
  }
  return {
    verdict: merged.length > 0 ? "revise" : "pass",
    issues: merged,
  };
}

async function runSemanticCritic(
  slides: Omit<SlideContent, "id">[],
  plan: DeckPlan
): Promise<SemanticValidationResult> {
  const localResult = validateDeckSemantics(slides, plan, "en");
  const criticPrompt = `Review this carousel for semantic storytelling quality.

Return JSON with:
- verdict: pass | revise
- issues: [{slide,type,reason,severity}]

Criteria:
1) Redundancy: detect repeated ideas, not just repeated wording.
2) Contribution: each slide must add new value.
3) Role correctness: problem must contain real problem; solution must answer prior problem.
4) Narrative flow: each slide should follow from prior slide.
5) CTA justification: CTA must be supported by previous slides.

DECK PLAN:
${formatDeckPlanForPrompt(plan)}

SLIDES:
${summarizeSlidesForCritic(slides)}

Only output JSON matching schema.`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are a strict semantic critic for story-driven carousel coherence. Output JSON only.",
        },
        { role: "user", content: criticPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "semantic_critic",
          strict: true,
          schema: SEMANTIC_CRITIC_JSON_SCHEMA,
        },
      },
      max_tokens: 1800,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = tryParseJson(text);
    const criticResult = normalizeSemanticResult(parsed);
    return mergeSemanticResults(localResult, criticResult);
  } catch (e) {
    console.warn("semantic critic failed; using local semantic validator only:", e);
    return localResult;
  }
}

function contiguousProblemSegment(
  issues: SemanticIssue[],
  upperBound: number
): number[] {
  const candidates = [...new Set(issues.map((i) => i.slide))]
    .filter((x) => x >= 0 && x < upperBound)
    .sort((a, b) => a - b);
  if (candidates.length < 2) return [];
  for (let i = 0; i < candidates.length - 1; i++) {
    if (candidates[i + 1] === candidates[i] + 1) {
      return [candidates[i], candidates[i + 1]];
    }
  }
  return [];
}

function ctaSemanticIssues(
  semantic: SemanticValidationResult,
  ctaIndex: number
): SemanticIssue[] {
  /** Only issues that warrant an LLM CTA fix — never weak / no_progression. */
  return semantic.issues.filter(
    (i) =>
      i.slide === ctaIndex &&
      i.type !== "weak" &&
      i.type !== "no_progression" &&
      (i.type === "invalid_role" || i.type === "empty")
  );
}

function onlyFinalSlideHasIssues(
  semantic: SemanticValidationResult,
  ctaIndex: number
): boolean {
  const relevant = semantic.issues.filter(
    (i) => i.type !== "weak" && i.type !== "no_progression"
  );
  if (relevant.length === 0) return false;
  return relevant.every((i) => i.slide === ctaIndex);
}

function weakRescueTargets(
  semantic: SemanticValidationResult,
  upperExclusive: number
): number[] {
  const rank = (s: SemanticIssue["severity"]) => (s === "high" ? 3 : s === "medium" ? 2 : 1);
  const grouped = new Map<number, number>();
  for (const issue of semantic.issues) {
    if (issue.slide < 0 || issue.slide >= upperExclusive) continue;
    if (issue.type !== "weak" && issue.type !== "redundant" && issue.type !== "no_progression") continue;
    grouped.set(issue.slide, (grouped.get(issue.slide) ?? 0) + rank(issue.severity));
  }
  return [...grouped.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([idx]) => idx);
}

function trimCtaLabelToMaxWords(label: string, maxWords: 2): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= maxWords) return parts.join(" ");
  return parts.slice(0, maxWords).join(" ");
}

/**
 * Local CTA repair: short label, fallbacks, no API calls.
 * Fixes CTA_LABEL_TOO_WORDY and missing ctaText before structural validation.
 */
function autoFixCtaSlide(
  slides: Omit<SlideContent, "id">[],
  plan: DeckPlan,
  analysis: AnalysisResult
): { slides: Omit<SlideContent, "id">[]; changed: boolean } {
  let changed = false;
  const idx = plan.targetSlides - 1;
  if (idx < 0 || idx >= slides.length) return { slides, changed: false };
  const row = plan.slides[idx];
  if (!row || row.contentRole !== "cta") return { slides, changed: false };

  const next = slides.map((s) => ({ ...s }));
  let s = { ...next[idx] };
  const c = getContractForLayout(s.layoutType);

  if ((s.body?.length ?? 0) > 0) {
    s.body = undefined;
    changed = true;
  }

  let cta = String(s.ctaText ?? "").trim();
  const subtitleForCtaCheck = String(s.subtitle ?? "").trim();
  if (!cta) {
    cta = analysis.language === "ar" ? "ابدأ الآن" : "Start Now";
    changed = true;
  } else if (cta.split(/\s+/).filter(Boolean).length > 2) {
    cta = trimCtaLabelToMaxWords(cta, 2);
    changed = true;
  }
  if (c.ctaMaxChars > 0 && cta.length > c.ctaMaxChars) {
    cta = cta.slice(0, c.ctaMaxChars).trim();
    changed = true;
  }
  if (
    analysis.language === "ar" &&
    !ctaPassesLocalizedSemanticCheck(cta, subtitleForCtaCheck, "ar")
  ) {
    const fallbacks = ["ابدأ الآن", "تابع الآن", "جرّب الآن"] as const;
    cta = fallbacks[idx % fallbacks.length];
    changed = true;
  }
  s.ctaText = cta;

  let title = String(s.title ?? "").trim();
  if (!title) {
    const fallbackTitle =
      analysis.language === "ar" ? "الخطوة التالية" : "Take the next step";
    title = (analysis.ctaDirection || fallbackTitle).slice(0, c.titleMaxChars).trim();
    s.title = title || (analysis.language === "ar" ? "التالي" : "Next step");
    changed = true;
  }

  const sub = String(s.subtitle ?? "").trim();
  if (!sub && c.subtitleMaxChars > 0) {
    const raw =
      analysis.ctaDirection.trim() ||
      (analysis.language === "ar"
        ? "اضغط أدناه للمتابعة."
        : "Tap below while this is still fresh.");
    s.subtitle = raw.slice(0, c.subtitleMaxChars).trim();
    changed = true;
  }

  const vi = String(s.visualIntent ?? "").trim();
  if (!vi) {
    s.visualIntent = row.purpose.slice(0, c.visualIntentMaxChars);
    changed = true;
  }

  s = alignSlideToPlan(s, row, idx);
  next[idx] = s;
  return { slides: next, changed };
}

function autoFixStatsOverflow(
  slides: Omit<SlideContent, "id">[]
): { slides: Omit<SlideContent, "id">[]; changed: boolean } {
  let changed = false;
  const next = slides.map((s) => ({ ...s }));
  for (let i = 0; i < next.length; i++) {
    const stats = String(next[i].stats ?? "").trim();
    if (!stats) continue;
    const c = getContractForLayout(next[i].layoutType);
    if (c.statsMaxChars <= 0) {
      next[i].stats = undefined;
      changed = true;
      continue;
    }
    if (stats.length > c.statsMaxChars) {
      next[i].stats = stats.slice(0, c.statsMaxChars).trim();
      changed = true;
    }
  }
  return { slides: next, changed };
}

function structuralIssueCount(issues: ReturnType<typeof validateDeck>): number {
  return issues
    .filter((i) => i.index >= 0)
    .reduce((acc, i) => acc + i.errors.length, 0);
}

function weakSlideCount(semantic: SemanticValidationResult): number {
  return new Set(
    semantic.issues
      .filter((i) => i.type === "weak")
      .map((i) => i.slide)
      .filter((i) => i >= 0)
  ).size;
}

function shouldEarlyWholeDeckRetry(
  structural: ReturnType<typeof validateDeck>,
  semantic: SemanticValidationResult
): boolean {
  return structuralIssueCount(structural) >= 2 && weakSlideCount(semantic) >= 4;
}

async function regenerateSingleSlide(
  index: number,
  plan: DeckPlan,
  analysis: AnalysisResult,
  brandName: string,
  deck: Omit<SlideContent, "id">[],
  errors: SlideValidationError[],
  semanticIssues: SemanticIssue[] = []
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
  const prevSlide = index > 0 ? deck[index - 1] : undefined;
  const nextSlide = index < deck.length - 1 ? deck[index + 1] : undefined;

  const userPrompt = `Regenerate ONLY slide ${index + 1} of ${plan.targetSlides} (Instagram carousel).

${formatLanguageConstraintsForPrompt(analysis)}

${layoutBlock}

VALIDATION ISSUES (fix in order of severity — HIGH first):
${JSON.stringify(prioritizedErrors, null, 2)}

SEMANTIC ISSUES (story coherence):
${semanticIssues.length ? JSON.stringify(semanticIssues, null, 2) : "[]"}

CURRENT TITLE (replace if it caused duplication or generic/length errors): "${currentTitle}"

PLAN ROW
- contentRole: ${row.contentRole}
- valueType: ${row.valueType}
- purpose: ${row.purpose}
- claim: ${row.claim}
- newInformation: ${row.newInformation}
- dependsOn: ${row.dependsOn}
- mustNotRepeat: ${row.mustNotRepeat.join(" | ") || "(none)"}
- bridgeToNext: ${row.bridgeToNext}

NEIGHBOR CONTEXT
- previous slide: ${
  prevSlide
    ? JSON.stringify({
        title: prevSlide.title,
        subtitle: prevSlide.subtitle ?? "",
        body: prevSlide.body ?? [],
        role: prevSlide.contentRole ?? "",
      })
    : "(none)"
}
- next slide: ${
  nextSlide
    ? JSON.stringify({
        title: nextSlide.title,
        subtitle: nextSlide.subtitle ?? "",
        body: nextSlide.body ?? [],
        role: nextSlide.contentRole ?? "",
      })
    : "(none)"
}

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
- This slide must add NEW information versus neighboring slides and connect story flow.
${row.contentRole === "cta"
  ? `CTA-ONLY HARD RULES
- This slide must be an unmistakable call-to-action, not a summary.
- title: short closing line that follows from previous slide.
- ctaText: REQUIRED imperative action phrase (1–2 words), must start with an action verb.
- subtitle: optional support line that reinforces urgency/value.
- body: [] (preferred) or minimal by schema; do not turn it into a list.
- Forbidden CTA endings: generic reflections like "in conclusion", "thanks for reading", "remember this".`
  : ""}

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

async function regenerateSlideSegment(
  indexes: number[],
  plan: DeckPlan,
  analysis: AnalysisResult,
  brandName: string,
  deck: Omit<SlideContent, "id">[],
  semanticIssues: SemanticIssue[]
): Promise<Map<number, Omit<SlideContent, "id">>> {
  const out = new Map<number, Omit<SlideContent, "id">>();
  if (indexes.length < 2) return out;
  const [start, end] = [indexes[0], indexes[indexes.length - 1]];
  const segmentRows = plan.slides.slice(start, end + 1);
  const segmentSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      slides: {
        type: "array",
        prefixItems: segmentRows.map((_, offset) =>
          buildSlideItemSchema(plan, start + offset)
        ),
        minItems: segmentRows.length,
        maxItems: segmentRows.length,
      },
    },
    required: ["slides"],
  };

  const prompt = `Regenerate a contiguous weak segment of an Instagram carousel.
Segment: slides ${start + 1} to ${end + 1} (inclusive).

${formatLanguageConstraintsForPrompt(analysis)}

Semantic issues:
${JSON.stringify(semanticIssues, null, 2)}

Segment plan rows:
${segmentRows
  .map(
    (r, i) => `- Slide ${start + i + 1}
  role=${r.contentRole}
  valueType=${r.valueType}
  purpose=${r.purpose}
  claim=${r.claim}
  newInformation=${r.newInformation}
  dependsOn=${r.dependsOn}
  mustNotRepeat=${r.mustNotRepeat.join(" | ") || "(none)"}
  bridgeToNext=${r.bridgeToNext}`
  )
  .join("\n")}

Neighbor anchors (do not rewrite):
- previous anchor: ${
  start > 0
    ? JSON.stringify({
        title: deck[start - 1].title,
        role: deck[start - 1].contentRole,
      })
    : "(none)"
}
- next anchor: ${
  end < deck.length - 1
    ? JSON.stringify({
        title: deck[end + 1].title,
        role: deck[end + 1].contentRole,
      })
    : "(none)"
}

Rules:
- Keep exact role order and layout constraints.
- Each regenerated slide must add distinct new value.
- Avoid semantic repetition inside segment and with anchors.
- Return JSON only: {"slides":[...]} with exactly ${segmentRows.length} objects.`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You rewrite weak adjacent slides while preserving story continuity and strict schema.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "segment_regen",
          strict: true,
          schema: segmentSchema,
        },
      },
      max_tokens: 2200,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    const parsed = text ? tryParseJson(text) : null;
    const rows = slidesFromParsed(parsed);
    rows.forEach((row, offset) => {
      const idx = start + offset;
      const normalized = normalizeSlide(row, idx);
      out.set(idx, alignSlideToPlan(normalized, plan.slides[idx], idx));
    });
  } catch (e) {
    console.warn("segment regeneration failed:", e);
  }
  return out;
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
  let didAutoFixStats = false;
  const autofixInitial = autoFixStatsOverflow(slides);
  if (autofixInitial.changed) {
    slides = autofixInitial.slides;
    didAutoFixStats = true;
  }
  const autofixCtaInitial = autoFixCtaSlide(slides, plan, analysis);
  if (autofixCtaInitial.changed) {
    slides = autofixCtaInitial.slides;
  }
  const regenPerIndex = new Array(plan.targetSlides).fill(0);
  let totalRegenCalls = 0;
  let segmentRegenCalls = 0;
  let ctaRescueCalls = 0;
  let telemetryEmitted = false;
  const emitTelemetry = (
    pathTaken: "initial_accept" | "cta_rescue" | "partial_regen" | "whole_retry" | "final_fail",
    structuralIssues: ReturnType<typeof validateDeck>,
    semanticIssues: SemanticValidationResult
  ) => {
    if (telemetryEmitted) return;
    telemetryEmitted = true;
    const slideCount = slides.length;
    if (slideCount < MIN_DECK_SLIDES) {
      console.warn("[carousel-warning] slide count too low", { slideCount });
    }
    console.debug("[carousel-recovery]", {
      structuralCount: structuralIssueCount(structuralIssues),
      weakSlides: weakSlideCount(semanticIssues),
      didAutoFixStats,
      pathTaken,
      slideCount,
    });
  };

  // Pragmatic early acceptance: if there are no HIGH-severity issues, ship immediately.
  const initialStructural = validateDeck(slides, plan);
  const initialSemantic = validateDeckSemantics(slides, plan, analysis.language);
  if (shouldEarlyWholeDeckRetry(initialStructural, initialSemantic)) {
    emitTelemetry("whole_retry", initialStructural, initialSemantic);
    throw new Error(EARLY_WHOLE_DECK_RETRY_ERROR);
  }
  const initialStructuralHigh =
    structuralFailure(initialStructural) || blockingIssuesHaveHighSeverity(initialStructural);
  const initialSemanticHigh = highestSemanticSeverity(initialSemantic) === "high";
  if (!initialStructuralHigh && !initialSemanticHigh) {
    emitTelemetry("initial_accept", initialStructural, initialSemantic);
    return acceptDeckWithOptionalWarnings(
      slides,
      plan,
      "Good-enough accept: no HIGH-severity issues on first pass."
    );
  }

  while (totalRegenCalls < MAX_REGEN_CALLS_TOTAL) {
    const autofix = autoFixStatsOverflow(slides);
    if (autofix.changed) {
      slides = autofix.slides;
      didAutoFixStats = true;
    }
    const autofixCta = autoFixCtaSlide(slides, plan, analysis);
    if (autofixCta.changed) {
      slides = autofixCta.slides;
    }
    const issues = validateDeck(slides, plan);
    // Cost/speed mode: local semantic validator only during loop.
    const semantic = validateDeckSemantics(slides, plan, analysis.language);
    const semanticBySlide = semanticIssuesBySlide(semantic);

    const structural = issues.find((i) => i.index === -1);
    if (structural) {
      throw new Error(structural.errors[0]?.message ?? "Deck validation failed.");
    }

    const structuralHigh = blockingIssuesHaveHighSeverity(issues);
    const semanticSeverity = highestSemanticSeverity(semantic);
    if (!structuralHigh && semanticSeverity !== "high") {
      emitTelemetry(
        totalRegenCalls > 0 ? "partial_regen" : "initial_accept",
        issues,
        semantic
      );
      return acceptDeckWithOptionalWarnings(
        slides,
        plan,
        "Good-enough accept: no HIGH-severity issues remain."
      );
    }

    const ctaIdx = plan.targetSlides - 1;
    const ctaIssues = ctaSemanticIssues(semantic, ctaIdx);
    const onlyCtaFailed = !structuralHigh && onlyFinalSlideHasIssues(semantic, ctaIdx);
    if (ctaIssues.length > 0 && ctaRescueCalls < MAX_CTA_RESCUE_CALLS) {
      ctaRescueCalls += 1;
      const ctaReplacement = await regenerateSingleSlide(
        ctaIdx,
        plan,
        analysis,
        brandName,
        slides,
        [],
        ctaIssues
      );
      if (ctaReplacement) {
        slides[ctaIdx] = ctaReplacement;
        if (onlyCtaFailed) {
          const postStructural = validateDeck(slides, plan);
          const postSemantic = validateDeckSemantics(slides, plan, analysis.language);
          if (
            !structuralFailure(postStructural) &&
            !blockingIssuesHaveHighSeverity(postStructural) &&
            highestSemanticSeverity(postSemantic) !== "high"
          ) {
            emitTelemetry("cta_rescue", postStructural, postSemantic);
            return acceptDeckWithOptionalWarnings(
              slides,
              plan,
              "Accepted after fast CTA-only rescue."
            );
          }
        }
        totalRegenCalls += 1;
        continue;
      }
    }

    const segment = contiguousProblemSegment(semantic.issues, plan.targetSlides - 1);
    if (segment.length >= 2 && segmentRegenCalls < MAX_SEGMENT_REGEN_CALLS) {
      segmentRegenCalls += 1;
      const replaced = await regenerateSlideSegment(
        segment,
        plan,
        analysis,
        brandName,
        slides,
        semantic.issues.filter((x) => segment.includes(x.slide))
      );
      if (replaced.size > 0) {
        for (const [idx, s] of replaced.entries()) {
          slides[idx] = s;
        }
        totalRegenCalls += 1;
        continue;
      }
    }

    const ordered = sortIssuesForRegeneration(issues);
    const semanticCandidates = [...semanticBySlide.entries()]
      .filter(([idx, arr]) => {
        if (!(idx >= 0 && idx < plan.targetSlides - 1) || arr.length === 0) return false;
        // Never spend regen budget on weak / no_progression (non-blocking guidance).
        return arr.some(
          (x) =>
            x.severity === "high" &&
            x.type !== "weak" &&
            x.type !== "no_progression"
        );
      })
      .sort((a, b) => {
        const score = (xs: SemanticIssue[]) =>
          xs.reduce((acc, x) => acc + (x.severity === "high" ? 10 : x.severity === "medium" ? 2 : 1), 0);
        return score(b[1]) - score(a[1]);
      });

    const structuralCandidate = ordered.find((i) => regenPerIndex[i.index] < MAX_REGEN_PER_SLIDE);
    const semanticCandidate = semanticCandidates.find(
      ([idx]) => regenPerIndex[idx] < MAX_REGEN_PER_SLIDE
    );
    const candidateIndex =
      semanticSeverity === "high" && semanticCandidate
        ? semanticCandidate[0]
        : structuralCandidate?.index ?? semanticCandidate?.[0];

    if (candidateIndex === undefined) {
      if (!blockingIssuesHaveHighSeverity(issues) && semanticSeverity !== "high") {
        return acceptDeckWithOptionalWarnings(
          slides,
          plan,
          "Partial accept: regeneration budget exhausted; no HIGH issues remain."
        );
      }
      throw new Error(
        `Carousel validation failed after regeneration attempts: ${JSON.stringify(
          { structural: issues, semantic: semantic.issues },
          null,
          2
        )}`
      );
    }

    const idx = candidateIndex;
    regenPerIndex[idx] += 1;
    totalRegenCalls += 1;

    const replacement = await regenerateSingleSlide(
      idx,
      plan,
      analysis,
      brandName,
      slides,
      structuralCandidate?.index === idx ? structuralCandidate.errors : [],
      semanticBySlide.get(idx) ?? []
    );
    if (replacement) {
      slides[idx] = replacement;
    }
  }

  const finalAuto = autoFixStatsOverflow(slides);
  if (finalAuto.changed) {
    slides = finalAuto.slides;
    didAutoFixStats = true;
  }
  const finalCtaAuto = autoFixCtaSlide(slides, plan, analysis);
  if (finalCtaAuto.changed) {
    slides = finalCtaAuto.slides;
  }
  const finalIssues = validateDeck(slides, plan);
  const finalSemantic = validateDeckSemantics(slides, plan, analysis.language);
  const finalCtaIdx = plan.targetSlides - 1;
  const finalCtaIssues = ctaSemanticIssues(finalSemantic, finalCtaIdx);
  if (finalCtaIssues.length > 0 && ctaRescueCalls < MAX_CTA_RESCUE_CALLS) {
    ctaRescueCalls += 1;
    const ctaReplacement = await regenerateSingleSlide(
      finalCtaIdx,
      plan,
      analysis,
      brandName,
      slides,
      [],
      finalCtaIssues
    );
    if (ctaReplacement) {
      slides[finalCtaIdx] = ctaReplacement;
      const rescueStructural = validateDeck(slides, plan);
      const rescueSemantic = validateDeckSemantics(slides, plan, analysis.language);
      if (
        !structuralFailure(rescueStructural) &&
        !blockingIssuesHaveHighSeverity(rescueStructural) &&
        highestSemanticSeverity(rescueSemantic) !== "high"
      ) {
        emitTelemetry("cta_rescue", rescueStructural, rescueSemantic);
        return acceptDeckWithOptionalWarnings(
          slides,
          plan,
          "Accepted after CTA rescue pass."
        );
      }
    }
  }
  if (finalIssues.length === 0) {
    if (finalSemantic.verdict === "pass") {
      emitTelemetry(
        totalRegenCalls > 0 ? "partial_regen" : "initial_accept",
        finalIssues,
        finalSemantic
      );
      return slides.map(normalizeSlideOutput);
    }
    if (highestSemanticSeverity(finalSemantic) !== "high") {
      emitTelemetry(
        totalRegenCalls > 0 ? "partial_regen" : "initial_accept",
        finalIssues,
        finalSemantic
      );
      return acceptDeckWithOptionalWarnings(
        slides,
        plan,
        "Accepted after regeneration budget with non-critical semantic notes."
      );
    }
  }
  if (structuralFailure(finalIssues)) {
    throw new Error(
      finalIssues[0]?.errors[0]?.message ?? "Deck validation failed."
    );
  }
  if (deckBlockingIssuesClear(finalIssues) && highestSemanticSeverity(finalSemantic) !== "high") {
    emitTelemetry(
      totalRegenCalls > 0 ? "partial_regen" : "initial_accept",
      finalIssues,
      finalSemantic
    );
    return acceptDeckWithOptionalWarnings(
      slides,
      plan,
      "Accepted after regen budget: LOW-only issues remain."
    );
  }
  if (!blockingIssuesHaveHighSeverity(finalIssues) && highestSemanticSeverity(finalSemantic) !== "high") {
    emitTelemetry(
      totalRegenCalls > 0 ? "partial_regen" : "initial_accept",
      finalIssues,
      finalSemantic
    );
    return acceptDeckWithOptionalWarnings(
      slides,
      plan,
      "Partial accept after regen budget: MEDIUM issues only."
    );
  }

  emitTelemetry("final_fail", finalIssues, finalSemantic);
  throw new Error(
    `Exceeded regeneration budget with HIGH-severity issues: ${JSON.stringify(
      { structural: finalIssues, semantic: finalSemantic.issues },
      null,
      2
    )}`
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
  const langLine =
    analysis.language === "ar"
      ? "All titles, subtitles, body lines, stats, labels, and CTA text must be in Arabic only."
      : "All titles, subtitles, body lines, stats, labels, and CTA text must be in English only.";
  const systemStrict = `You are a premium carousel designer. Output JSON only. Exactly ${slideCount} slides in "slides". Each slide must include contentRole and emphasis. Slide i contentRole MUST match the editorial plan row i. Each role maps to a fixed layout — shape fields (body length, stats, ctaText) to that layout. Enums must match the schema. Enforce semantic progression: every slide adds new value and does not restate earlier ideas. ${langLine} Do not mix languages.`;
  const systemLoose = `You are a premium carousel designer. Reply with a single JSON object: {"slides":[...]} with exactly ${slideCount} slides. Match each slide's contentRole to the provided plan in order; each role implies a layout — fit copy to that layout. Each slide: contentRole, emphasis, visualIntent, title, subtitle, body (array), stats, ctaText, contrastLabelA, contrastLabelB. Enforce semantic delta from previous slides; no filler or repeated ideas. ${langLine} No markdown.`;

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
  const maxRetries = 1;
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
