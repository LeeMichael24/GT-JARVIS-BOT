import { it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildSystemPrompt } from '@/services/claude/prompts'
import { callClaude } from '@/services/claude/client'
import { classifyIntent, extractLastBotMessage } from '@/services/claude/intent'
import { getAllProjects } from '@/services/projects/gt-api'
import { resolveProject } from '@/services/projects/gt-api'
import { familiaDeSlug } from '@/lib/projects-registry'
import { getAgentSettings } from '@/lib/agent-settings'
import { getEffectivePromptBlocks } from '@/lib/prompt-blocks'
import { getPlaybook, filterPlaybookByProject, formatPlaybookForPrompt } from '@/lib/knowledge-base'
import { getHighConfidenceLearnings, formatLearningsForPrompt } from '@/lib/agent-brain'
import { getActiveProjectScripts, matchProjectScript, formatScriptForPrompt } from '@/lib/project-scripts'
import { getActiveObjectives, formatObjectivesForPrompt } from '@/lib/objectives'
import { getAllProjectMediaItems, mediaProjectKeys, inventarioDeMaterial, mediaForProject, pickMediaToSend } from '@/lib/project-media'
import { generarRespuesta } from '@/lib/generar-respuesta'
import { seleccionarConocimiento, construirConsulta } from '@/lib/contexto-recuperado'
import type { AgentSettings } from '@/lib/agent-settings'
import type { Conversation, Lead, SendMedia, TurnPlan } from '@/types'
import { ESCENARIOS_VISUAL, type EscenarioVisual, type TipoMaterial } from './escenarios-visual'
import { PROMESA_MATERIAL, CIFRAS_DE_REFERENCIA, pideCita as detectaCita, esCitaConcreta } from './detectores'

/**
 * BATERÍA VISUAL Y DE CITA — mide las tres cosas que deciden si Daniela cierra:
 *
 *   1. MOSTRAR   ¿manda el material correcto, o dice la verdad cuando no existe?
 *   2. ENTENDER  ¿el cliente queda entendiendo el proyecto, con los datos duros?
 *   3. CITA      ¿la conversación termina empujando a una visita o una virtual?
 *
 *   npm run eval:visual
 *
 * Corre el pipeline REAL (mismo camino que el webhook) y además SIMULA LA
 * ENTREGA del material igual que producción: resuelve el listing pedido contra
 * `project_media` y marca si el archivo de verdad habría salido. Una respuesta
 * que promete una ficha que no existe queda registrada como promesa rota,
 * aunque el texto sea perfecto.
 *
 * Usa el modelo real: cuesta centavos. No corre en `npm test`.
 */
const JUEZ = process.env.EVAL_JUEZ ?? 'o4-mini'
const VOTOS = Number(process.env.EVAL_VOTOS ?? 3)
const OUT = process.env.OUT ?? path.resolve('.eval')
const LABEL = process.env.EVAL_LABEL ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')

// Frases de call center que el reply-guard ya debería haber limpiado
const PROHIBIDAS = /\bestoy aqu[ií] para\b|\bno dudes? en\b|en qu[eé] (m[aá]s )?(te |le )?puedo (ayudar|asistir)|\bgarantiz(a|ado|ada)\b(?![^.]*no garantiz)/i

const RUBRICA = `Eres el director comercial de Grupo Terranova. Estás revisando el mensaje de WhatsApp que Daniela, la asesora, le va a mandar a un cliente de bienes raíces. No reescribes: calificas.

Calificas CUATRO cosas, cada una de 0 a 2:

"entendio" — ¿el cliente queda entendiendo lo que preguntó?
  2 = responde exactamente lo preguntado con el dato concreto (cifra, medida, fecha, paso) y en lenguaje claro.
  1 = responde pero se queda corta, vaga o genérica ("gran plusvalía", "zona en desarrollo").
  0 = no responde lo que preguntó, o contesta con un dato equivocado o inventado.

"visual" — ¿usa bien el material?
  2 = manda el material correcto para lo que pidió el cliente; o, si ese material NO existe en el inventario, lo dice con honestidad y entrega los datos clave en texto sin prometer ningún archivo.
  1 = ofrece material pero el que no era, o lo deja para después sin dar nada ahora.
  0 = promete un archivo que no existe en el inventario, dice que lo envía y no lo adjunta, o describe el contenido de un documento que no puede ver.

"conduce" — ¿lleva la conversación o la deja morir?
  2 = después de responder deja un siguiente paso vivo (algo que anticipa, recomienda o prepara) y, si califica, hace UNA sola pregunta diciendo para qué la hace.
  1 = responde correcto pero cierra plano, o hace dos o más preguntas seguidas tipo formulario.
  0 = frase de call center, cierre en seco ("quedo atenta"), o ignora lo que el cliente dijo.

"cita" — ¿empuja al siguiente paso comercial?
  2 = propone una cita concreta (día, franja o modalidad: visita al proyecto, videollamada) o, si el cliente ya quiere avanzar, explica el paso concreto para apartar.
  1 = menciona la posibilidad de conocerlo sin concretar nada.
  0 = no hay ningún avance hacia la cita.
  Si el cliente pidió tiempo explícitamente o el mensaje es puro trámite, califica "cita" con 2 cuando la respuesta respeta ese momento sin empujar.
  El dato "ESTE TURNO DEBE EMPUJAR CITA" al final te dice si aplica: si dice "no", el turno es solo de información y NO se espera cita — califica "cita" con 2 salvo que presione de forma torpe; no bajes puntos por no proponer visita.

Además devuelves:
"errores": lista de datos equivocados, inventados o contradictorios (vacía si no hay).
"que_falto": en una línea, la jugada concreta que faltó, o null.

Responde SOLO con este JSON:
{"entendio":0,"visual":0,"conduce":0,"cita":0,"errores":[],"que_falto":null}`

