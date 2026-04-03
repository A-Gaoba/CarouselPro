import OpenAI from "openai";
import {
  SlideContent,
  AnalysisResult,
  LayoutType,
  SlideType,
} from "../types";

const MODEL = "gpt-4o-mini";
/** Fixed count: matches prompts, schema, and export expectations. */
const SLIDE_COUNT = 10;

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY ?? "",
  dangerouslyAllowBrowser: true,
});

const LAYOUT_TYPES: LayoutType[] = [
  "hero-typography",
  "big-statement",
  "split-content",
  "feature-list",
  "comparison",
  "cta-final",
];

const SLIDE_TYPES: SlideType[] = [
  "hook",
  "problem",
  "value",
  "example",
  "cta",
];

/** OpenAI strict JSON Schema for AnalysisResult (matches types.ts). */
const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    topic: { type: "string" },
    audience: { type: "string" },
    goal: { type: "string" },
    coreMessage: { type: "string" },
    keyPoints: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 5,
    },
    tone: { type: "string" },
    ctaDirection: { type: "string" },
  },
  required: [
    "topic",
    "audience",
    "goal",
    "coreMessage",
    "keyPoints",
    "tone",
    "ctaDirection",
  ],
} as const;

const SLIDE_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: [...SLIDE_TYPES],
    },
    layoutType: {
      type: "string",
      enum: [...LAYOUT_TYPES],
    },
    visualIntent: { type: "string" },
    title: { type: "string" },
    subtitle: { type: "string" },
    body: {
      type: "array",
      items: { type: "string" },
      maxItems: 6,
    },
    stats: { type: "string" },
  },
  required: [
    "type",
    "layoutType",
    "visualIntent",
    "title",
    "subtitle",
    "body",
    "stats",
  ],
} as const;

const CAROUSEL_WRAPPER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    slides: {
      type: "array",
      items: SLIDE_ITEM_SCHEMA,
      minItems: SLIDE_COUNT,
      maxItems: SLIDE_COUNT,
    },
  },
  required: ["slides"],
} as const;

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
    keyPoints = [userInput.trim() || "Key insight"];
  }
  while (keyPoints.length < 3) {
    keyPoints.push(`Point ${keyPoints.length + 1}`);
  }
  keyPoints = keyPoints.slice(0, 5);

  return {
    topic: String(parsed.topic || userInput).trim().slice(0, 200) || userInput.substring(0, 50),
    audience: String(parsed.audience || "General Audience").trim().slice(0, 200),
    goal: String(parsed.goal || "Inform and Engage").trim().slice(0, 200),
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
  const layoutType = coerceLayoutType(String(raw.layoutType ?? ""));
  const type = coerceSlideType(String(raw.type ?? ""));

  let body: string[] = [];
  if (Array.isArray(raw.body)) {
    body = raw.body.map((x) => String(x).trim()).filter(Boolean);
  }
  body = body.slice(0, 6);

  if (layoutType === "comparison") {
    if (body.length < 2) {
      body = [
        body[0] || "Manual and slow",
        body[1] || "Automated and fast",
      ];
    }
  }

  const subtitleRaw = String(raw.subtitle ?? "").trim();
  const statsRaw = String(raw.stats ?? "").trim();

  return {
    type,
    layoutType,
    visualIntent: String(raw.visualIntent ?? "")
      .trim()
      .slice(0, 160) || `Slide ${index + 1} focus`,
    title: String(raw.title ?? "Slide")
      .trim()
      .slice(0, 120) || "Slide",
    subtitle: subtitleRaw ? subtitleRaw.slice(0, 200) : undefined,
    body: body.length > 0 ? body : undefined,
    stats: statsRaw ? statsRaw.slice(0, 80) : undefined,
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

/** Extract first balanced {...} or [...] so `}` inside strings does not break parsing. */
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
  target: number,
  analysis: AnalysisResult
): Omit<SlideContent, "id">[] {
  let out = slides.slice();
  if (out.length > target) {
    return out.slice(0, target);
  }
  let i = out.length;
  while (out.length < target) {
    const kp = analysis.keyPoints[i % Math.max(analysis.keyPoints.length, 1)];
    out.push(
      normalizeSlide(
        {
          type: i === target - 1 ? "cta" : "value",
          layoutType: i === target - 1 ? "cta-final" : "feature-list",
          visualIntent: "Continue the narrative",
          title: (kp || analysis.topic || "Slide").slice(0, 80),
          subtitle: "",
          body: kp ? [kp] : [analysis.coreMessage.slice(0, 120)],
          stats: "",
        },
        i
      )
    );
    i++;
  }
  return out;
}

async function analyzeInput(userInput: string): Promise<AnalysisResult> {
  const prompt = `Analyze the following user input for an Instagram carousel and extract a structured strategy.

User Input: "${userInput}"

Rules:
- If input is too short, infer a reasonable topic and audience.
- If input is too long or messy, summarize and extract the core message.
- If vague, extract the strongest likely angle.

Fields:
- topic: Clear, concise topic (max 10 words)
- audience: Target audience
- goal: What the carousel aims to achieve
- coreMessage: The single most important takeaway
- keyPoints: Exactly 3 to 5 short bullet strings (no empty strings)
- tone: Brand voice in a few words (e.g. professional, minimal)
- ctaDirection: What the final slide should ask the user to do`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a strategic content analyzer. Reply only via the required JSON schema. Be concise.",
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
      goal: "Inform and Engage",
      coreMessage: userInput,
      keyPoints: [userInput.trim() || "Insight one", "Insight two", "Insight three"],
      tone: "Professional",
      ctaDirection: "Follow for more",
    };
  }
}

