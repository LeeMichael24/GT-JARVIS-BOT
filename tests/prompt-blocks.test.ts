import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  rows: [] as { key: string; content: string; enabled: boolean }[],
  fail: false,
}))

vi.mock('@/lib/supabase', () => ({
  getServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(async () =>
        db.fail ? { data: null, error: { message: 'no table' } } : { data: db.rows, error: null },
      ),
    })),
  })),
}))

import {
  DEFAULT_PROMPT_BLOCKS,
  PROMPT_BLOCK_DEFS,
  PROMPT_BLOCK_KEYS,
  renderPromptBlock,
  mergePromptBlocks,
  getEffectivePromptBlocks,
  _clearPromptBlocksCache,
} from '@/lib/prompt-blocks'
import { buildSystemPrompt } from '@/services/claude/prompts'
import { DEFAULT_SETTINGS } from '@/lib/agent-settings'
import type { Lead } from '@/types'

const lead: Lead = {
  id: 'l1', phone: '503', name: 'Carlos', stage: 'warm', bot_active: true,
  project_interest: null, qualification_data: null, assigned_to: null,
  opted_out: false, last_proactive_at: null,
  first_message_at: '', last_message_at: '', created_at: '',
}

beforeEach(() => {
  db.rows = []
  db.fail = false
  _clearPromptBlocksCache()
})

// 13-sep-2026: prompt_blocks en producción tiene 0 filas, así que estos textos
// son los que corren. La guía de inversión decía "Portacelli Alta ($242k-$265k,
// zona en desarrollo acelerado)" con el catálogo en $252,500 — precio viejo y la
// frase genérica exacta por la que el juez reprueba. Regla de oro: precio,
// reserva y disponibilidad llegan del catálogo, nunca de un texto fijo.
describe('prompt blocks — sin datos vivos escritos a mano', () => {
  const CIFRA_PROYECTO = /\$\s?\d{3}(?:[.,]\d{3}|\s?[kK])|\$\d{1,3},\d{3}\s+de\s+reserva/

  it.each(['investment_guide', 'price_psychology'])('%s no trae precios ni montos de reserva', key => {
    expect(DEFAULT_PROMPT_BLOCKS[key]).not.toMatch(CIFRA_PROYECTO)
  })

  it('ningún bloque usa "desarrollo acelerado" como argumento', () => {
    for (const [key, texto] of Object.entries(DEFAULT_PROMPT_BLOCKS)) {
      expect(texto, key).not.toMatch(/desarrollo acelerado/i)
    }
  })
})

describe('prompt blocks — defaults', () => {
  it('cada bloque definido tiene texto default y viceversa', () => {
    for (const def of PROMPT_BLOCK_DEFS) {
      expect(DEFAULT_PROMPT_BLOCKS[def.key], `falta default para ${def.key}`).toBeTruthy()
    }
    for (const key of Object.keys(DEFAULT_PROMPT_BLOCKS)) {
      expect(PROMPT_BLOCK_KEYS).toContain(key)
    }
  })

  it('renderPromptBlock rellena placeholders y elimina los desconocidos', () => {
    const out = renderPromptBlock('Hola {{ceo_name}}, umbral {{escalation_budget}} y {{nada}}', {
      ceo_name: 'Michael Narváez',
      escalation_budget: '$300,000',
    })
    expect(out).toBe('Hola Michael Narváez, umbral $300,000 y ')
  })
})

describe('prompt blocks — merge con la tabla', () => {
  it('sin overrides usa los defaults del código', () => {
    const merged = mergePromptBlocks({})
    expect(merged.identity).toBe(DEFAULT_PROMPT_BLOCKS.identity)
  })

  it('un override reemplaza el contenido; disabled lo vacía', () => {
    const merged = mergePromptBlocks({
      identity: { content: 'Soy OTRA identidad', enabled: true },
      language: { content: 'x', enabled: false },
    })
    expect(merged.identity).toBe('Soy OTRA identidad')
    expect(merged.language).toBe('')
    expect(merged.banned_phrases).toBe(DEFAULT_PROMPT_BLOCKS.banned_phrases)
  })

  it('tabla caída → defaults (fail-safe, Daniela nunca muere por config)', async () => {
    db.fail = true
    const blocks = await getEffectivePromptBlocks()
    expect(blocks.identity).toBe(DEFAULT_PROMPT_BLOCKS.identity)
  })

  it('ignora keys desconocidas de la tabla', async () => {
    db.rows = [{ key: 'hacker_block', content: 'evil', enabled: true }]
    const blocks = await getEffectivePromptBlocks()
    expect(Object.keys(blocks)).not.toContain('hacker_block')
  })
})

