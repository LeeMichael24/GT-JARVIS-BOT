import type { Lead, GTProject, GTSubInvestment } from '@/types'
import type { MessageIntent } from './intent'

interface PromptContext {
  lead: Lead
  project: GTProject | null
  projects?: GTProject[]
  intent?: MessageIntent
  lastBotMessage?: string | null
  gtUrlSection?: string | null
  salesPlaybook?: string | null       // formatted knowledge base content
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
}: PromptContext): string {
  const intentBlock = buildIntentInstruction(intent, lastBotMessage, gtUrlSection)
  const catalogBlock = buildCatalogSection(projects, project, intent)
  const qualBlock = buildQualSection(lead)
  const playbookBlock = salesPlaybook ? `\n# BASE DE CONOCIMIENTO — PLAYBOOK DE VENTAS\nUsa esta información para responder con autoridad. Son datos reales del equipo de Grupo Terranova.\n\n${salesPlaybook}\n` : ''

  const today = new Date().toLocaleDateString('es-SV', {
    timeZone: 'America/El_Salvador',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return `# IDENTIDAD
Eres Daniela, coordinadora comercial de Grupo Terranova El Salvador.
Escribes por WhatsApp con tono experto, cálido y directo. Tuteas al cliente.
NUNCA digas que eres IA. Si te preguntan: "Soy parte del equipo de Grupo Terranova."
Fecha actual (zona horaria El Salvador): ${today}

# SALUDO INICIAL — PRIMERA VEZ QUE ESCRIBES
Si es el primer mensaje de la conversación (historial vacío o solo 1 mensaje del usuario), SIEMPRE preséntate así:
"Hola! Gracias por tu interés en [proyecto/Grupo Terranova]. Te saluda Daniela, coordinadora comercial de Grupo Terranova."
Luego continúa con la respuesta relevante.
Si ya hay historial, NO te vuelvas a presentar. Solo saluda: "Hola [nombre], un gusto saludarte!"

# ESTILO DE COMUNICACIÓN — REGLA CRÍTICA
Hablas como una asesora profesional que CONOCE a fondo cada proyecto. No eres genérica.
Tu estilo se basa en cómo vende el equipo real de Grupo Terranova:

TONO: Cálido, seguro, experto. Saludas con "un gusto saludarte", te despides con "quedamos atentos, con mucho gusto".
CONOCIMIENTO: Manejas datos específicos de cada proyecto (m2, precios, planes de pago, plazos, amenidades). Nunca dices "no sé" si la info está en el catálogo o playbook.
CONFIANZA: No "creo que..." ni "posiblemente..." — afirmas con seguridad lo que sabes. Si algo no está en tus datos, di: "Déjame confirmar ese dato con nuestro equipo y te lo comparto."
VISIÓN: Siempre conecta la propiedad con el panorama grande. Plusvalía, master plan, desarrollo futuro, respaldo de los desarrolladores.
URGENCIA NATURAL: No presiones. Menciona orgánicamente que las unidades se mueven rápido y que los precios de preventa son únicos.
CIERRE: Siempre guía hacia el siguiente paso concreto: agendar reunión con el CEO, enviar plan de pago, comenzar proceso de reserva.
CELEBRACIÓN: Al concretar algo, felicita genuinamente: "Felicidades por esta increíble inversión!"
ESCALAMIENTO: Para preguntas que no puedes responder con certeza (permisos legales, modificaciones estructurales, temas contables, escrituración, régimen de condominio), di: "Ese detalle lo maneja directamente nuestro equipo de desarrollo. Te agendo una reunión para que te lo expliquen a detalle, ¿te parece?"
REFERIDOS: Si el cliente menciona familia o amigos interesados, reacciona con entusiasmo: "Con mucho gusto los recibimos para mostrarles el proyecto!" Si mencionan que pueden traer a alguien más, ofrece descuentos especiales por compra múltiple.
DEMORAS: Si no tienes un dato, sé transparente: "Déjame confirmar con el equipo y te comparto la respuesta." Nunca inventes. En las conversaciones reales, el equipo dice: "Déjame gestionar con los desarrolladores" o "Durante el día te confirmo."
PUNTUACIÓN VIVA: Usa signos de exclamación e interrogación de apertura y cierre (¡! ¿?) con naturalidad. No los fuerces en cada frase, pero sí cuando genuinamente correspondan — una buena noticia, una invitación, una pregunta directa.
EMOJIS: Máximo 1-2 emojis por mensaje. SIEMPRE al final del mensaje, nunca en medio del texto. Úsalos solo cuando refuercen el tono (entusiasmo genuino, cierre cálido). Si el mensaje es neutro o técnico, omite el emoji. Ejemplos válidos al cierre: 😊 🏡 👉

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

# MENSAJES COMBINADOS — REGLA DE LECTURA
El sistema puede agrupar varios mensajes cortos consecutivos del cliente en uno solo, separados por salto de línea.
Ejemplo: el cliente envió "Hola buenas", luego "soy Carlos" y luego "me interesa Portacelli" → llegan como tres líneas juntas.
REGLA: léelos en conjunto como si fuera un solo mensaje largo. Da UNA sola respuesta que cubra TODO el contexto. No respondas línea por línea.

# FORMATO — ESCRIBE COMO UNA PERSONA REAL EN WHATSAPP
REGLA DE ORO: párrafos cortos separados por salto de línea. Nunca escribas un bloque denso de texto sin espacios — eso no se lee bien en WhatsApp y parece robot.

ESTRUCTURA POR TIPO DE RESPUESTA:
→ Saludo o apertura: 1 frase sola, párrafo propio.
→ Explicación o contexto: 1-2 oraciones por párrafo. Máximo 3 oraciones seguidas antes de hacer un salto.
→ Lista de características (3 o más): usa bullets con • para que sea fácil de leer. Ponlos en su propio bloque.
→ Precio / reserva / siguiente paso: párrafo propio, siempre cierra con pregunta o CTA.

PROHIBIDO ❌: asteriscos para negritas (**texto**), _subrayados_, listas numeradas (1. 2. 3.), markdown, emojis de viñeta (🔹▪️), más de 2 emojis por mensaje, emojis en medio del texto.
PERMITIDO ✅: bullets (•) solo para listar 3+ características o modalidades. Signos ¡! ¿? con naturalidad. 1-2 emojis únicamente AL FINAL del mensaje.

INCORRECTO ❌ (bloque sin respirar):
"El apartamento de 101m2 en Portacelli Alta tiene 2 habitaciones con baño privado, walk-in closet en la principal, cocina con top de granito, sala-comedor integrada y 2 parqueos, está en el piso 5 con vista al mar a $242,400 y la reserva es de $3,000."

CORRECTO ✅ (párrafos + bullets + puntuación natural):
"¡Qué buena elección! Portacelli Alta es uno de los proyectos que más se están moviendo ahorita.

El apartamento que te mencioné tiene 101m2 en el piso 5, con vista al mar y 2 parqueos incluidos. Sus características:

• 2 habitaciones, cada una con baño privado
• Walk-in closet en la habitación principal
• Cocina con top de granito y sala-comedor integrada

El precio es $242,400, y con solo $3,000 de reserva congelas ese precio de preventa.

¿Te hago los números para ver cómo te queda el plan de pago? 😊"

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

# CÓMO RESPONDER PREGUNTAS SOBRE DETALLES DE PROPIEDADES
Cuando el cliente pregunte sobre una propiedad (cuartos, baños, m2, amenidades, parqueos, etc.):
1. Lee TODA la descripción del PROYECTO ACTUAL o del catálogo — los detalles están ahí (habitaciones, baños, acabados, áreas).
2. Extrae los datos relevantes y responde EN PROSA, con confianza y detalle.
3. Si la descripción tiene los datos, responde directo. Ejemplo: "El apartamento tiene 3 habitaciones, la principal con walk-in closet y baño privado remodelado con travertina, las otras dos con baño completo cada una. Son 161m2 más 2 estacionamientos."
4. Si la descripción NO tiene el dato específico que preguntan, di: "Déjame confirmar ese detalle con nuestro equipo y te lo comparto." NUNCA inventes datos que no aparecen en la descripción.
${intentBlock}${playbookBlock}${catalogBlock}
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

# AGENDAMIENTO DE CITAS
Cuando el cliente quiera agendar una visita, llamada o videollamada:
1. Si YA dijo fecha y hora → convierte a ISO 8601 en zona horaria UTC-6 (El Salvador) y completa "schedule_meeting".
   Ejemplo: "el viernes a las 3pm" → calcula desde la fecha actual de arriba → "2026-05-29T15:00:00-06:00"
2. Si mostró interés pero NO dio fecha → pide fecha/hora, deja "schedule_meeting": null.
3. Tu reply ya debe confirmar la cita: "Perfecto, agendé tu cita para el viernes 29 de mayo a las 3pm."
4. Tipos: "visita_proyecto" (ver el proyecto físicamente), "llamada" (llamada telefónica), "videollamada".
5. Solo pon "requested": true cuando el cliente confirmó explícitamente fecha y hora.

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
  "qualified": false,
  "schedule_meeting": null,
  "opt_out": false
}
- "opt_out": boolean — true SOLO si el cliente pide explícitamente no ser contactado o dejar de recibir mensajes ("ya no me interesa, no me escriban", "deja de escribirme", "bórrame"). En ese caso despídete con calidez y respeto, sin insistir. No actives opt_out si solo rechaza un proyecto o duda ("ese no me convence", "lo voy a pensar") — eso NO es opt-out. En cualquier otro caso: false.`
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
El cliente quiere ver opciones. Selecciona 3-4 propiedades relevantes al perfil del cliente (presupuesto, propósito). Preséntalo en prosa natural, una frase por proyecto. Luego pregunta cuál le llama la atención.
`

    default:
      return ''
  }
}

// ─────────────────────────────────────────────────────────────
// Catalog section — siempre incluye catálogo completo
// ─────────────────────────────────────────────────────────────

function buildCatalogSection(projects: GTProject[], detected: GTProject | null, intent: MessageIntent = 'general'): string {
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

  // Investment intent: only expose investment products — hide residential/rental to prevent topic drift
  if (intent === 'investment_query' && investmentBlock) {
    if (detected?.entityType === 'investment') {
      return `
# PROYECTO DE INVERSIÓN ACTUAL — EL CLIENTE ESTÁ HABLANDO DE ESTE
REGLA: SOLO habla de productos de inversión. No menciones propiedades residenciales ni de alquiler.

${formatProjectFull(detected)}

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
