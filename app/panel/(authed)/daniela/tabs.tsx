'use client'

import { useState, type ReactNode } from 'react'

type Tab =
  | 'status' | 'projects' | 'notices' | 'playbook' | 'brain' | 'training'
  | 'persona' | 'objectives' | 'scripts' | 'escalation' | 'media' | 'settings'

/**
 * Cada pestaña lleva su propia explicación de una línea. Los nombres solos no
 * alcanzaban: "Conocimiento" y "Playbook" eran dos tablas distintas y nadie
 * recordaba cuál era cuál. El orden va de lo más operativo (qué está pasando
 * hoy) a lo más técnico (perillas que casi nunca se tocan).
 */
const TABS: { value: Tab; label: string; hint: string }[] = [
  { value: 'status',     label: 'Estado',
    hint: 'Qué está haciendo ahora mismo: corridas de los crons, actividad reciente y la pausa global.' },
  { value: 'projects',   label: 'Proyectos',
    hint: 'La ficha de cada proyecto y cuál recibe inversión hoy. Acá va lo que NO cambia — precios y disponibilidad llegan vivos del Ecosistema.' },
  { value: 'notices',    label: 'Avisos',
    hint: 'Novedades de hoy con fecha de vencimiento ("se liberó la única unidad de 106 m²"). Mandan sobre el catálogo y sobre su conocimiento.' },
  { value: 'playbook',   label: 'Conocimiento',
    hint: 'El saber universal de venta que le escribimos: técnicas de cierre, objeciones, legal y financiero. Vale para todos los proyectos.' },
  { value: 'brain',      label: 'Lo que aprendió',
    hint: 'Lo que Daniela sacó sola de sus conversaciones cada noche. Vos aprobás lo que sirve y descartás el resto.' },
  { value: 'training',   label: 'Entrenamiento',
    hint: 'Enseñarle pegando conversaciones reales de WhatsApp: ella extrae los aprendizajes y vos los revisás antes de que entren.' },
  { value: 'persona',    label: 'Personalidad',
    hint: 'Cómo habla: los bloques de su prompt, editables uno por uno. Vacío = usa el texto de fábrica.' },
  { value: 'objectives', label: 'Objetivos',
    hint: 'Qué tiene que lograr en cada conversación, en general o según el proyecto del que se hable.' },
  { value: 'scripts',    label: 'Guiones',
    hint: 'El paso a paso de venta de un proyecto, palabra por palabra. Se activa cuando el cliente lo menciona.' },
  { value: 'escalation', label: 'Escalamiento',
    hint: 'Cuándo deja de responder y te pasa el cliente: palabras clave, temas y condiciones.' },
  { value: 'media',      label: 'Material',
    hint: 'Fotos, videos, brochures y links que puede enviar. Lo del Ecosistema se sincroniza solo; acá se agrega lo manual.' },
  { value: 'settings',   label: 'Ajustes',
    hint: 'Perillas técnicas: temperatura del modelo, horario de atención, umbrales de escalamiento y largo de respuesta.' },
]

interface DanielaTabsProps {
  statusPanel: ReactNode
  projectsEditor: ReactNode
  noticesEditor: ReactNode
  playbookEditor: ReactNode
  brainEditor: ReactNode
  trainingStudio: ReactNode
  personaEditor: ReactNode
  objectivesEditor: ReactNode
  scriptsEditor: ReactNode
  escalationRules: ReactNode
  projectMedia: ReactNode
  settingsEditor: ReactNode
}

export function DanielaTabs(p: DanielaTabsProps) {
  const [tab, setTab] = useState<Tab>('status')
  const activa = TABS.find(t => t.value === tab)!

  return (
    <>
      <div className="mb-2 flex gap-1 overflow-x-auto rounded-lg bg-zinc-900 p-1">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            title={t.hint}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.value ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* La explicación de la pestaña abierta — para no tener que adivinar */}
      <p className="mb-4 border-l-2 border-zinc-800 pl-3 text-xs leading-relaxed text-zinc-500">
        {activa.hint}
      </p>

      {tab === 'status' && p.statusPanel}
      {tab === 'projects' && p.projectsEditor}
      {tab === 'notices' && p.noticesEditor}
      {tab === 'playbook' && p.playbookEditor}
      {tab === 'brain' && p.brainEditor}
      {tab === 'training' && p.trainingStudio}
      {tab === 'persona' && p.personaEditor}
      {tab === 'objectives' && p.objectivesEditor}
      {tab === 'scripts' && p.scriptsEditor}
      {tab === 'escalation' && p.escalationRules}
      {tab === 'media' && p.projectMedia}
      {tab === 'settings' && p.settingsEditor}
    </>
  )
}
