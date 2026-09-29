import { getServiceClient } from '@/lib/supabase'

/**
 * TOPE DE GASTO EN IA — presupuesto MENSUAL repartido por ritmo.
 *
 * El 29-sep-2026 una tanda de pruebas gastó $14 en un día y nadie se enteró
 * hasta ver el panel de OpenAI; el presupuesto real es de $20 al mes. Este
 * módulo lleva la cuenta del gasto y degrada a Daniela por escalones — NUNCA la
 * apaga: un cliente sin respuesta cuesta más que cualquier factura.
 *
 * El presupuesto del mes se reparte por ritmo: lo que queda del mes entre los
 * días que faltan (lo no gastado se acumula). Con $20 son ~$0.67 al día; un tope
 * diario fijo se comería el mes en unos días.
 *
 *   sobre el permitido de HOY:
 *   normal  < 80 %      todo como siempre
 *   aviso   ≥ 80 %      todo como siempre + alerta al CEO (una vez por nivel y día)
 *   ahorro  ≥ 100 %     sin revisión de venta ni reescrituras (~40 % menos)
 *   tope    ≥ 200 %     además responde con un modelo más barato
 *   y sobre el MES: ≥ 80 % aviso; ≥ 100 % tope.
 *
 * Los contadores viven en `agent_settings` (`_sys_gasto_<día SV>` y
 * `_sys_gasto_mes_<AAAA-MM>`) para no exigir una migración. Son aproximados a
 * propósito: sumar es leer-y-escribir y dos mensajes simultáneos pueden pisarse
 * una fracción de centavo. Para un tope de presupuesto basta; para facturar no.
 */

export interface UsoLLM {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
}

interface Tarifa { entrada: number; cacheada: number; salida: number }

/**
 * USD por millón de tokens, de la página oficial de precios de OpenAI
 * (developers.openai.com/api/docs/pricing, verificada el 29-sep-2026).
 * gpt-5.6-terra cobra $2.00 de entrada, pero además "cache writes" a $2.50: en la
 * factura real casi toda la entrada salió como cache write, así que se usa $2.50.
 * En o4-mini y gpt-5.x, `completion_tokens` ya incluye el razonamiento.
 */
export const TARIFAS: Record<string, Tarifa> = {
  'gpt-4.1': { entrada: 2.0, cacheada: 0.5, salida: 8.0 },
  'gpt-4.1-mini': { entrada: 0.4, cacheada: 0.1, salida: 1.6 },
  'gpt-4o': { entrada: 2.5, cacheada: 1.25, salida: 10.0 },
  'o4-mini': { entrada: 1.1, cacheada: 0.275, salida: 4.4 },
  'gpt-5.6-terra': { entrada: 2.5, cacheada: 0.2, salida: 12.0 },
}

/** Modelo desconocido: se cobra a la tarifa más cara conocida — el error debe pecar de prudente. */
const TARIFA_PRUDENTE: Tarifa = Object.values(TARIFAS).reduce((a, t) => ({
  entrada: Math.max(a.entrada, t.entrada),
  cacheada: Math.max(a.cacheada, t.cacheada),
  salida: Math.max(a.salida, t.salida),
}))

export function costoLlamada(modelo: string, uso: UsoLLM | undefined): number {
  if (!uso) return 0
  const t = TARIFAS[modelo] ?? TARIFA_PRUDENTE
  const prompt = uso.prompt_tokens ?? 0
  const cacheados = Math.min(uso.prompt_tokens_details?.cached_tokens ?? 0, prompt)
  const salida = uso.completion_tokens ?? 0
  return ((prompt - cacheados) * t.entrada + cacheados * t.cacheada + salida * t.salida) / 1e6
}

export type NivelPresupuesto = 'normal' | 'aviso' | 'ahorro' | 'tope'

export const UMBRAL_AVISO = 0.8
export const UMBRAL_AHORRO = 1
export const UMBRAL_TOPE = 2

/** Presupuesto mensual por defecto (USD): el de la cuenta de OpenAI de Grupo Terranova. */
export const TOPE_MENSUAL_USD_DEFAULT = 20

