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
import { seleccionarConocimiento, construirConsulta } from '@/lib/contexto-recuperado'
import type { AgentSettings } from '@/lib/agent-settings'
import type { KBEntry } from '@/lib/knowledge-base'
import { construirPromptJuez, parsearVeredicto, type Veredicto } from '@/lib/sales-critic'
import type { Conversation, Lead, SendMedia, TurnPlan } from '@/types'
import { ESCENARIOS } from './escenarios'

/**
 * BATERÍA DE VENTA — el candado antes de cada deploy que toque a Daniela.
 *
 *   npm run eval:ventas            corre el pipeline real sobre los escenarios fijos
 *   JUZGAR=archivo.json npm run eval:ventas   solo califica resultados ya generados
 *
 * Experimentos (sin tocar la base): EVAL_LLM_MODEL=gpt-4.1 · EVAL_CRITIC_MODEL=o4-mini
 * · EVAL_SIN_RECUPERACION=1 (todo el conocimiento, como antes) · EVAL_BIBLIOTECA=borrador.json
 * (entradas de conocimiento que se suman en memoria) · EVAL_JUEZ=otro-modelo
 *
 * Corre con el modelo real y cuesta centavos. No corre en `npm test`.
 * El juez de la batería es DISTINTO y más fuerte que el de producción: si fuera
 * el mismo, la revisión automática aprendería a pasarle a su propio juez.
 */
// o4-mini: familia distinta a la de producción (gpt-4.x) y su propio límite de
// tokens, así la batería corre en paralelo a experimentos con gpt-4o y gpt-4.1
const JUEZ_BATERIA = process.env.EVAL_JUEZ ?? 'o4-mini'
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

function resumen(filas: { juez: Veredicto; burbujas: string[]; reescrita?: boolean; ms?: number; prompt_chars?: number }[]) {
  const aprobadas = filas.filter(f => f.juez.aprobada).length
  const ms = filas.map(f => f.ms ?? 0).filter(Boolean).sort((x, y) => x - y)
  return {
    total: filas.length,
    aprobadas,
    tasa: filas.length ? Math.round((aprobadas / filas.length) * 100) / 100 : 0,
    reescritas: filas.filter(f => f.reescrita).length,
    con_frase_prohibida: filas.filter(f => f.burbujas.some(b => PROHIBIDAS.test(b))).length,
    ms_mediana: ms.length ? ms[Math.floor(ms.length / 2)] : null,
    prompt_chars_mediana: (() => { const p = filas.map(f => f.prompt_chars ?? 0).filter(Boolean).sort((x, y) => x - y); return p.length ? p[Math.floor(p.length / 2)] : null })(),
    juez: JUEZ_BATERIA,
  }
}

it.skipIf(!process.env.RUN_EVAL)('batería de venta', async () => {
  fs.mkdirSync(OUT, { recursive: true })

  // ── Modo solo-juzgar: califica un archivo de resultados ya generado ──
  if (process.env.JUZGAR) {
    type Fila = { id: string; cliente: string; reply?: string; extra_messages?: string[]; send_media?: SendMedia | null; plan?: TurnPlan | null }
    // Acepta el formato viejo (arreglo) y el de la batería ({ resumen, filas })
    const bruto = JSON.parse(fs.readFileSync(process.env.JUZGAR, 'utf8')) as Fila[] | { filas: Fila[] }
    const origen = Array.isArray(bruto) ? bruto : bruto.filas
    const filas = []
    for (const r of origen) {
      if (!r.reply) continue
      const burbujas = [r.reply, ...(r.extra_messages ?? [])]
      filas.push({ id: r.id, burbujas, juez: await juzgar(r.cliente, r.reply, r.extra_messages ?? [], r.plan ?? null, r.send_media ?? null) })
    }
    const destino = process.env.JUZGAR.replace(/\.json$/, `.juzgado-${JUEZ_BATERIA}.json`)
    fs.writeFileSync(destino, JSON.stringify({ resumen: resumen(filas), filas }, null, 2))
    console.log('RESUMEN', JSON.stringify(resumen(filas)))
    return
  }

  // ── Modo batería: pipeline real, igual que el webhook ──
  const settings = {
    ...(await getAgentSettings()),
    ...(process.env.EVAL_LLM_MODEL ? { llm_model: process.env.EVAL_LLM_MODEL } : {}),
    ...(process.env.EVAL_CRITIC_MODEL ? { sales_critic_model: process.env.EVAL_CRITIC_MODEL } : {}),
  } as AgentSettings
  const blocks = await getEffectivePromptBlocks()
  const projects = await getAllProjects()
  const project = projects.find(p => p.name.startsWith('Portacelli Alta'))!
  const biblioteca: KBEntry[] = process.env.EVAL_BIBLIOTECA ? JSON.parse(fs.readFileSync(process.env.EVAL_BIBLIOTECA, 'utf8')) : []
  const kbProyecto = filterPlaybookByProject([...(await getPlaybook()), ...biblioteca], project.slug, project.name)
  const cerebroTodo = await getHighConfidenceLearnings(settings.brain_min_confidence)
  console.log('CONFIG', JSON.stringify({ llm: settings.llm_model, critico: settings.sales_critic_model, juez: JUEZ_BATERIA, recuperacion: !process.env.EVAL_SIN_RECUPERACION, biblioteca: biblioteca.length }))
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
    const lastBotMessage = extractLastBotMessage(history)
    const seleccion = process.env.EVAL_SIN_RECUPERACION
      ? { playbook: kbProyecto, cerebro: cerebroTodo, modo: { playbook: 'todo', cerebro: 'todo' } }
      : await seleccionarConocimiento({ consulta: construirConsulta({ mensajeCliente, ultimaRespuestaBot: lastBotMessage }), playbook: kbProyecto, cerebro: cerebroTodo })
    const systemPrompt = buildSystemPrompt({
      lead, project, projects, intent: classifyIntent(mensajeCliente, history), lastBotMessage,
      salesPlaybook: formatPlaybookForPrompt(seleccion.playbook), brainLearnings: formatLearningsForPrompt(seleccion.cerebro) || null,
      projectScript: matched ? formatScriptForPrompt(matched) : null,
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
      prompt_chars: systemPrompt.length, memoria: seleccion.modo,
      temas: seleccion.playbook.map(k => k.topic), lazo_abierto: respuesta.lazo_abierto ?? null,
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
