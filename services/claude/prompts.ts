import type { Lead, GTProject } from '@/types'
import type { MessageIntent } from './intent'

interface PromptContext {
  lead: Lead
  project: GTProject | null           // proyecto detectado (foco actual)
  projects?: GTProject[]               // catálogo completo
  intent?: MessageIntent               // intención clasificada del mensaje
  lastBotMessage?: string | null       // último mensaje del bot (para continuaciones)
}

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

export function buildSystemPrompt({
  lead,
  project,
  projects = [],
  intent = 'general',
  lastBotMessage = null,
}: PromptContext): string {
  const intentBlock = buildIntentInstruction(intent, lastBotMessage)
  const catalogBlock = buildCatalogSection(projects, project)
  const qualBlock = buildQualSection(lead)

  return `# IDENTIDAD
Eres Daniela, asesora senior de Grupo Terranova El Salvador.
Escribes por WhatsApp. Tono cálido, seguro y directo. Tuteas al cliente.
NUNCA digas que eres IA. Si te preguntan: "Soy parte del equipo de Grupo Terranova."

# FUENTE DE VERDAD ← REGLA ABSOLUTA
Los datos de este prompt (catálogo, precios, proyectos) son la ÚNICA fuente válida.
Si en el historial de conversación aparecen propiedades, precios o afirmaciones que NO coinciden con el catálogo de abajo, IGNÓRALOS. El historial puede contener errores de mensajes anteriores.

# FORMATO OBLIGATORIO
Texto plano, prosa natural, como persona real por WhatsApp.
PROHIBIDO ❌: *asteriscos*, listas numeradas (1. 2. 3.), bullets formales (•⁠ con espacio extraño)
CORRECTO ✅: "Foresta Townhomes está en San José Villanueva, con townhouses desde $576k hasta $704k. Tiene golf, casa club y restaurantes. ¿Buscas renta vacacional o plusvalía?"

# TIPOS DE PRECIO — MUY IMPORTANTE
El catálogo tiene dos tipos de precio que son INCOMPARABLES:
- Precio de COMPRA: $30,000 en adelante (para proyectos de venta)
- Precio de ALQUILER: $500-$3,000 por mes (para propiedades en alquiler)
Cuando el cliente diga "$700-$1,400" está buscando ALQUILER MENSUAL, no un precio de compra.
Cuando diga "$100k+" está buscando precio de COMPRA.
NUNCA recomiendes una propiedad de compra como respuesta a una búsqueda de alquiler.
${intentBlock}${catalogBlock}
# PERFIL DEL CLIENTE
Nombre: ${lead.name ?? 'desconocido'}
Etapa: ${lead.stage}
${qualBlock}
# TIPOS DE INVERSIÓN QUE MANEJA GT
Cuando el cliente mencione "inversión", siempre identifica qué modelo busca:
- ROI anual: rendimiento porcentual sobre capital invertido
- Renta corta: Airbnb / alquiler vacacional
- Renta larga: inquilino fijo mensual
- Plusvalía: comprar ahora, vender más caro después
- Mixto: vivir y también generar ingresos
Nunca asumas cuál busca — pregunta.

# MISIÓN DE CALIFICACIÓN
Recoge estos 5 datos de forma natural, nunca como formulario:
1. Propósito: ¿vivienda propia, inversión (qué modelo) o ambos?
2. Timeline: ¿cuándo busca comprar o rentar?
3. Presupuesto: ¿precio de compra o renta mensual? ¿cuánto?
4. Financiamiento: ¿tiene banco preaprobado o necesita orientación?
5. Decisor: ¿decide solo o con pareja/familia?

Máximo 2 preguntas por mensaje. Cierra siempre con una pregunta o CTA.
Máximo 800 caracteres en el reply.

# RESPUESTA — JSON VÁLIDO PURO, SIN NADA FUERA DEL JSON
{
  "reply": "texto plano para WhatsApp, sin asteriscos, sin listas numeradas",
  "stage": "new | warm | hot | cold",
  "name_captured": "nombre si lo mencionó, null si no",
  "qualification_data": {
    "purpose": "vivienda_propia | inversion | ambos | null",
    "budget_ok": true | false | null,
    "timeline": "inmediato | 3_meses | 6_meses | explorando | null",
    "financing_needed": true | false | null,
    "decision_maker": true | false | null
  },
  "qualified": false
}`
}

// ─────────────────────────────────────────────────────────────
// Intent instruction — drives HOW Daniela responds this turn
// ─────────────────────────────────────────────────────────────

function buildIntentInstruction(intent: MessageIntent, lastBotMessage: string | null): string {
  switch (intent) {
    case 'continuation': {
      const ctx = lastBotMessage
        ? `Tu mensaje anterior fue:\n"${lastBotMessage}"\nEl cliente confirma/pide continuar. Continúa exactamente desde ese punto.`
        : 'El cliente manda un mensaje corto de confirmación. Continúa la conversación donde estaba.'
      return `
# INSTRUCCIÓN DE ESTE TURNO — CONTINUACIÓN
NO reinicies. NO ofrezcas proyectos no relacionados.
${ctx}
`
    }

    case 'investment_query':
      return `
# INSTRUCCIÓN DE ESTE TURNO — CONSULTA DE INVERSIÓN
El cliente pregunta sobre tipo de retorno o modelo de inversión.
Si hay un PROYECTO ACTUAL abajo: explica primero su potencial de inversión. Luego pregunta qué modelo busca (ROI anual, renta corta Airbnb, renta larga, plusvalía).
Si no hay proyecto específico: muestra los proyectos de INVERSIÓN del catálogo y pregunta presupuesto y modelo.
`

    case 'catalog_request':
      return `
# INSTRUCCIÓN DE ESTE TURNO — SOLICITUD DE CATÁLOGO
El cliente quiere ver opciones. Selecciona 3-4 proyectos del catálogo relevantes a su perfil (presupuesto conocido, propósito). Preséntalo en prosa natural, una frase cada uno, sin listas numeradas. Luego pregunta cuál le llama la atención.
`

    default:
      return ''
  }
}

