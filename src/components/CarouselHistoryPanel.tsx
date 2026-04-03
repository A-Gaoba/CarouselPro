import { History, Trash2, Layers, Calendar } from "lucide-react";
import type { CarouselHistoryItem } from "../types";
import { useLanguage, formatMessage } from "../i18n";

function formatHistoryDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale === "ar" ? "ar" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

interface CarouselHistoryPanelProps {
  items: CarouselHistoryItem[];
  primaryColor: string;
  onOpen: (item: CarouselHistoryItem) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function CarouselHistoryPanel({
  items,
  primaryColor,
  onOpen,
  onDelete,
  onClearAll,
}: CarouselHistoryPanelProps) {
  const { messages, locale } = useLanguage();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-start">
          <h2 className="text-3xl font-bold">{messages.history.title}</h2>
          <p className="text-gray-500">{messages.history.subtitle}</p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(messages.history.confirmClear)) {
                onClearAll();
              }
            }}
            className="self-start rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            {messages.history.clearAll}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white/80 p-12 text-center">
          <History className="mx-auto mb-4 h-12 w-12 text-gray-300" strokeWidth={1.25} aria-hidden />
          <p className="font-medium text-gray-600">{messages.history.emptyTitle}</p>
          <p className="mt-2 text-sm text-gray-500">{messages.history.emptyBody}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="min-w-0 flex-1 text-start"
                >
                  <p className="line-clamp-2 font-medium text-gray-900">{item.prompt}</p>
                  {item.previewTitle && (
                    <p className="mt-1 truncate text-xs text-gray-400">
                      {formatMessage(messages.history.firstSlide, { title: item.previewTitle })}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={12} aria-hidden />
                      {formatHistoryDate(item.createdAt, locale)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Layers size={12} aria-hidden />
                      {formatMessage(messages.history.slidesCount, { n: item.slideCount })}
                    </span>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {messages.history.open}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    title={messages.history.deleteTitle}
                    aria-label={messages.history.deleteTitle}
                  >
                    <Trash2 size={18} aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
