'use client'

import { useState, type ReactNode } from 'react'

type Tab = 'brain' | 'playbook' | 'scripts' | 'escalation' | 'media' | 'settings'

const TABS: { value: Tab; label: string }[] = [
  { value: 'brain', label: 'Conocimiento' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'scripts', label: 'Guiones' },
  { value: 'escalation', label: 'Escalamiento' },
  { value: 'media', label: 'Media' },
  { value: 'settings', label: 'Ajustes' },
]

interface DanielaTabsProps {
  brainEditor: ReactNode
  playbookEditor: ReactNode
  scriptsEditor: ReactNode
  escalationRules: ReactNode
  projectMedia: ReactNode
  settingsEditor: ReactNode
}

export function DanielaTabs({ brainEditor, playbookEditor, scriptsEditor, escalationRules, projectMedia, settingsEditor }: DanielaTabsProps) {
  const [tab, setTab] = useState<Tab>('brain')

  return (
    <>
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-zinc-900 p-1">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`shrink-0 flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
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
      {tab === 'playbook' && playbookEditor}
      {tab === 'scripts' && scriptsEditor}
      {tab === 'escalation' && escalationRules}
      {tab === 'media' && projectMedia}
      {tab === 'settings' && settingsEditor}
    </>
  )
}