function buildSlidesUserPrompt(analysis: AnalysisResult, brandName: string): string {
  const keyPointsStr = analysis.keyPoints.join(", ");
  return `Generate a high-end, light SaaS-style Instagram carousel from this brief.

Topic: ${analysis.topic}
Audience: ${analysis.audience}
Goal: ${analysis.goal}
Core message: ${analysis.coreMessage}
Key points: ${keyPointsStr}
Tone: ${analysis.tone}
CTA direction: ${analysis.ctaDirection}
Brand name (voice only): "${brandName}"

RULES:
- LIGHT theme only. No dark backgrounds. Typography and soft shapes only (no images).
- Headline: max 6 words. Subtitle: max 10 words when used.
- Max 6 strings in any body array.
- Return exactly ${SLIDE_COUNT} slides in the "slides" array.

SEQUENCE:
1) Slide 1: layout hero-typography — hook.
2) Middle: mix big-statement, split-content, feature-list, comparison as needed.
3) Second-to-last: layout hero-typography — final impact.
4) Last slide: layout cta-final — call to action aligned with CTA direction.

layoutType must be one of: ${LAYOUT_TYPES.join(", ")}.
type must be one of: ${SLIDE_TYPES.join(", ")}.
Use empty string for unused subtitle/stats; use [] for empty body.

Keep copy very short to avoid truncation.`;
}

function parseSlidesFromModelText(
  text: string,
  analysis: AnalysisResult
): Omit<SlideContent, "id">[] | null {
  try {
    const parsed = tryParseJson(text);
    const rawSlides = slidesFromParsed(parsed);
    if (rawSlides.length === 0) return null;
    const slides = rawSlides.map((row, i) => normalizeSlide(row, i));
    return ensureSlideCount(slides, SLIDE_COUNT, analysis);
  } catch (e) {
    console.error("parseSlidesFromModelText:", e);
    return null;
  }
}

async function generateSlidesFromAnalysis(
  analysis: AnalysisResult,
  brandName: string
): Promise<Omit<SlideContent, "id">[]> {
  const userPrompt = buildSlidesUserPrompt(analysis, brandName);
  const systemStrict = `You are a premium carousel designer. Output JSON only. Exactly ${SLIDE_COUNT} slides in "slides". Enum values must match the allowed layout and slide types.`;
  const systemLoose = `You are a premium carousel designer. Reply with a single JSON object: {"slides":[...]} containing exactly ${SLIDE_COUNT} slide objects. No markdown, no text outside JSON.`;

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
          schema: CAROUSEL_WRAPPER_SCHEMA,
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

  let slides = content ? parseSlidesFromModelText(content, analysis) : null;

  if (!slides) {
    console.warn("Slides parse failed; retrying with json_object mode.");
    const fb = await runJsonObject();
    const fbText = fb.choices[0]?.message?.content?.trim() ?? "";
    slides = fbText ? parseSlidesFromModelText(fbText, analysis) : null;
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
      const slides = await generateSlidesFromAnalysis(analysis, brandName);

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
