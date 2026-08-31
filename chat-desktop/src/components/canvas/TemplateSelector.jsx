import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ArrowLeft, Search, FileText } from "lucide-react";
import { TEMPLATES, CATEGORIES, buildTemplateContent } from "./templates";
import TemplateGallery from "./templates/TemplateGallery";
import CoverSelector from "./templates/CoverSelector";

export default function TemplateSelector({ onSelect, onBack }) {
  const [search, setSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [customTitle, setCustomTitle] = useState("");
  const [selectedCoverVariation, setSelectedCoverVariation] = useState(null);
  const [variableValues, setVariableValues] = useState({});
  const [prefillVars, setPrefillVars] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [focusIndex, setFocusIndex] = useState(-1);
  const searchRef = useRef(null);
  const titleInputRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 180);
    return () => clearTimeout(id);
  }, [search]);

  const filtered = useMemo(() => {
    const q = (debouncedSearch || "").trim().toLowerCase();
    if (!q) return TEMPLATES;
    return TEMPLATES.filter((t) =>
      (t.label || "").toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q) ||
      ((t.tags || []).join(" ") || "").toLowerCase().includes(q)
    );
  }, [debouncedSearch]);

  const openCreateFor = (template) => {
    setSelectedTemplate(template);
    setCustomTitle(template.label);
    const cover = template?.cover;
    let firstVar = null;
    if (cover) {
      const variations = Array.isArray(cover) ? cover : (cover.variations || [cover]);
      firstVar = variations[0]?.id || variations[0]?.url || null;
    }
    setSelectedCoverVariation(firstVar);
    const vars = {};
    (template.variables || []).forEach((v) => { vars[v.name] = ""; });
    setVariableValues(vars);
    setPrefillVars(false);
    const idx = filtered.findIndex((t) => t.id === template.id);
    setFocusIndex(idx >= 0 ? idx : -1);
  };

  // Use refs to avoid stale closures in callbacks and keyboard handler
  const selectedTemplateRef = useRef(selectedTemplate);
  useEffect(() => {
    selectedTemplateRef.current = selectedTemplate;
  }, [selectedTemplate]);
  const customTitleRef = useRef(customTitle);
  useEffect(() => { customTitleRef.current = customTitle; }, [customTitle]);
  const selectedCoverRef = useRef(selectedCoverVariation);
  useEffect(() => { selectedCoverRef.current = selectedCoverVariation; }, [selectedCoverVariation]);
  const variableValuesRef = useRef(variableValues);
  useEffect(() => { variableValuesRef.current = variableValues; }, [variableValues]);
  const prefillVarsRef = useRef(prefillVars);
  useEffect(() => { prefillVarsRef.current = prefillVars; }, [prefillVars]);

  const cancelCreate = useCallback(() => {
    setSelectedTemplate(null);
    setCustomTitle("");
  }, []);

  const confirmCreate = useCallback(async () => {
    const tpl = selectedTemplateRef.current;
    if (!tpl) return;
    setIsCreating(true);
    try {
      await onSelect({
        id: tpl.id,
        title: customTitleRef.current,
        coverVariation: selectedCoverRef.current,
        variables: prefillVarsRef.current ? variableValuesRef.current : undefined,
        template: tpl,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
      cancelCreate();
    }
  }, [onSelect, cancelCreate]);

  useEffect(() => {
    if (selectedTemplate && titleInputRef.current) {
      // Use setTimeout to avoid causing React state updates during render
      setTimeout(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus();
          titleInputRef.current.select();
        }
      }, 0);
    }
  }, [selectedTemplate]);

  // Separate effect for keyboard navigation - stable handler to prevent cursor jumping
  useEffect(() => {
    const scrollToTemplate = (id) => {
      try {
        const el = document.querySelector(`[data-template-id="${id}"]`);
        if (el) el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      } catch (_) {}
    };

    const handler = (e) => {
      if (e.key === "Escape") {
        if (selectedTemplateRef.current) cancelCreate();
        return;
      }
      const active = document.activeElement;
      if (searchRef.current && active === searchRef.current) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => {
          const len = filtered.length;
          if (len === 0) return -1;
          const next =
            e.key === "ArrowDown"
              ? Math.min(len - 1, prev < 0 ? 0 : prev + 1)
              : Math.max(0, prev <= 0 ? 0 : prev - 1);
          const tpl = filtered[next];
          if (tpl) {
            setSelectedTemplate(tpl);
            setCustomTitle(tpl.label);
            setTimeout(() => scrollToTemplate(tpl.id), 50);
          }
          return next;
        });
        return;
      }

      if (e.key === "Enter") {
        if (titleInputRef.current && document.activeElement === titleInputRef.current) {
          e.preventDefault();
          confirmCreate();
          return;
        }
        if (selectedTemplateRef.current) {
          e.preventDefault();
          confirmCreate();
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [filtered, confirmCreate, cancelCreate]);

  // Build cover style for the banner
  const getCoverBannerStyle = (tpl) => {
    const cover = tpl?.cover;
    if (!cover) return { background: "linear-gradient(135deg,#eef2ff,#fef3c7)" };
    let v = null;
    if (typeof cover === "string") v = { type: "image", url: cover };
    else if (Array.isArray(cover)) v = cover[0];
    else if (cover.variations && cover.variations.length) v = cover.variations[0];
    else v = cover;

    if (!v) return { background: "linear-gradient(135deg,#eef2ff,#fef3c7)" };
    if (v.type === "image" || v.type === "photo" || v.url) {
      return {
        backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.08)), url(${v.url || v.src})`,
        backgroundSize: "cover",
        backgroundPosition: v.focalPoint || "center",
      };
    }
    if (v.type === "gradient" || v.colorPalette) {
      const palette = v.colorPalette || v.colors || ["#eef2ff", "#fef3c7"];
      return { background: `linear-gradient(135deg, ${palette[0]}, ${palette[1] || palette[0]})` };
    }
    return { background: "linear-gradient(135deg,#eef2ff,#fef3c7)" };
  };

  const extractText = (node) => {
    if (!node) return "";
    if (node.type === "text") return node.text || "";
    if (!node.content) return "";
    return node.content.map(extractText).join("");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        background: "var(--bg-primary)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderBottom: "1px solid var(--border-primary)",
          flexShrink: 0,
        }}
      >
        {/* {onBack && (
          <button
            onClick={onBack}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <ArrowLeft size={16} />
          </button>
        )} */}
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3 }}>
            Choose a template
          </h2>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            Start with a structured layout
          </p>
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{ padding: "10px 14px 6px", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <Search
            size={13}
            style={{
              position: "absolute",
              left: 9,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            placeholder="Search templates…"
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              paddingLeft: 28,
              paddingRight: 10,
              paddingTop: 7,
              paddingBottom: 7,
              fontSize: 13,
              color: "var(--text-primary)",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              borderRadius: "var(--radius-md)",
              outline: "none",
              transition: "border-color var(--transition-fast)",
              fontFamily: "var(--font-sans)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--border-focus)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-primary)")}
          />
        </div>
      </div>

      {/* ── Body: left list + right preview ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* Left: template list */}
        <div
          style={{
            width: 340,
            borderRight: "1px solid var(--border-primary)",
            overflowY: "auto",
            padding: "12px 14px",
            flexShrink: 0,
          }}
        >
          <TemplateGallery
            templates={filtered}
            categories={CATEGORIES}
            activeTemplateId={
              selectedTemplate?.id ||
              (focusIndex >= 0 ? filtered[focusIndex]?.id : null)
            }
            onUse={(t) => openCreateFor(t)}
            onPreview={(t) => openCreateFor(t)}
            onDuplicate={async (t) => {
              setIsCreating(true);
              try {
                await onSelect({ id: t.id, title: `Copy of ${t.label}` });
              } catch (err) {
                console.error(err);
              } finally {
                setIsCreating(false);
              }
            }}
            onToggleFavorite={() => {}}
          />
        </div>

        {/* Right: preview panel */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {!selectedTemplate ? (
            /* ── Empty state ── */
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                color: "var(--text-muted)",
                padding: 32,
                background: "linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)",
              }}
            >
              <div style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--bg-active)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                marginBottom: 8
              }}>
                <FileText size={32} style={{ color: "var(--accent-primary)", opacity: 0.8 }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 16, marginBottom: 4 }}>
                  Select a template
                </p>
                <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 220, lineHeight: 1.5 }}>
                  Pick one from the left to preview and customize, or start from scratch.
                </p>
              </div>
              
              <button
                onClick={() => onSelect({ id: "blank", title: "Untitled canvas" })}
                style={{
                  marginTop: 8,
                  padding: "10px 20px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--accent-primary)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "var(--font-sans)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "background var(--transition-fast), transform var(--transition-fast)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--accent-primary-hover)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--accent-primary)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Start Blank Canvas
              </button>
            </div>
          ) : (
            <>
              {/* Scrollable middle section */}
              <div style={{ flex: 1, overflowY: "auto" }}>

                {/* ── Cover banner (Slack-style) ── */}
                <div
                  style={{
                    position: "relative",
                    height: 220,
                    flexShrink: 0,
                    overflow: "hidden",
                    ...getCoverBannerStyle(selectedTemplate),
                  }}
                >
                  {/* subtle dark gradient overlay for text readability, avoiding muddiness */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)",
                      opacity: 0.8,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: 14,
                      left: 16,
                      color: "#fff",
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                      {selectedTemplate.label}
                    </h3>
                    {selectedTemplate.subtitle && (
                      <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.9, fontWeight: 500 }}>
                        {selectedTemplate.subtitle}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── Content below banner ── */}
                <div style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 24 }}>

                  {/* Meta row */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 9,
                        background: selectedTemplate.iconBg || "var(--bg-secondary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {selectedTemplate.icon
                        ? (() => { const Icon = selectedTemplate.icon; return <Icon size={22} />; })()
                        : <FileText size={20} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                        {selectedTemplate.label}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                        {selectedTemplate.description}
                      </div>
                    </div>
                    <button
                      onClick={cancelCreate}
                      style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-primary)",
                        cursor: "pointer",
                        color: "var(--text-secondary)",
                        fontSize: 12,
                        fontFamily: "var(--font-sans)",
                        fontWeight: 500,
                        padding: "6px 10px",
                        borderRadius: "var(--radius-md)",
                        transition: "all var(--transition-fast)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--text-primary)";
                        e.currentTarget.style.background = "var(--bg-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-secondary)";
                        e.currentTarget.style.background = "var(--bg-secondary)";
                      }}
                    >
                      Clear
                    </button>
                  </div>

                  {/* Sections */}
                  {selectedTemplate.sections && selectedTemplate.sections.length > 0 && (
                    <div>
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: 8,
                        }}
                      >
                        Sections
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {selectedTemplate.sections.map((s) => (
                          <div
                            key={s.id}
                            style={{
                              padding: "12px 14px",
                              border: "1px solid var(--border-secondary)",
                              borderRadius: 10,
                              background: "var(--bg-primary)",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 13 }}>
                              {s.icon ? `${s.icon} ` : ""}
                              {s.title}
                            </div>
                            {s.contentMarkdown && (
                              <div
                                style={{
                                  marginTop: 5,
                                  color: "var(--text-muted)",
                                  fontSize: 12,
                                  whiteSpace: "pre-wrap",
                                  lineHeight: 1.6,
                                }}
                              >
                                {s.contentMarkdown}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Title input */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Title
                    </label>
                    <input
                      ref={titleInputRef}
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          confirmCreate();
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--border-primary)",
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                        fontSize: 14,
                        fontFamily: "var(--font-sans)",
                        outline: "none",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.02) inset",
                        transition: "border-color var(--transition-fast), box-shadow var(--transition-fast)",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "var(--accent-primary)";
                        e.target.style.boxShadow = "0 0 0 3px rgba(var(--accent-primary-rgb, 78, 124, 255), 0.15)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "var(--border-primary)";
                        e.target.style.boxShadow = "0 1px 2px rgba(0,0,0,0.02) inset";
                      }}
                    />
                  </div>

                  {/* Cover selector */}
                  {selectedTemplate?.cover && (
                    <div>
                      <label
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          display: "block",
                          marginBottom: 8,
                        }}
                      >
                        Cover
                      </label>
                      <CoverSelector
                        template={selectedTemplate}
                        selectedVariationId={selectedCoverVariation}
                        onSelectVariation={(v) =>
                          setSelectedCoverVariation(v.id || v.url || v.type)
                        }
                      />
                    </div>
                  )}

                  {/* Variables */}
                  {selectedTemplate?.variables && selectedTemplate.variables.length > 0 && (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}
                      >
                        <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          Auto-fill variables
                        </label>
                        <label
                          style={{
                            fontSize: 12,
                            color: "var(--text-muted)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={prefillVars}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setPrefillVars(checked);
                              const next = { ...variableValues };
                              (selectedTemplate.variables || []).forEach((v) => {
                                next[v.name] = checked ? v.example || "" : "";
                              });
                              setVariableValues(next);
                            }}
                          />
                          <span>Prefill with examples</span>
                        </label>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {selectedTemplate.variables.map((v) => (
                          <div
                            key={v.name}
                            style={{ display: "flex", flexDirection: "column", minWidth: 160 }}
                          >
                            <label
                              style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}
                            >
                              {v.name}
                            </label>
                            {v.description && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-muted)",
                                  marginBottom: 6,
                                }}
                              >
                                {v.description}
                              </div>
                            )}
                            <input
                              value={variableValues[v.name] || ""}
                              onChange={(e) =>
                                setVariableValues((prev) => ({
                                  ...prev,
                                  [v.name]: e.target.value,
                                }))
                              }
                              placeholder={v.example || ""}
                              style={{
                                padding: 8,
                                borderRadius: 8,
                                border: "1px solid var(--border-primary)",
                                background: "var(--bg-secondary)",
                                color: "var(--text-primary)",
                                fontSize: 12,
                                fontFamily: "var(--font-sans)",
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Content preview */}
                  <div>
                    <label
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Preview
                    </label>
                    <div
                      style={{
                        border: "1px solid var(--border-secondary)",
                        borderRadius: 12,
                        padding: "16px 20px",
                        background: "var(--bg-primary)",
                        maxHeight: 250,
                        overflowY: "auto",
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: "var(--text-muted)",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                      }}
                    >
                      {(() => {
                        // Build preview from the selected template object so
                        // sections (from PROD_TEMPLATES) are reflected.
                        const doc = buildTemplateContent(selectedTemplate);
                        return (doc.content || []).slice(0, 20).map((node, idx) => {
                          if (node.type === "heading") {
                            return (
                              <div
                                key={idx}
                                style={{ fontWeight: 700, marginBottom: 5, color: "var(--text-primary)" }}
                              >
                                {extractText(node)}
                              </div>
                            );
                          }
                          if (node.type === "blockquote") {
                            const inner = (node.content || []).map((n) => extractText(n)).join("\n");
                            return (
                              <div key={idx} style={{ marginBottom: 8 }}>
                                <div
                                  style={{
                                    borderLeft: "3px solid var(--border-secondary)",
                                    paddingLeft: 12,
                                    color: "var(--text-primary)",
                                    background: "var(--bg-blockquote, transparent)",
                                    borderRadius: 8,
                                    padding: "8px 12px",
                                    fontStyle: "italic",
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {inner}
                                </div>
                              </div>
                            );
                          }
                          if (node.type === "paragraph") {
                            const text = extractText(node);
                            return (
                              <div key={idx} style={{ marginBottom: 4 }}>
                                {text || (
                                  <span style={{ opacity: 0.35 }}>— empty paragraph —</span>
                                )}
                              </div>
                            );
                          }
                          if (node.type === "bulletList") {
                            const items = (node.content || []).map((li) => extractText(li));
                            return (
                              <ul key={idx} style={{ margin: "4px 0 8px 18px" }}>
                                {items.map((it, ii) => (
                                  <li key={ii}>{it || <em style={{ opacity: 0.5 }}>empty</em>}</li>
                                ))}
                              </ul>
                            );
                          }
                          if (node.type === "orderedList") {
                            const items = (node.content || []).map((li) => extractText(li));
                            return (
                              <ol key={idx} style={{ margin: "4px 0 8px 22px" }}>
                                {items.map((it, ii) => (
                                  <li key={ii}>{it || <em style={{ opacity: 0.5 }}>empty</em>}</li>
                                ))}
                              </ol>
                            );
                          }
                          if (node.type === "taskList") {
                            const items = (node.content || []).map((ti) => ({
                              text: extractText(ti),
                              checked: ti?.attrs?.checked || false,
                            }));
                            return (
                              <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {items.map((it, ii) => (
                                  <label
                                    key={ii}
                                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={it.checked}
                                      readOnly
                                      style={{ accentColor: "var(--accent-primary)" }}
                                    />
                                    <span>{it.text || <em style={{ opacity: 0.5 }}>empty</em>}</span>
                                  </label>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        });
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Sticky footer with CTA ── */}
              <div
                style={{
                  padding: "12px 18px",
                  borderTop: "1px solid var(--border-primary)",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  flexShrink: 0,
                  background: "var(--bg-primary)",
                  // KEY FIX: sticky footer — always visible regardless of scroll position
                  position: "sticky",
                  bottom: 0,
                  zIndex: 5,
                }}
              >
                <button
                  onClick={cancelCreate}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border-primary)",
                    background: "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  Cancel
                </button>
                <button
                  disabled={isCreating}
                  onClick={confirmCreate}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    border: "none",
                    background: "var(--accent-primary)",
                    color: "#fff",
                    cursor: isCreating ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "var(--font-sans)",
                    opacity: isCreating ? 0.7 : 1,
                  }}
                >
                  {isCreating ? "Creating…" : "Use Template"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}