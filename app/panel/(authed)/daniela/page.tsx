import { getBrainEntries, getEscalationRules, getProjectScripts } from '@/app/panel/actions'
import { BrainEditor } from '@/components/panel/BrainEditor'
import { EscalationRules } from '@/components/panel/EscalationRules'
import { ProjectMedia } from '@/components/panel/ProjectMedia'
import { ScriptsEditor } from '@/components/panel/ScriptsEditor'
import { getAllProjects } from '@/services/projects/gt-api'
import { getAllProjectMediaItems } from '@/lib/project-media'
import { DanielaTabs } from './tabs'

export default async function DanielaPage() {
  const [entries, rules, projects, mediaItems, projectScripts] = await Promise.all([
    getBrainEntries(),
    getEscalationRules(),
    getAllProjects(),
    getAllProjectMediaItems(),
    getProjectScripts(),
  ])

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden px-3 py-4 sm:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">Cerebro de Daniela</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Conocimiento, reglas de escalamiento y media que Daniela usa para responder.
        </p>
      </div>
      <DanielaTabs
        brainEditor={<BrainEditor entries={entries} />}
        scriptsEditor={<ScriptsEditor scripts={projectScripts} />}
        escalationRules={<EscalationRules rules={rules} />}
        projectMedia={<ProjectMedia projects={projects} items={mediaItems} />}
      />
    </div>
  )
}
