import { forwardRef } from 'react'
import { Search, X } from 'lucide-react'
import './UnifiedSearch.css'

const SearchInput = forwardRef(function SearchInput(
  {
    value,
    onChange,
    onKeyDown,
    onClear,
    onClose,
    placeholder,
    scopeLabel,
    autoFocus = false,
    compact = false,
  },
  ref,
) {
  return (
    <div className={`channel-search-input ${compact ? 'is-compact' : ''}`}>
      <span className="channel-search-input__icon">
        <Search size={16} />
      </span>
      {scopeLabel && <span className="channel-search-input__scope">{scopeLabel}</span>}
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        inputMode="search"
      />
      {value && onClear && (
        <button
          type="button"
          className="channel-search-input__btn"
          aria-label="Clear search"
          onClick={onClear}
        >
          <X size={14} />
        </button>
      )}
      {onClose && (
        <button
          type="button"
          className="channel-search-input__btn"
          aria-label="Close search"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
})

export default SearchInput