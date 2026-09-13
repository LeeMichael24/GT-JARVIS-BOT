import { it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildSystemPrompt } from '@/services/claude/prompts'
import { callClaude } from '@/services/claude/client'
import { classifyIntent, extractLastBotMessage } from '@/services/claude/intent'
import { getAllProjects } from '@/services/projects/gt-api'
import { getAgentSettings } from '@/lib/agent-settings'
import { getEffectivePromptBlocks } from '@/lib/prompt-blocks'
import { getPlaybook, filterPlaybookByProject, formatPlaybookForPrompt } from '@/lib/knowledge-base'
import { getHighConfidenceLearnings, formatLearningsForPrompt } from '@/lib/agent-brain'
import { getActiveProjectScripts, matchProjectScript, formatScriptForPrompt } from '@/lib/project-scripts'
import { getActiveObjectives, formatObjectivesForPrompt } from '@/lib/objectives'
import { getAllProjectMediaItems, mediaProjectKeys, inventarioDeMaterial } from '@/lib/project-media'
import { generarRespuesta } from '@/lib/generar-respuesta'
import { construirPromptJuez, parsearVeredicto, type Veredicto } from '@/lib/sales-critic'
import type { Conversation, Lead, SendMedia, TurnPlan } from '@/types'
import { ESCENARIOS } from './escenarios'

/**
 * BATERÍA DE VENTA — el candado antes de cada deploy que toque a Daniela.
 *
 *   npm run eval:ventas            corre el pipeline real sobre los escenarios fijos
 *   JUZGAR=archivo.json npm run eval:ventas   solo califica resultados ya generados
 *
 * Corre con el modelo real y cuesta centavos. No corre en `npm test`.
 * El juez de la batería es DISTINTO y más fuerte que el de producción: si fuera
 * el mismo, la revisión automática aprendería a pasarle a su propio juez.
 */
const JUEZ_BATERIA = 'gpt-4.1'
const UMBRAL_APROBADAS = 0.8
const PROHIBIDAS = /\bestoy aqu[ií] para\b|\bno dudes? en\b|en qu[eé] (m[aá]s )?(te |le )?puedo (ayudar|asistir)|\bgarantiz(a|ado|ada)\b(?![^.]*no garantiz)/i

const OUT = process.env.OUT ?? path.resolve('.eval')
const LABEL = process.env.EVAL_LABEL ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')

const userMsg = (content: string): Conversation =>
  ({ id: 'u', lead_id: 'eval', role: 'user', content, wa_message_id: null, sent_by: null, created_at: new Date().toISOString() })

async function conReintento<T>(fn: () => Promise<T>): Promise<T> {
  for (let intento = 0; intento < 6; intento++) {
    try { return await fn() } catch (err) {
      if (!/429|rate/i.test(String(err)) || intento === 5) throw err
      await new Promise(r => setTimeout(r, 30_000))
    }
  }
  throw new Error('inalcanzable')
}

async function juzgar(mensajeCliente: string, reply: string, extras: string[], plan: TurnPlan | null, sendMedia: SendMedia | null): Promise<Veredicto> {
  const prompt = construirPromptJuez({ mensajeCliente, reply, extras, plan, sendMedia })
  return parsearVeredicto(await conReintento(() => callClaude(prompt, [userMsg('Evalúa la respuesta y devuelve el JSON.')], { model: JUEZ_BATERIA, temperature: 0 })))
}

function resumen(filas: { juez: Veredicto; burbujas: string[]; reescrita?: boolean; ms?: number }[]) {
  const aprobadas = filas.filter(f => f.juez.aprobada).length
  const ms = filas.map(f => f.ms ?? 0).filter(Boolean).sort((x, y) => x - y)
  return {
    total: filas.length,
    aprobadas,
    tasa: filas.length ? Math.round((aprobadas / filas.length) * 100) / 100 : 0,
    reescritas: filas.filter(f => f.reescrita).length,
    con_frase_prohibida: filas.filter(f => f.burbujas.some(b => PROHIBIDAS.test(b))).length,
    ms_mediana: ms.length ? ms[Math.floor(ms.length / 2)] : null,
  }
}

