import { X } from 'lucide-react'

/**
 * ScopeChip — renders the `in:#channel-name` pill inside the search input.
 *
 * Props:
 *   label     {string}   — e.g. "in:#general" or "in:DM"
 *   onRemove  {function} — optional; if provided, shows an × button
 */
export default function ScopeChip({ label, onRemove }) {
  if (!label) return null

  return (
    <span className="us-scope-chip">
      {label}
      {onRemove && (
        <button
          type="button"
          className="us-scope-chip__remove"
          aria-label="Remove scope filter"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onRemove}
        >
          <X size={10} />
        </button>
      )}
    </span>
  )
}
