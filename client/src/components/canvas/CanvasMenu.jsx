import {
  Plus,
  CopyPlus,
  LayoutTemplate,
} from "lucide-react";

export default function CanvasMenu({
  onSelect,
}) {

  return (
    <div className="p-4">

      <div
        className="
          w-[320px]
          rounded-xl
          border
          border-[var(--border-color)]
          bg-[var(--bg-primary)]
          shadow-xl
          overflow-hidden
        "
      >

        <MenuItem
          icon={Plus}
          label="New blank canvas"
          onClick={() => onSelect("blank")}
        />

        <MenuItem
          icon={CopyPlus}
          label="Add existing canvas"
          onClick={() => onSelect("existing")}
        />

        <MenuItem
          icon={LayoutTemplate}
          label="Start with a template"
          onClick={() => onSelect("template")}
        />

      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}) {

  return (
    <button
      onClick={onClick}
      className="
        w-full
        flex
        items-center
        gap-3
        px-4
        py-3
        hover:bg-[var(--bg-secondary)]
        transition-colors
      "
    >

      <Icon size={18} />

      <span className="text-sm font-medium">
        {label}
      </span>

    </button>
  );
}