import { getServiceClient } from '@/lib/supabase'

/**
 * TOPE DE GASTO DIARIO EN IA.
 *
 * El 29-sep-2026 una tanda de pruebas gastó $14 en un día y nadie se enteró
 * hasta ver el panel de OpenAI. Este módulo lleva la cuenta del gasto de hoy y
 * degrada a Daniela por escalones — NUNCA la apaga: un cliente sin respuesta
 * cuesta más que cualquier factura.
 *
 *   normal  < 80 %      todo como siempre
 *   aviso   ≥ 80 %      todo como siempre + alerta al CEO (una vez al día)
 *   ahorro  ≥ 100 %     sin revisión de venta ni reescrituras (~40 % menos)
 *   tope    ≥ 200 %     además responde con un modelo más barato
 *
 * El contador vive en `agent_settings` (clave `_sys_gasto_<fecha SV>`) para no
 * exigir una migración. Es aproximado a propósito: sumar es leer-y-escribir, y
 * dos mensajes simultáneos pueden pisarse una fracción de centavo. Para un tope
 * de presupuesto basta; para facturar no serviría.
 */

export interface UsoLLM {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
}

interface Tarifa { entrada: number; cacheada: number; salida: number }

/**
 * USD por millón de tokens. gpt-4.1, gpt-4.1-mini, gpt-4o y o4-mini son la lista
 * pública. gpt-5.6-terra se calibró con la factura real del 29-sep (entrada
 * ≈ $2.1/M cobrada casi toda como "cache writes", salida ≈ $11/M): es una
 * estimación. En o4-mini y gpt-5.x, `completion_tokens` ya incluye el razonamiento.
 */
