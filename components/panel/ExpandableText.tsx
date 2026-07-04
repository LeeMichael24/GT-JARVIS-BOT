'use client'

import { useState } from 'react'

interface Props {
  text: string
  /** Caracteres visibles antes de colapsar — mismo largo para todas las cards,
      en desktop y mobile, para que ningún mensaje largo rompa el layout */
  limit?: number
  className?: string
}

export function ExpandableText({ text, limit = 280, className = '' }: Props) {
  const [expanded, setExpanded] = useState(false)
  const needsClamp = text.length > limit

  if (!needsClamp) {
    return <p className={`whitespace-pre-wrap ${className}`}>{text}</p>
  }

  return (
    <div>
      <p className={`whitespace-pre-wrap ${className}`}>
        {expanded ? text : text.slice(0, limit).trimEnd() + '…'}
      </p>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          setExpanded(v => !v)
        }}
        className="mt-1 text-[11px] font-medium underline opacity-70 transition-opacity hover:opacity-100"
      >
        {expanded ? 'Ver menos' : 'Ver más'}
      </button>
    </div>
  )
}
