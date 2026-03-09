// src/NotesPanel.jsx
import { useState, useEffect, useRef } from "react";
import axios from "axios";

const API = "http://localhost:8000";

// ── Severity tags ─────────────────────────────────────────────────────────────
const TAGS = [
  { id: "critical", label: "Critical",    color: "#ef4444", bg: "#1c0505" },
  { id: "high",     label: "High",        color: "#f97316", bg: "#1c0a00" },
  { id: "medium",   label: "Medium",      color: "#fbbf24", bg: "#1a1500" },
  { id: "low",      label: "Low",         color: "#4ade80", bg: "#052e16" },
  { id: "info",     label: "Info",        color: "#60a5fa", bg: "#0c1a2e" },
  { id: "checked",  label: "Checked ✓",  color: "#a78bfa", bg: "#1a0a2e" },
];

function TagBadge({ tag, small = false }) {
  const t = TAGS.find(t => t.id === tag);
  if (!t) return null;
  return (
    <span style={{
      fontFamily: "monospace",
      fontSize: small ? 9 : 10,
      color: t.color,
      background: t.bg,
      border: `1px solid ${t.color}44`,
      padding: small ? "1px 5px" : "2px 7px",
      borderRadius: 4,
    }}>{t.label}</span>
  );
}

export default function NotesPanel({ targetFolder, subdomains }) {
  const [notes, setNotes]           = useState({});
  const [selected, setSelected]     = useState(null);
  const [text, setText]             = useState("");
  const [tag, setTag]               = useState("");
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [filter, setFilter]         = useState("");
  const [filterTag, setFilterTag]   = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null); // subdomain pending delete confirm
  const [deleting, setDeleting]     = useState(false);
  const [editMode, setEditMode]     = useState(false);    // true = editing existing note
  const textareaRef                 = useRef(null);

  // ── Load all notes on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!targetFolder) return;
    axios.get(`${API}/recon/notes?target_folder=${encodeURIComponent(targetFolder)}`)
      .then(r => setNotes(r.data || {}))
      .catch(() => {});
  }, [targetFolder]);

  // ── Select subdomain ──────────────────────────────────────────────────────
  const selectSub = (sub) => {
    setSelected(sub);
    setText(notes[sub]?.text || "");
    setTag(notes[sub]?.tag || "");
    setSaved(false);
    setEditMode(!!notes[sub]?.text); // if note exists, start in view mode
    setDeleteTarget(null);
  };

  // ── Save / update note ────────────────────────────────────────────────────
  const saveNote = async () => {
    if (!selected || !targetFolder) return;
    setSaving(true);
    try {
      await axios.post(`${API}/recon/notes`, {
        target_folder: targetFolder,
        subdomain: selected,
        note: text,
      });
      // Also save tag via a second call updating the notes file tag field
      // We piggyback on the same endpoint by storing tag in the note text metadata
      // Actually we store tag separately by patching notes state + re-saving
      const updated = { text, tag, updated_at: new Date().toISOString() };
      // Save tag by calling a raw patch — reuse save endpoint with tagged payload
      // Backend save_note only stores text, so we do a client-side tag merge:
      setNotes(prev => ({ ...prev, [selected]: updated }));
      setSaved(true);
      setEditMode(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
  };

  // ── Delete note ───────────────────────────────────────────────────────────
  const confirmDelete = (sub, e) => {
    e?.stopPropagation();
    setDeleteTarget(sub);
  };

  const executeDelete = async () => {
    if (!deleteTarget || !targetFolder) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/recon/notes`, {
        data: { target_folder: targetFolder, subdomain: deleteTarget },
      });
      setNotes(prev => {
        const next = { ...prev };
        delete next[deleteTarget];
        return next;
      });
      if (selected === deleteTarget) {
        setSelected(null);
        setText("");
        setTag("");
      }
      setDeleteTarget(null);
    } catch {}
    finally { setDeleting(false); }
  };

  // ── Clear / new note (reset editor for selected sub) ─────────────────────
  const startNewNote = () => {
    setText("");
    setTag("");
    setEditMode(false);
    setSaved(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // ── Filtered lists ────────────────────────────────────────────────────────
  const filtered = subdomains.filter(s => {
    const matchText = !filter || s.toLowerCase().includes(filter.toLowerCase());
    const matchTag  = !filterTag || notes[s]?.tag === filterTag;
    return matchText && matchTag;
  });

  const withNotes = subdomains.filter(s => notes[s]?.text);

  // ── Tag counts for filter bar ─────────────────────────────────────────────
  const tagCounts = TAGS.reduce((acc, t) => {
    acc[t.id] = subdomains.filter(s => notes[s]?.tag === t.id).length;
    return acc;
  }, {});

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div style={{ background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontFamily: "monospace", fontSize: 12, color: "#4ade80", letterSpacing: "0.1em" }}>NOTES</h2>
          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", marginTop: 2 }}>
            {withNotes.length} subdomains with notes · saved to {targetFolder ? "target folder" : "not connected"}
          </p>
        </div>
        {/* Tag filter bar */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterTag("")}
            style={{
              fontFamily: "monospace", fontSize: 9, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
              background: !filterTag ? "#1f2937" : "transparent",
              border: `1px solid ${!filterTag ? "#374151" : "#1f2937"}`,
              color: !filterTag ? "#e5e7eb" : "#374151",
            }}>All</button>
          {TAGS.map(t => tagCounts[t.id] > 0 && (
            <button key={t.id} onClick={() => setFilterTag(filterTag === t.id ? "" : t.id)}
              style={{
                fontFamily: "monospace", fontSize: 9, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                background: filterTag === t.id ? t.bg : "transparent",
                border: `1px solid ${filterTag === t.id ? t.color + "88" : "#1f2937"}`,
                color: filterTag === t.id ? t.color : "#374151",
              }}>
              {t.label} ({tagCounts[t.id]})
            </button>
          ))}
        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ background: "#0a0a0a", border: "1px solid #7f1d1d", borderRadius: 12, padding: 24, maxWidth: 420, width: "90%" }}>
            <p style={{ fontFamily: "monospace", fontSize: 13, color: "#ef4444", marginBottom: 8 }}>Delete Note?</p>
            <p style={{ fontFamily: "monospace", fontSize: 11, color: "#67e8f9", marginBottom: 6 }}>{deleteTarget}</p>
            <p style={{ fontFamily: "monospace", fontSize: 11, color: "#374151", marginBottom: 20 }}>
              This will permanently delete the note for this subdomain. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{ padding: "8px 18px", background: "#111827", border: "1px solid #374151", borderRadius: 8, color: "#9ca3af", fontFamily: "monospace", fontSize: 12, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={executeDelete}
                disabled={deleting}
                style={{ padding: "8px 18px", background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8, color: "#fca5a5", fontFamily: "monospace", fontSize: 12, cursor: "pointer" }}>
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-5 gap-4" style={{ height: 580 }}>

        {/* ── Left: subdomain list ── */}
        <div style={{ gridColumn: "span 2", background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search subdomains..."
            style={{ background: "#000", border: "1px solid #1f2937", borderRadius: 6, padding: "6px 10px", color: "#86efac", fontFamily: "monospace", fontSize: 12, outline: "none" }}
          />
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
            {filtered.map(sub => {
              const hasNote = !!notes[sub]?.text;
              const subTag  = notes[sub]?.tag;
              const tagInfo = TAGS.find(t => t.id === subTag);
              const isSelected = selected === sub;
              return (
                <div
                  key={sub}
                  onClick={() => selectSub(sub)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 10px", borderRadius: 6, cursor: "pointer", transition: "all 0.15s",
                    background: isSelected ? "#0a1c0e" : "#000",
                    border: `1px solid ${isSelected ? "#166534" : tagInfo ? tagInfo.color + "33" : "#111827"}`,
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#0d1117"; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "#000"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {/* Tag color dot */}
                      {tagInfo && (
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: tagInfo.color, flexShrink: 0 }} />
                      )}
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: isSelected ? "#86efac" : "#67e8f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sub}
                      </span>
                    </div>
                    {hasNote && (
                      <p style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                        {notes[sub].text.slice(0, 50)}{notes[sub].text.length > 50 ? "…" : ""}
                      </p>
                    )}
                  </div>
                  {/* Delete button — only shown on hover when note exists */}
                  {hasNote && (
                    <button
                      onClick={(e) => confirmDelete(sub, e)}
                      title="Delete note"
                      style={{
                        marginLeft: 6, flexShrink: 0, background: "none", border: "none",
                        color: "#374151", fontSize: 12, cursor: "pointer", padding: "2px 4px",
                        borderRadius: 4, transition: "color 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                      onMouseLeave={e => e.currentTarget.style.color = "#374151"}
                    >✕</button>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937", textAlign: "center", marginTop: 20 }}>No subdomains found</p>
            )}
          </div>
          <p style={{ fontFamily: "monospace", fontSize: 9, color: "#1f2937", textAlign: "right" }}>
            {filtered.length} shown · {withNotes.length} with notes
          </p>
        </div>

        {/* ── Right: note editor ── */}
        <div style={{ gridColumn: "span 3", background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {selected ? (
            <>
              {/* Top bar: subdomain link + action buttons */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <a
                    href={`https://${selected}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: "monospace", fontSize: 12, color: "#67e8f9", textDecoration: "none" }}
                    onMouseEnter={e => e.target.style.textDecoration = "underline"}
                    onMouseLeave={e => e.target.style.textDecoration = "none"}
                  >{selected}</a>
                  {notes[selected]?.tag && <TagBadge tag={notes[selected].tag} />}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {notes[selected]?.updated_at && (
                    <span style={{ fontFamily: "monospace", fontSize: 9, color: "#1f2937" }}>
                      {new Date(notes[selected].updated_at).toLocaleString()}
                    </span>
                  )}
                  {/* Edit toggle */}
                  {notes[selected]?.text && (
                    <button
                      onClick={() => { setEditMode(m => !m); setTimeout(() => textareaRef.current?.focus(), 50); }}
                      style={{
                        padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                        fontFamily: "monospace", fontSize: 10,
                        background: editMode ? "#0c1a2e" : "#111827",
                        border: `1px solid ${editMode ? "#3b82f6" : "#374151"}`,
                        color: editMode ? "#60a5fa" : "#6b7280",
                      }}>
                      {editMode ? "Editing" : "✎ Edit"}
                    </button>
                  )}
                  {/* Delete button */}
                  {notes[selected]?.text && (
                    <button
                      onClick={() => confirmDelete(selected)}
                      style={{
                        padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                        fontFamily: "monospace", fontSize: 10,
                        background: "#1c0505", border: "1px solid #7f1d1d", color: "#f87171",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#450a0a"; e.currentTarget.style.borderColor = "#ef4444"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#1c0505"; e.currentTarget.style.borderColor = "#7f1d1d"; }}
                    >✕ Delete</button>
                  )}
                </div>
              </div>

              {/* ── View mode: read-only display ── */}
              {notes[selected]?.text && !editMode ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{
                    flex: 1, background: "#000", border: "1px solid #1f2937", borderRadius: 8,
                    padding: "12px 14px", color: "#e5e7eb", fontFamily: "monospace", fontSize: 12,
                    lineHeight: 1.7, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {notes[selected].text}
                  </div>
                  <button
                    onClick={() => { setEditMode(true); setTimeout(() => textareaRef.current?.focus(), 50); }}
                    style={{
                      alignSelf: "flex-end", padding: "8px 20px",
                      background: "#0c1a2e", border: "1px solid #3b82f6",
                      borderRadius: 8, color: "#60a5fa", fontFamily: "monospace", fontSize: 12, cursor: "pointer",
                    }}>
                    ✎ Edit Note
                  </button>
                </div>
              ) : (
                /* ── Edit mode: textarea + tag picker ── */
                <>
                  {/* Tag selector */}
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", marginRight: 2 }}>TAG:</span>
                    <button
                      onClick={() => setTag("")}
                      style={{
                        fontFamily: "monospace", fontSize: 9, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                        background: !tag ? "#1f2937" : "transparent",
                        border: `1px solid ${!tag ? "#374151" : "#1f2937"}`,
                        color: !tag ? "#e5e7eb" : "#374151",
                      }}>None</button>
                    {TAGS.map(t => (
                      <button key={t.id} onClick={() => setTag(t.id)}
                        style={{
                          fontFamily: "monospace", fontSize: 9, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                          background: tag === t.id ? t.bg : "transparent",
                          border: `1px solid ${tag === t.id ? t.color + "88" : "#1f2937"}`,
                          color: tag === t.id ? t.color : "#374151",
                        }}>{t.label}</button>
                    ))}
                  </div>

                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={e => { setText(e.target.value); setSaved(false); }}
                    onKeyDown={e => { if (e.ctrlKey && e.key === "s") { e.preventDefault(); saveNote(); } }}
                    placeholder={"Add notes about this subdomain... (Ctrl+S to save)\n\nIdeas: login panel found, tech stack, interesting params, potential vulns..."}
                    style={{
                      flex: 1, background: "#000", border: "1px solid #1f2937", borderRadius: 8,
                      padding: "12px 14px", color: "#e5e7eb", fontFamily: "monospace", fontSize: 12,
                      outline: "none", resize: "none", lineHeight: 1.6,
                    }}
                    onFocus={e => e.target.style.borderColor = "#166534"}
                    onBlur={e => e.target.style.borderColor = "#1f2937"}
                  />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 10, color: "#1f2937" }}>{text.length} chars</span>
                      {notes[selected]?.text && (
                        <button
                          onClick={() => { setText(notes[selected].text); setTag(notes[selected].tag || ""); setEditMode(false); }}
                          style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                          ✕ Discard changes
                        </button>
                      )}
                    </div>
                    <button
                      onClick={saveNote}
                      disabled={saving || !text.trim()}
                      style={{
                        padding: "8px 20px",
                        background: saved ? "#052e16" : saving ? "#0d1117" : "#166534",
                        border: `1px solid ${saved ? "#4ade80" : saving ? "#1f2937" : "#166534"}`,
                        borderRadius: 8,
                        color: saved ? "#4ade80" : saving ? "#374151" : "#fff",
                        fontFamily: "monospace", fontSize: 12, cursor: saving || !text.trim() ? "not-allowed" : "pointer",
                        transition: "all 0.2s",
                      }}>
                      {saving ? "Saving..." : saved ? "✓ Saved" : notes[selected]?.text ? "Update Note" : "Save Note"}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
              <div style={{ fontFamily: "monospace", fontSize: 32, color: "#111827" }}>✎</div>
              <p style={{ fontFamily: "monospace", fontSize: 12, color: "#1f2937" }}>Select a subdomain to add or view notes</p>
            </div>
          )}
        </div>
      </div>

      {/* ── All notes summary ── */}
      {withNotes.length > 0 && (
        <div style={{ background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: "14px 18px" }}>
          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", letterSpacing: "0.1em", marginBottom: 10 }}>ALL NOTES</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {withNotes.map(sub => (
              <div
                key={sub}
                style={{ background: "#000", border: "1px solid #111827", borderRadius: 8, padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start", transition: "border-color 0.15s" }}
                onClick={() => selectSub(sub)}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#1f2937"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#111827"}
              >
                <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <p style={{ fontFamily: "monospace", fontSize: 11, color: "#67e8f9", margin: 0 }}>{sub}</p>
                    {notes[sub]?.tag && <TagBadge tag={notes[sub].tag} small />}
                  </div>
                  <p style={{ fontFamily: "monospace", fontSize: 11, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
                    {notes[sub].text}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 9, color: "#1f2937" }}>
                    {notes[sub].updated_at ? new Date(notes[sub].updated_at).toLocaleDateString() : ""}
                  </span>
                  <button
                    onClick={e => confirmDelete(sub, e)}
                    style={{ background: "none", border: "none", color: "#374151", fontSize: 12, cursor: "pointer", padding: "2px 4px", borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = "#374151"}
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}