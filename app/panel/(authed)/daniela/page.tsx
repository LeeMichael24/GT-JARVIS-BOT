import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import {
  getBrainEntries, getEscalationRules, getProjectScripts, getAgentSettingsPanel,
  getProjectMediaAll, getPlaybookEntries, getSupervisionData, getPromptBlocksPanel, getObjectives,
} from '@/app/panel/actions'
import { getAllProjects } from '@/services/projects/gt-api'
import { BrainEditor } from '@/components/panel/BrainEditor'
import { EscalationRules } from '@/components/panel/EscalationRules'
import { MediaEditor } from '@/components/panel/MediaEditor'
import { PlaybookEditor } from '@/components/panel/PlaybookEditor'
import { ScriptsEditor } from '@/components/panel/ScriptsEditor'
import { SettingsEditor } from '@/components/panel/SettingsEditor'
import { StatusPanel } from '@/components/panel/StatusPanel'
import { PersonaEditor } from '@/components/panel/PersonaEditor'
import { ObjectivesEditor } from '@/components/panel/ObjectivesEditor'
import { TrainingStudio } from '@/components/panel/TrainingStudio'
import { DanielaTabs } from './tabs'

// El análisis de entrenamiento (server action de esta página) llama al
// modelo — necesita más que los 10s default
export const maxDuration = 60

export default async function DanielaPage() {
  // Guard explícito: /panel/daniela es solo-admin (los getters ya lo
  // exigen, pero un asesor merece redirect, no una página de error)
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')
  if (member.role !== 'admin') redirect('/panel')

  const [entries, rules, projectScripts, settingsPanel, mediaItems, playbook, supervision, promptBlocks, objectives, projects] = await Promise.all([
    getBrainEntries(),
    getEscalationRules(),
    getProjectScripts(),
    getAgentSettingsPanel(),
    getProjectMediaAll(),
    getPlaybookEntries(),
    getSupervisionData(),
    getPromptBlocksPanel(),
    getObjectives(),
    getAllProjects().catch(() => []),
  ])

  // Bandeja de entrenamiento: lo que Daniela aprendió sola y aún no entra al prompt
  const candidates = entries.filter(e => e.source === 'agent' && e.active && e.confidence < 0.7)
  const projectNames = projects.map(p => p.name).filter(Boolean)

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden px-3 py-4 sm:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">Daniela — Supervisión y configuración</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Todo lo que Daniela es, sabe y hace — 100% configurable en vivo, sin deploys.
        </p>
      </div>
      <DanielaTabs
        statusPanel={<StatusPanel data={supervision} />}
        personaEditor={<PersonaEditor rows={promptBlocks.rows} tableReady={promptBlocks.tableReady} />}
        objectivesEditor={<ObjectivesEditor objectives={objectives} projectNames={projectNames} />}
        trainingStudio={<TrainingStudio candidates={candidates} />}
        brainEditor={<BrainEditor entries={entries} />}
        playbookEditor={<PlaybookEditor entries={playbook} />}
        scriptsEditor={<ScriptsEditor scripts={projectScripts} />}
        escalationRules={<EscalationRules rules={rules} />}
        projectMedia={<MediaEditor items={mediaItems} />}
        settingsEditor={<SettingsEditor rows={settingsPanel.rows} tableReady={settingsPanel.tableReady} />}
      />
    </div>
  )
}