describe('buildSystemPrompt con bloques', () => {
  it('con defaults: el prompt contiene identidad, umbrales interpolados y CEO', () => {
    const prompt = buildSystemPrompt({ lead, project: null })
    expect(prompt).toContain('Eres Daniela, coordinadora comercial de Grupo Terranova')
    expect(prompt).toContain('$300,000')
    expect(prompt).toContain('3+ unidades')
    expect(prompt).toContain('Michael Narváez')
    expect(prompt).toContain('Máximo 500 caracteres en el reply')
  })

  it('los ajustes cambian los valores interpolados sin tocar bloques', () => {
    const prompt = buildSystemPrompt({
      lead, project: null,
      settings: {
        ...DEFAULT_SETTINGS,
        ceo_name: 'Ana López',
        escalation_budget_usd: 500_000,
        escalation_units: 5,
        reply_max_chars: 350,
      },
    })
    expect(prompt).toContain('$500,000')
    expect(prompt).toContain('5+ unidades')
    expect(prompt).toContain('Ana López')
    expect(prompt).toContain('directamente Ana, nuestro CEO')
    expect(prompt).toContain('Máximo 350 caracteres en el reply')
    expect(prompt).not.toContain('Michael Narváez')
  })

  it('un bloque editado desde el panel reemplaza al default en el prompt', () => {
    const prompt = buildSystemPrompt({
      lead, project: null,
      blocks: { ...DEFAULT_PROMPT_BLOCKS, identity: '# IDENTIDAD\nEres Sofía, asesora de pruebas.' },
    })
    expect(prompt).toContain('Eres Sofía, asesora de pruebas.')
    expect(prompt).not.toContain('Eres Daniela, coordinadora comercial')
  })

  it('un bloque deshabilitado se omite del prompt', () => {
    const prompt = buildSystemPrompt({
      lead, project: null,
      blocks: { ...DEFAULT_PROMPT_BLOCKS, banned_phrases: '' },
    })
    expect(prompt).not.toContain('FRASES PROHIBIDAS')
    // El resto sigue presente
    expect(prompt).toContain('Eres Daniela, coordinadora comercial')
  })

  it('inyecta la sección de objetivos cuando se provee', () => {
    const prompt = buildSystemPrompt({
      lead, project: null,
      objectivesBlock: '\n# OBJETIVOS DEL NEGOCIO (configuración viva — guían cada decisión)\nOBJETIVOS GENERALES (siempre aplican):\n- Agendar visitas\n',
    })
    expect(prompt).toContain('OBJETIVOS DEL NEGOCIO')
    expect(prompt).toContain('- Agendar visitas')
  })

  it('incluye un glosario de inversión para hablar con propiedad de retornos y financiamiento', () => {
    const prompt = buildSystemPrompt({ lead, project: null })
    expect(prompt).toContain('Flujo de caja')
    expect(prompt).toContain('Plusvalía:')
    expect(prompt).toContain('Apalancamiento')
    expect(prompt).toContain('Punto de equilibrio')
  })

  it('el marco de decisión escala en reunión, dinero y documentos legales; el descuento estándar no escala', () => {
    const prompt = buildSystemPrompt({ lead, project: null })
    expect(prompt).toContain('Se agenda o confirma una reunión')
    expect(prompt).toContain('cuenta bancaria, transferencia')
    expect(prompt).toContain('promesa de venta, promesa de compraventa')
    expect(prompt).toContain('El descuento estándar por pago de contado SÍ es tuyo para compartir')
  })

  it('incluye inteligencia emocional y técnicas de cierre en el prompt ensamblado', () => {
    const prompt = buildSystemPrompt({ lead, project: null })
    expect(prompt).toContain('INTELIGENCIA EMOCIONAL')
    expect(prompt).toContain('ESCEPTICISMO')
    expect(prompt).toContain('TÉCNICAS DE CIERRE')
    expect(prompt).toContain('ALTERNATIVA CERRADA')
  })

  it('el descuento estándar libre solo aplica cuando el catálogo trae la cifra para ese proyecto', () => {
    const prompt = buildSystemPrompt({ lead, project: null })
    expect(prompt).toContain('SOLO cuando el catálogo o playbook trae la cifra para ESE proyecto específico')
    expect(prompt).toContain('Déjame confirmar ese descuento con el equipo')
  })
})

// ─────────────────────────────────────────────────────────────
// Tono al escalar: serio y profesional, sin celebración
// ─────────────────────────────────────────────────────────────

