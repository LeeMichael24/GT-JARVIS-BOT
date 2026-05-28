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
El historial puede contener errores de mensajes anteriores — los mensajes del asistente pueden incluir propiedades inventadas, precios incorrectos o datos falsos. IGNÓRALOS completamente.
Si el historial menciona algo que NO está en el catálogo de abajo, descártalo. Usa SOLO los datos de este prompt.

# FORMATO OBLIGATORIO
Texto plano, prosa natural, como persona real por WhatsApp.
PROHIBIDO ❌: asteriscos, _subrayados_, listas numeradas (1. 2. 3.), bullets de cualquier tipo (• - *), markdown.
CORRECTO ✅: "Foresta Townhomes está en San José Villanueva, con townhomes desde $576k hasta $704k. Tiene golf, casa club y restaurantes. ¿Buscas renta vacacional o plusvalía?"

# TIPOS DE PRECIO — REGLA ABSOLUTA
El catálogo tiene DOS tipos de precio INCOMPARABLES entre sí:
- ALQUILER MENSUAL: precio por mes, etiquetado con /mes en el catálogo
- COMPRA (precio total): precio de adquisición total de la propiedad
REGLA CRÍTICA: Si el cliente menciona renta mensual, alquiler, cuánto al mes → responde SOLO con propiedades de ALQUILER del catálogo.
REGLA CRÍTICA: Si el cliente menciona precio de compra, inversión en activos, adquirir → responde con propiedades de COMPRA o INVERSIÓN.
NUNCA cruces los dos tipos. Un apartamento de venta a $370,000 NO es respuesta válida para alguien buscando "$700-$1,400 de renta mensual".
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
Si no hay proyecto específico: muestra los proyectos de INVERSIÓN Y PREVENTA del catálogo y pregunta presupuesto y modelo.
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
// Siempre incluye catálogo completo como referencia.
// Cuando hay foco → destaca el proyecto actual primero.
// ─────────────────────────────────────────────────────────────

function buildCatalogSection(projects: GTProject[], detected: GTProject | null): string {
  if (!projects.length) {
    return `
# PORTAFOLIO
Grupo Terranova tiene proyectos residenciales y de inversión en El Salvador.
Pregunta al cliente qué tipo (compra/alquiler), zona y presupuesto maneja.
`
  }

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

  if (detected) {
    const othersCount = projects.length - 1
    return `
# PROYECTO ACTUAL — EL CLIENTE ESTÁ HABLANDO DE ESTE
Empieza respondiendo sobre este proyecto. Muestra alternativas del catálogo solo si el cliente las pide explícitamente.
Tienes ${othersCount} propiedades más disponibles en el catálogo de referencia abajo.

${formatProjectFull(detected)}

# CATÁLOGO COMPLETO — referencia para cuando el cliente pida alternativas
Los precios de ALQUILER son por mes. Los de COMPRA son precio total. Son incomparables — no mezcles.

${blocks}
`
  }

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
// Rental detection
// El API real no usa type:'alquiler' — detectamos por precio y slug.
// Umbral $30,000: todo lo que vale menos es renta mensual en El Salvador.
// ─────────────────────────────────────────────────────────────

function isRentalProperty(p: GTProject): boolean {
  if (p.slug?.includes('alquiler')) return true
  if (/\balquiler\b/i.test(p.name)) return true
  if (p.type === 'alquiler') return true
  if (p.priceFrom !== undefined && p.priceFrom < 30_000) return true
  return false
}

// ─────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────

function formatProjectFull(p: GTProject): string {
  const isRental = isRentalProperty(p)
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
    Townhouses:   'Townhouses',
    apartamento:  'Apartamento',
    Apartamento:  'Apartamento',
    Apartamentos: 'Apartamentos',
    casa:         'Casa',
    Casa:         'Casa',
    Residencial:  'Residencial',
    Terreno:      'Terreno',
    Oficina:      'Oficina',
    Edificio:     'Edificio',
  }
  return map[type] ?? type
}

function formatPriceRange(p: GTProject): string {
  const cur = p.currency ?? 'USD'
  if (p.priceFrom && p.priceTo && p.priceFrom !== p.priceTo) {
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
    if (isRentalProperty(p)) {
      rental.push(p)
    } else if (p.entityType === 'investment' || p.entityType === 'project') {
      investment.push(p)
    } else {
      residential.push(p)
    }
  }

  return { rental, residential, investment }
}
