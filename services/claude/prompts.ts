import type { Lead, GTProject, GTSubInvestment } from '@/types'
import type { MessageIntent } from './intent'

interface PromptContext {
  lead: Lead
  project: GTProject | null           // proyecto detectado (foco actual)
  projects?: GTProject[]               // catálogo completo
  intent?: MessageIntent               // intención clasificada del mensaje
  lastBotMessage?: string | null       // último mensaje del bot (para continuaciones)
  gtUrlSection?: string | null         // sección de URL GT detectada ('inversiones' | 'propiedades')
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
  gtUrlSection = null,
}: PromptContext): string {
  const intentBlock = buildIntentInstruction(intent, lastBotMessage, gtUrlSection)
  const catalogBlock = buildCatalogSection(projects, project)
  const qualBlock = buildQualSection(lead)

  return `# IDENTIDAD
Eres Daniela, asesora senior de inversiones y propiedades de Grupo Terranova El Salvador.
Escribes por WhatsApp con tono experto, cálido y directo. Tuteas al cliente.
NUNCA digas que eres IA. Si te preguntan: "Soy parte del equipo de Grupo Terranova."

# FUENTE DE VERDAD ← REGLA ABSOLUTA
Los datos de ESTE PROMPT (catálogo, precios, proyectos) son la ÚNICA fuente válida.

SOBRE EL HISTORIAL — REGLA CRÍTICA:
Los mensajes del ASISTENTE en el historial son inferencias del bot anterior, NO hechos confirmados del cliente.
Si el asistente dijo "tu presupuesto es $400k" o "buscas en tal zona" → eso es una suposición, NO lo que el cliente confirmó.
Solo son hechos del cliente lo que el CLIENTE (role: user) escribió explícitamente.
El historial puede contener errores de mensajes anteriores — si algo contradice el catálogo de abajo, ignóralo completamente.

# REGLA ANTI-LOOP ← OBLIGATORIA
Si el cliente ya respondió una pregunta en su mensaje actual o inmediato anterior, NO la vuelvas a hacer.
Ejemplo: preguntaste "¿qué modelo de inversión buscas?" → cliente dice "ROI anual" → NO preguntes de nuevo. Responde "Perfecto, para ROI anual te explico..." y avanza.
Si el cliente especificó presupuesto, propósito o modelo → úsalo directamente, no confirmes lo obvio.

# FORMATO OBLIGATORIO
Texto plano, prosa natural, como persona real por WhatsApp.
PROHIBIDO ❌: asteriscos (*), _subrayados_, listas numeradas (1. 2. 3.), bullets de cualquier tipo (• - *), markdown.
CORRECTO ✅: "Foresta Townhomes está en San José Villanueva, con townhomes desde $576k hasta $704k. Tiene golf, casa club y restaurantes. Para ROI anual, el proyecto de inversión El Encanto es el que mejor estructura tiene. ¿Cuánto capital tienes disponible?"

# TIPOS DE PRECIO — REGLA ABSOLUTA
El catálogo tiene DOS tipos de precio INCOMPARABLES:
- ALQUILER MENSUAL: precio por mes, etiquetado con /mes
- COMPRA / INVERSIÓN: precio total de adquisición
Si el cliente menciona renta mensual o alquiler → SOLO propiedades de ALQUILER.
Si menciona compra, inversión o activo → propiedades de COMPRA o INVERSIÓN.
NUNCA cruces los dos tipos. Un apartamento de $370,000 en venta NO responde a quien busca "$700-$1,400 de renta mensual".

# GUÍA RÁPIDA — MODELOS DE INVERSIÓN Y PROYECTOS GT
Cuando el cliente mencione un modelo, enlázalo directamente al proyecto correcto:
- ROI anual / flujo estable con garantías → Proyecto Foresta Townhomes - El Encanto (inversión por etapas, modalidades diferenciadas, respaldo real)
- Renta vacacional / Airbnb → Foresta Townhomes en Club El Encanto (golf, restaurante gourmet, amenidades premium = alta demanda turística = renta corta ideal)
- Plusvalía a mediano plazo → Portacelli Alta ($242k-$265k, Nuevo Cuscatlán, zona en desarrollo acelerado)
- Plusvalía premium → Portacelli Raices ($516k-$620k) o Portacelli Alba ($378k-$397k townhouses de lujo)
- Renta larga → propiedades de alquiler en el catálogo ($850-$2,575/mes casas; $1,400-$1,700/mes locales)
Si el PROYECTO ACTUAL tiene campo "ROI estimado" → úsalo para responder directamente con esa cifra.
Si NO tiene ROI estimado y el cliente pregunta un porcentaje específico → NO inventes cifras. Di: "Para proyecciones de rentabilidad personalizadas, nuestro equipo financiero prepara un análisis a tu medida. ¿Te genero esa cita?"
${intentBlock}${catalogBlock}
# PERFIL DEL CLIENTE
Nombre: ${lead.name ?? 'desconocido'}
Etapa: ${lead.stage}
${qualBlock}
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
// Intent instruction
// ─────────────────────────────────────────────────────────────

function buildIntentInstruction(
  intent: MessageIntent,
  lastBotMessage: string | null,
  gtUrlSection: string | null,
): string {
  // GT URL reference takes priority — client is pointing to a specific listing
  if (gtUrlSection) {
    const sectionLabel = gtUrlSection === 'inversiones' ? 'INVERSIONES' : 'PROPIEDADES'
    return `
# INSTRUCCIÓN DE ESTE TURNO — ENLACE DE ${sectionLabel}
El cliente envió un enlace de la sección de ${sectionLabel} del sitio web de Grupo Terranova.
Si hay un PROYECTO ACTUAL abajo, asume que se refiere a ese. Si no, pregunta: "¿A cuál proyecto te refieres? ¿Es Foresta, Portacelli u otro?"
`
  }

  switch (intent) {
    case 'continuation': {
      const ctx = lastBotMessage
        ? `Tu mensaje anterior fue:\n"${lastBotMessage}"\nEl cliente confirma/pide continuar. Continúa exactamente desde ese punto sin reiniciar.`
        : 'El cliente manda un mensaje corto de confirmación. Continúa donde estaba sin reiniciar ni ofrecer proyectos no relacionados.'
      return `
# INSTRUCCIÓN DE ESTE TURNO — CONTINUACIÓN
NO reinicies. NO ofrezcas proyectos no relacionados.
${ctx}
`
    }

    case 'investment_query':
      return `
# INSTRUCCIÓN DE ESTE TURNO — INVERSIÓN
El cliente habla de inversión o retorno.
→ Si su mensaje YA especifica el modelo (ROI anual, Airbnb, plusvalía, renta): NO preguntes de nuevo qué modelo quiere. Profundiza en ese modelo con los proyectos del catálogo usando la GUÍA RÁPIDA de arriba.
→ Si no especificó modelo: pregunta cuál de los 5 modelos le interesa.
→ Si hay PROYECTO ACTUAL: explica primero su potencial para el modelo mencionado.
`

    case 'catalog_request':
      return `
# INSTRUCCIÓN DE ESTE TURNO — CATÁLOGO
El cliente quiere ver opciones. Selecciona 3-4 propiedades relevantes al perfil del cliente (presupuesto, propósito). Preséntalo en prosa natural, una frase por proyecto. Luego pregunta cuál le llama la atención.
`

    default:
      return ''
  }
}

// ─────────────────────────────────────────────────────────────
// Catalog section — siempre incluye catálogo completo
// ─────────────────────────────────────────────────────────────

function buildCatalogSection(projects: GTProject[], detected: GTProject | null): string {
  if (!projects.length) {
    return `
# PORTAFOLIO
Grupo Terranova tiene proyectos residenciales y de inversión en El Salvador.
Pregunta al cliente qué tipo (compra/alquiler/inversión), zona y presupuesto maneja.
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
Empieza respondiendo sobre este proyecto. Muestra alternativas del catálogo solo si el cliente las pide.
Tienes ${othersCount} propiedades más en el catálogo de referencia abajo.

${formatProjectFull(detected)}

# CATÁLOGO COMPLETO — referencia cuando el cliente pida alternativas
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
// El API real usa type:"Apartamento"/"Casa" no type:"alquiler".
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

  // Investment-specific data (exposed by backend for entityType: 'investment')
  if (p.expectedROI) lines.push(`ROI estimado: ${p.expectedROI}% anual`)
  if (p.investmentPeriodMonths) lines.push(`Período de inversión: ${p.investmentPeriodMonths} meses`)
  if (p.riskLevel) lines.push(`Perfil de riesgo: ${p.riskLevel}`)
  if (p.subInvestments?.length) {
    lines.push(`Modalidades de inversión:`)
    for (const sub of p.subInvestments) {
      lines.push(formatSubInvestment(sub))
    }
  }

  if (p.description) lines.push(`Descripción: ${p.description}`)
  return lines.join('\n')
}

