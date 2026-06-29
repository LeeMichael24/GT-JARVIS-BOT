'use client'

import { useState, type ReactNode } from 'react'

type Tab = 'brain' | 'escalation' | 'media'

const TABS: { value: Tab; label: string }[] = [
  { value: 'brain', label: 'Conocimiento' },
  { value: 'escalation', label: 'Escalamiento' },
  { value: 'media', label: 'Media' },
]

interface DanielaTabsProps {
  brainEditor: ReactNode
  escalationRules: ReactNode
  projectMedia: ReactNode
}

export function DanielaTabs({ brainEditor, escalationRules, projectMedia }: DanielaTabsProps) {
  const [tab, setTab] = useState<Tab>('brain')

  return (
    <>
      <div className="mb-4 flex gap-1 rounded-lg bg-zinc-900 p-1">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'brain' && brainEditor}
      {tab === 'escalation' && escalationRules}
      {tab === 'media' && projectMedia}
    </>
  )
}