describe('decision_framework — tono al escalar', () => {
  const bloque = DEFAULT_PROMPT_BLOCKS.decision_framework

  it('ordena el cambio de marcha: cero emojis y cero exclamaciones al escalar', () => {
    expect(bloque).toContain('TONO AL ESCALAR')
    expect(bloque).toContain('CERO emojis')
    expect(bloque).toContain('CERO signos de exclamación')
  })

  it('la regla le gana a "REACCIONA PRIMERO" y aplica también a consult_team', () => {
    expect(bloque).toContain('le gana a "REACCIONA PRIMERO"')
    expect(bloque).toContain('aplica igual cuando consultas al equipo')
  })

  it('ya no pide reaccionar con emoción antes de conectar con el CEO', () => {
    expect(bloque).not.toContain('PRIMERO reacciona al contexto específico del cliente')
  })
})

describe('decision_framework — expectativa de respuesta al escalar', () => {
  it('ordena cerrar el reply diciendo que el CEO responde en los próximos minutos', () => {
    const bloque = DEFAULT_PROMPT_BLOCKS.decision_framework
    expect(bloque).toContain('responde en los próximos minutos')
    expect(bloque).toContain('CIERRE CON EXPECTATIVA')
  })
})

describe('decision_framework — no re-escalar en cada turno', () => {
  it('ordena no re-anunciar la conexión con el CEO si ya se anunció', () => {
    const bloque = DEFAULT_PROMPT_BLOCKS.decision_framework
    expect(bloque).toContain('NO RE-ESCALES')
    expect(bloque).toContain('sigue en curso')
  })
})

// 29-sep-2026: la batería visual dio 0/4 en "cita concreta cuando tocaba". El
// bloque solo pedía cita "con señal de avance" y Terra, que sigue las reglas al
// pie de la letra, no la proponía nunca (ni al cliente en el extranjero).
describe('closing_techniques — siguiente paso concreto sin presionar', () => {
  const bloque = DEFAULT_PROMPT_BLOCKS.closing_techniques

  it('define qué es señal de avance y pide UN paso concreto con dos opciones', () => {
    expect(bloque).toMatch(/SEÑAL DE AVANCE/)
    expect(bloque).toMatch(/precio, plan de pago, disponibilidad, ubicaci[óo]n o material/i)
    expect(bloque).toMatch(/jueves por la tarde o s[áa]bado/i)
  })

  it('se propone UNA vez por conversación, no en cada turno', () => {
    expect(bloque).toMatch(/UNA vez por conversaci[óo]n/i)
    expect(bloque).toMatch(/no lo repitas/i)
  })

  it('cliente fuera del país o que no puede visitar → videollamada, nunca solo el brochure', () => {
    expect(bloque).toMatch(/FUERA DEL PA[ÍI]S/)
    expect(bloque).toMatch(/videollamada/i)
    expect(bloque).toMatch(/hora de El Salvador/i)
  })

  it('quiere apartar → paso concreto, y la cuenta bancaria sigue siendo del equipo', () => {
    expect(bloque).toMatch(/QUIERE APARTAR/)
    expect(bloque).toMatch(/cuenta bancaria nunca la das t[úu]/i)
  })

  it('conserva el respeto al cliente que pide tiempo o al trámite puro', () => {
    expect(bloque).toMatch(/PIDI[ÓO] TIEMPO/)
    expect(bloque).toMatch(/no propongas nada/i)
  })

  it('sigue sin cerrar contrato: el cierre es el siguiente paso', () => {
    expect(bloque).toMatch(/NUNCA EL CONTRATO/)
  })

  // 29-sep, medición 3: 5 de 9 reescrituras eran "dos preguntas seguidas": el paso
  // concreto + la pregunta de calificación en el mismo mensaje. Cada reescritura
  // suma 12-15 s. Un solo pedido por mensaje evita el choque con el crítico.
  it('UN solo pedido por mensaje: o califica, o propone el paso — nunca los dos', () => {
    expect(bloque).toMatch(/UN solo pedido por mensaje/)
    expect(bloque).toMatch(/nunca las dos|nunca los dos/i)
    expect(bloque).toMatch(/ya sabes si es para vivir o invertir/i)
  })

  it('cliente fuera del país u ocupado: es obligatorio, con horarios concretos en el mismo mensaje', () => {
    expect(bloque).toMatch(/FUERA DEL PA[ÍI]S[^\n]*OBLIGATORIO/)
    expect(bloque).toMatch(/en ese mismo mensaje/i)
  })
})