/**
 * Costo estimado de un mensaje de Daniela mientras no haya 10 mensajes reales medidos
 * en el mes. Con gpt-4o (tarifa pública, sin caché) + crítico + ~45 % de reescrituras:
 * ~$0.08. Con gpt-4.1 medido en la factura del 29-sep serían ~$0.053. Se prefiere el
 * estimado prudente: el conteo real lo corrige a los 10 mensajes.
 */
export const COSTO_MENSAJE_ESTIMADO_USD = 0.08
const MENSAJES_PARA_MEDIR = 10

/** Modelo con el que Daniela sigue respondiendo cuando se pasa el doble de lo permitido. */
export const MODELO_TOPE = 'gpt-4.1-mini'

export function nivelPresupuesto(gastoUsd: number, presupuestoUsd: number): NivelPresupuesto {
  if (!Number.isFinite(presupuestoUsd) || presupuestoUsd <= 0) return 'normal'
  const ratio = gastoUsd / presupuestoUsd
  if (ratio >= UMBRAL_TOPE) return 'tope'
  if (ratio >= UMBRAL_AHORRO) return 'ahorro'
  if (ratio >= UMBRAL_AVISO) return 'aviso'
  return 'normal'
}

const ORDEN: NivelPresupuesto[] = ['normal', 'aviso', 'ahorro', 'tope']
const peor = (a: NivelPresupuesto, b: NivelPresupuesto) => (ORDEN.indexOf(a) >= ORDEN.indexOf(b) ? a : b)

