export type SlideType = 'hook' | 'problem' | 'value' | 'example' | 'cta';

export type LayoutType = 
  | 'hero-typography' 
  | 'big-statement' 
  | 'split-content' 
  | 'feature-list' 
  | 'comparison' 
  | 'contrast-card'
  | 'cta-final';

/** Strategist / story role — drives layout mapping in generation. */
export type ContentRole =
  | 'hook'
  | 'insight'
  | 'list'
  | 'comparison'
  | 'contrast'
  | 'stat'
  | 'problem'
  | 'solution'
  | 'cta';

/** Visual expression tier (optional on slide; UI falls back if absent). */
export type SlideEmphasis = 'hook' | 'title' | 'body' | 'balanced' | 'close';

export interface SlideContent {
  id: string;
  type: SlideType;
  layoutType: LayoutType;
  visualIntent: string;
  title: string;
  subtitle?: string;
  body?: string[];
  stats?: string;
  ctaText?: string;
  ctaLink?: string;
  contentRole?: ContentRole;
  emphasis?: SlideEmphasis;
  /**
   * contrast-card only: semantic editorial labels for the two states.
   * Optional for other layouts.
   */
  contrastLabelA?: string;
  contrastLabelB?: string;
}

export interface BrandConfig {
  name: string;
  logo?: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  ctaColor: string;
  whatsapp?: string;
  website?: string;
  instagram?: string;
}

export type CarouselGoal =
  | 'educational'
  | 'marketing'
  | 'storytelling'
  | 'awareness';

export type TopicComplexity = 'low' | 'medium' | 'high';

export type ToneProfile = 'strong' | 'soft' | 'neutral';

/** Detected from user input + analysis fields; drives generation language. */
export type ContentLanguage = 'ar' | 'en';

export interface AnalysisResult {
  topic: string;
  audience: string;
  /** Language for all carousel copy — inferred from input (Arabic script vs Latin). */
  language: ContentLanguage;
  /** One-line outcome (human-readable). */
  goal: string;
  carouselGoal: CarouselGoal;
  complexity: TopicComplexity;
  toneProfile: ToneProfile;
  coreMessage: string;
  keyPoints: string[];
  /** Legacy / extra voice notes from model. */
  tone: string;
  ctaDirection: string;
}

/**
 * Narrative “value” each slide must add (orthogonal to contentRole / layout).
 * No two consecutive slides may share the same valueType.
 */
export type InformationValueType =
  | 'insight'
  | 'problem'
  | 'consequence'
  | 'example'
  | 'comparison'
  | 'statistic'
  | 'solution'
  | 'action';

/** Editorial archetype — chosen in planning pass. */
export type DeckArchetype =
  | "micro-tip"
  | "educational"
  | "myth-busting"
  | "story"
  | "breakdown"
  | "promotion";

/** Caps per deck (Phase 1: fixed product limits). */
export interface DeckRoleBudget {
  hook_max: number;
  cta_max: number;
  list_max: number;
  stat_max: number;
  comparison_max: number;
  contrast_max: number;
}

/** One row in the editorial slide plan. */
export interface PlannedSlideRow {
  index: number;
  contentRole: ContentRole;
  /** Editorial intent for this slide (shown to generator). */
  purpose: string;
  /** Core assertion this slide makes. */
  claim: string;
  /** New value introduced vs earlier slides. */
  newInformation: string;
  /** Slide index this slide builds on; -1 means standalone opener. */
  dependsOn: number;
  /** Concepts that must not be repeated in this slide. */
  mustNotRepeat: string[];
  /** Narrative handoff into the next slide. */
  bridgeToNext: string;
  /** Kind of value this slide adds; must differ from the previous slide’s valueType. */
  valueType: InformationValueType;
}

export interface DeckPlan {
  version: "deck-plan.v1";
  archetype: DeckArchetype;
  targetSlides: number;
  allowedRoles: ContentRole[];
  forbiddenRoles: ContentRole[];
  roleBudget: DeckRoleBudget;
  slides: PlannedSlideRow[];
}

export interface Carousel {
  topic: string;
  slides: SlideContent[];
}

/** Saved generation session (localStorage history). */
export interface CarouselHistoryItem {
  id: string;
  prompt: string;
  slides: SlideContent[];
  /** Brand snapshot at generation time */
  brand: BrandConfig;
  createdAt: string;
  slideCount: number;
  /** First slide title for list preview (no image — keeps storage small) */
  previewTitle?: string;
}