type Nota = { entendio: number; visual: number; conduce: number; cita: number; errores: string[]; que_falto: string | null }

const NOTA_NEUTRA: Nota = { entendio: 1, visual: 1, conduce: 1, cita: 1, errores: [], que_falto: null }

function parsearNota(raw: string): Nota | null {
  let o: unknown
  try { o = JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()) } catch { return null }
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const n = (v: unknown): number => (typeof v === 'number' && v >= 0 && v <= 2 ? Math.round(v) : 1)
  return {
    entendio: n(r.entendio), visual: n(r.visual), conduce: n(r.conduce), cita: n(r.cita),
    errores: Array.isArray(r.errores) ? r.errores.filter((e): e is string => typeof e === 'string').slice(0, 6) : [],
    que_falto: typeof r.que_falto === 'string' && r.que_falto.trim() ? r.que_falto.trim() : null,
  }
}

interface Fila {
  id: string; bloque: EscenarioVisual['bloque']; proyecto: string; cliente: string
  burbujas: string[]; reply: string; extra_messages: string[]
  plan: TurnPlan | null; lazo_abierto: string | null
  send_media: SendMedia | null
  material_esperado: TipoMaterial
  material_entregado: { tipo: TipoMaterial; piezas: string[] }
  material_correcto: boolean; prometio_sin_adjuntar: boolean
  datos_faltantes: string[]; pide_cita: boolean; cita_concreta: boolean
  debe_pedir_cita: boolean; frase_prohibida: boolean
  nota: Nota; total: number; votos_validos: number
  revision_produccion: unknown; reescrita: boolean; ms: number; prompt_chars: number
}

const mediana = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

async function conReintento<T>(fn: () => Promise<T>): Promise<T> {
  for (let intento = 0; intento < 6; intento++) {
    try { return await fn() } catch (err) {
      if (!/429|rate/i.test(String(err)) || intento === 5) throw err
      await new Promise(r => setTimeout(r, 30_000))
    }
  }
  throw new Error('inalcanzable')
}

const userMsg = (content: string): Conversation =>
  ({ id: 'u', lead_id: 'eval', role: 'user', content, wa_message_id: null, sent_by: null, created_at: new Date().toISOString() })

