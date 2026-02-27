import React from "react";

export default function Sidebar({
  viewMode,
  setViewMode,
  mappingResult,
  results,
  loadingStates,
}) {
  const items = [
    { key: "list", label: "List View" },
    // { key: "tree", label: "Tree View", requiresMapping: true },
    // { key: "patterns", label: "Patterns", requiresMapping: true },
    { key: "graph", label: "Graph Map", requiresMapping: true },
    { key: "meta", label: "Meta Info" },
  ];

  return (
    <div className="w-64 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 
                    text-green-400 h-full flex flex-col 
                    rounded-3xl shadow-2xl p-6">

      {/* Title */}
      <div className="text-2xl font-bold mb-8 text-center tracking-wide">
        Features
      </div>

      {/* Navigation */}
      <nav className="flex flex-col space-y-4">
        {items.map((item) => {
          const isDisabled =
            item.requiresMapping && !mappingResult;

          return (
            <button
              key={item.key}
              onClick={() => setViewMode(item.key)}
              disabled={isDisabled}
              className={`
                text-left px-6 py-3 rounded-2xl 
                transition-all duration-200 
                w-full font-medium
                ${
                  viewMode === item.key
                    ? "bg-green-600 text-white shadow-lg"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }
                ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}
              `}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}