import type { ContentLanguage, DeckPlan, SlideContent } from "../types";

/** Arabic CTA phrases that are clearly imperative / action-oriented (substring match). */
const ARABIC_CTA_ACTION_PHRASES: readonly string[] = [
  "ابدأ الآن",
  "تابع الآن",
  "جرّب الآن",
  "جرب الآن",
  "اطلب الآن",
  "اكتشف المزيد",
  "تواصل معنا",
  "احجز الآن",
  "اشترك الآن",
  "حمّل الآن",
  "حمل الآن",
  "اضغط هنا",
  "راسلنا",
  "سجّل الآن",
  "شارك الآن",
  "انضم الآن",
  "اقرأ المزيد",
  "اطّلع على",
];

/** Common Arabic imperative stems (first word or early token in short CTA label). */
const ARABIC_CTA_IMPERATIVE_OPENERS = new Set<string>([
  "تابع",
  "ابدأ",
  "جرّب",
  "جرب",
  "اطلب",
  "اكتشف",
  "تواصل",
  "احجز",
  "اشترك",
  "حمّل",
  "حمل",
  "اضغط",
  "راسل",
  "سجّل",
  "سجل",
  "احفظ",
  "شارك",
  "نوّر",
  "نور",
  "انضم",
  "أرسل",
  "أرسلنا",
]);

/** Problem / pain signals (Arabic) — parallel to English list in checkRoleSemantics. */
const PROBLEM_SIGNALS_AR: readonly string[] = [
  "مشكلة",
  "مشاكل",
  "خطر",
  "مخاطر",
  "خسارة",
  "تأخير",
  "صعوبة",
  "فشل",
  "أخطاء",
  "خطأ",
  "تحدي",
  "تكلفة",
  "ضرر",
  "ألم",
  "عقبة",
  "عوائق",
  "سوء",
  "تعقيد",
  "عيب",
  "غلط",
];

/** Solution / method signals (Arabic). */
const SOLUTION_SIGNALS_AR: readonly string[] = [
  "حل",
  "حلول",
  "خطوات",
  "طريقة",
  "طرق",
  "إطار",
  "خطوة",
  "تقليل",
  "تحسين",
  "تطبيق",
  "استخدم",
  "اعمل",
  "اتبع",
  "نفّذ",
  "نفذ",
  "ركّز",
  "ركز",
  "ابن",
  "طبّق",
  "طبق",
  "اختَر",
  "اختار",
];

const GENERIC_CTA_CLOSINGS_AR: readonly string[] = [
  "شكرا للقراءة",
  "شكراً للقراءة",
  "شكرا على المتابعة",
  "شكراً على المتابعة",
  "في الختام",
  "باختصار",
  "أتمنى أن ينفعك",
  "لا تنسى الاشتراك",
];

export type SemanticIssueType =
  | "redundant"
  | "empty"
  | "weak"
  | "invalid_role"
  | "no_progression";

export interface SemanticIssue {
  slide: number;
  type: SemanticIssueType;
  reason: string;
  severity: "high" | "medium" | "low";
}

export interface SemanticValidationResult {
  verdict: "pass" | "revise";
  issues: SemanticIssue[];
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "is",
    "are",
    "this",
    "that",
    "it",
  ]);
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length > 2 && !stop.has(t));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) {
    if (sb.has(t)) inter++;
  }
  const union = new Set([...sa, ...sb]).size || 1;
  return inter / union;
}

function slideCoreText(slide: Omit<SlideContent, "id">): string {
  return [
    slide.title ?? "",
    slide.subtitle ?? "",
    ...(slide.body ?? []),
    slide.stats ?? "",
    slide.ctaText ?? "",
    slide.visualIntent ?? "",
  ]
    .join(" ")
    .trim();
}

function hasAny(text: string, words: string[]): boolean {
  const n = normalizeText(text);
  return words.some((w) => n.includes(w));
}

function hasAnyArabicSubstring(text: string, needles: readonly string[]): boolean {
  return needles.some((n) => text.includes(n));
}

