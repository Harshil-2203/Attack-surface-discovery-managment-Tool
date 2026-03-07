// src/NotesPanel.jsx
import { useState, useEffect } from "react";
import axios from "axios";

const API = "http://localhost:8000";

export default function NotesPanel({ targetFolder, subdomains }) {
  const [notes, setNotes]       = useState({});
  const [selected, setSelected] = useState(null);
  const [text, setText]         = useState("");
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [filter, setFilter]     = useState("");

  // Load all notes on mount
  useEffect(() => {
    if (!targetFolder) return;
    axios.get(`${API}/recon/notes?target_folder=${encodeURIComponent(targetFolder)}`)
      .then(r => setNotes(r.data || {}))
      .catch(() => {});
  }, [targetFolder]);

  const selectSub = (sub) => {
    setSelected(sub);
    setText(notes[sub]?.text || "");
    setSaved(false);
  };

  const saveNote = async () => {
    if (!selected || !targetFolder) return;
    setSaving(true);
    try {
      await axios.post(`${API}/recon/notes`, { target_folder: targetFolder, subdomain: selected, note: text });
      setNotes(prev => ({ ...prev, [selected]: { text, updated_at: new Date().toISOString() } }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  };

  const filtered = subdomains.filter(s => !filter || s.toLowerCase().includes(filter.toLowerCase()));
  const withNotes = subdomains.filter(s => notes[s]?.text);

  return (
    <div className="space-y-4">
      <div style={{ background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: "14px 18px" }}>
        <h2 style={{ fontFamily: "monospace", fontSize: 12, color: "#4ade80", letterSpacing: "0.1em" }}>NOTES</h2>
        <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", marginTop: 2 }}>
          {withNotes.length} subdomains with notes · saved to {targetFolder ? "target folder" : "not connected"}
        </p>
      </div>

      <div className="grid grid-cols-5 gap-4" style={{ height: 560 }}>
        {/* Subdomain list */}
        <div style={{ gridColumn: "span 2", background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search subdomains..."
            style={{ background: "#000", border: "1px solid #1f2937", borderRadius: 6, padding: "6px 10px", color: "#86efac", fontFamily: "monospace", fontSize: 12, outline: "none" }} />
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map(sub => (
              <button key={sub} onClick={() => selectSub(sub)}
                style={{
                  textAlign: "left", padding: "7px 10px", borderRadius: 6, cursor: "pointer", transition: "all 0.15s",
                  background: selected === sub ? "#0a1c0e" : "#000",
                  border: `1px solid ${selected === sub ? "#166534" : "#111827"}`,
                }}
                onMouseEnter={e => { if (selected !== sub) e.currentTarget.style.borderColor = "#1f2937"; }}
                onMouseLeave={e => { if (selected !== sub) e.currentTarget.style.borderColor = "#111827"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#67e8f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{sub}</span>
                  {notes[sub]?.text && <span style={{ fontSize: 8, color: "#166534" }}>●</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Note editor */}
        <div style={{ gridColumn: "span 3", background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {selected ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <a href={`https://${selected}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: "monospace", fontSize: 12, color: "#67e8f9", textDecoration: "none" }}
                  onMouseEnter={e => e.target.style.textDecoration = "underline"}
                  onMouseLeave={e => e.target.style.textDecoration = "none"}>
                  {selected}
                </a>
                {notes[selected]?.updated_at && (
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "#1f2937" }}>
                    Last saved: {new Date(notes[selected].updated_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <textarea
                value={text}
                onChange={e => { setText(e.target.value); setSaved(false); }}
                onKeyDown={e => { if (e.ctrlKey && e.key === "s") { e.preventDefault(); saveNote(); } }}
                placeholder="Add notes about this subdomain... (Ctrl+S to save)&#10;&#10;Ideas: login panel found, tech stack, interesting params, potential vulns..."
                style={{
                  flex: 1, background: "#000", border: "1px solid #1f2937", borderRadius: 8,
                  padding: "12px 14px", color: "#e5e7eb", fontFamily: "monospace", fontSize: 12,
                  outline: "none", resize: "none", lineHeight: 1.6,
                }}
                onFocus={e => e.target.style.borderColor = "#166534"}
                onBlur={e => e.target.style.borderColor = "#1f2937"}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#1f2937" }}>
                  {text.length} chars
                </span>
                <button onClick={saveNote} disabled={saving}
                  style={{
                    padding: "8px 20px", background: saved ? "#052e16" : "#166534",
                    border: `1px solid ${saved ? "#4ade80" : "#166534"}`,
                    borderRadius: 8, color: saved ? "#4ade80" : "#fff",
                    fontFamily: "monospace", fontSize: 12, cursor: "pointer", transition: "all 0.2s",
                  }}>
                  {saving ? "Saving..." : saved ? "✓ Saved" : "Save Note"}
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: "monospace", fontSize: 12, color: "#1f2937" }}>
              Select a subdomain to add notes
            </div>
          )}
        </div>
      </div>

      {/* Notes with content */}
      {withNotes.length > 0 && (
        <div style={{ background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: "14px 18px" }}>
          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", letterSpacing: "0.1em", marginBottom: 10 }}>ALL NOTES</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {withNotes.map(sub => (
              <div key={sub} onClick={() => selectSub(sub)}
                style={{ background: "#000", border: "1px solid #111827", borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#1f2937"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#111827"}>
                <p style={{ fontFamily: "monospace", fontSize: 11, color: "#67e8f9", marginBottom: 4 }}>{sub}</p>
                <p style={{ fontFamily: "monospace", fontSize: 11, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {notes[sub].text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}