/** Día calendario de El Salvador (UTC-6): a las 21:54 locales UTC ya está en el día siguiente. */
export function fechaSV(ahora: Date): string {
  return new Date(ahora.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const claveDia = (ahora: Date) => `_sys_gasto_${fechaSV(ahora)}`
const claveMes = (ahora: Date) => `_sys_gasto_mes_${fechaSV(ahora).slice(0, 7)}`

// ── Reparto del presupuesto por ritmo ──────────────────────────

export interface PermitidoHoy {
  /** Cuánto se puede gastar HOY (0 = sin límite) */
  permitidoUsd: number
  /** Lo que quedaba del mes al empezar el día */
  restanteAlEmpezarUsd: number
  /** Días que faltan del mes, contando hoy */
  diasRestantes: number
}

export function permitidoHoy(o: {
  mensualUsd: number
  diarioUsd: number
  gastoMesUsd: number
  gastoHoyUsd: number
  ahora: Date
}): PermitidoHoy {
  const [y, m, d] = fechaSV(o.ahora).split('-').map(Number)
  const diasDelMes = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const diasRestantes = diasDelMes - d + 1
  const restanteAlEmpezarUsd = Math.max(0, o.mensualUsd - (o.gastoMesUsd - o.gastoHoyUsd))
  const explicito = o.diarioUsd > 0 ? o.diarioUsd : Infinity

  if (!(o.mensualUsd > 0)) {
    return { permitidoUsd: Number.isFinite(explicito) ? explicito : 0, restanteAlEmpezarUsd, diasRestantes }
  }
  const ritmo = restanteAlEmpezarUsd / diasRestantes
  // El tope diario explícito solo puede bajar el ritmo, nunca subirlo
  return { permitidoUsd: Math.min(ritmo, explicito), restanteAlEmpezarUsd, diasRestantes }
}

// ── Contadores (día y mes) ─────────────────────────────────────

export interface GastoDia { usd: number; calls: number; mensajes: number }

const CERO: GastoDia = { usd: 0, calls: 0, mensajes: 0 }
const redondear = (n: number) => Math.round(n * 1e6) / 1e6

const cache = new Map<string, { valor: GastoDia; at: number }>()
const CACHE_MS = 15_000

export function _limpiarCacheGasto(): void {
  cache.clear()
}

function parsear(raw: string | undefined | null): GastoDia {
  if (!raw) return { ...CERO }
  try {
    const o = JSON.parse(raw) as Partial<GastoDia>
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
    return { usd: num(o.usd), calls: num(o.calls), mensajes: num(o.mensajes) }
  } catch {
    return { ...CERO }
  }
}

async function leerFila(clave: string): Promise<GastoDia> {
  const { data } = await getServiceClient()
    .from('agent_settings')
    .select('value')
    .eq('key', clave)
    .maybeSingle()
  return parsear((data as { value?: string } | null)?.value)
}

async function leerCacheado(clave: string): Promise<GastoDia> {
  const c = cache.get(clave)
  if (c && Date.now() - c.at < CACHE_MS) return c.valor
  try {
    const valor = await leerFila(clave)
    cache.set(clave, { valor, at: Date.now() })
    return valor
  } catch (err) {
    console.warn('[llm-budget] no se pudo leer el gasto:', err instanceof Error ? err.message : err)
    return { ...CERO }
  }
}

/** Gasto acumulado de hoy. Ante cualquier error: 0 (fail-open). */
export const leerGastoHoy = (ahora: Date = new Date()): Promise<GastoDia> => leerCacheado(claveDia(ahora))

/** Gasto acumulado del mes en curso. Ante cualquier error: 0 (fail-open). */
export const leerGastoMes = (ahora: Date = new Date()): Promise<GastoDia> => leerCacheado(claveMes(ahora))

async function sumarEn(clave: string, usd: number, calls: number, mensajes: number, descripcion: string): Promise<void> {
  const previo = await leerFila(clave)
  const nuevo: GastoDia = {
    usd: redondear(previo.usd + usd),
    calls: previo.calls + calls,
    mensajes: previo.mensajes + mensajes,
  }
  await getServiceClient()
    .from('agent_settings')
    .upsert({ key: clave, value: JSON.stringify(nuevo), description: descripcion, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  cache.set(clave, { valor: nuevo, at: Date.now() })
}

/** Suma al día y al mes. Nunca lanza: medir no puede tumbar una respuesta. */
export async function sumarGasto(usd: number, calls: number, ahora: Date = new Date(), mensajes = 0): Promise<void> {
  if (!(usd > 0) && calls <= 0 && mensajes <= 0) return
  try {
    await sumarEn(claveDia(ahora), usd, calls, mensajes, 'Contador interno del gasto diario en IA (no editar).')
    await sumarEn(claveMes(ahora), usd, calls, mensajes, 'Contador interno del gasto mensual en IA (no editar).')
  } catch (err) {
    console.warn('[llm-budget] no se pudo registrar el gasto:', err instanceof Error ? err.message : err)
  }
}

/** Una llamada suelta (seguimientos, reflexión…): calcula el costo y lo suma. */
export async function registrarUso(modelo: string, uso: UsoLLM | undefined, ahora: Date = new Date()): Promise<void> {
  await sumarGasto(costoLlamada(modelo, uso), 1, ahora)
}

export interface Medidor {
  add: (modelo: string, uso: UsoLLM | undefined) => void
  guardar: (ahora?: Date, opts?: { mensaje?: boolean }) => Promise<void>
}

/**
 * Acumula las llamadas de UN mensaje (respuesta + votos del crítico + reescritura)
 * y las guarda de una vez: una escritura por mensaje, y sin pisarse entre los tres
 * votos que corren en paralelo.
 */
export function crearMedidor(): Medidor {
  let usd = 0
  let calls = 0
  return {
    add(modelo, uso) {
      usd += costoLlamada(modelo, uso)
      calls++
    },
    async guardar(ahora = new Date(), opts = {}) {
      if (calls === 0) return
      const u = usd, c = calls
      usd = 0
      calls = 0
      await sumarGasto(u, c, ahora, opts.mensaje ? 1 : 0)
    },
  }
}

// ── Estado del presupuesto ─────────────────────────────────────

export interface EstadoPresupuesto {
  nivel: NivelPresupuesto
  /** Gasto de hoy */
  gastoUsd: number
  gastoMesUsd: number
  mensualUsd: number
  /** Lo permitido hoy según el ritmo (0 = sin límite) */
  permitidoHoyUsd: number
  /** Mensajes que quedan del mes al costo medido (o estimado) */
  mensajesRestantes: number
}

export async function estadoPresupuesto(
  cfg: { mensualUsd: number; diarioUsd: number },
  ahora: Date = new Date(),
): Promise<EstadoPresupuesto> {
  const [hoy, mes] = await Promise.all([leerGastoHoy(ahora), leerGastoMes(ahora)])
  const p = permitidoHoy({ ...cfg, gastoMesUsd: mes.usd, gastoHoyUsd: hoy.usd, ahora })

  let nivel = nivelPresupuesto(hoy.usd, p.permitidoUsd)
  if (cfg.mensualUsd > 0) {
    // El mes agotado es tope; desde el 80 % del mes es aviso como mínimo
    const delMes: NivelPresupuesto = mes.usd >= cfg.mensualUsd
      ? 'tope'
      : nivelPresupuesto(mes.usd, cfg.mensualUsd) === 'normal' ? 'normal' : 'aviso'
    nivel = peor(nivel, delMes)
  }

  const costoPorMensaje = mes.mensajes >= MENSAJES_PARA_MEDIR && mes.usd > 0
    ? mes.usd / mes.mensajes
    : COSTO_MENSAJE_ESTIMADO_USD
  const restanteMes = cfg.mensualUsd > 0 ? Math.max(0, cfg.mensualUsd - mes.usd) : 0
  return {
    nivel,
    gastoUsd: hoy.usd,
    gastoMesUsd: mes.usd,
    mensualUsd: cfg.mensualUsd,
    permitidoHoyUsd: p.permitidoUsd,
    mensajesRestantes: Math.floor(restanteMes / costoPorMensaje),
  }
}

// ── Alerta al CEO ──────────────────────────────────────────────

export interface ContextoAlerta {
  gastoHoyUsd: number
  permitidoHoyUsd: number
  gastoMesUsd: number
  mensualUsd: number
  mensajesRestantes: number
}

const usd2 = (n: number) => `$${n.toFixed(2)}`

function textoAlerta(nivel: NivelPresupuesto, c: ContextoAlerta): string {
  const mes = c.mensualUsd > 0
    ? `Mes: ${usd2(c.gastoMesUsd)} de ${usd2(c.mensualUsd)}, quedan unos ${c.mensajesRestantes} mensajes al costo actual.`
    : `Mes: ${usd2(c.gastoMesUsd)} (sin tope mensual).`
  const hoy = c.permitidoHoyUsd > 0
    ? `Hoy: ${usd2(c.gastoHoyUsd)} de ${usd2(c.permitidoHoyUsd)} permitidos por el ritmo del mes.`
    : `Hoy: ${usd2(c.gastoHoyUsd)}.`
  const cierre = 'Sigue contestando a todos los clientes. Ajusta los topes en /panel → Ajustes → Motor.'
  if (nivel === 'aviso') {
    return `⚠️ Gasto de IA: ${hoy} ${mes} Al pasar lo permitido de hoy, Daniela pasa a modo ahorro (sin revisión de venta). ${cierre}`
  }
  if (nivel === 'ahorro') {
    return `🟠 Gasto de IA: ${hoy} ${mes} Daniela pasó a modo ahorro: sin revisión de venta ni reescrituras. ${cierre}`
  }
  return `🔴 Gasto de IA: ${hoy} ${mes} Daniela responde ahora con un modelo más barato (${MODELO_TOPE}) y sin revisión de venta. ${cierre}`
}

/**
 * Avisa al CEO cuando se cruza un nivel, UNA vez por nivel y por día. La marca se
 * guarda antes de enviar: si el envío falla (p. ej. ventana de 24 h de WhatsApp)
 * no se reintenta en cada mensaje.
 */
export async function avisarSiCorresponde(
  nivel: NivelPresupuesto,
  contexto: ContextoAlerta,
  deps: { enviar: (texto: string) => Promise<void>; ahora?: Date },
): Promise<void> {
  if (nivel === 'normal') return
  const ahora = deps.ahora ?? new Date()
  const clave = `_sys_alerta_${fechaSV(ahora)}_${nivel}`
  try {
    const { data } = await getServiceClient().from('agent_settings').select('value').eq('key', clave).maybeSingle()
    if (data) return
    await getServiceClient().from('agent_settings').upsert({
      key: clave, value: '1', description: 'Marca interna: alerta de gasto ya enviada (no editar).',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
    await deps.enviar(textoAlerta(nivel, contexto))
  } catch (err) {
    console.warn('[llm-budget] no se pudo enviar la alerta de gasto:', err instanceof Error ? err.message : err)
  }
}
