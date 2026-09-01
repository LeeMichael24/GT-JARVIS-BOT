import type { Lead, GTProject, GTSubInvestment, DealSignals } from '@/types'
import type { MessageIntent } from './intent'
import { DEFAULT_SETTINGS, type AgentSettings } from '@/lib/agent-settings'
import { DEFAULT_PROMPT_BLOCKS, renderPromptBlock } from '@/lib/prompt-blocks'

interface PromptContext {
  lead: Lead
  project: GTProject | null
  projects?: GTProject[]
  intent?: MessageIntent
  lastBotMessage?: string | null
  gtUrlSection?: string | null
  salesPlaybook?: string | null
  dealSummary?: { summary: string; next_action: string | null; signals?: DealSignals | null } | null
  brainLearnings?: string | null
  adContext?: string | null
  escalationOverride?: string | null
  /** Guion oficial de venta del proyecto detectado (formateado) */
  projectScript?: string | null
  /** Proyectos que SÍ tienen media disponible para enviar */
  mediaProjects?: string[]
  /** Perillas vivas del agente (tabla agent_settings) */
  settings?: AgentSettings
  /** Bloques del prompt (tabla prompt_blocks) — default: los del código */
  blocks?: Record<string, string>
  /** Sección de objetivos del negocio (tabla agent_objectives), ya formateada */
  objectivesBlock?: string | null
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
  salesPlaybook = null,
  dealSummary = null,
  brainLearnings = null,
  adContext = null,
  escalationOverride = null,
  projectScript = null,
  mediaProjects = [],
  settings = DEFAULT_SETTINGS,
  blocks = DEFAULT_PROMPT_BLOCKS,
  objectivesBlock = null,
}: PromptContext): string {
  const intentBlock = buildIntentInstruction(intent, lastBotMessage, gtUrlSection)
  const catalogBlock = buildCatalogSection(projects, project, intent, settings.rental_threshold_usd)
  const qualBlock = buildQualSection(lead)
  const playbookBlock = salesPlaybook ? `\n# BASE DE CONOCIMIENTO — PLAYBOOK DE VENTAS\nUsa esta información para responder con autoridad. Son datos reales del equipo de Grupo Terranova.\n\n${salesPlaybook}\n` : ''

  // Las señales se capturan en CADA turno (deal_summaries.signals) y antes
  // nunca volvían al prompt: Daniela recalculaba al cliente de cero.
  const s = dealSummary?.signals ?? null
  const signalLines = s
    ? [
        s.objections?.length ? `Objeciones que YA planteó (no las trates como nuevas; retómalas con un ángulo distinto): ${s.objections.join('; ')}` : '',
        s.buying_signals?.length ? `Señales de compra ya detectadas: ${s.buying_signals.join('; ')}` : '',
        s.budget_mentioned ? `Presupuesto mencionado: $${s.budget_mentioned.toLocaleString('en-US')}` : '',
        s.preferred_zone ? `Zona de interés: ${s.preferred_zone}` : '',
        s.engagement_level ? `Nivel de interés en la última charla: ${s.engagement_level}` : '',
      ].filter(Boolean)
    : []

  const dealBlock = dealSummary
    ? `\n# MEMORIA DEL DEAL — CONTEXTO DE CONVERSACIONES ANTERIORES
Lo siguiente es un resumen de interacciones previas con este cliente. Úsalo para continuar donde quedaste:
Resumen: ${dealSummary.summary}
${dealSummary.next_action ? `Siguiente acción pendiente: ${dealSummary.next_action}` : ''}${signalLines.length ? '\n' + signalLines.join('\n') : ''}
REGLA: No repitas lo que ya se dijo. Avanza la conversación desde este punto.\n`
    : ''

  const brainBlock = brainLearnings
    ? `\n# APRENDIZAJES — COMPORTAMIENTOS VALIDADOS
Estas son observaciones confirmadas por el equipo. Aplícalas:\n${brainLearnings}\n`
    : ''

  const emojiRule = settings.emoji_policy === 'none'
    ? 'EMOJIS: CERO emojis. Nunca uses emojis en tus mensajes.'
    : settings.emoji_policy === 'moderate'
      ? 'EMOJIS: Máximo 1-2 por mensaje, siempre al final, solo si refuerzan el tono. Mensaje técnico o serio = sin emoji.'
      : 'EMOJIS: La MAYORÍA de tus mensajes NO llevan emoji. Máximo 1, siempre al final, y solo cuando aporte de verdad (celebración genuina, bienvenida). Mensajes informativos, de precios o serios: cero emojis.'

  const trato = settings.formality_default === 'usted'
    ? '5. TRATO: por defecto hablas de "usted". Cambia a tuteo solo si el cliente tutea primero con confianza — y mantente consistente.'
    : '5. TRATO: por defecto tuteas. Cambia a "usted" si el cliente es claramente corporativo, formal o mayor — y mantente consistente.'

  // Proyectos con documentos reales cargados — Daniela solo puede ofrecer
  // fichas/PDFs de estos. Prometer un documento que no existe mata la confianza.
  // Media disponible viene del route (DB) — el prompt solo la lista
  const hasMedia = mediaProjects.length > 0

  // ── Variables que rellenan los {{placeholders}} de los bloques ──
  // (los bloques son texto editable desde el panel; estos valores vienen
  //  de agent_settings y del contexto del mensaje)
  const vars: Record<string, string> = {
    ceo_name: settings.ceo_name,
    ceo_first_name: settings.ceo_name.split(' ')[0] || settings.ceo_name,
    escalation_budget: '$' + settings.escalation_budget_usd.toLocaleString('en-US'),
    escalation_units: String(settings.escalation_units),
    reply_max_chars: String(settings.reply_max_chars),
    media_format_hint: hasMedia ? ' Si el cliente necesita más info, usa send_media para adjuntar un PDF/ficha.' : '',
    format_example_correct: hasMedia
      ? '"Portacelli arranca desde $89K, con financiamiento directo y solo $3,000 de reserva. Te comparto la ficha con planos y precios por modelo."'
      : '"Portacelli arranca desde $89K, con financiamiento directo y solo $3,000 de reserva."',
    media_pro_patterns: hasMedia
      ? `- SUGIERE enviar PDF/ficha/brochure cuando el cliente quiere specs detalladas (usa send_media, solo proyectos con documentos: ${mediaProjects.join(', ')})
- ROMPE respuestas complejas: reply corto con el gancho + send_media con el documento detallado`
      : `- Si el cliente quiere specs detalladas, da los 2-3 datos más relevantes en texto corto y ofrece agendar una llamada o visita para el detalle completo`,
    media_property_step: hasMedia
      ? ' Si pide más detalle, ofrécele la ficha con tus propias palabras — algo como "te mando la ficha con planos y precios" — y usa send_media (solo proyectos con documentos disponibles).'
      : ' Si pide más detalle y todavía no hay ficha, dilo con transparencia y dale los 2-3 datos más relevantes en texto.',
  }

  // Bloque editable renderizado; deshabilitado/vacío → se omite
  const r = (key: string): string => {
    const content = blocks[key] ?? DEFAULT_PROMPT_BLOCKS[key] ?? ''
    return content ? renderPromptBlock(content, vars) : ''
  }

  const responseFormat = `
# RESPUESTA — JSON VÁLIDO PURO, SIN NADA FUERA DEL JSON
{
  "reply": "texto plano para WhatsApp",
  "stage": "new | warm | hot | cold",
  "name_captured": "nombre si lo mencionó, null si no",
  "qualification_data": {
    "purpose": "vivienda_propia | inversion | ambos | null",
    "budget_ok": true | false | null,
    "timeline": "inmediato | 3_meses | 6_meses | explorando | null",
    "financing_needed": true | false | null,
    "decision_maker": true | false | null
  },
  "qualified": false,
  "schedule_meeting": null,
  "opt_out": false,
  "agent_action": {
    "type": "sell | consult_team | escalate_ceo | schedule | follow_up_needed",
    "reason": "razón de la decisión, null si type es sell",
    "urgency": "normal | high | critical",
    "client_type": "individual | corporate",
    "follow_up_hint": "qué hacer en el seguimiento, null si no aplica"
  },
  "deal_summary": {
    "summary": "3 líneas máximo: quién es, qué busca, dónde quedó la conversación",
    "signals": {
      "buying_signals": ["lista de señales de compra detectadas"],
      "objections": ["objeciones mencionadas"],
      "client_profile": "individual | corporate",
      "budget_mentioned": null,
      "engagement_level": "low | medium | high"
    },
    "next_action": "siguiente paso concreto que Daniela debe hacer"
  },
  "brain_observations": [],
  "interactive_buttons": [],
  "send_media": null,
  "extra_messages": []
}
- "agent_action": SIEMPRE incluir. Es tu decisión como SDR.
- "deal_summary": SIEMPRE incluir. Resume el estado del deal para tu yo futuro.
${settings.learning_sensitivity === 'high'
    ? '- "brain_observations": REGISTRA APRENDIZAJES ACTIVAMENTE. En toda conversación con sustancia (una objeción, una pregunta difícil, una señal de compra, un motivo de rechazo, una duda que no supiste responder) emite 1 observación corta y accionable. Solo déjalo vacío en saludos o mensajes triviales.'
    : '- "brain_observations": solo cuando detectes algo interesante (patrón, técnica que funcionó, objeción nueva). Array vacío si nada notable.'}
- "interactive_buttons": máximo 3 botones, títulos de máximo 20 caracteres. Úsalos solo en momentos clave: después de presentar opciones, al ofrecer visita, al confirmar interés. Array vacío la mayoría de veces.
- "opt_out": boolean — true SOLO si el cliente pide explícitamente no ser contactado.
- "extra_messages": burbujas ADICIONALES que se envían DESPUÉS del reply (máx 2). Así textea la gente real: mensajes separados, no un bloque. Úsalo cuando el guion pida doble mensaje, o cuando dividir en 2 burbujas cortas sea más natural que una larga. Vacío la mayoría de veces. Orden de envío: reply → media (si hay) → extra_messages.
${hasMedia
    ? `- "send_media": null normalmente. Úsalo para adjuntar material del proyecto:
  { "type": "document" | "image" | "video" | "link", "project": "nombre_del_proyecto", "description": "qué enviar (ej: brochure, ubicación, avances de obra)" }
  SOLO tienes material de estos proyectos: ${mediaProjects.join(', ')}. Para cualquier otro proyecto NUNCA ofrezcas enviar material — da la info en texto.
  Actívalo cuando: el guion lo indique; el cliente pida brochure/planos/precios (document), fotos o avances (image), videos (video), o ubicación (link); o tras dar un gancho corto sobre un proyecto.`
    : `- "send_media": SIEMPRE null — todavía no hay documentos cargados en el sistema. NUNCA ofrezcas enviar fichas, PDFs, brochures ni planos. Si el cliente pide un documento, responde: "Te lo comparto en cuanto lo tenga a mano, pero te adelanto lo importante:" y da los datos clave en texto corto.`}
`

  const today = new Date().toLocaleDateString('es-SV', {
    timeZone: 'America/El_Salvador',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // ── Ensamblaje: bloques editables + secciones dinámicas ──
  const header = [
    r('identity'),
    [r('personality'), trato].filter(Boolean).join('\n'),
    r('language'),
    r('banned_phrases'),
    r('first_contact'),
    [r('communication_style'), emojiRule].filter(Boolean).join('\n'),
    r('truth_source'),
    r('anti_loop'),
    r('combined_messages'),
    r('format_rules'),
    r('anti_patterns'),
    r('pro_patterns'),
    r('price_types'),
    r('price_psychology'),
    r('investment_guide'),
    r('property_questions'),
    r('emotional_intelligence'),
    r('closing_techniques'),
  ].filter(Boolean).join('\n\n')

  const decisionParts = [r('decision_framework'), r('stage_rubric')].filter(Boolean).join('\n\n')
  const decisionSection = decisionParts ? `\n${decisionParts}\n` : '\n'
  const objectivesSection = objectivesBlock ?? ''
  const missionBlock = r('qualification_mission')
  const schedulingBlock = r('scheduling')

  return `${header}
${projectScript ? '\n' + projectScript + '\n' : ''}${intentBlock}${playbookBlock}${brainBlock}${adContext ? '\n' + adContext + '\n' : ''}${escalationOverride ? '\n' + escalationOverride + '\n' : ''}${catalogBlock}${objectivesSection}${decisionSection}
${settings.custom_instructions ? '# INSTRUCCIONES DEL EQUIPO (configuración viva — prioridad alta)\n' + settings.custom_instructions + '\n\n' : ''}# PERFIL DEL CLIENTE
Fecha actual (zona horaria El Salvador): ${today}
Nombre: ${lead.name ?? 'desconocido'}
Etapa: ${lead.stage}
${qualBlock}
${dealBlock}
${missionBlock}

${schedulingBlock}

${responseFormat}`
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
REGLA ABSOLUTA: SOLO habla de productos de INVERSIÓN / ROI. NO menciones proyectos residenciales ni propiedades de alquiler como opción — aunque estén en el catálogo.
→ Si su mensaje YA especifica el modelo (ROI anual, Airbnb, plusvalía, renta): NO preguntes de nuevo qué modelo quiere. Profundiza en ese modelo con los proyectos de inversión usando la GUÍA RÁPIDA de arriba.
→ Si no especificó modelo: pregunta cuál de los 5 modelos le interesa.
→ Si hay PROYECTO ACTUAL de inversión: explica primero su potencial para el modelo mencionado.
`

    case 'catalog_request':
      return `
# INSTRUCCIÓN DE ESTE TURNO — CATÁLOGO
El cliente quiere ver opciones. Selecciona 3-4 propiedades relevantes al perfil del cliente (presupuesto, propósito). Preséntalo en prosa natural, una frase por proyecto. El cierre es opcional: puedes preguntar cuál le llama la atención, o simplemente dejar las opciones ahí y que el cliente elija — no fuerces la pregunta si el mensaje ya se siente completo.
`

    default:
      return ''
  }
}

// ─────────────────────────────────────────────────────────────
// Catalog section — siempre incluye catálogo completo
// ─────────────────────────────────────────────────────────────

function buildCatalogSection(
  projects: GTProject[],
  detected: GTProject | null,
  intent: MessageIntent = 'general',
  rentalThreshold = 30_000,
): string {
  if (!projects.length) {
    return `
# PORTAFOLIO
Grupo Terranova tiene proyectos residenciales y de inversión en El Salvador.
Pregunta al cliente qué tipo (compra/alquiler/inversión), zona y presupuesto maneja.
`
  }

  const { rental, residential, investment } = partitionCatalog(projects, rentalThreshold)

  const rentalBlock = rental.length
    ? `ALQUILER MENSUAL (precio por mes)\n${rental.map(p => formatProjectLine(p, 'rental')).join('\n')}`
    : ''

  const residentialBlock = residential.length
    ? `COMPRA RESIDENCIAL (precio total de venta)\n${residential.map(p => formatProjectLine(p, 'purchase')).join('\n')}`
    : ''

  const investmentBlock = investment.length
    ? `INVERSIÓN / ROI (precio total de compra)\n${investment.map(p => formatProjectLine(p, 'purchase')).join('\n')}`
    : ''

  // Investment intent: only expose investment products — hide residential/rental to prevent topic drift
  if (intent === 'investment_query' && investmentBlock) {
    if (detected?.entityType === 'investment') {
      return `
# PROYECTO DE INVERSIÓN ACTUAL — EL CLIENTE ESTÁ HABLANDO DE ESTE
REGLA: SOLO habla de productos de inversión. No menciones propiedades residenciales ni de alquiler.

${formatProjectFull(detected, rentalThreshold)}

# OTROS PRODUCTOS DE INVERSIÓN — referencia si el cliente pide alternativas
${investmentBlock}
`
    }
    return `
# PORTAFOLIO DE INVERSIONES — ÚNICO FOCO DE ESTE TURNO
REGLA ABSOLUTA: SOLO habla de estos productos. No menciones propiedades residenciales ni de alquiler.
Los precios son precio total de compra.

${investmentBlock}
`
  }

  const blocks = [rentalBlock, residentialBlock, investmentBlock].filter(Boolean).join('\n\n')

  if (detected) {
    // Recorte inteligente: con proyecto detectado solo cargamos las alternativas
    // de SU categoría. Menos tokens (límite TPM de OpenAI, ~5K/mensaje),
    // menos costo y menos deriva de tema. El resto queda como resumen.
    const inRental = rental.some(p => p.name === detected.name)
    const inInvestment = investment.some(p => p.name === detected.name)
    const sameCategory = inRental ? rental : inInvestment ? investment : residential
    const sameLabel = inRental ? 'ALQUILER MENSUAL (precio por mes)' : inInvestment ? 'INVERSIÓN / ROI (precio total)' : 'COMPRA RESIDENCIAL (precio total)'
    const sameBlock = sameCategory
      .filter(p => p.name !== detected.name)
      .map(p => formatProjectLine(p, inRental ? 'rental' : 'purchase'))
      .join('\n')
    const otherCounts = [
      !inRental && rental.length ? `${rental.length} propiedades en alquiler` : null,
      inRental || inInvestment ? (residential.length ? `${residential.length} residenciales en venta` : null) : null,
      !inInvestment && investment.length ? `${investment.length} productos de inversión` : null,
    ].filter(Boolean).join(', ')

    return `
# PROYECTO ACTUAL — EL CLIENTE ESTÁ HABLANDO DE ESTE
Empieza respondiendo sobre este proyecto. Muestra alternativas solo si el cliente las pide.

${formatProjectFull(detected, rentalThreshold)}
${sameBlock ? `
# ALTERNATIVAS DE LA MISMA CATEGORÍA — ${sameLabel}
${sameBlock}
` : ''}${otherCounts ? `
# RESTO DEL PORTAFOLIO
Además tenemos ${otherCounts}. Si el cliente cambia de tema (ej: de compra a alquiler), di que tienes opciones y pregunta qué busca — el detalle te llegará en el siguiente turno.
` : ''}`
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
// Umbral configurable (agent_settings.rental_threshold_usd, default
// $30,000): todo lo que vale menos es renta mensual en El Salvador.
// ─────────────────────────────────────────────────────────────

function isRentalProperty(p: GTProject, threshold = 30_000): boolean {
  if (p.slug?.includes('alquiler')) return true
  if (/\balquiler\b/i.test(p.name)) return true
  if (p.type === 'alquiler') return true
  if (p.priceFrom !== undefined && p.priceFrom < threshold) return true
  return false
}

// ─────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────

function formatProjectFull(p: GTProject, rentalThreshold = 30_000): string {
  const isRental = isRentalProperty(p, rentalThreshold)
  const priceLabel = isRental
    ? `Renta mensual: ${formatPriceRange(p)}/mes`
    : `Precio de venta: ${formatPriceRange(p)}`

  const lines = [
    `Nombre: ${p.name}`,
    `Tipo: ${humanizeType(p.type)}${p.transactionType ? ` (${p.transactionType})` : ''}`,
    `Ubicación: ${p.location}`,
    priceLabel,
  ]
  if (p.address) lines.push(`Dirección: ${p.address}`)
  if (p.developer) lines.push(`Desarrollador: ${p.developer}`)
  if (p.constructionStatus) lines.push(`Estado: ${p.constructionStatus}`)
  if (p.deliveryDate) lines.push(`Entrega estimada: ${p.deliveryDate}`)
  if (p.area) lines.push(`Área: ${p.area} m²`)
  if (p.bedrooms !== undefined) lines.push(`Habitaciones: ${p.bedrooms}`)
  if (p.bathrooms !== undefined) lines.push(`Baños: ${p.bathrooms}`)
  if (p.parkings !== undefined) lines.push(`Parqueos: ${p.parkings}`)
  if (p.amenities?.length) lines.push(`Amenidades: ${p.amenities.join(', ')}`)

  if (p.expectedROI) lines.push(`ROI estimado: ${p.expectedROI}% anual`)
  if (p.investmentPeriodMonths) lines.push(`Período de inversión: ${p.investmentPeriodMonths} meses`)
  if (p.riskLevel) lines.push(`Perfil de riesgo: ${p.riskLevel}`)
  if (p.subInvestments?.length) {
    lines.push(`Modalidades de inversión:`)
    for (const sub of p.subInvestments) {
      lines.push(formatSubInvestment(sub))
    }
  }

  if (p.models?.length) {
    lines.push(`Modelos disponibles:`)
    for (const m of p.models) {
      const parts = [m.name]
      if (m.dimensions) parts.push(m.dimensions)
      if (m.spaces) parts.push(m.spaces)
      if (m.price) parts.push(`$${m.price.toLocaleString()}`)
      if (m.availability) parts.push(`(${m.availability})`)
      lines.push(`  ${parts.join(' | ')}`)
      if (m.amenities?.length) lines.push(`    Amenidades: ${m.amenities.join(', ')}`)
    }
  }

  if (p.description) {
    lines.push(`Detalles: ${p.description}`)
    if (p.description.length >= 495 && !p.bedrooms && !p.models?.length) {
      lines.push(`(Nota: descripción puede estar incompleta. Si el cliente pide un dato que no aparece, di: "Déjame confirmar ese detalle con nuestro equipo y te lo comparto.")`)
    }
  }
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
  const specs: string[] = []
  if (p.area) specs.push(`${p.area}m²`)
  if (p.bedrooms !== undefined) specs.push(`${p.bedrooms} hab`)
  if (p.bathrooms !== undefined) specs.push(`${p.bathrooms} baños`)
  if (p.parkings !== undefined) specs.push(`${p.parkings} parqueos`)
  const specStr = specs.length ? ` | ${specs.join(', ')}` : ''
  const desc = !specs.length && p.description ? ` — ${p.description.substring(0, 120)}` : ''
  return `${p.name} | ${p.location} | ${price}${roi}${specStr}${desc}`
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

function partitionCatalog(projects: GTProject[], rentalThreshold = 30_000): {
  rental: GTProject[]
  residential: GTProject[]
  investment: GTProject[]
} {
  const rental: GTProject[] = []
  const investment: GTProject[] = []
  const residential: GTProject[] = []

  for (const p of projects) {
    if (isRentalProperty(p, rentalThreshold)) {
      rental.push(p)
    } else if (p.entityType === 'investment' || p.entityType === 'project') {
      investment.push(p)
    } else {
      residential.push(p)
    }
  }

  return { rental, residential, investment }
}