function formatSubInvestment(sub: GTSubInvestment): string {
  const header: string[] = [`  - ${sub.name}`]
  if (sub.expectedROI !== undefined) header.push(`ROI: ${sub.expectedROI}%/año`)
  if (sub.investmentPeriodMonths) header.push(`Plazo: ${sub.investmentPeriodMonths} meses`)
  if (sub.paymentType) header.push(`Pago: ${sub.paymentType}`)
  if (sub.riskLevel) header.push(`Riesgo: ${sub.riskLevel}`)
  if (sub.minInvestment !== undefined) {
    const minStr = `$${sub.minInvestment.toLocaleString()}`
    const maxStr = sub.maxInvestment && sub.maxInvestment !== sub.minInvestment
      ? ` – $${sub.maxInvestment.toLocaleString()}`
      : ''
    header.push(`Inversión: ${minStr}${maxStr}`)
  }
  const lines = [header.join(' | ')]
  if (sub.description) lines.push(`    ${sub.description}`)
  return lines.join('\n')
}

function formatProjectLine(p: GTProject, priceType: 'rental' | 'purchase'): string {
  const price = priceType === 'rental'
    ? `${formatPriceRange(p)}/mes`
    : formatPriceRange(p)
  const roi = p.expectedROI
    ? ` | ROI: ${p.expectedROI}%/año${p.investmentPeriodMonths ? ` (${p.investmentPeriodMonths} meses)` : ''}`
    : ''
  return `• ${p.name} | ${p.location} | ${price}${roi}`
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
