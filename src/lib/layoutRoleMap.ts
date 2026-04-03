import type { ContentRole, LayoutType, SlideEmphasis, SlideType } from "../types";

/** Single source of truth: strategist role → slide type + layoutType (drives UI + fit). */
export function mapContentRoleToTypeLayout(role: ContentRole): {
  type: SlideType;
  layoutType: LayoutType;
} {
  switch (role) {
    case "hook":
      return { type: "hook", layoutType: "hero-typography" };
    case "insight":
      return { type: "value", layoutType: "big-statement" };
    case "list":
      return { type: "value", layoutType: "feature-list" };
    case "comparison":
      return { type: "value", layoutType: "comparison" };
    case "contrast":
      return { type: "value", layoutType: "contrast-card" };
    case "stat":
      return { type: "example", layoutType: "big-statement" };
    case "problem":
      return { type: "problem", layoutType: "hero-typography" };
    case "solution":
      return { type: "value", layoutType: "hero-typography" };
    case "cta":
      return { type: "cta", layoutType: "cta-final" };
  }
}

export function defaultEmphasisForRole(role: ContentRole): SlideEmphasis {
  switch (role) {
    case "hook":
      return "hook";
    case "stat":
      return "balanced";
    case "list":
    case "comparison":
    case "contrast":
      return "body";
    case "cta":
      return "close";
    default:
      return "title";
  }
}
