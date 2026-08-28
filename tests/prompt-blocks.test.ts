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
    expect(prompt).toContain('directamente con Ana, nuestro CEO')
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

  it('el marco de decisión escala en reunión, dinero y documentos legales; el descuento estándar no escala', () => {
    const prompt = buildSystemPrompt({ lead, project: null })
    expect(prompt).toContain('Se agenda o confirma una reunión')
    expect(prompt).toContain('cuenta bancaria, transferencia')
    expect(prompt).toContain('promesa de venta, promesa de compraventa')
    expect(prompt).toContain('El descuento estándar por pago de contado SÍ es tuyo para compartir')
  })
})
