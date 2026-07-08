import { getServiceClient } from '@/lib/supabase'

/**
 * Guiones de venta por proyecto — el script EXACTO que Daniela sigue cuando
 * un cliente pregunta por un proyecto con guion oficial. El guion vive en la
 * tabla `project_scripts` (editable sin deploy); el "cerebro" maneja las
 * desviaciones y el guion marca el camino.
 */
export interface ProjectScript {
  id: string
  project_name: string
  trigger_keywords: string[]
  script: string
  active: boolean
}

export async function getActiveProjectScripts(): Promise<ProjectScript[]> {
  const { data, error } = await getServiceClient()
    .from('project_scripts')
    .select('*')
    .eq('active', true)
  if (error) {
    // Tabla aún no migrada u otro fallo — el bot sigue sin guion, no muere
    console.warn('[project-scripts] No se pudieron cargar guiones:', error.message)
    return []
  }
  return (data as ProjectScript[]) ?? []
}

/**
 * Matchea un guion contra el mensaje actual O el interés previo del lead.
 * El interés previo importa: una vez que el cliente entró al guion de
 * Portacelli, el guion sigue activo aunque ya no repita la palabra.
 */
export function matchProjectScript(
  scripts: ProjectScript[],
  message: string,
  projectInterest: string | null,
): ProjectScript | null {
  const haystack = `${message} ${projectInterest ?? ''}`.toLowerCase()
  for (const s of scripts) {
    if (s.trigger_keywords.some(k => k && haystack.includes(k.toLowerCase()))) {
      return s
    }
  }
  return null
}

export function formatScriptForPrompt(script: ProjectScript): string {
  return `
# GUION OFICIAL DE VENTA — ${script.project_name.toUpperCase()} ← SIGUE ESTE PROCESO
Este es el proceso de venta REAL del equipo para ${script.project_name}. Tu prioridad es avanzar por estos pasos en orden — el guion filtra y califica al cliente. Lee el historial para detectar en qué paso vas y NO repitas pasos ya completados.

${script.script}
`
}
