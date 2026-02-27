import React from 'react';

export default function MetaViewer({ domain, subdomains, meta }) {
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
          return (
            <div key={i} className="p-3 bg-gray-700 rounded border border-gray-700">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-cyan-300 font-medium">{s}</div>
                  <div className="text-sm text-gray-300">{m.title || '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-green-300">{m.status_code || m.error || '—'}</div>
                  <div className="text-xs text-gray-400">{m.final_url || ''}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
