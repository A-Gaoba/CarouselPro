export type SlideType = 'hook' | 'problem' | 'value' | 'example' | 'cta';

export type LayoutType = 
  | 'hero-typography' 
  | 'big-statement' 
  | 'split-content' 
  | 'feature-list' 
  | 'comparison' 
  | 'cta-final';

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

export interface AnalysisResult {
  topic: string;
  audience: string;
  goal: string;
  coreMessage: string;
  keyPoints: string[];
  tone: string;
  ctaDirection: string;
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
