import { useState, useRef, ChangeEvent, CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import {
  Sparkles,
  Download,
  Settings,
  RefreshCw,
  Instagram,
  Globe,
  MessageCircle,
  Image as ImageIcon,
  ChevronRight,
  ChevronLeft,
  History,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { BrandConfig, SlideContent, type CarouselHistoryItem } from './types';
import { generateCarouselContent } from './lib/openai';
import { BrandPreviewSlide, GeneratedSlide } from './components/slides';
import { captureSlideToPng, waitForSlideExportElement } from './lib/captureSlidePng';
import {
  loadHistory,
  addGenerationToHistory,
  deleteHistoryItem,
  clearAllHistory,
} from './lib/carouselHistory';
import { CarouselHistoryPanel } from './components/CarouselHistoryPanel';
import { useLanguage, formatMessage } from './i18n';
import { mapGenerationError } from './lib/mapGenerationError';
import { getSlideDir } from './lib/textDirection';

/** Served from `public/favicon.svg` — default carousel logo until user uploads another. */
const DEFAULT_LOGO_URL = "/favicon.svg";

const DEFAULT_BRAND: BrandConfig = {
  name: "naqla-tech",
  logo: "⚡",
  logoUrl: DEFAULT_LOGO_URL,
  primaryColor: "#4A5759", // Naqla Gray
  secondaryColor: "#FFFFFF", // Naqla White
  accentColor: "#EF3A39", // Naqla Red
  ctaColor: "#EF3A39", // Naqla Red
  website: "naqla-tech.com",
  instagram: "@naqla_tech",
  whatsapp: "+966 55 517 0481"
};

export default function App() {
  const { messages, locale, setLocale, isRtl } = useLanguage();
  const [brand, setBrand] = useState<BrandConfig>(DEFAULT_BRAND);
  const [topic, setTopic] = useState(messages.generate.defaultTopic);
  const [slides, setSlides] = useState<SlideContent[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'generate' | 'brand' | 'history'>('generate');
  const [historyItems, setHistoryItems] = useState<CarouselHistoryItem[]>(() => loadHistory());

  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  /** Disables Framer Motion slide transitions during batch export so capture matches the painted frame. */
  const [exportingSlides, setExportingSlides] = useState(false);

  const visibleSlideRef = useRef<HTMLDivElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBrand({ ...brand, logoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!topic) return;
    setIsGenerating(true);
    setError(null);
    setSlides([]);
    setSelectedSlideIndex(0);

    try {
      const content = await generateCarouselContent(topic, brand.name);
      setSlides(content);

      addGenerationToHistory({
        prompt: topic,
        slides: content,
        brand: { ...brand },
      });
      setHistoryItems(loadHistory());

      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        colors: [brand.accentColor, brand.ctaColor, '#FFFFFF']
      });
    } catch (err) {
      console.error(err);
      setError(mapGenerationError(err, messages));
    } finally {
      setIsGenerating(false);
    }
  };

  const showToast = (message: string, isError = false) => {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-8 left-1/2 -translate-x-1/2 ${isError ? 'bg-red-600' : 'bg-black'} text-white px-6 py-3 rounded-full z-[100] font-bold shadow-2xl flex items-center gap-3 transition-all duration-300`;
    toast.innerHTML = isError
      ? `<div class="h-4 w-4 flex items-center justify-center bg-white text-red-600 rounded-full text-[10px]">!</div> ${message}`
      : `<div class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div> ${message}`;
    document.body.appendChild(toast);

    if (isError) {
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 4000);
    }
    return toast;
  };

  const handleExport = async () => {
    if (slides.length === 0) return;

    const exportToast = showToast(messages.toast.exportingAll);
    const originalIndex = selectedSlideIndex;
    const bg = brand.secondaryColor || '#ffffff';

    /** Must commit before the loop so Motion uses instant transitions (no wait-for-exit race). */
    flushSync(() => {
      setExportingSlides(true);
    });
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    try {
      const failedSlides: number[] = [];

      for (let i = 0; i < slides.length; i++) {
        const expectedId = slides[i].id;

        flushSync(() => {
          setSelectedSlideIndex(i);
        });

        try {
          const el = await waitForSlideExportElement(
            () => visibleSlideRef.current,
            expectedId
          );
          const dataUrl = await captureSlideToPng(el, bg);
          if (!dataUrl || dataUrl.length < 5000) {
            throw new Error('Invalid image data generated');
          }
          const link = document.createElement('a');
          link.download = `${brand.name.toLowerCase().replace(/\s+/g, '-')}-slide-${i + 1}.png`;
          link.href = dataUrl;
          link.click();
        } catch (err) {
          console.error(`Export failed for slide ${i + 1}:`, err);
          failedSlides.push(i + 1);
        }
      }

      flushSync(() => {
        setSelectedSlideIndex(originalIndex);
      });

      if (failedSlides.length > 0) {
        showToast(
          formatMessage(messages.errors.exportFailedList, { list: failedSlides.join(', ') }),
          true
        );
      } else {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: [brand.accentColor, brand.primaryColor, brand.ctaColor],
        });
      }
    } catch (error) {
      console.error('Export all failed:', error);
      showToast(messages.toast.exportFailed, true);
    } finally {
      flushSync(() => {
        setExportingSlides(false);
      });
      if (document.body.contains(exportToast)) {
        document.body.removeChild(exportToast);
      }
    }
  };

  const handleSingleExport = async (index: number) => {
    const el = visibleSlideRef.current;
    if (!el) {
      showToast(messages.toast.slideRefMissing, true);
      return;
    }

    const exportToast = showToast(messages.toast.exportingOne);

    try {
      const dataUrl = await captureSlideToPng(el, brand.secondaryColor || '#ffffff');
      if (!dataUrl || dataUrl.length < 5000) {
        throw new Error('Invalid image data generated');
      }

      const link = document.createElement('a');
      link.download = `${brand.name.toLowerCase().replace(/\s+/g, '-')}-slide-${index + 1}.png`;
      link.href = dataUrl;
      link.click();

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: [brand.accentColor, brand.primaryColor],
      });
    } catch (error) {
      console.error('Single export failed:', error);
      showToast(messages.toast.exportSlideFailed, true);
    } finally {
      if (document.body.contains(exportToast)) {
        document.body.removeChild(exportToast);
      }
    }
  };

  const handleOpenHistoryItem = (item: CarouselHistoryItem) => {
    setBrand(JSON.parse(JSON.stringify(item.brand)) as BrandConfig);
    setTopic(item.prompt);
    setSlides(item.slides);
    setSelectedSlideIndex(0);
    setError(null);
    setActiveTab('generate');
  };

  const handleDeleteHistoryItem = (id: string) => {
    setHistoryItems(deleteHistoryItem(id));
  };

  const handleClearAllHistory = () => {
    clearAllHistory();
    setHistoryItems([]);
  };

  return (
    <div
      className="min-h-screen flex flex-col md:flex-row"
      lang={locale === 'ar' ? 'ar' : 'en'}
      style={{
        '--brand-primary': brand.primaryColor,
        '--brand-secondary': brand.secondaryColor,
        '--brand-accent': brand.accentColor,
        '--brand-cta': brand.ctaColor,
        '--accent-gradient': `linear-gradient(135deg, ${brand.accentColor}, ${brand.ctaColor})`,
        '--glass-bg': 'rgba(255, 255, 255, 0.7)',
        '--glass-bg-export': 'rgba(255, 255, 255, 0.95)',
        '--glass-border': `${brand.accentColor}15`,
      } as CSSProperties}
    >
      {/* Sidebar */}
      <aside className="flex w-full flex-col gap-8 border-gray-200 bg-white p-6 md:w-80 md:border-e md:border-gray-200">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black font-bold text-white">C</div>
          <h1 className="text-xl font-bold tracking-tight">{messages.meta.appTitle}</h1>
        </div>

        <nav className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('generate')}
            className={`flex items-center gap-3 rounded-lg px-4 py-2 transition-all ${activeTab === 'generate' ? 'text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}
            style={activeTab === 'generate' ? { backgroundColor: brand.primaryColor } : {}}
          >
            <Sparkles size={18} className="shrink-0" aria-hidden />
            {messages.nav.generate}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('brand')}
            className={`flex items-center gap-3 rounded-lg px-4 py-2 transition-all ${activeTab === 'brand' ? 'text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}
            style={activeTab === 'brand' ? { backgroundColor: brand.primaryColor } : {}}
          >
            <Settings size={18} className="shrink-0" aria-hidden />
            {messages.nav.brand}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-3 rounded-lg px-4 py-2 transition-all ${activeTab === 'history' ? 'text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}
            style={activeTab === 'history' ? { backgroundColor: brand.primaryColor } : {}}
          >
            <History size={18} className="shrink-0" aria-hidden />
            {messages.nav.history}
          </button>
        </nav>

        <div
          className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1"
          role="group"
          aria-label={locale === 'ar' ? 'اللغة' : 'Language'}
        >
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setLocale('en')}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                locale === 'en' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {messages.lang.english}
            </button>
            <button
              type="button"
              onClick={() => setLocale('ar')}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                locale === 'ar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {messages.lang.arabic}
            </button>
          </div>
        </div>

        <div className="mt-auto border-t border-gray-100 pt-6">
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 font-medium text-blue-600">
              {brand.name.charAt(0)}
            </div>
            <div className="min-w-0 text-start">
              <p className="truncate text-sm font-semibold">{brand.name}</p>
              <p className="text-xs text-gray-500">{messages.nav.proPlan}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[#F1F5F9]/50 relative">
        <AnimatePresence mode="wait">
          {activeTab === 'generate' ? (
            <motion.div
              key="generate"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-5xl mx-auto space-y-8 p-8"
            >
              <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div className="text-start">
                  <h2 className="text-3xl font-bold">{messages.generate.title}</h2>
                  <p className="text-gray-500">{messages.generate.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {slides.length > 0 && (
                    <button
                      type="button"
                      onClick={handleExport}
                      className="flex items-center gap-2 rounded-xl px-6 py-3 font-bold text-white shadow-lg transition-all hover:shadow-xl active:scale-95"
                      style={{ backgroundColor: brand.primaryColor }}
                    >
                      <Download size={18} className="shrink-0" aria-hidden />
                      {messages.generate.exportAll}
                    </button>
                  )}
                </div>
              </header>

              <div className="glass-card space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
                <div className="group relative">
                  <textarea
                    placeholder={messages.generate.topicPlaceholder}
                    dir="auto"
                    className="min-h-[140px] w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 pb-16 ps-4 pe-4 pt-4 text-lg shadow-inner transition-all focus:outline-none focus:ring-2 focus:ring-black/5"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                  />
                  <div className="absolute bottom-3 end-3 flex items-center gap-3">
                    <span className="hidden text-xs font-medium text-gray-400 sm:block">
                      {topic.length > 0
                        ? formatMessage(messages.generate.topicCharHint, { count: topic.length })
                        : messages.generate.topicEmptyHint}
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={isGenerating || !topic}
                      className="flex items-center gap-2 rounded-xl px-6 py-3 font-bold text-white shadow-lg transition-all hover:shadow-xl active:scale-95 disabled:opacity-50"
                      style={{ backgroundColor: brand.primaryColor }}
                    >
                      {isGenerating ? <RefreshCw className="animate-spin" size={18} aria-hidden /> : <Sparkles size={18} aria-hidden />}
                      {isGenerating ? messages.generate.generating : messages.generate.generate}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 animate-in fade-in slide-in-from-top-2">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <span className="font-bold text-sm">!</span>
                  </div>
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              {slides.length > 0 ? (
                <div className="flex flex-col items-center space-y-12">
                  <div className="relative w-full max-w-[480px]">
                    <div className="absolute start-[-5rem] top-1/2 hidden -translate-y-1/2 flex-col gap-4 xl:flex">
                      <button
                        type="button"
                        onClick={() => setSelectedSlideIndex(prev => Math.max(0, prev - 1))}
                        disabled={selectedSlideIndex === 0}
                        className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-100 bg-white text-gray-400 shadow-xl transition-all hover:scale-110 hover:text-indigo-600 disabled:opacity-30"
                        aria-label={messages.generate.slidePrev}
                      >
                        <ChevronLeft size={24} aria-hidden />
                      </button>
                    </div>
                    <div className="absolute end-[-5rem] top-1/2 hidden -translate-y-1/2 flex-col gap-4 xl:flex">
                      <button
                        type="button"
                        onClick={() => setSelectedSlideIndex(prev => Math.min(slides.length - 1, prev + 1))}
                        disabled={selectedSlideIndex === slides.length - 1}
                        className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-100 bg-white text-gray-400 shadow-xl transition-all hover:scale-110 hover:text-indigo-600 disabled:opacity-30"
                        aria-label={messages.generate.slideNext}
                      >
                        <ChevronRight size={24} aria-hidden />
                      </button>
                    </div>

                    <div className="group/slide relative z-10 overflow-hidden rounded-[24px]">
                      <div className="relative aspect-[4/5] w-full bg-transparent">
                        {/* Single Slide Download Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSingleExport(selectedSlideIndex);
                          }}
                          className="absolute end-4 top-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white/90 text-gray-600 opacity-0 shadow-lg backdrop-blur-md transition-all hover:scale-110 hover:text-indigo-600 active:scale-95 group-hover/slide:opacity-100"
                          title={messages.generate.downloadSlideTitle}
                        >
                          <Download size={18} aria-hidden />
                        </button>

                        <AnimatePresence mode={exportingSlides ? 'sync' : 'wait'}>
                          <motion.div
                            key={slides[selectedSlideIndex]?.id ?? selectedSlideIndex}
                            initial={
                              exportingSlides
                                ? false
                                : {
                                    x: getSlideDir(slides[selectedSlideIndex]) === 'rtl' ? -50 : 50,
                                    opacity: 0,
                                  }
                            }
                            animate={{ x: 0, opacity: 1 }}
                            exit={
                              exportingSlides
                                ? { opacity: 0 }
                                : {
                                    x: getSlideDir(slides[selectedSlideIndex]) === 'rtl' ? 50 : -50,
                                    opacity: 0,
                                  }
                            }
                            transition={
                              exportingSlides
                                ? { duration: 0 }
                                : { type: "spring", stiffness: 300, damping: 30 }
                            }
                            className="w-full h-full"
                          >
                            <GeneratedSlide
                              ref={visibleSlideRef}
                              slide={slides[selectedSlideIndex]}
                              brand={brand}
                              index={selectedSlideIndex}
                              total={slides.length}
                            />
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  <div className="w-full max-w-4xl">
                    <div className="mb-4 flex items-center justify-between px-2">
                      <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">
                        {messages.generate.filmstrip}
                      </h4>
                      <span className="text-xs font-medium text-gray-400" dir="ltr">
                        {formatMessage(messages.generate.slideCounter, {
                          current: selectedSlideIndex + 1,
                          total: slides.length,
                        })}
                      </span>
                    </div>
                    <div
                      className="flex gap-4 overflow-x-auto scroll-smooth px-2 pb-6 no-scrollbar"
                      dir="ltr"
                    >
                      {slides.map((_, i) => (
                        <motion.button
                          key={i}
                          type="button"
                          whileHover={{ y: -5 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSelectedSlideIndex(i)}
                          title={formatMessage(messages.generate.slideThumbTitle, { n: i + 1 })}
                          className={`relative shrink-0 w-32 aspect-[4/5] rounded-2xl overflow-hidden border-2 transition-all duration-300 shadow-lg ${i === selectedSlideIndex
                              ? 'border-indigo-600 ring-4 ring-indigo-600/10 scale-105 z-10'
                              : 'border-gray-100 opacity-70'
                            }`}
                        >
                          <div
                            className="absolute inset-0 slide-template-dots slide-template-surface"
                            style={{ backgroundColor: brand.secondaryColor }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span
                              className="text-xs font-semibold tabular-nums"
                              style={{ color: `${brand.primaryColor}50` }}
                            >
                              {i + 1}
                            </span>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex h-96 max-w-md flex-col items-center justify-center space-y-8 text-center">
                  <div className="mx-auto flex h-24 w-24 -rotate-12 transform items-center justify-center rounded-[32px] border border-gray-50 bg-white shadow-2xl">
                    <Sparkles size={40} className="text-indigo-600" aria-hidden />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-3xl font-black tracking-tight text-gray-900">{messages.generate.emptyTitle}</h2>
                    <p className="font-medium leading-relaxed text-gray-500">{messages.generate.emptyBody}</p>
                  </div>
                </div>
              )}
            </motion.div>
          ) : activeTab === 'brand' ? (
            <motion.div
              key="brand"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              dir="ltr"
              className="mx-auto flex max-w-6xl flex-col gap-10 p-8 lg:flex-row lg:items-start lg:gap-12"
            >
              {/* Live preview — column stays left (layout locked; not mirrored by html[dir=rtl]) */}
              <div className="flex w-full flex-col gap-4 lg:sticky lg:top-8 lg:max-w-[min(420px,42vw)] lg:shrink-0">
                <div className={isRtl ? "text-end" : "text-start"}>
                  <h2 className="text-xl font-bold tracking-tight text-gray-900">{messages.brand.livePreviewTitle}</h2>
                  <p className="text-sm text-gray-500">{messages.brand.livePreviewSubtitle}</p>
                </div>
                <div className="mx-auto w-full max-w-[400px]">
                  <div className="overflow-hidden rounded-[24px]">
                    <BrandPreviewSlide
                      brand={brand}
                      dir={isRtl ? 'rtl' : 'ltr'}
                      previewPlaceholder={messages.brand.previewPlaceholder}
                    />
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-8" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'ar' : 'en'}>
                <div className={isRtl ? "text-end" : "text-start"}>
                  <h2 className="text-3xl font-bold">{messages.brand.pageTitle}</h2>
                  <p className="text-gray-500">{messages.brand.pageSubtitle}</p>
                </div>

                <div className="glass-card space-y-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className={`block text-sm font-semibold text-gray-700 ${isRtl ? "text-end" : "text-start"}`}>
                        {messages.brand.name}
                      </label>
                      <input
                        type="text"
                        dir="auto"
                        className={`w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black/5 ${isRtl ? "text-end" : "text-start"}`}
                        value={brand.name}
                        onChange={(e) => setBrand({ ...brand, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className={`block text-sm font-semibold text-gray-700 ${isRtl ? "text-end" : "text-start"}`}>
                        {messages.brand.logoFallback}
                      </label>
                      <input
                        type="text"
                        dir="auto"
                        className={`w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-black/5 ${isRtl ? "text-end" : "text-start"}`}
                        value={brand.logo}
                        onChange={(e) => setBrand({ ...brand, logo: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className={`block text-sm font-semibold text-gray-700 ${isRtl ? "text-end" : "text-start"}`}>
                      {messages.brand.logoImage}
                    </label>
                    <div className={`flex flex-wrap items-center gap-4 ${isRtl ? "justify-end" : "justify-start"}`}>
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                        {brand.logoUrl ? (
                          <img src={brand.logoUrl} alt="" className="h-full w-full object-contain" />
                        ) : (
                          <ImageIcon className="text-gray-300" size={24} aria-hidden />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-50"
                      >
                        {messages.brand.uploadLogo}
                      </button>
                      <input
                        type="file"
                        ref={logoInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleLogoUpload}
                      />
                      {brand.logoUrl && brand.logoUrl !== DEFAULT_LOGO_URL && (
                        <button
                          type="button"
                          onClick={() => setBrand({ ...brand, logoUrl: DEFAULT_LOGO_URL })}
                          className="text-sm text-red-500 hover:underline"
                        >
                          {messages.brand.removeLogo}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className={`block text-sm font-semibold text-gray-700 ${isRtl ? "text-end" : "text-start"}`}>
                      {messages.brand.colors}
                    </label>
                    <div className="grid grid-cols-4 gap-4">
                      {(
                        [
                          ['primaryColor', messages.brand.colorPrimary],
                          ['secondaryColor', messages.brand.colorSecondary],
                          ['accentColor', messages.brand.colorAccent],
                          ['ctaColor', messages.brand.colorCta],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="space-y-2">
                          <div
                            className="h-12 w-full rounded-lg border border-gray-200"
                            style={{ backgroundColor: brand[key as keyof BrandConfig] as string }}
                          />
                          <input
                            type="color"
                            className="h-8 w-full cursor-pointer border-0 bg-transparent p-0"
                            value={brand[key as keyof BrandConfig] as string}
                            onChange={(e) => setBrand({ ...brand, [key]: e.target.value })}
                          />
                          <p className={`text-[10px] text-gray-500 ${isRtl ? "text-end" : "text-center"}`}>
                            {label}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className={`block text-sm font-semibold text-gray-700 ${isRtl ? "text-end" : "text-start"}`}>
                        {messages.brand.whatsapp}
                      </label>
                      <div className="relative" dir="ltr">
                        <MessageCircle
                          className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400"
                          size={16}
                          aria-hidden
                        />
                        <input
                          type="text"
                          dir="ltr"
                          autoComplete="tel"
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 ps-10 pe-4 text-start focus:outline-none focus:ring-2 focus:ring-black/5"
                          value={brand.whatsapp}
                          onChange={(e) => setBrand({ ...brand, whatsapp: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className={`block text-sm font-semibold text-gray-700 ${isRtl ? "text-end" : "text-start"}`}>
                        {messages.brand.instagram}
                      </label>
                      <div className="relative" dir="ltr">
                        <Instagram
                          className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400"
                          size={16}
                          aria-hidden
                        />
                        <input
                          type="text"
                          dir="ltr"
                          autoComplete="username"
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 ps-10 pe-4 text-start focus:outline-none focus:ring-2 focus:ring-black/5"
                          value={brand.instagram}
                          onChange={(e) => setBrand({ ...brand, instagram: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className={`block text-sm font-semibold text-gray-700 ${isRtl ? "text-end" : "text-start"}`}>
                        {messages.brand.website}
                      </label>
                      <div className="relative" dir="ltr">
                        <Globe
                          className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400"
                          size={16}
                          aria-hidden
                        />
                        <input
                          type="text"
                          dir="ltr"
                          autoComplete="url"
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 ps-10 pe-4 text-start focus:outline-none focus:ring-2 focus:ring-black/5"
                          value={brand.website}
                          onChange={(e) => setBrand({ ...brand, website: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => setActiveTab('generate')}
                      className="w-full rounded-xl py-3 font-semibold text-white shadow-lg transition-all hover:shadow-xl active:scale-95"
                      style={{ backgroundColor: brand.primaryColor }}
                    >
                      {messages.brand.save}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full"
            >
              <CarouselHistoryPanel
                items={historyItems}
                primaryColor={brand.primaryColor}
                onOpen={handleOpenHistoryItem}
                onDelete={handleDeleteHistoryItem}
                onClearAll={handleClearAllHistory}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
