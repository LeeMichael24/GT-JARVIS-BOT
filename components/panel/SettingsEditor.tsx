'use client'

import { useState, useTransition } from 'react'
import { saveAgentSettings, type AgentSettingRow } from '@/app/panel/actions'

interface Props {
  rows: AgentSettingRow[]
  tableReady: boolean
}

const OPTION_LABELS: Record<string, { value: string; label: string; hint: string }[]> = {
  emoji_policy: [
    { value: 'none', label: 'Cero', hint: 'Nunca usa emojis' },
    { value: 'minimal', label: 'Mínimo', hint: 'La mayoría sin emoji; máx 1 cuando aporta' },
    { value: 'moderate', label: 'Moderado', hint: '1-2 por mensaje' },
  ],
  learning_sensitivity: [
    { value: 'high', label: 'Alta', hint: 'Aprende de casi toda conversación con sustancia' },
    { value: 'normal', label: 'Normal', hint: 'Solo hallazgos claramente notables' },
  ],
  formality_default: [
    { value: 'tu', label: 'Tú', hint: 'Tutea por defecto (usted con corporativos)' },
    { value: 'usted', label: 'Usted', hint: 'Usted por defecto (tutea si el cliente tutea)' },
  ],
  reflection_enabled: [
    { value: 'true', label: 'Encendida', hint: 'Cada noche extrae aprendizajes del día' },
    { value: 'false', label: 'Apagada', hint: 'Sin reflexión nocturna' },
  ],
}

const SETTING_TITLES: Record<string, string> = {
  emoji_policy: 'Emojis en las respuestas',
  learning_sensitivity: 'Sensibilidad de aprendizaje',
  formality_default: 'Trato por defecto',
  reflection_enabled: 'Reflexión nocturna',
  custom_instructions: 'Instrucciones del equipo',
}

const ORDER = ['custom_instructions', 'emoji_policy', 'formality_default', 'learning_sensitivity', 'reflection_enabled']

export function SettingsEditor({ rows, tableReady }: Props) {
  const initial: Record<string, string> = {}
  for (const r of rows) initial[r.key] = r.value
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [dirty, setDirty] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  function setVal(key: string, value: string) {
    setValues(v => ({ ...v, [key]: value }))
    setDirty(true)
    setStatus('idle')
  }

  function handleSave() {
    startTransition(async () => {
      const res = await saveAgentSettings(values)
      if (res.ok) { setStatus('saved'); setDirty(false) }
      else setStatus('error')
    })
  }

  if (!tableReady) {
    return (
      <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-300">
        La tabla <code>agent_settings</code> aún no existe. Corre la migración
        <code className="mx-1">009_agent_settings.sql</code> en el SQL Editor de Supabase y recarga esta página.
      </div>
    )
  }

  const keys = ORDER.filter(k => k in values)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4">
      <p className="text-xs text-zinc-500">
        Estas perillas cambian el comportamiento de Daniela <strong>al instante</strong> (máximo 1 minuto), sin deploy.
      </p>

      {keys.map(key => (
        <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-sm font-semibold text-white">{SETTING_TITLES[key] ?? key}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">{rows.find(r => r.key === key)?.description}</p>

          {key === 'custom_instructions' ? (
            <>
              <textarea
                value={values[key]}
                onChange={e => setVal(key, e.target.value)}
                rows={5}
                maxLength={3000}
                placeholder={'Ej: "Esta semana prioriza Portacelli sobre todo lo demás."\n"Si preguntan por financiamiento, primero califica el presupuesto."'}
                className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-zinc-200 placeholder:text-zinc-600"
              />
              <p className="mt-1 text-[11px] text-zinc-600">
                Daniela aplica esto en CADA mensaje, con prioridad alta. {values[key]?.length ?? 0}/3000
              </p>
            </>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {(OPTION_LABELS[key] ?? []).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setVal(key, opt.value)}
                  title={opt.hint}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    values[key] === opt.value
                      ? 'border-emerald-600 bg-emerald-900/50 text-emerald-200'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <span className="self-center text-[11px] text-zinc-600">
                {(OPTION_LABELS[key] ?? []).find(o => o.value === values[key])?.hint}
              </span>
            </div>
          )}
        </div>
      ))}

      <div className="sticky bottom-0 flex items-center gap-3 bg-zinc-950/95 py-2">
        <button
          onClick={handleSave}
          disabled={!dirty || isPending}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
        >
          {isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {status === 'saved' && <span className="text-xs text-emerald-400">Guardado — Daniela ya lo aplica</span>}
        {status === 'error' && <span className="text-xs text-red-400">Error al guardar. Reintenta.</span>}
      </div>
    </div>
  )
}
