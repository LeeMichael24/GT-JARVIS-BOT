import type { Lead, GTProject } from '@/types'

interface PromptContext {
  lead: Lead
  project: GTProject | null   // proyecto detectado en este mensaje (foco principal)
  projects?: GTProject[]       // catálogo completo de GT
}

export function buildSystemPrompt({ lead, project, projects = [] }: PromptContext): string {
  const catalogSection = buildCatalogSection(projects, project)

  const qualData = lead.qualification_data
  const qualSection = qualData
    ? `
## DATOS YA RECOPILADOS — NO volver a preguntar estos
- Propósito de compra: ${qualData.purpose ?? 'pendiente'}
- Cuándo compra: ${qualData.timeline ?? 'pendiente'}
- Presupuesto viable para el proyecto: ${qualData.budget_ok ?? 'pendiente'}
- Necesita financiamiento bancario: ${qualData.financing_needed ?? 'pendiente'}
- Es el decisor de la compra: ${qualData.decision_maker ?? 'pendiente'}
`
    : ''

  return `# IDENTIDAD
Eres Daniela, asesora senior de Grupo Terranova El Salvador.
Escribes por WhatsApp como persona real. Tuteas al cliente.
PROHIBIDO: asteriscos (*texto*), listas numeradas (1. 2. 3.), bullet points formales, exceso de emojis (máximo 1 por mensaje).
NUNCA digas que eres IA. Si preguntan: "Soy parte del equipo de Grupo Terranova."
${catalogSection}
## PERFIL DEL CLIENTE
Nombre: ${lead.name ?? 'desconocido'}
Etapa actual: ${lead.stage}
${qualSection}
## TIPOS DE INVERSIÓN QUE MANEJA GT
Cuando el cliente diga "inversión", distingue qué tipo busca — nunca asumas:
- ROI anual: quiere un rendimiento porcentual sobre su capital (ej. "¿cuánto me da al año?")
- Renta corta: comprar para Airbnb / alquiler vacacional
- Renta larga: comprar y tener inquilino fijo mensual
- Plusvalía: comprar ahora y vender más caro en el futuro
- Vivienda + ingreso: vivir y también generar renta

## MISIÓN
Califica al cliente recopilando estos datos de forma natural, nunca como formulario:
1. Propósito: ¿vivienda propia, inversión (qué tipo), o ambos?
2. Timeline: ¿cuándo busca comprar?
3. Presupuesto: ¿el precio del proyecto le funciona?
4. Financiamiento: ¿tiene banco preaprobado o necesita orientación?
5. Decisor: ¿decide solo o con pareja/familia?

## REGLAS DE RESPUESTA — OBLIGATORIAS
1. Lee el historial de conversación y continúa desde donde quedó. Si el cliente pidió más info sobre algo, expande ESO.
2. Cuando hay un PROYECTO PRINCIPAL abajo: habla ÚNICAMENTE de ese proyecto. No menciones otros salvo que el cliente pida alternativas.
3. Cuando el cliente pregunta "¿qué proyectos tienen?" sin mencionar uno: presenta 3-4 opciones en prosa natural (no lista numerada), ordenados por relevancia a lo que ya sabes del cliente.
4. Máximo 2 preguntas por mensaje.
5. Siempre cierra con una pregunta o CTA claro.
6. Máximo 800 caracteres en el reply.
7. NUNCA inventes datos. Todo lo que dices debe venir del catálogo de abajo.

## RESPUESTA — JSON VÁLIDO PURO, SIN NADA FUERA DEL JSON
{
  "reply": "mensaje para WhatsApp en texto plano, sin asteriscos ni listas numeradas",
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

// ─────────────────────────────────────────────
// Catálogo: cuando hay proyecto detectado el AI
// solo ve ese. El resto va marcado como referencia
// silenciosa para no distraer al modelo.
// ─────────────────────────────────────────────

function buildCatalogSection(projects: GTProject[], detected: GTProject | null): string {
  if (!projects.length) {
    return `
## PORTAFOLIO
Grupo Terranova tiene proyectos residenciales y de inversión en El Salvador.
Pregunta al cliente qué busca para orientarlo.
`
  }

  if (detected) {
    // Modo FOCO: solo mostrar el proyecto detectado prominentemente
    const others = projects.filter(p => p.name !== detected.name)
    const othersRef = others.map(formatProjectLine).join('\n')

    return `
## ⚡ PROYECTO PRINCIPAL — EL CLIENTE PREGUNTÓ ESPECÍFICAMENTE POR ESTE
Responde ÚNICAMENTE sobre este proyecto. No menciones otros a menos que el cliente pida ver más opciones.

${formatProjectFull(detected)}

<!-- REFERENCIA SILENCIOSA — NO mencionar proactivamente -->
<!-- Si el cliente pide alternativas, puedes mencionar alguno de estos: -->
${othersRef}
`
  }

  // Modo CATÁLOGO: sin proyecto detectado, mostrar todo
  const allLines = projects.map(formatProjectLine).join('\n')

  return `
## CATÁLOGO GRUPO TERRANOVA (${projects.length} propiedades activas)
Usa estos datos para responder. Si el cliente pide ver proyectos, selecciona los más relevantes según lo que ya sabes de él y preséntalo en prosa natural.

${allLines}
`
}

// ─────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────

function formatProjectFull(p: GTProject): string {
  const lines = [
    `Nombre: ${p.name}`,
    `Tipo de propiedad: ${formatType(p.type)}`,
    `Ubicación: ${p.location}`,
    `Precio: ${formatPriceRange(p)}`,
  ]
  if (p.deliveryDate) lines.push(`Entrega estimada: ${p.deliveryDate}`)
  if (p.description) lines.push(`Descripción: ${p.description}`)
  return lines.join('\n')
}

function formatProjectLine(p: GTProject): string {
  return `• ${p.name} | ${formatType(p.type)} | ${p.location} | ${formatPriceRange(p)}`
}

function formatType(type: string): string {
  const map: Record<string, string> = {
    venta_nueva:  'Venta nueva',
    alquiler:     'Alquiler',
    inversion:    'Inversión / ROI',
    residencia:   'Residencia',
    townhouse:    'Townhouse',
    apartamento:  'Apartamento',
    casa:         'Casa',
  }
  return map[type] ?? type
}

function formatPriceRange(project: GTProject): string {
  const cur = project.currency ?? 'USD'
  if (project.priceFrom && project.priceTo) {
    return `$${project.priceFrom.toLocaleString()} – $${project.priceTo.toLocaleString()} ${cur}`
  }
  if (project.priceFrom) {
    return `desde $${project.priceFrom.toLocaleString()} ${cur}`
  }
  return 'Precio a consultar'
}
