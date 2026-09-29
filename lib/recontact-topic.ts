import { resolveProject } from '@/services/projects/gt-api'
import type { GTProject } from '@/types'

/**
 * Tema real de una conversación, para nombrarlo en un recontacto.
 *
 * `lead.project_interest` NO sirve para esto: lo fija un buscador de palabras y
 * puede quedar mal (29-sep-2026: 4 leads con "Local Comercial excelente para
 * negocio" sin haberlo pedido; uno lo recibió en el seguimiento mientras
 * hablaba de Portacelli). Aquí el tema sale de lo que de verdad se dijo:
 * el proyecto más mencionado, con más peso lo que nombró el cliente que lo que
 * ofreció Daniela. Sin proyecto claro devuelve null y el llamador usa texto
 * genérico — mejor genérico que equivocado.
 */
export function temaDeConversacion(
  historial: { role: string; content: string }[],
  proyectos: GTProject[],
): string | null {
  if (!historial.length || !proyectos.length) return null

  const cuenta = new Map<string, { peso: number; ultimo: number }>()
  historial.forEach((msg, i) => {
    // Un recontacto previo lleva el tema (quizá el equivocado): no puede votarse a sí mismo
    if (msg.content.startsWith('[Plantilla')) return
    const r = resolveProject(msg.content, proyectos)
    if (!r.project) return
    // Empate dentro de una familia ("portacelli" a secas): se nombra la familia, no un hermano al azar
    const etiqueta = r.ambiguous
      ? r.project.name.split(/[\s-]/)[0]
      : r.project.name.split(' - ')[0].trim()
    const previo = cuenta.get(etiqueta)
    cuenta.set(etiqueta, {
      peso: (previo?.peso ?? 0) + (msg.role === 'user' ? 2 : 1),
      ultimo: i,
    })
  })

  let mejor: { etiqueta: string; peso: number; ultimo: number } | null = null
  for (const [etiqueta, v] of cuenta) {
    if (!mejor || v.peso > mejor.peso || (v.peso === mejor.peso && v.ultimo > mejor.ultimo)) {
      mejor = { etiqueta, ...v }
    }
  }
  return mejor?.etiqueta ?? null
}