it.skipIf(!process.env.RUN_EVAL)('batería de venta', async () => {
  fs.mkdirSync(OUT, { recursive: true })

  // ── Modo solo-juzgar: califica un archivo de resultados ya generado ──
  if (process.env.JUZGAR) {
    const origen = JSON.parse(fs.readFileSync(process.env.JUZGAR, 'utf8')) as { id: string; cliente: string; reply?: string; extra_messages?: string[]; send_media?: SendMedia | null; plan?: TurnPlan | null }[]
    const filas = []
    for (const r of origen) {
      if (!r.reply) continue
      const burbujas = [r.reply, ...(r.extra_messages ?? [])]
      filas.push({ id: r.id, burbujas, juez: await juzgar(r.cliente, r.reply, r.extra_messages ?? [], r.plan ?? null, r.send_media ?? null) })
    }
    const destino = process.env.JUZGAR.replace(/\.json$/, '.juzgado.json')
    fs.writeFileSync(destino, JSON.stringify({ resumen: resumen(filas), filas }, null, 2))
    console.log('RESUMEN', JSON.stringify(resumen(filas)))
    return
  }

  // ── Modo batería: pipeline real, igual que el webhook ──
  const settings = await getAgentSettings()
  const blocks = await getEffectivePromptBlocks()
  const projects = await getAllProjects()
  const project = projects.find(p => p.name.startsWith('Portacelli Alta'))!
  const salesPlaybook = formatPlaybookForPrompt(filterPlaybookByProject(await getPlaybook(), project.slug, project.name))
  const brain = formatLearningsForPrompt(await getHighConfidenceLearnings(settings.brain_min_confidence))
  const scripts = await getActiveProjectScripts()
  const objectives = await getActiveObjectives()
  const media = await getAllProjectMediaItems()
  const now = new Date().toISOString()
  const lead = { id: 'eval', phone: '503', name: null, stage: 'warm', bot_active: true, project_interest: project.name, qualification_data: null, assigned_to: null, opted_out: false, last_proactive_at: null, first_message_at: now, last_message_at: now, created_at: now } as Lead

  const filas = []
  for (const e of ESCENARIOS) {
    const history = e.msgs.map((m, i) => ({ id: `c${i}`, lead_id: 'eval', role: m.role, content: m.content, wa_message_id: null, sent_by: null, created_at: now }) as Conversation)
    const usuario: string[] = []
    for (let i = history.length - 1; i >= 0 && history[i].role === 'user'; i--) usuario.unshift(history[i].content)
    const mensajeCliente = usuario.join('\n')
    const matched = matchProjectScript(scripts, mensajeCliente, project.name)
    const systemPrompt = buildSystemPrompt({
      lead, project, projects, intent: classifyIntent(mensajeCliente, history), lastBotMessage: extractLastBotMessage(history),
      salesPlaybook, brainLearnings: brain || null, projectScript: matched ? formatScriptForPrompt(matched) : null,
      mediaProjects: mediaProjectKeys(media), mediaInventory: inventarioDeMaterial(media, projects), settings, blocks,
      objectivesBlock: formatObjectivesForPrompt(objectives, { projectNames: [project.name, project.slug], investmentNames: [], isInvestmentTopic: false }) || null,
    })

    const inicio = Date.now()
    const { respuesta, revision } = await conReintento(() => generarRespuesta({ systemPrompt, history, settings, mensajeCliente, inicioMs: Date.now() }))
    const ms = Date.now() - inicio
    const burbujas = [respuesta.reply, ...(respuesta.extra_messages ?? [])]
    const juez = await juzgar(mensajeCliente, respuesta.reply, respuesta.extra_messages ?? [], respuesta.plan ?? null, respuesta.send_media)

    filas.push({
      id: e.id, cliente: mensajeCliente, burbujas, send_media: respuesta.send_media, plan: respuesta.plan ?? null,
      revision_produccion: revision, reescrita: revision.reescrita, ms, juez,
      // campos planos para poder re-juzgar este archivo con JUZGAR=
      reply: respuesta.reply, extra_messages: respuesta.extra_messages ?? [],
    })
    fs.writeFileSync(path.join(OUT, `eval-ventas-${LABEL}.json`), JSON.stringify({ resumen: resumen(filas), filas }, null, 2))
  }

  const r = resumen(filas)
  console.log('RESUMEN', JSON.stringify(r))
  expect(r.con_frase_prohibida, 'ninguna respuesta puede llevar frases prohibidas').toBe(0)
  expect(r.tasa, `aprobadas por el juez: ${r.aprobadas}/${r.total}`).toBeGreaterThanOrEqual(UMBRAL_APROBADAS)
}, 1_800_000)
