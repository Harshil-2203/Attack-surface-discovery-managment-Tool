import React, { useState } from 'react';

// Ensure URL has a protocol for opening in browser
function toUrl(s) {
  if (!s) return null;
  return s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`;
}

export default function MetaViewer({ domain, subdomains, meta }) {
  const [copied, setCopied] = useState(null);

  const handleCopy = (s) => {
    navigator.clipboard.writeText(s);
    setCopied(s);
    setTimeout(() => setCopied(null), 1500);
  };

  if (!meta) {
    return (
      <div className="bg-gray-800 p-4 rounded">
        <h3 className="text-lg font-semibold mb-2">Meta Info</h3>
        <p className="text-gray-400">No metadata available. Run a scan or refresh mapping.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 p-4 rounded">
      <h3 className="text-lg font-semibold mb-4">HTTP Metadata for {domain}</h3>
      <div className="space-y-2 max-h-96 overflow-auto">
        {subdomains.map((s, i) => {
          const m = meta[s] || meta[s.replace(/^https?:\/\//, '')] || meta[s.replace(/\.$/, '')] || {};
          const href = toUrl(m.final_url || s);
          return (
            <div key={i} className="p-3 bg-gray-700 rounded border border-gray-700">
              <div className="flex justify-between items-start">

                {/* Left: subdomain + copy + title */}
                <div className="flex items-center gap-2 flex-1 min-w-0 mr-3">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-300 font-medium truncate hover:text-cyan-100 hover:underline transition-colors"
                    title={"Open " + href + " in new tab"}
                  >
                    {s}
                  </a>
                  <button
                    onClick={() => handleCopy(s)}
                    style={{
                      flexShrink: 0,
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: copied === s ? "#4ade80" : "#4b5563",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0 4px",
                    }}
                  >
                    {copied === s ? "✓" : "copy"}
                  </button>
                  <div className="text-sm text-gray-300 truncate">{m.title || '—'}</div>
                </div>

                {/* Right: status + final_url as clickable link */}
                <div className="text-right shrink-0">
                  <div className="text-sm text-green-300">{m.status_code || m.error || '—'}</div>
                  {m.final_url ? (
                    <a
                      href={toUrl(m.final_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-cyan-400 hover:underline transition-colors truncate block max-w-[200px]"
                      title={m.final_url}
                    >
                      {m.final_url}
                    </a>
                  ) : (
                    <div className="text-xs text-gray-600">—</div>
                  )}
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}