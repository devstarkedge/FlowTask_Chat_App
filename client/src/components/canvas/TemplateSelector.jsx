const templates = [
  {
    id: "blank",
    title: "Blank Canvas",
    description: "Start from scratch",
  },
  {
    id: "meeting",
    title: "Meeting Notes",
    description: "Agenda, notes, action items",
  },
  {
    id: "sprint",
    title: "Sprint Planning",
    description: "Track sprint goals and tasks",
  },
];

export default function TemplateSelector({
  onSelect,
}) {

  return (
    <div className="flex flex-col gap-4 p-6">

      <div>
        <h2 className="text-xl font-bold">
          Choose a Template
        </h2>

        <p className="text-sm text-gray-400 mt-1">
          Start with a predefined canvas
        </p>
      </div>

      <div className="grid gap-4">

        {templates.map((template) => (

          <button
            key={template.id}
            onClick={() => onSelect?.(template)}
            className="
              border border-[var(--border-color)]
              rounded-xl
              p-4
              text-left
              hover:bg-[var(--bg-secondary)]
              transition-all
            "
          >

            <h3 className="font-semibold">
              {template.title}
            </h3>

            <p className="text-sm text-gray-400 mt-1">
              {template.description}
            </p>

          </button>
        ))}

      </div>
    </div>
  );
}