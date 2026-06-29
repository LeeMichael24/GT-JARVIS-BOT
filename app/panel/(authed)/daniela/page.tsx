import { getBrainEntries } from '@/app/panel/actions'
import { BrainEditor } from '@/components/panel/BrainEditor'

export default async function DanielaPage() {
  const entries = await getBrainEntries()

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden px-3 py-4 sm:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">Cerebro de Daniela</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Conocimiento que Daniela usa para responder. Las entradas del equipo tienen prioridad sobre las observaciones automáticas.
        </p>
      </div>
      <BrainEditor entries={entries} />
    </div>
  )
}
