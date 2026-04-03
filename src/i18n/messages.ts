/**
 * Single source of truth for UI copy — English and Arabic share this shape.
 */
export interface AppMessages {
  meta: {
    appTitle: string;
    htmlTitle: string;
  };
  nav: {
    generate: string;
    brand: string;
    history: string;
    proPlan: string;
  };
  lang: {
    english: string;
    arabic: string;
  };
  generate: {
    defaultTopic: string;
    title: string;
    subtitle: string;
    topicPlaceholder: string;
    topicCharHint: string;
    topicEmptyHint: string;
    generate: string;
    generating: string;
    exportAll: string;
    filmstrip: string;
    slideCounter: string;
    downloadSlideTitle: string;
    slidePrev: string;
    slideNext: string;
    slideThumbTitle: string;
    emptyTitle: string;
    emptyBody: string;
  };
  brand: {
    livePreviewTitle: string;
    livePreviewSubtitle: string;
    pageTitle: string;
    pageSubtitle: string;
    name: string;
    logoFallback: string;
    logoImage: string;
    uploadLogo: string;
    removeLogo: string;
    colors: string;
    colorPrimary: string;
    colorSecondary: string;
    colorAccent: string;
    colorCta: string;
    whatsapp: string;
    instagram: string;
    website: string;
    save: string;
    previewPlaceholder: string;
  };
  history: {
    title: string;
    subtitle: string;
    clearAll: string;
    confirmClear: string;
    emptyTitle: string;
    emptyBody: string;
    firstSlide: string;
    open: string;
    deleteTitle: string;
    slidesCount: string;
  };
  toast: {
    exportingAll: string;
    exportingOne: string;
    exportFailed: string;
    exportSlideFailed: string;
    slideRefMissing: string;
  };
  errors: {
    unexpected: string;
    parseSlides: string;
    generateFailed: string;
    exportFailedList: string;
  };
  slides: {
    keyPoints: string;
    before: string;
    after: string;
    getStarted: string;
  };
}

export const en: AppMessages = {
  meta: {
    appTitle: "CarouselPro AI",
    htmlTitle: "CarouselPro AI",
  },
  nav: {
    generate: "Generate",
    brand: "Brand Identity",
    history: "History",
    proPlan: "Pro Plan",
  },
  lang: {
    english: "English",
    arabic: "العربية",
  },
  generate: {
    defaultTopic:
      "Turning product photos into social media ad creatives",
    title: "Create Carousel",
    subtitle: "Premium typography-first Instagram designs.",
    topicPlaceholder:
      "Enter a topic, a paragraph, or messy notes…",
    topicCharHint: "{count} characters",
    topicEmptyHint: "Type anything…",
    generate: "Generate Carousel",
    generating: "Analyzing & Generating…",
    exportAll: "Export All Slides",
    filmstrip: "Filmstrip",
    slideCounter: "{current} / {total}",
    downloadSlideTitle: "Download this slide",
    slidePrev: "Previous slide",
    slideNext: "Next slide",
    slideThumbTitle: "Slide {n}",
    emptyTitle: "Ready to create?",
    emptyBody:
      "Enter a topic above and watch AI transform your ideas into a premium Instagram carousel.",
  },
  brand: {
    livePreviewTitle: "Live preview",
    livePreviewSubtitle: "How your carousel chrome will look.",
    pageTitle: "Brand Identity",
    pageSubtitle: "Configure your brand assets for consistent generation.",
    name: "Brand Name",
    logoFallback: "Logo Emoji/Icon (Fallback)",
    logoImage: "Brand Logo Image",
    uploadLogo: "Upload Logo",
    removeLogo: "Remove",
    colors: "Brand Colors",
    colorPrimary: "Primary",
    colorSecondary: "Secondary",
    colorAccent: "Accent",
    colorCta: "CTA",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    website: "Website",
    save: "Save Brand Identity",
    previewPlaceholder: "Content will be inserted here",
  },
  history: {
    title: "History",
    subtitle: "Past carousels saved on this device (newest first).",
    clearAll: "Clear all",
    confirmClear: "Remove all saved history from this browser?",
    emptyTitle: "No history yet",
    emptyBody:
      "Each successful Generate Carousel run will appear here automatically.",
    firstSlide: "First slide: {title}",
    open: "Open",
    deleteTitle: "Delete",
    slidesCount: "{n} slides",
  },
  toast: {
    exportingAll: "Exporting all slides…",
    exportingOne: "Exporting slide…",
    exportFailed: "Export failed. Please try again.",
    exportSlideFailed: "Failed to export slide. Please try again.",
    slideRefMissing: "Slide reference not found",
  },
  errors: {
    unexpected: "An unexpected error occurred. Please try again.",
    parseSlides:
      "The AI returned slides we could not parse. Please try again.",
    generateFailed:
      "Failed to generate carousel after multiple attempts.",
    exportFailedList: "Failed to export slides: {list}",
  },
  slides: {
    keyPoints: "Key points",
    before: "Before",
    after: "After",
    getStarted: "Get started",
  },
};

