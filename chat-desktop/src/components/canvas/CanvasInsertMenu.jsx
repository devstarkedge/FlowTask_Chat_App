import React, { useState, useEffect, useRef } from "react";
import {
  Video,
  Mic,
  Minus,
  LayoutGrid,
  Calendar,
  User,
  MessageSquare,
  Quote,
  FileText,
  Image as ImageIcon,
  Paperclip,
  ChevronRight,
  Table2,
  List,
  CheckSquare,
  Columns3,
  Search,
  Code2,
  Link2,
  AlertTriangle,
  Smile,
  Type,
  Heading1,
  ListOrdered,
} from "lucide-react";
import CanvasInsertSubmenu from "./CanvasInsertSubmenu";

export default function CanvasInsertMenu({
  onSelect,
  onClose,
  triggerRef,
  editor,
}) {
  const [showSubmenu, setShowSubmenu] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const menuRef = useRef(null);
  const submenuRef = useRef(null);
  const searchInputRef = useRef(null);

  // Grouped items with Slack/Notion-style categories
  const menuGroups = [
    {
      label: "Basic",
      items: [
        { id: "text", label: "Text", icon: Type, description: "Plain text block" },
        { id: "heading1", label: "Heading 1", icon: Heading1, description: "Large heading", shortcut: "Ctrl+Alt+1" },
        { id: "bullet-list", label: "Bullet list", icon: List, description: "Unordered list", shortcut: "Ctrl+Shift+8" },
        { id: "checklist", label: "Checklist", icon: CheckSquare, description: "Tasks with checkboxes" },
        { id: "divider", label: "Divider", icon: Minus, description: "Horizontal separator line" },
        { id: "blockquote", label: "Blockquote", icon: Quote, description: "Quote text" },
      ],
    },
    {
      label: "Media",
      items: [
        { id: "image", label: "Image", icon: ImageIcon, description: "Upload an image" },
        { id: "file", label: "File", icon: Paperclip, description: "Upload a file" },
        { id: "record-video", label: "Record video clip", icon: Video, description: "Capture a video" },
        { id: "record-audio", label: "Record audio clip", icon: Mic, description: "Record your voice" },
      ],
    },
    {
      label: "Advanced",
      items: [
        { id: "table", label: "Table", icon: Table2, description: "Insert a data table" },
        { id: "columns-3", label: "Columns", icon: Columns3, description: "Multi-column layout" },
        { id: "code-block", label: "Code block", icon: Code2, description: "Code with syntax highlighting"},
        { id: "callout", label: "Callout", icon: MessageSquare, description: "Highlighted note" },
        { id: "placeholder", label: "Placeholder", icon: LayoutGrid, hasSubmenu: true, description: "Dynamic template variable" },
      ],
    },
    {
      label: "Workspace",
      items: [
        { id: "date", label: "Date", icon: Calendar, description: "Insert today's date" },
        { id: "profile", label: "Profile", icon: User, description: "Mention a user" },
        { id: "canvas", label: "Canvas", icon: FileText, description: "Link a canvas" },
      ],
    },
  ];

  // Flatten for keyboard navigation
  const allInteractiveItems = menuGroups.flatMap((group) => group.items);
  
  // Filter items based on search
  const filteredGroups = searchQuery
    ? menuGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            item.label.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((group) => group.items.length > 0)
    : menuGroups;

  const filteredItems = filteredGroups.flatMap((g) => g.items);

  useEffect(() => {
    // Focus search input on mount
    if (searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        (!triggerRef?.current || !triggerRef.current.contains(event.target))
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, triggerRef]);

  // Handle Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveItemIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveItemIndex((prev) =>
          prev > 0 ? prev - 1 : filteredItems.length - 1
        );
      } else if (e.key === "ArrowRight") {
        const currentItem = filteredItems[activeItemIndex];
        if (currentItem?.hasSubmenu) {
          e.preventDefault();
          setShowSubmenu(true);
        }
      } else if (e.key === "ArrowLeft") {
        if (showSubmenu) {
          e.preventDefault();
          setShowSubmenu(false);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeItemIndex >= 0) {
          const currentItem = filteredItems[activeItemIndex];
          if (currentItem.hasSubmenu) {
            setShowSubmenu((prev) => !prev);
          } else {
            handleItemClick(currentItem.id);
          }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeItemIndex, filteredItems, showSubmenu, onClose]);

  const handleItemClick = (id) => {
    onSelect(id);
    if (id !== "placeholder") {
      onClose();
    }
  };

  // Submenu placement calculation
  const getSubmenuStyle = () => {
    if (!menuRef.current) return {};
    const rect = menuRef.current.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    const submenuWidth = 200;
    const leftOffset = spaceRight > submenuWidth ? "100%" : `-${submenuWidth}px`;
    
    const placeholderIndex = allInteractiveItems.findIndex((it) => it.id === "placeholder");
    const topOffset = placeholderIndex >= 0 ? placeholderIndex * 48 + 48 : 48;

    return {
      position: "absolute",
      left: leftOffset,
      top: `${topOffset}px`,
      marginLeft: spaceRight > submenuWidth ? "4px" : "-4px",
      zIndex: 1010,
    };
  };

  return (
    <div className="canvas-insert-menu" ref={menuRef} role="dialog" aria-label="Insert menu">
      {/* Search bar */}
      <div className="canvas-insert-menu-search">
        <Search size={14} className="canvas-insert-menu-search-icon" />
        <input
          ref={searchInputRef}
          type="text"
          className="canvas-insert-menu-search-input"
          placeholder="Search blocks..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setActiveItemIndex(0);
          }}
          aria-label="Search blocks"
        />
      </div>

      {/* Scrollable items list */}
      <div className="canvas-insert-menu-scroll" role="listbox">
        {filteredGroups.map((group, gi) => (
          <div key={gi} className="canvas-insert-menu-group">
            <div className="canvas-insert-menu-group-label">{group.label}</div>
            {group.items.map((item, ii) => {
              const globalIndex = filteredItems.indexOf(item);
              const isActive = globalIndex === activeItemIndex;
              const IconComponent = item.icon;

              return (
                <div
                  key={item.id}
                  className={`canvas-menu-item-wrapper ${
                    item.id === "placeholder" ? "has-submenu-trigger" : ""
                  }`}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => {
                    setActiveItemIndex(globalIndex);
                    if (item.hasSubmenu) setShowSubmenu(true);
                    else setShowSubmenu(false);
                  }}
                >
                  <button
                    className={`canvas-menu-item ${isActive ? "is-active" : ""}`}
                    onClick={() => handleItemClick(item.id)}
                    tabIndex={-1}
                  >
                    <div className="canvas-menu-item-icon-wrap">
                      <IconComponent className="canvas-menu-icon" size={16} />
                    </div>
                    <div className="canvas-menu-item-content">
                      <div className="canvas-menu-item-label-row">
                        <span className="canvas-menu-label">{item.label}</span>
                        {item.shortcut && (
                          <span className="canvas-menu-shortcut">{item.shortcut}</span>
                        )}
                        {item.hasSubmenu && (
                          <ChevronRight className="canvas-menu-arrow" size={12} />
                        )}
                      </div>
                      {item.description && (
                        <span className="canvas-menu-description">{item.description}</span>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        ))}

        {filteredGroups.length === 0 && (
          <div className="canvas-insert-menu-empty">
            No blocks found for "{searchQuery}"
          </div>
        )}
      </div>

      {showSubmenu && (
        <div
          ref={submenuRef}
          onMouseEnter={() => setShowSubmenu(true)}
          onMouseLeave={() => setShowSubmenu(false)}
        >
          <CanvasInsertSubmenu
            style={getSubmenuStyle()}
            onSelect={(submenuId) => {
              handleItemClick(`placeholder-${submenuId}`);
            }}
          />
        </div>
      )}
    </div>
  );
}