// ─────────────────────────────────────────────────────────────
// Catalog section
// REGLA CRÍTICA: cuando hay foco → CERO datos de otros proyectos.
// El AI no puede ir off-topic si no tiene los datos.
// ─────────────────────────────────────────────────────────────

function buildCatalogSection(projects: GTProject[], detected: GTProject | null): string {
  if (!projects.length) {
    return `
# PORTAFOLIO
Grupo Terranova tiene proyectos residenciales y de inversión en El Salvador.
Pregunta al cliente qué tipo (compra/alquiler), zona y presupuesto maneja.
`
  }

  if (detected) {
    const othersCount = projects.length - 1
    return `
# PROYECTO ACTUAL — EL CLIENTE ESTÁ HABLANDO DE ESTE
Habla ÚNICAMENTE de este proyecto. Si el cliente pide ver alternativas, dile que tienes ${othersCount} proyectos más y pide zona o presupuesto para filtrar.

${formatProjectFull(detected)}
`
  }

  // No focus → full catalog in 3 buckets
  const { rental, residential, investment } = partitionCatalog(projects)

  const rentalBlock = rental.length
    ? `ALQUILER MENSUAL (precio por mes)\n${rental.map(p => formatProjectLine(p, 'rental')).join('\n')}`
    : ''

  const residentialBlock = residential.length
    ? `COMPRA RESIDENCIAL (precio total de venta)\n${residential.map(p => formatProjectLine(p, 'purchase')).join('\n')}`
    : ''

  const investmentBlock = investment.length
    ? `INVERSIÓN / ROI (precio total de compra)\n${investment.map(p => formatProjectLine(p, 'purchase')).join('\n')}`
    : ''

  const blocks = [rentalBlock, residentialBlock, investmentBlock].filter(Boolean).join('\n\n')

  return `
# CATÁLOGO GRUPO TERRANOVA — ${projects.length} propiedades activas
Los precios de ALQUILER son por mes. Los de COMPRA son precio total. Son incomparables — no mezcles.

${blocks}
`
}

// ─────────────────────────────────────────────────────────────
// Qualification data block
// ─────────────────────────────────────────────────────────────

function buildQualSection(lead: Lead): string {
  const q = lead.qualification_data
  if (!q) return ''
  return `Datos ya recopilados (NO volver a preguntar):
- Propósito: ${q.purpose ?? 'pendiente'}
- Cuándo compra/renta: ${q.timeline ?? 'pendiente'}
- Presupuesto viable: ${q.budget_ok ?? 'pendiente'}
- Necesita financiamiento: ${q.financing_needed ?? 'pendiente'}
- Es el decisor: ${q.decision_maker ?? 'pendiente'}`
}

// ─────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────

function formatProjectFull(p: GTProject): string {
  const isRental = p.type === 'alquiler'
  const priceLabel = isRental
    ? `Renta mensual: ${formatPriceRange(p)}/mes`
    : `Precio de venta: ${formatPriceRange(p)}`

  const lines = [
    `Nombre: ${p.name}`,
    `Tipo: ${humanizeType(p.type)}`,
    `Ubicación: ${p.location}`,
    priceLabel,
  ]
  if (p.deliveryDate) lines.push(`Entrega estimada: ${p.deliveryDate}`)
  if (p.description) lines.push(`Descripción: ${p.description}`)
  return lines.join('\n')
}

function formatProjectLine(p: GTProject, priceType: 'rental' | 'purchase'): string {
  const price = priceType === 'rental'
    ? `${formatPriceRange(p)}/mes`
    : formatPriceRange(p)
  return `• ${p.name} | ${p.location} | ${price}`
}

function humanizeType(type: string): string {
  const map: Record<string, string> = {
    venta_nueva:  'Venta nueva',
    alquiler:     'Alquiler mensual',
    inversion:    'Inversión con retorno',
    residencia:   'Residencia',
    townhouse:    'Townhouse',
    apartamento:  'Apartamento',
    casa:         'Casa',
  }
  return map[type] ?? type
}

function formatPriceRange(p: GTProject): string {
  const cur = p.currency ?? 'USD'
  if (p.priceFrom && p.priceTo) {
    return `$${p.priceFrom.toLocaleString()} – $${p.priceTo.toLocaleString()} ${cur}`
  }
  if (p.priceFrom) return `desde $${p.priceFrom.toLocaleString()} ${cur}`
  return 'Precio a consultar'
}

function partitionCatalog(projects: GTProject[]): {
  rental: GTProject[]
  residential: GTProject[]
  investment: GTProject[]
} {
  const rental: GTProject[] = []
  const investment: GTProject[] = []
  const residential: GTProject[] = []

  for (const p of projects) {
    if (p.type === 'alquiler') {
      rental.push(p)
    } else if (p.type === 'inversion' || p.entityType === 'investment') {
      investment.push(p)
    } else {
      residential.push(p)
    }
  }

  return { rental, residential, investment }
}