export const ar: AppMessages = {
  meta: {
    appTitle: "CarouselPro AI",
    htmlTitle: "CarouselPro AI",
  },
  nav: {
    generate: "إنشاء",
    brand: "الهوية التجارية",
    history: "السجل",
    proPlan: "الخطة الاحترافية",
  },
  lang: {
    english: "English",
    arabic: "العربية",
  },
  generate: {
    defaultTopic:
      "تحويل صور المنتجات إلى إبداعات إعلانية لوسائل التواصل",
    title: "إنشاء كاروسيل",
    subtitle: "تصاميم إنستغرام تركز على الطباعة بجودة عالية.",
    topicPlaceholder:
      "أدخل موضوعًا أو فقرة أو ملاحظات غير منسّقة…",
    topicCharHint: "{count} حرفًا",
    topicEmptyHint: "اكتب أي شيء…",
    generate: "إنشاء الكاروسيل",
    generating: "جارٍ التحليل والإنشاء…",
    exportAll: "تصدير كل الشرائح",
    filmstrip: "شريط المعاينة",
    slideCounter: "{current} / {total}",
    downloadSlideTitle: "تنزيل هذه الشريحة",
    slidePrev: "الشريحة السابقة",
    slideNext: "الشريحة التالية",
    slideThumbTitle: "الشريحة {n}",
    emptyTitle: "هل أنت مستعد للإبداع؟",
    emptyBody:
      "أدخل موضوعًا أعلاه وشاهد الذكاء الاصطناعي يحوّل أفكارك إلى كاروسيل إنستغرام مميز.",
  },
  brand: {
    livePreviewTitle: "معاينة مباشرة",
    livePreviewSubtitle: "كيف ستبدو هوية الكاروسيل.",
    pageTitle: "الهوية التجارية",
    pageSubtitle: "اضبط أصول علامتك لإنشاء متناسق.",
    name: "اسم العلامة",
    logoFallback: "رمز/إيموجي الشعار (احتياطي)",
    logoImage: "صورة الشعار",
    uploadLogo: "رفع الشعار",
    removeLogo: "إزالة",
    colors: "ألوان العلامة",
    colorPrimary: "أساسي",
    colorSecondary: "ثانوي",
    colorAccent: "تمييز",
    colorCta: "دعوة لإجراء",
    whatsapp: "واتساب",
    instagram: "إنستغرام",
    website: "الموقع",
    save: "حفظ الهوية التجارية",
    previewPlaceholder: "سيُدرج المحتوى هنا",
  },
  history: {
    title: "السجل",
    subtitle: "الكاروسيلات المحفوظة على هذا الجهاز (الأحدث أولاً).",
    clearAll: "مسح الكل",
    confirmClear: "حذف كل السجل المحفوظ في هذا المتصفح؟",
    emptyTitle: "لا يوجد سجل بعد",
    emptyBody:
      "سيظهر هنا تلقائيًا كل عملية إنشاء كاروسيل ناجحة.",
    firstSlide: "الشريحة الأولى: {title}",
    open: "فتح",
    deleteTitle: "حذف",
    slidesCount: "{n} شرائح",
  },
  toast: {
    exportingAll: "جارٍ تصدير كل الشرائح…",
    exportingOne: "جارٍ تصدير الشريحة…",
    exportFailed: "فشل التصدير. حاول مرة أخرى.",
    exportSlideFailed: "فشل تصدير الشريحة. حاول مرة أخرى.",
    slideRefMissing: "مرجع الشريحة غير موجود",
  },
  errors: {
    unexpected: "حدث خطأ غير متوقع. حاول مرة أخرى.",
    parseSlides:
      "أعاد النموذج شرائح لا يمكننا تحليلها. حاول مرة أخرى.",
    generateFailed: "فشل إنشاء الكاروسيل بعد عدة محاولات.",
    exportFailedList: "فشل تصدير الشرائح: {list}",
  },
  slides: {
    keyPoints: "نقاط رئيسية",
    before: "قبل",
    after: "بعد",
    getStarted: "ابدأ الآن",
  },
};

export type Locale = "en" | "ar";

export const LOCALES: Locale[] = ["en", "ar"];

export const LOCALE_STORAGE_KEY = "carouselpro_locale_v1";
