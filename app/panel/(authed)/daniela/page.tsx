import { getBrainEntries, getEscalationRules, getProjectScripts, getAgentSettingsPanel, getProjectMediaAll, getPlaybookEntries } from '@/app/panel/actions'
import { BrainEditor } from '@/components/panel/BrainEditor'
import { EscalationRules } from '@/components/panel/EscalationRules'
import { MediaEditor } from '@/components/panel/MediaEditor'
import { PlaybookEditor } from '@/components/panel/PlaybookEditor'
import { ScriptsEditor } from '@/components/panel/ScriptsEditor'
import { SettingsEditor } from '@/components/panel/SettingsEditor'
import { DanielaTabs } from './tabs'

export default async function DanielaPage() {
  const [entries, rules, projectScripts, settingsPanel, mediaItems, playbook] = await Promise.all([
    getBrainEntries(),
    getEscalationRules(),
    getProjectScripts(),
    getAgentSettingsPanel(),
    getProjectMediaAll(),
    getPlaybookEntries(),
  ])

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden px-3 py-4 sm:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">Cerebro de Daniela</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Todo lo que Daniela sabe y cómo se comporta — editable en vivo, sin deploys.
        </p>
      </div>
      <DanielaTabs
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