function textHasArabicScript(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

function arabicCtaSemanticValid(ctaText: string, subtitle: string): boolean {
  const cta = String(ctaText ?? "").trim();
  const sub = String(subtitle ?? "").trim();
  if (!cta || cta.length < 2) return false;
  const combined = `${cta} ${sub}`;
  if (ARABIC_CTA_ACTION_PHRASES.some((p) => combined.includes(p))) return true;
  const words = cta.split(/\s+/).filter(Boolean);
  for (const w of words.slice(0, 4)) {
    if (ARABIC_CTA_IMPERATIVE_OPENERS.has(w)) return true;
  }
  return sub.split(/\s+/).filter(Boolean).some((w) => ARABIC_CTA_IMPERATIVE_OPENERS.has(w));
}

const ENGLISH_CTA_IMPERATIVE_FIRST = new Set<string>([
  "follow",
  "share",
  "comment",
  "save",
  "download",
  "start",
  "book",
  "join",
  "learn",
  "try",
  "contact",
  "message",
  "subscribe",
  "visit",
  "apply",
  "dm",
]);

function englishCtaSemanticValid(ctaText: string, subtitle: string): boolean {
  const cta = String(ctaText ?? "").trim();
  if (!cta || cta.length < 3) return false;
  if (!ctaHasActionRequest(cta, subtitle)) return false;
  const firstWord = normalizeText(cta).split(" ")[0] ?? "";
  return ENGLISH_CTA_IMPERATIVE_FIRST.has(firstWord);
}

/**
 * True if CTA label satisfies localized imperative / action rules (used by validators and auto-fix).
 * English: unchanged — first token must match English imperative set + action-verb heuristics.
 * Arabic: phrase list, imperative openers, or action stems in short labels.
 */
export function ctaPassesLocalizedSemanticCheck(
  ctaText: string,
  subtitle: string,
  language: ContentLanguage
): boolean {
  if (language === "ar") return arabicCtaSemanticValid(ctaText, subtitle);
  return englishCtaSemanticValid(ctaText, subtitle);
}

function ctaHasActionRequest(ctaText: string, subtitle: string): boolean {
  const actionVerbs = [
    "follow",
    "share",
    "comment",
    "save",
    "download",
    "start",
    "book",
    "join",
    "learn",
    "try",
    "contact",
    "message",
    "subscribe",
    "visit",
    "apply",
    "dm",
  ];
  const ctaNorm = normalizeText(ctaText);
  const subNorm = normalizeText(subtitle);
  const firstWord = ctaNorm.split(" ")[0] ?? "";
  if (actionVerbs.includes(firstWord)) return true;
  return actionVerbs.some((v) => ctaNorm.includes(v) || subNorm.includes(v));
}

function isGenericCtaClosing(full: string, language: ContentLanguage): boolean {
  const n = normalizeText(full);
  const genericEn = [
    "thanks for reading",
    "thank you for reading",
    "that s all",
    "thats all",
    "in conclusion",
    "to sum up",
    "final thoughts",
    "hope this helps",
    "keep this in mind",
    "remember this",
    "good luck",
  ];
  if (genericEn.some((p) => n.includes(p))) return true;
  if (language === "ar" || textHasArabicScript(full)) {
    return GENERIC_CTA_CLOSINGS_AR.some((p) => full.includes(p));
  }
  return false;
}

function checkRoleSemantics(
  slide: Omit<SlideContent, "id">,
  prev: Omit<SlideContent, "id"> | undefined,
  language: ContentLanguage
): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const role = slide.contentRole;
  const text = slideCoreText(slide);
  if (!role) return issues;

  const problemKeywordsEn = [
    "problem",
    "pain",
    "risk",
    "mistake",
    "issue",
    "challenge",
    "friction",
    "cost",
    "loss",
    "bug",
    "delay",
  ];
  if (role === "problem") {
    const hasProblemSignal =
      language === "ar"
        ? hasAny(text, problemKeywordsEn) || hasAnyArabicSubstring(text, PROBLEM_SIGNALS_AR)
        : hasAny(text, problemKeywordsEn);
    if (!hasProblemSignal) {
      issues.push({
        slide: -1,
        type: "invalid_role",
        severity: "high",
        reason:
          'Problem slide lacks concrete problem signal (pain, risk, friction, issue, cost, etc.).',
      });
    }
  }

  const solutionKeywordsEn = [
    "solution",
    "fix",
    "approach",
    "framework",
    "method",
    "step",
    "improve",
    "reduce",
  ];
  if (role === "solution") {
    const hasSolutionSignal =
      language === "ar"
        ? hasAny(text, solutionKeywordsEn) || hasAnyArabicSubstring(text, SOLUTION_SIGNALS_AR)
        : hasAny(text, solutionKeywordsEn);
    if (!hasSolutionSignal) {
      issues.push({
        slide: -1,
        type: "invalid_role",
        severity: "medium",
        reason: "Solution slide does not clearly present a method or action.",
      });
    }
    if (prev?.contentRole === "problem") {
      const sim = jaccard(tokens(text), tokens(slideCoreText(prev)));
      const minSim = language === "ar" ? 0.045 : 0.06;
      if (sim < minSim) {
        issues.push({
          slide: -1,
          type: "no_progression",
          severity: "medium",
          reason:
            "Solution slide appears weakly connected to the preceding problem slide.",
        });
      }
    }
  }

  if (role === "cta") {
    const ctaText = String(slide.ctaText ?? "").trim();
    const subtitle = String(slide.subtitle ?? "").trim();
    const full = `${slide.title ?? ""} ${subtitle}`.trim();
    if (!ctaPassesLocalizedSemanticCheck(ctaText, subtitle, language)) {
      issues.push({
        slide: -1,
        type: "invalid_role",
        severity: "high",
        reason:
          language === "ar"
            ? "شريحة الدعوة لاتخاذ إجراء يجب أن تتضمن طلبًا مباشرًا بصيغة أمر (مثل: تابع الآن، ابدأ الآن)."
            : "CTA slide must include a direct imperative action request (e.g., Follow Now, Start Today).",
      });
    }
    if (
      isGenericCtaClosing(full, language) &&
      !ctaPassesLocalizedSemanticCheck(ctaText, subtitle, language)
    ) {
      issues.push({
        slide: -1,
        type: "invalid_role",
        severity: "high",
        reason:
          language === "ar"
            ? "الشريحة الأخيرة تبدو خاتمة عامة وليست طلب إجراء واضح."
            : "CTA slide is a generic closing statement instead of an actionable request.",
      });
    }
  }

  return issues;
}

