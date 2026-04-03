import type {
  AnalysisResult,
  CarouselGoal,
  ContentRole,
  SlideContent,
} from "../types";
import {
  defaultEmphasisForRole,
  mapContentRoleToTypeLayout,
} from "./layoutRoleMap";

export function applyRoleMetadata(
  slide: Omit<SlideContent, "id">,
  role: ContentRole
): Omit<SlideContent, "id"> {
  const mapped = mapContentRoleToTypeLayout(role);
  return {
    ...slide,
    contentRole: role,
    type: mapped.type,
    layoutType: mapped.layoutType,
    emphasis: defaultEmphasisForRole(role),
  };
}

export function bodyItemCount(slide: Omit<SlideContent, "id">): number {
  if (!slide.body?.length) return 0;
  return slide.body.filter((s) => String(s).trim().length > 0).length;
}

/** Non-empty and contains a digit (filters prose-only "stats" placeholders). */
export function isStatMeaningful(stats: string | undefined): boolean {
  const s = String(stats ?? "").trim();
  if (s.length < 2) return false;
  return /\d/.test(s);
}

export function defaultCtaForGoal(goal: CarouselGoal): string {
  switch (goal) {
    case "educational":
      return "Follow for more tips like this.";
    case "marketing":
      return "Tap through — link in bio to get started.";
    case "storytelling":
      return "Follow for the next part of the story.";
    case "awareness":
      return "Share this if it resonated.";
    default:
      return "Follow for more.";
  }
}
