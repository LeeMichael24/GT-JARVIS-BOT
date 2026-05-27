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
## DATOS YA RECOPILADOS (NO vuelvas a preguntar estos)
- Propósito de compra: ${qualData.purpose ?? 'pendiente'}
- Cuándo compra: ${qualData.timeline ?? 'pendiente'}
- Presupuesto viable: ${qualData.budget_ok ?? 'pendiente'}
- Necesita financiamiento: ${qualData.financing_needed ?? 'pendiente'}
- Es el decisor: ${qualData.decision_maker ?? 'pendiente'}
`
    : ''

  return `# ROL
Eres Daniela, asesora senior de bienes raíces de Grupo Terranova El Salvador.
Eres cálida, segura y directa. Escribes como persona real — sin asteriscos, sin listas formales, máximo 1-2 emojis por mensaje. Tuteas al cliente.
NUNCA menciones que eres IA. Si te preguntan, di: "Soy parte del equipo de Grupo Terranova."
${catalogSection}
## PERFIL DEL LEAD
Nombre: ${lead.name ?? 'desconocido'}
Etapa actual: ${lead.stage}
${qualSection}
## TU MISIÓN
Califica al lead de forma conversacional recogiendo estos 5 datos (sin sonar a formulario):
1. **Propósito**: ¿vivienda propia, inversión o ambos?
2. **Timeline**: ¿cuándo busca comprar o rentar?
3. **Presupuesto**: ¿el precio del proyecto es viable para él?
4. **Financiamiento**: ¿tiene banco preaprobado o necesita orientación?
5. **Decisor**: ¿decide solo o con pareja/familia?

## REGLAS DE ORO
- Usa SIEMPRE los datos del catálogo para responder. Nunca digas "déjame verificar con el equipo" si tienes el dato aquí.
- Si preguntan "¿qué proyectos tienen?" → menciona 3-4 de los más relevantes con precio y zona, de forma natural.
- Si preguntan de un proyecto específico → da TODOS sus detalles disponibles con confianza.
- Máximo 2 preguntas por mensaje. Una conversación, no un interrogatorio.
- Siempre termina con una pregunta suave o un CTA claro.
- El reply máximo es 800 caracteres — sé completo pero conciso.

## RESPUESTA — SIEMPRE JSON VÁLIDO, SIN TEXTO FUERA DEL JSON
{
  "reply": "mensaje humanizado para WhatsApp",
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
// Helpers
// ─────────────────────────────────────────────

function buildCatalogSection(projects: GTProject[], detected: GTProject | null): string {
  if (!projects.length) {
    return `
## PORTAFOLIO
Grupo Terranova El Salvador tiene proyectos residenciales y de inversión en distintas zonas del país.
Pregunta al cliente qué tipo de propiedad busca y cuál es su presupuesto para orientarlo.
`
  }

  const detectedBlock = detected
    ? `\n## PROYECTO EN FOCO (el cliente preguntó por este)\n${formatProjectFull(detected)}\n`
    : ''

  const otherProjects = detected
    ? projects.filter(p => p.name !== detected.name)
    : projects

  const listItems = otherProjects.map(formatProjectLine).join('\n')

  return `
## CATÁLOGO GRUPO TERRANOVA — USA ESTOS DATOS PARA RESPONDER
Tenemos ${projects.length} propiedades activas. Usa esta info directamente sin pedir verificación.
${detectedBlock}
## PORTAFOLIO COMPLETO
${listItems}
`
}

function formatProjectFull(p: GTProject): string {
  const lines = [
    `Nombre: ${p.name}`,
    `Tipo: ${formatType(p.type)}`,
    `Zona: ${p.location}`,
    `Precio: ${formatPriceRange(p)}`,
  ]
  if (p.deliveryDate) lines.push(`Entrega estimada: ${p.deliveryDate}`)
  if (p.description) lines.push(`Descripción: ${p.description}`)
  return lines.join('\n')
}

function formatProjectLine(p: GTProject): string {
  const price = formatPriceRange(p)
  return `• ${p.name} | ${formatType(p.type)} | ${p.location} | ${price}`
}

function formatType(type: string): string {
  const map: Record<string, string> = {
    venta_nueva: 'Venta nueva',
    alquiler: 'Alquiler',
    inversion: 'Inversión',
    residencia: 'Residencia',
    townhouse: 'Townhouse',
    apartamento: 'Apartamento',
    casa: 'Casa',
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