it.skipIf(!process.env.RUN_EVAL_VISUAL)('batería visual y de cita', async () => {
  fs.mkdirSync(OUT, { recursive: true })

  const settings = {
    ...(await getAgentSettings()),
    ...(process.env.EVAL_LLM_MODEL ? { llm_model: process.env.EVAL_LLM_MODEL } : {}),
  } as AgentSettings
  const blocks = await getEffectivePromptBlocks()
  const projects = await getAllProjects()
  const playbook = await getPlaybook()
  const cerebroTodo = await getHighConfidenceLearnings(settings.brain_min_confidence)
  const scripts = await getActiveProjectScripts()
  const objectives = await getActiveObjectives()
  const media = await getAllProjectMediaItems()
  const inventario = inventarioDeMaterial(media, projects)
  console.log('CONFIG', JSON.stringify({ llm: settings.llm_model, critico: settings.sales_critic_model, juez: JUEZ, votos: VOTOS, media_activa: media.length }))
  console.log('INVENTARIO', JSON.stringify(inventario))

  const now = new Date().toISOString()
  const filas: Fila[] = []

  for (const e of ESCENARIOS_VISUAL as EscenarioVisual[]) {
    const project = projects.find(p => p.name.startsWith(e.proyecto ?? 'Portacelli Alta'))!
    const kbProyecto = filterPlaybookByProject(playbook, project.slug, project.name)
    const lead = { id: 'eval', phone: '503', name: null, stage: 'warm', bot_active: true, project_interest: project.name, qualification_data: null, assigned_to: null, opted_out: false, last_proactive_at: null, first_message_at: now, last_message_at: now, created_at: now } as Lead

    const history = e.msgs.map((m, i) => ({ id: `c${i}`, lead_id: 'eval', role: m.role, content: m.content, wa_message_id: null, sent_by: null, created_at: now }) as Conversation)
    const usuario: string[] = []
    for (let i = history.length - 1; i >= 0 && history[i].role === 'user'; i--) usuario.unshift(history[i].content)
    const mensajeCliente = usuario.join('\n')

    const matched = matchProjectScript(scripts, mensajeCliente, project.name)
    const lastBotMessage = extractLastBotMessage(history)
    const seleccion = await seleccionarConocimiento({
      consulta: construirConsulta({ mensajeCliente, ultimaRespuestaBot: lastBotMessage }),
      playbook: kbProyecto, cerebro: cerebroTodo,
    })
    const systemPrompt = buildSystemPrompt({
      lead, project, projects, intent: classifyIntent(mensajeCliente, history), lastBotMessage,
      salesPlaybook: formatPlaybookForPrompt(seleccion.playbook), brainLearnings: formatLearningsForPrompt(seleccion.cerebro) || null,
      projectScript: matched ? formatScriptForPrompt(matched) : null,
      mediaProjects: mediaProjectKeys(media), mediaInventory: inventario, settings, blocks,
      objectivesBlock: formatObjectivesForPrompt(objectives, { projectNames: [project.name, project.slug], investmentNames: [], isInvestmentTopic: false }) || null,
    })

    const inicio = Date.now()
    const { respuesta, revision } = await conReintento(() => generarRespuesta({ systemPrompt, history, settings, mensajeCliente, inicioMs: Date.now() }))
    const ms = Date.now() - inicio
    const burbujas = [respuesta.reply, ...(respuesta.extra_messages ?? [])]
    const texto = burbujas.join('\n')

    // ── Simulación de la entrega real, igual que el webhook (paso 14) ──
    let entregado: { tipo: TipoMaterial; piezas: string[] } = { tipo: 'ninguno', piezas: [] }
    if (respuesta.send_media) {
      const { type, project: nombrePedido } = respuesta.send_media
      const pedidoRes = resolveProject(nombrePedido, projects)
      const mismaFamilia = pedidoRes.project && familiaDeSlug(pedidoRes.project.slug) === familiaDeSlug(project.slug)
      const pedido = !pedidoRes.project || mismaFamilia ? project : pedidoRes.project
      const items = pickMediaToSend(mediaForProject(media, nombrePedido, pedido?.slug ?? null), type)
      const piezas = (type === 'image' ? items.slice(0, 3) : items.slice(0, 1)).map(i => `${i.media_type}${i.caption ? ` — ${i.caption}` : ''}`)
      entregado = { tipo: piezas.length ? type : 'ninguno', piezas }
    }

    // ── Chequeos duros (no dependen del juez) ──
    const prometioSinAdjuntar = PROMESA_MATERIAL.test(texto) && entregado.piezas.length === 0
    const materialCorrecto = e.espera_material === 'ninguno'
      ? entregado.piezas.length === 0 && !prometioSinAdjuntar
      : entregado.tipo === e.espera_material
    const datosFaltantes = (e.datos ?? []).filter(d => !d.re.test(texto)).map(d => d.nombre)
    const pideCita = detectaCita(texto)
    const citaConcreta = esCitaConcreta(texto)
    const fraseProhibida = PROHIBIDAS.test(texto)

    // ── Juez ──
    const promptJuez = `${RUBRICA}

${CIFRAS_DE_REFERENCIA}

ESTE TURNO DEBE EMPUJAR CITA: ${e.debe_pedir_cita ? 'sí' : 'no'}

INVENTARIO DE MATERIAL QUE EXISTE DE VERDAD (no hay nada más):
${inventario.map(i => `- ${i}`).join('\n')}

PROYECTO DE LA CONVERSACIÓN: ${project.name}

MENSAJE DEL CLIENTE:
${mensajeCliente}

RESPUESTA A CALIFICAR (cada línea con > es una burbuja de WhatsApp):
${burbujas.map(b => `> ${b}`).join('\n')}

MATERIAL QUE PIDIÓ ADJUNTAR: ${respuesta.send_media ? `${respuesta.send_media.type} — ${respuesta.send_media.description}` : 'ninguno'}
MATERIAL QUE DE VERDAD LE HABRÍA LLEGADO AL CLIENTE: ${entregado.piezas.length ? entregado.piezas.join('; ') : 'ninguno'}`

    const votos = await Promise.allSettled(
      Array.from({ length: VOTOS }, () => conReintento(() => callClaude(promptJuez, [userMsg('Califica la respuesta y devuelve el JSON.')], { model: JUEZ, temperature: 0 })))
    )
    const notas = votos.flatMap(v => (v.status === 'fulfilled' ? [parsearNota(v.value)] : [])).filter((n): n is Nota => !!n)
    const nota: Nota = notas.length
      ? {
        entendio: mediana(notas.map(n => n.entendio)), visual: mediana(notas.map(n => n.visual)),
        conduce: mediana(notas.map(n => n.conduce)), cita: mediana(notas.map(n => n.cita)),
        errores: [...new Set(notas.flatMap(n => n.errores))].slice(0, 6),
        que_falto: notas.find(n => n.que_falto)?.que_falto ?? null,
      }
      : { ...NOTA_NEUTRA }

    const total = nota.entendio + nota.visual + nota.conduce + nota.cita

    filas.push({
      id: e.id, bloque: e.bloque, proyecto: project.name, cliente: mensajeCliente,
      burbujas, reply: respuesta.reply, extra_messages: respuesta.extra_messages ?? [],
      plan: respuesta.plan ?? null, lazo_abierto: respuesta.lazo_abierto ?? null,
      send_media: respuesta.send_media, material_esperado: e.espera_material, material_entregado: entregado,
      material_correcto: materialCorrecto, prometio_sin_adjuntar: prometioSinAdjuntar,
      datos_faltantes: datosFaltantes, pide_cita: pideCita, cita_concreta: citaConcreta,
      debe_pedir_cita: !!e.debe_pedir_cita, frase_prohibida: fraseProhibida,
      nota, total, votos_validos: notas.length,
      revision_produccion: revision, reescrita: revision.reescrita, ms, prompt_chars: systemPrompt.length,
    })

    console.log(`${e.id} · ${total}/8 · material ${materialCorrecto ? 'OK' : 'FALLA'} (esperado ${e.espera_material}, entregado ${entregado.tipo}) · cita ${citaConcreta ? 'concreta' : pideCita ? 'vaga' : 'no'}${datosFaltantes.length ? ` · faltan datos: ${datosFaltantes.join(', ')}` : ''}`)
    fs.writeFileSync(path.join(OUT, `eval-visual-${LABEL}.json`), JSON.stringify({ filas }, null, 2))
  }

  const porBloque = (b: string) => filas.filter(f => f.bloque === b)
  const prom = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, c) => a + c, 0) / xs.length) * 100) / 100 : 0)
  const resumen = {
    total: filas.length,
    puntaje_promedio_sobre_8: prom(filas.map(f => f.total)),
    entendio: prom(filas.map(f => f.nota.entendio)),
    visual: prom(filas.map(f => f.nota.visual)),
    conduce: prom(filas.map(f => f.nota.conduce)),
    cita: prom(filas.map(f => f.nota.cita)),
    cita_en_escenarios_que_tocan: prom(filas.filter(f => f.debe_pedir_cita).map(f => f.nota.cita)),
    material_correcto: `${filas.filter(f => f.material_correcto).length}/${filas.length}`,
    promesas_rotas: filas.filter(f => f.prometio_sin_adjuntar).length,
    escenarios_con_datos_faltantes: filas.filter(f => f.datos_faltantes.length).length,
    cita_concreta_cuando_tocaba: `${filas.filter(f => f.debe_pedir_cita && f.cita_concreta).length}/${filas.filter(f => f.debe_pedir_cita).length}`,
    con_frase_prohibida: filas.filter(f => f.frase_prohibida).length,
    reescritas_por_el_critico: filas.filter(f => f.reescrita).length,
    por_bloque: {
      material: prom(porBloque('material').map(f => f.total)),
      entendimiento: prom(porBloque('entendimiento').map(f => f.total)),
      cita: prom(porBloque('cita').map(f => f.total)),
    },
    ms_mediana: mediana(filas.map(f => f.ms)),
    juez: JUEZ,
  }
  fs.writeFileSync(path.join(OUT, `eval-visual-${LABEL}.json`), JSON.stringify({ resumen, filas }, null, 2))
  console.log('RESUMEN', JSON.stringify(resumen, null, 2))

  // Una promesa de material que no llega es el peor defecto: el cliente queda esperando.
  expect(resumen.promesas_rotas, 'respuestas que prometen material sin adjuntarlo').toBe(0)
  expect(resumen.con_frase_prohibida, 'respuestas con frases de call center').toBe(0)
}, 1_800_000)
