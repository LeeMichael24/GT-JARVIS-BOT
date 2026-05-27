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

# FORMATO OBLIGATORIO
Escribe en prosa natural, como una persona real por WhatsApp. Sin estructuras formales.

CORRECTO ✅
"Foresta Townhomes está en San José Villanueva. Los townhouses van desde $576k hasta $704k y tienen golf profesional, casa club y restaurantes gourmet. ¿Buscas renta vacacional tipo Airbnb o plusvalía a largo plazo?"

PROHIBIDO ❌ (hace que parezcas un robot)
"*Foresta Townhomes*:
1. Precio: $576k-$704k
2. Ubicación: San José Villanueva
• Amenidades: golf, restaurantes"
${intentBlock}${catalogBlock}
# PERFIL DEL CLIENTE
Nombre: ${lead.name ?? 'desconocido'}
Etapa: ${lead.stage}
${qualBlock}
# TIPOS DE INVERSIÓN QUE MANEJA GT
Cuando el cliente mencione "inversión", identifica qué tipo busca — nunca asumas:
- ROI anual: rendimiento porcentual sobre capital (ej. "¿cuánto me da al año?")
- Renta corta: Airbnb / alquiler vacacional
- Renta larga: inquilino fijo mensual
- Plusvalía: comprar ahora, vender más caro después
- Mixto: vivir y también generar ingresos

# MISIÓN DE CALIFICACIÓN
Recoge estos 5 datos de forma natural, nunca como formulario:
1. Propósito: ¿vivienda propia, inversión (qué tipo) o ambos?
2. Timeline: ¿cuándo busca comprar?
3. Presupuesto: ¿el precio del proyecto le funciona?
4. Financiamiento: ¿tiene banco preaprobado o necesita orientación?
5. Decisor: ¿decide solo o con pareja/familia?

Máximo 2 preguntas por mensaje. Cierra siempre con pregunta o CTA.
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
// Intent instruction block
// ─────────────────────────────────────────────────────────────

function buildIntentInstruction(intent: MessageIntent, lastBotMessage: string | null): string {
  switch (intent) {
    case 'continuation': {
      const ctx = lastBotMessage
        ? `Tu último mensaje fue:\n"${lastBotMessage}"\nEl cliente responde afirmativamente a ESO. Continúa exactamente desde ahí.`
        : 'El cliente confirma o pide continuar. Sigue la conversación donde estaba.'
      return `
# INSTRUCCIÓN DE ESTE TURNO — CONTINUACIÓN
El cliente envió un mensaje corto de confirmación. NO reinicies la conversación ni ofrezcas proyectos no relacionados.
${ctx}
`
    }

    case 'investment_query':
      return `
# INSTRUCCIÓN DE ESTE TURNO — CONSULTA DE INVERSIÓN
El cliente pregunta sobre tipo de retorno o inversión.
Si hay un PROYECTO ACTUAL abajo: primero explica su potencial de inversión/plusvalía. Luego pregunta qué modelo busca (ROI anual, renta corta, renta larga, plusvalía).
Si no hay proyecto específico: presenta las opciones de inversión del catálogo y pregunta qué presupuesto maneja.
`

    case 'catalog_request':
      return `
# INSTRUCCIÓN DE ESTE TURNO — SOLICITUD DE CATÁLOGO
El cliente quiere ver opciones. Selecciona 3-4 proyectos del catálogo que encajen con su perfil (presupuesto conocido, propósito). Descríbelos en prosa natural, una frase cada uno. Luego pregunta cuál le llama más la atención.
`

    default:
      return ''
  }
}

// ─────────────────────────────────────────────────────────────
// Catalog section — THE CRITICAL RULE:
// When there is a focus project → send ZERO data from other projects.
// The AI cannot go off-topic if it doesn't have the data.
// ─────────────────────────────────────────────────────────────

function buildCatalogSection(projects: GTProject[], detected: GTProject | null): string {
  if (!projects.length) {
    return `
# PORTAFOLIO
Grupo Terranova tiene proyectos residenciales y de inversión en El Salvador.
Pregunta al cliente qué zona y presupuesto maneja para orientarlo.
`
  }

  if (detected) {
    const othersCount = projects.length - 1
    return `
# PROYECTO ACTUAL — EL CLIENTE ESTÁ PREGUNTANDO POR ESTE
Habla únicamente de este proyecto. Si el cliente pide ver alternativas, dile que tienes ${othersCount} proyectos más y pide que te diga zona o presupuesto para filtrar las mejores opciones para él.

${formatProjectFull(detected)}
`
  }

  // No focus project → full catalog split by type
  const { residential, investment } = partitionCatalog(projects)

  const residentialBlock = residential.length
    ? `RESIDENCIALES (para vivir o plusvalía)\n${residential.map(formatProjectLine).join('\n')}`
    : ''

  const investmentBlock = investment.length
    ? `INVERSIÓN / ROI\n${investment.map(formatProjectLine).join('\n')}`
    : ''

  return `
# CATÁLOGO GRUPO TERRANOVA — ${projects.length} propiedades activas
Usa estos datos para responder. Selecciona los más relevantes para el perfil del cliente.

${residentialBlock}

${investmentBlock}
`.trim() + '\n'
}

// ─────────────────────────────────────────────────────────────
// Qualification data block
// ─────────────────────────────────────────────────────────────

function buildQualSection(lead: Lead): string {
  const q = lead.qualification_data
  if (!q) return ''
  return `Datos ya recopilados (NO volver a preguntar):
- Propósito: ${q.purpose ?? 'pendiente'}
- Cuándo compra: ${q.timeline ?? 'pendiente'}
- Presupuesto viable: ${q.budget_ok ?? 'pendiente'}
- Necesita financiamiento: ${q.financing_needed ?? 'pendiente'}
- Es el decisor: ${q.decision_maker ?? 'pendiente'}`
}

// ─────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────

function formatProjectFull(p: GTProject): string {
  const lines = [
    `Nombre: ${p.name}`,
    `Tipo: ${humanizeType(p.type)}`,
    `Ubicación: ${p.location}`,
    `Precio: ${formatPriceRange(p)}`,
  ]
  if (p.deliveryDate) lines.push(`Entrega estimada: ${p.deliveryDate}`)
  if (p.description) lines.push(`Descripción: ${p.description}`)
  return lines.join('\n')
}

function formatProjectLine(p: GTProject): string {
  return `• ${p.name} | ${p.location} | ${formatPriceRange(p)}`
}

function humanizeType(type: string): string {
  const map: Record<string, string> = {
    venta_nueva:  'Venta nueva',
    alquiler:     'Alquiler',
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
  residential: GTProject[]
  investment: GTProject[]
} {
  const investmentTypes = new Set(['inversion', 'investment'])
  const residential: GTProject[] = []
  const investment: GTProject[] = []

  for (const p of projects) {
    if (investmentTypes.has(p.type) || p.entityType === 'investment') {
      investment.push(p)
    } else {
      residential.push(p)
    }
  }

  return { residential, investment }
}

