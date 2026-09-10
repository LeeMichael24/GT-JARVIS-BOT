/**
 * LA FICHA DE PROYECTO — el formulario estandarizado.
 *
 * Antes, el conocimiento de un proyecto era texto libre: cada quien escribía
 * lo que se le ocurría y nadie sabía qué faltaba. Estos diez campos son el
 * mínimo para vender un proyecto, y salieron de analizar 903 preguntas reales
 * de clientes en 120 conversaciones de WhatsApp.
 *
 * DÓNDE VIVEN: en `knowledge_base`, con `project_slug` puesto y el `key` de
 * abajo como `topic`. Eso es a propósito — hay UN solo camino del conocimiento
 * al prompt, ya presupuestado y filtrado por proyecto. La ficha es la forma
 * guiada de llenarlo, no un almacén paralelo.
 *
 * QUÉ NO VA ACÁ: precios, metrajes, disponibilidad ni fechas de entrega. Eso
 * llega vivo del API en cada mensaje. Un precio escrito acá se queda viejo y
 * contradice al catálogo — es exactamente el bug de la prima.
 */

export interface FichaCampo {
  key: string
  label: string
  hint: string
  /** Categoría de knowledge_base con la que se guarda. */
  categoria: 'project_pitch' | 'objection' | 'faq' | 'sales_playbook'
  /** Menor = más arriba en el prompt. */
  priority: number
  rows: number
}

export const FICHA_CAMPOS: FichaCampo[] = [
  {
    key: 'ficha_diferenciador', categoria: 'project_pitch', priority: 10, rows: 3,
    label: 'La frase que lo distingue',
    hint: '¿Por qué éste y no otro de los tuyos? En una oración, como se lo dirías a un amigo.',
  },
  {
    key: 'ficha_perfil', categoria: 'project_pitch', priority: 20, rows: 3,
    label: 'Para quién es',
    hint: 'El perfil que sí cierra: vivienda o inversión, salvadoreño en el exterior, primer inmueble.',
  },
  {
    key: 'ficha_pago', categoria: 'faq', priority: 15, rows: 4,
    label: 'Estructura de pago exacta',
    hint: 'Reserva, prima en %, en cuántos meses y el descuento de contado. UNA sola versión — sin montos en dólares, que esos vienen del catálogo.',
  },
  {
    key: 'ficha_incluye', categoria: 'faq', priority: 30, rows: 4,
    label: 'Qué incluye el precio y qué no',
    hint: 'Parqueos, bodega, acabados, electrodomésticos. Lo que no se aclara se asume, y después reclaman.',
  },
  {
    key: 'ficha_obra', categoria: 'faq', priority: 35, rows: 3,
    label: 'Estado real de obra',
    hint: 'Qué se puede ver hoy si el cliente maneja hasta allá. Es distinto de la fecha de entrega.',
  },
  {
    key: 'ficha_objeciones', categoria: 'objection', priority: 25, rows: 6,
    label: 'Las 3 objeciones propias de este proyecto',
    hint: 'Con la respuesta que sí funciona. No las genéricas — ésas ya las tiene.',
  },
  {
    key: 'ficha_confianza', categoria: 'faq', priority: 40, rows: 4,
    label: 'La prueba de confianza',
    hint: 'Desarrollador, permisos, respaldo, y qué puede verificar el cliente por su cuenta.',
  },
  {
    key: 'ficha_detalles', categoria: 'faq', priority: 45, rows: 5,
    label: 'Los detalles del que va en serio',
    hint: 'Orientación del sol, accesos, vecinos, razón social para el cheque, nomenclatura del brochure. Lo que solo pregunta quien va a comprar.',
  },
  {
    key: 'ficha_amenidades', categoria: 'faq', priority: 50, rows: 4,
    label: 'Amenidades y servicios',
    hint: 'Qué hay y qué está incluido en la cuota. Salió 12 veces en tus conversaciones y hoy no está escrito en ningún lado.',
  },
  {
    key: 'ficha_limites', categoria: 'sales_playbook', priority: 5, rows: 4,
    label: 'Lo que Daniela NO puede decir',
    hint: 'El campo que nadie piensa y el que más evita que invente. Los límites también son contexto.',
  },
]

export const FICHA_KEYS = FICHA_CAMPOS.map(c => c.key)

/** Título legible que se guarda junto al contenido en knowledge_base. */
export function tituloDeCampo(key: string): string {
  return FICHA_CAMPOS.find(c => c.key === key)?.label ?? key
}

export function campoPorKey(key: string): FichaCampo | undefined {
  return FICHA_CAMPOS.find(c => c.key === key)
}

/** Cuántos de los diez están llenos — el medidor de completitud del panel. */
export function completitud(topicsLlenos: string[]): { llenos: number; total: number; pct: number } {
  const set = new Set(topicsLlenos)
  const llenos = FICHA_KEYS.filter(k => set.has(k)).length
  return { llenos, total: FICHA_KEYS.length, pct: Math.round((llenos / FICHA_KEYS.length) * 100) }
}