export const TARIFAS: Record<string, Tarifa> = {
  'gpt-4.1': { entrada: 2.0, cacheada: 0.5, salida: 8.0 },
  'gpt-4.1-mini': { entrada: 0.4, cacheada: 0.1, salida: 1.6 },
  'gpt-4o': { entrada: 2.5, cacheada: 1.25, salida: 10.0 },
  'o4-mini': { entrada: 1.1, cacheada: 0.275, salida: 4.4 },
  'gpt-5.6-terra': { entrada: 2.1, cacheada: 0.2, salida: 11.0 },
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

/** Tope diario por defecto (USD): ~65 mensajes al día con el modelo caro y la revisión completa. */
export const TOPE_DIARIO_USD_DEFAULT = 5

/** Modelo con el que Daniela sigue respondiendo cuando se pasa el doble del tope. */
export const MODELO_TOPE = 'gpt-4.1-mini'

export function nivelPresupuesto(gastoUsd: number, presupuestoUsd: number): NivelPresupuesto {
  if (!Number.isFinite(presupuestoUsd) || presupuestoUsd <= 0) return 'normal'
  const ratio = gastoUsd / presupuestoUsd
  if (ratio >= UMBRAL_TOPE) return 'tope'
  if (ratio >= UMBRAL_AHORRO) return 'ahorro'
  if (ratio >= UMBRAL_AVISO) return 'aviso'
  return 'normal'
}

/** Día calendario de El Salvador (UTC-6): a las 21:54 locales UTC ya está en el día siguiente. */
export function fechaSV(ahora: Date): string {
  return new Date(ahora.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const claveGasto = (ahora: Date) => `_sys_gasto_${fechaSV(ahora)}`

// ── Contador diario ────────────────────────────────────────────

export interface GastoDia { usd: number; calls: number }

const redondear = (n: number) => Math.round(n * 1e6) / 1e6

let cache: { clave: string; valor: GastoDia; at: number } | null = null
const CACHE_MS = 15_000

export function _limpiarCacheGasto(): void {
  cache = null
}

function parsear(raw: string | undefined | null): GastoDia {
  if (!raw) return { usd: 0, calls: 0 }
  try {
    const o = JSON.parse(raw) as Partial<GastoDia>
    const usd = typeof o.usd === 'number' && Number.isFinite(o.usd) && o.usd >= 0 ? o.usd : 0
    const calls = typeof o.calls === 'number' && Number.isFinite(o.calls) && o.calls >= 0 ? o.calls : 0
    return { usd, calls }
  } catch {
    return { usd: 0, calls: 0 }
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

/** Gasto acumulado de hoy. Ante cualquier error: 0 (fail-open). */
export async function leerGastoHoy(ahora: Date = new Date()): Promise<GastoDia> {
  const clave = claveGasto(ahora)
  if (cache && cache.clave === clave && Date.now() - cache.at < CACHE_MS) return cache.valor
  try {
    const valor = await leerFila(clave)
    cache = { clave, valor, at: Date.now() }
    return valor
  } catch (err) {
    console.warn('[llm-budget] no se pudo leer el gasto de hoy:', err instanceof Error ? err.message : err)
    return { usd: 0, calls: 0 }
  }
}

/** Suma al gasto de hoy. Nunca lanza: medir no puede tumbar una respuesta. */
export async function sumarGasto(usd: number, calls: number, ahora: Date = new Date()): Promise<void> {
  if (!(usd > 0) && calls <= 0) return
  const clave = claveGasto(ahora)
  try {
    const previo = await leerFila(clave)
    const nuevo: GastoDia = { usd: redondear(previo.usd + usd), calls: previo.calls + calls }
    await getServiceClient()
      .from('agent_settings')
      .upsert({
        key: clave,
        value: JSON.stringify(nuevo),
        description: 'Contador interno del gasto diario en IA (no editar).',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
    cache = { clave, valor: nuevo, at: Date.now() }
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
  guardar: (ahora?: Date) => Promise<void>
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
    async guardar(ahora = new Date()) {
      if (calls === 0) return
      const u = usd, c = calls
      usd = 0
      calls = 0
      await sumarGasto(u, c, ahora)
    },
  }
}

export async function estadoPresupuesto(
  presupuestoUsd: number,
  ahora: Date = new Date(),
): Promise<{ nivel: NivelPresupuesto; gastoUsd: number }> {
  const { usd } = await leerGastoHoy(ahora)
  return { nivel: nivelPresupuesto(usd, presupuestoUsd), gastoUsd: usd }
}

// ── Alerta al CEO ──────────────────────────────────────────────

const usd2 = (n: number) => `$${n.toFixed(2)}`

function textoAlerta(nivel: NivelPresupuesto, gastoUsd: number, presupuestoUsd: number): string {
  const base = `Gasto de IA de hoy: ${usd2(gastoUsd)} de ${usd2(presupuestoUsd)} (${Math.round((gastoUsd / presupuestoUsd) * 100)} %).`
  const ajuste = 'Puedes cambiar el tope en /panel → Ajustes → Motor.'
  if (nivel === 'aviso') {
    return `⚠️ ${base} Al llegar a ${usd2(presupuestoUsd)} Daniela pasa a modo ahorro (sin revisión de venta); a ${usd2(presupuestoUsd * UMBRAL_TOPE)} responde con un modelo más barato. Sigue contestando a todos los clientes. ${ajuste}`
  }
  if (nivel === 'ahorro') {
    return `🟠 ${base} Daniela pasó a modo ahorro: sin revisión de venta ni reescrituras. A ${usd2(presupuestoUsd * UMBRAL_TOPE)} usará un modelo más barato. Sigue contestando a todos los clientes. ${ajuste}`
  }
  return `🔴 ${base} Daniela responde ahora con un modelo más barato (${MODELO_TOPE}) y sin revisión de venta. Sigue contestando a todos los clientes. ${ajuste}`
}

/**
 * Avisa al CEO cuando se cruza un nivel, UNA vez por nivel y por día. La marca se
 * guarda antes de enviar: si el envío falla (p. ej. ventana de 24 h de WhatsApp)
 * no se reintenta en cada mensaje.
 */
export async function avisarSiCorresponde(
  nivel: NivelPresupuesto,
  gastoUsd: number,
  presupuestoUsd: number,
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
    await deps.enviar(textoAlerta(nivel, gastoUsd, presupuestoUsd))
  } catch (err) {
    console.warn('[llm-budget] no se pudo enviar la alerta de gasto:', err instanceof Error ? err.message : err)
  }
}