export function validateDeckSemantics(
  slides: Omit<SlideContent, "id">[],
  plan: DeckPlan,
  language: ContentLanguage = "en"
): SemanticValidationResult {
  const issues: SemanticIssue[] = [];

  slides.forEach((slide, i) => {
    const text = slideCoreText(slide);
    const planRow = plan.slides[i];
    const bodyChars = (slide.body ?? []).join(" ").trim().length;
    const totalChars = text.length;

    if (totalChars < 24 || (slide.title.trim().length > 0 && bodyChars < 8 && !slide.subtitle?.trim())) {
      issues.push({
        slide: i,
        type: "empty",
        severity: "high",
        reason: "Slide has too little explanatory content.",
      });
    }

    if (planRow) {
      const claimOverlap = jaccard(tokens(text), tokens(planRow.claim));
      const noveltyOverlap = jaccard(tokens(text), tokens(planRow.newInformation));
      /** Arabic token overlap with plan English is noisier; require both lows to flag weak. */
      const weakPlan =
        language === "ar"
          ? claimOverlap < 0.022 && noveltyOverlap < 0.016
          : claimOverlap < 0.03 || noveltyOverlap < 0.02;
      if (weakPlan) {
        issues.push({
          slide: i,
          type: "weak",
          severity: "medium",
          reason:
            "Slide appears weakly aligned with planned claim/newInformation.",
        });
      }

      if (i > 0 && planRow.dependsOn >= 0) {
        const dep = slides[planRow.dependsOn];
        if (dep) {
          const depSim = jaccard(tokens(text), tokens(slideCoreText(dep)));
          const depTh = language === "ar" ? 0.02 : 0.03;
          if (depSim < depTh) {
            issues.push({
              slide: i,
              type: "no_progression",
              severity: "medium",
              reason: `Slide does not clearly build on dependency slide ${planRow.dependsOn + 1} (plan index ${planRow.dependsOn}).`,
            });
          }
        }
      }
    }

    checkRoleSemantics(slide, i > 0 ? slides[i - 1] : undefined, language).forEach((x) =>
      issues.push({ ...x, slide: i })
    );
  });

  for (let i = 1; i < slides.length; i++) {
    const prevText = slideCoreText(slides[i - 1]);
    const curText = slideCoreText(slides[i]);
    const sim = jaccard(tokens(prevText), tokens(curText));
    if (sim > 0.72) {
      issues.push({
        slide: i,
        type: "redundant",
        severity: "high",
        reason: `Slide ${i + 1} is semantically too similar to slide ${i}.`,
      });
    } else if (sim > 0.58) {
      issues.push({
        slide: i,
        type: "redundant",
        severity: "medium",
        reason: `Slide ${i + 1} likely repeats the previous slide with minor wording changes.`,
      });
    }
  }

  const ctaIndex = slides.length - 1;
  const ctaSlide = slides[ctaIndex];
  if (ctaSlide?.contentRole === "cta") {
    const prefix = slides.slice(0, ctaIndex).map((s) => slideCoreText(s)).join(" ");
    const supportSim = jaccard(tokens(slideCoreText(ctaSlide)), tokens(prefix));
    const supportTh = language === "ar" ? 0.012 : 0.02;
    if (supportSim < supportTh) {
      issues.push({
        slide: ctaIndex,
        type: "no_progression",
        severity: "medium",
        reason: "CTA appears weakly supported by prior slides.",
      });
    }
  }

  return {
    verdict: issues.some((i) => i.severity !== "low") ? "revise" : "pass",
    issues,
  };
}

export function highestSemanticSeverity(
  result: SemanticValidationResult
): "high" | "medium" | "low" {
  if (result.issues.some((i) => i.severity === "high")) return "high";
  if (result.issues.some((i) => i.severity === "medium")) return "medium";
  return "low";
}

export function semanticIssuesBySlide(
  result: SemanticValidationResult
): Map<number, SemanticIssue[]> {
  const map = new Map<number, SemanticIssue[]>();
  for (const issue of result.issues) {
    const arr = map.get(issue.slide) ?? [];
    arr.push(issue);
    map.set(issue.slide, arr);
  }
  return map;
}

