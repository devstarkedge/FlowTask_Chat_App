import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  COMMAND_GROUPS,
  fuzzyMatch,
  getAllCommands,
  getRecentCommandIds,
  runSlashCommand,
} from "./commandRegistry";

function groupCommands(query) {
  const all = getAllCommands();
  const recentIds = getRecentCommandIds();
  const recent = !query
    ? recentIds.map((id) => all.find((command) => command.id === id)).filter(Boolean)
    : [];

  const groups = [];
  if (recent.length > 0) {
    groups.push({ id: "recent", label: "Recently used", commands: recent });
  }

  COMMAND_GROUPS.forEach((group) => {
    const commands = group.commands
      .map((command) => ({ ...command, group: group.label }))
      .filter((command) => fuzzyMatch(command, query));

    if (commands.length > 0) {
      groups.push({ ...group, commands });
    }
  });

  return groups;
}

export default function SlashCommandMenu({ editor, menu, onClose }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const groups = useMemo(() => groupCommands(menu.query), [menu.query]);
  const flatCommands = useMemo(() => groups.flatMap((group) => group.commands), [groups]);

  useEffect(() => {
    setActiveIndex(0);
  }, [menu.query]);

  useEffect(() => {
    const handler = (event) => {
      if (!menu.open) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, flatCommands.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        runSlashCommand(editor, flatCommands[activeIndex], menu.range);
        onClose();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeIndex, editor, flatCommands, menu.open, menu.range, onClose]);

  if (!menu.open) return null;

  let commandIndex = -1;

  return (
    <div
      className="canvas-slash-menu"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      aria-label="Canvas commands"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="canvas-slash-search">
        <Search size={14} />
        <span>{menu.query ? `/${menu.query}` : "Search commands..."}</span>
      </div>

      <div className="canvas-slash-list">
        {flatCommands.length === 0 ? (
          <div className="canvas-slash-empty">No commands found</div>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="canvas-slash-group">
              <div className="canvas-slash-group-label">{group.label}</div>
              {group.commands.map((command) => {
                commandIndex += 1;
                const index = commandIndex;
                const Icon = command.icon;
                const active = index === activeIndex;

                return (
                  <button
                    key={`${group.id}-${command.id}`}
                    type="button"
                    className={`canvas-slash-item${active ? " is-active" : ""}`}
                    role="menuitem"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      runSlashCommand(editor, command, menu.range);
                      onClose();
                    }}
                  >
                    <span className="canvas-slash-icon">
                      <Icon size={16} />
                    </span>
                    <span className="canvas-slash-copy">
                      <span>{command.label}</span>
                      <small>{command.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
