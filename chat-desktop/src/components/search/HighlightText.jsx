import './UnifiedSearch.css'

function escapePattern(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default function HighlightText({ text = '', query = '' }) {
  if (!text) return null

  const terms = Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .filter(Boolean),
    ),
  ).slice(0, 8)

  if (terms.length === 0) return text

  const matcher = new RegExp(`(${terms.map((term) => escapePattern(term)).join('|')})`, 'ig')

  return text.split(matcher).map((part, index) => (
    matcher.test(part)
      ? <mark key={`${part}-${index}`} className="channel-search-highlight">{part}</mark>
      : <span key={`${part}-${index}`}>{part}</span>
  ))
}