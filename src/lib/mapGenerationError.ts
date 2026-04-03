import { en, type AppMessages } from "../i18n/messages";

/** Map thrown English API errors to the active locale. */
export function mapGenerationError(err: unknown, messages: AppMessages): string {
  if (!(err instanceof Error)) return messages.errors.unexpected;
  if (err.message === en.errors.parseSlides) return messages.errors.parseSlides;
  if (err.message === en.errors.generateFailed) return messages.errors.generateFailed;
  return err.message || messages.errors.unexpected;
}
