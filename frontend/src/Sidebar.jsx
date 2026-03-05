import React from "react";

export default function Sidebar({
  viewMode,
  setViewMode,
  scanDone,
  mappingReady,
  mappingLoading,
  crawlData,
  crawlLoading,
}) {
  const items = [
    {
      key: "list",
      label: "List View",
      icon: "📋",
      requiresScan: true,
    },
    {
      key: "graph",
      label: "Graph Map",
      icon: "🕸️",
      requiresScan: true,
      requiresMapping: true,
    },
    {
      key: "meta",
      label: "Meta Info",
      icon: "🌐",
      requiresScan: true,
      note: "loaded with scan",
    },
    {
      key: "crawl",
      label: "Crawl URLs",
      icon: "🕷️",
      requiresScan: false,
      isCrawl: true,
    },
  ];

  return (
    <div className="h-full flex flex-col p-5 space-y-2">

      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 mt-2 text-center">
        Features
      </p>

      {items.map((item) => {
        const disabled =
          (item.requiresScan && !scanDone) ||
          (item.requiresMapping && !mappingReady && !mappingLoading);

        const isActive = viewMode === item.key;

        // Right-side status badge
        let badge = null;
        if (item.key === "graph" && mappingLoading) {
          badge = <span className="text-xs text-blue-400 animate-pulse ml-auto">building…</span>;
        } else if (item.key === "graph" && mappingReady) {
          badge = <span className="text-xs text-green-500 ml-auto">✓</span>;
        } else if (item.key === "meta" && scanDone) {
          badge = <span className="text-xs text-green-500 ml-auto">✓</span>;
        } else if (item.key === "crawl" && crawlLoading) {
          badge = <span className="text-xs text-purple-400 animate-pulse ml-auto">running…</span>;
        } else if (item.key === "crawl" && crawlData) {
          badge = (
            <span className="text-xs bg-purple-800 text-purple-200 px-2 py-0.5 rounded-full ml-auto">
              {crawlData.total_unique}
            </span>
          );
        }

        return (
          <button
            key={item.key}
            onClick={() => !disabled && setViewMode(item.key)}
            disabled={disabled}
            className={`
              flex items-center gap-2.5 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all
              ${isActive
                ? item.isCrawl
                  ? "bg-purple-700 text-white shadow-lg"
                  : "bg-green-700 text-white shadow-lg"
                : item.isCrawl
                ? "bg-gray-800/60 text-purple-300 hover:bg-purple-900/30 border border-purple-900/50"
                : "bg-gray-800/60 text-gray-300 hover:bg-gray-700/60"
              }
              ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {badge}
          </button>
        );
      })}

      {/* Bottom hint */}
      <div className="mt-auto pt-6">
        {!scanDone && (
          <div className="text-xs text-gray-700 text-center bg-gray-900/50 rounded-xl p-3">
            Press <span className="text-green-600">Scan</span> to unlock views
          </div>
        )}
        <div className="text-xs text-gray-800 text-center mt-3 font-mono">
          gau · waybackurls · katana
        </div>
      </div>
    </div>
  );
}