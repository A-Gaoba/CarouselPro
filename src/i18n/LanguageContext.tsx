import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type AppMessages,
  type Locale,
  LOCALE_STORAGE_KEY,
  en,
  ar,
} from "./messages";

const byLocale: Record<Locale, AppMessages> = { en, ar };

export interface LanguageContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  messages: AppMessages;
  /** True when UI is Arabic (RTL chrome). */
  isRtl: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === "ar" || raw === "en") return raw;
  } catch {
    /* ignore */
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const isRtl = locale === "ar";
    document.documentElement.lang = locale === "ar" ? "ar" : "en";
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.title = byLocale[locale].meta.htmlTitle;
  }, [locale]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale,
      messages: byLocale[locale],
      isRtl: locale === "ar",
    }),
    [locale, setLocale]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
}

/** Interpolate `{key}` placeholders in a string. */
export function formatMessage(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`
  );
}
