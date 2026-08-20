# Auditoría 6 — Configurabilidad TOTAL desde el panel

**Fecha:** 14 julio 2026 · **Sexta auditoría** — método: 4 auditorías en paralelo sobre el código actual (hardcode vs BD · panel · crons/entrenamiento · esquema Supabase) + implementación completa en la misma sesión.

**Objetivo pedido por el CEO:** que el 100% de Daniela sea configurable desde el panel de administración (ya live en Vercel): objetivos generales/por proyecto/por inversión, voz y tono, entrenamiento automático (crons) y manual (pegar conversaciones reales), y que cualquier admin pueda supervisarla y **pausarla** cuando haga falta.

---

## Diagnóstico (antes)

| Área | Estado encontrado |
|------|-------------------|
| Perillas configurables | Solo 5 (`emoji_policy`, `formality`, `learning_sensitivity`, `custom_instructions`, `reflection_enabled`) |
| Personalidad/voz/tono | ~90% hardcodeada en `services/claude/prompts.ts` (identidad, frases prohibidas, saludos, estilo, psicología de precios, marco de decisión) |
| Objetivos | ❌ Inexistentes como dato — ni generales, ni por proyecto, ni por inversión |
| Pausa global | ❌ No existía — solo pausa por lead (`bot_active`) |
| Entrenamiento manual | ❌ Solo scripts locales `npx tsx` — imposible desde el panel |
| Loop de aprendizaje | ⚠️ NO cerraba: reflexión y observaciones guardaban a confianza 0.5, el prompt solo lee ≥0.7 → lo aprendido jamás llegaba a las respuestas sin promoción manual |
| Observabilidad de crons | ❌ Cero — sin tabla de corridas, sin vista en panel |
| Umbrales de negocio | Hardcodeados: escalación $300k / 3+ unidades, nombre del CEO, horario 8-18, scoring, umbral de renta $30k |
| Esquema BD | 3 tablas huérfanas sin migración (`lead_sources`, `ad_campaigns`, `activity_log`); migraciones 008/009/010 sin correr |
| Inconsistencia de precios | El prompt decía "Portacelli desde $89K" en un ejemplo y "$242k-$265k" en la guía |

---

## Lo implementado (en esta sesión)

### 1. Pausa global 🔴 (lo más pedido)
- Perilla `agent_enabled` en `agent_settings` + **interruptor gigante en el tab Estado**.
- Enforcement en: webhook (guarda el mensaje, no responde), cron de secuencias, radar y recontacto proactivos.
- **Banner rojo en TODO el panel** cuando está pausada (visible para asesores y admins).
- Todo queda en `activity_log` (quién pausó/reactivó y cuándo).

### 2. Personalidad/voz/tono 100% editable (tab Personalidad)
- Nueva tabla `prompt_blocks` + `lib/prompt-blocks.ts`: el prompt se descompuso en **20 bloques editables** (identidad, personalidad viva, idioma, frases prohibidas, primer contacto, estilo, fuente de verdad, anti-loop, formato, anti/pro-patrones, tipos de precio, psicología de precios, guía de inversiones, respuestas de propiedades, marco de decisión, rúbrica de stages, misión de calificación, agendamiento).
- **Diseño anti-drift**: la tabla arranca vacía; el código trae el texto de fábrica (el prompt auditado "top-decil"). Editar crea un override; **Restaurar default** siempre disponible; un bloque se puede desactivar completo.
- Placeholders vivos: `{{ceo_name}}`, `{{escalation_budget}}`, `{{escalation_units}}`, `{{reply_max_chars}}` se rellenan desde Ajustes en cada mensaje.
- El formato JSON de respuesta NO es editable (romperlo rompería el parser) — es la única parte estructural que queda en código, a propósito.

### 3. Objetivos por nivel (tab Objetivos)
- Nueva tabla `agent_objectives` con scope `general` / `project` / `investment` + prioridad + activo.
- Se inyectan al prompt en cada turno: generales siempre; por proyecto cuando el cliente habla de ese proyecto; por inversión en conversaciones de inversión (match por nombre/slug, case-insensitive).
- Dropdown con los proyectos reales del catálogo GT para elegir el target sin typos.

### 4. Entrenamiento manual desde el panel (tab Entrenamiento)
- **Pegar conversaciones reales** (export .txt de WhatsApp, formato `CLIENTE:/EQUIPO:`, o texto libre) → `lib/wa-parse.ts` las normaliza → el modelo extrae patrones → el admin revisa/edita/selecciona → se guardan al cerebro como `source='team'`, confianza 0.85 → **entran al prompt de inmediato**.
- **"Reflexionar ahora"**: dispara la reflexión nocturna bajo demanda (clave en Vercel Hobby donde los crons corren 1 vez/día).
- **Bandeja de revisión**: los aprendizajes que Daniela capturó sola (confianza <70%) con botones Promover (→0.75, entra al prompt) / Rechazar.

### 5. Loop de aprendizaje CERRADO
- **Dedup por tema**: la misma observación repetida ya no inserta duplicados — incrementa `seen_count` (columnas nuevas en `agent_brain`).
- **Auto-promoción por convergencia**: al verse N veces (default 3, configurable) una observación sube sola a confianza 0.72 y entra al prompt. Apagable (`auto_promote_enabled`).
- **Reflexión a temperatura 0.3** (configurable) — extracción sin inventar, antes corría a 0.85.

### 6. Observabilidad (tab Estado)
- Tabla `cron_runs`: cada cron registra su corrida (job, duración, status, resumen JSON). 100% fail-safe.
- El tab Estado muestra: historial de corridas, actividad reciente (`activity_log` por fin visible — existía pero nada la mostraba), contador de aprendizajes pendientes, y botones **"Ejecutar ahora"** para reflexión/radar/recontacto/métricas/media-sync.

### 7. ~14 perillas nuevas en Ajustes (agrupadas por sección)
`ceo_name` · `escalation_budget_usd` · `escalation_units` · `reply_max_chars` · `llm_temperature` · `reflection_temperature` · `business_hours_start/end` · `rental_threshold_usd` · `history_window` · `brain_min_confidence` · `auto_promote_enabled/threshold` — todas con defaults seguros en código y validación de rango en ambos lados.

### 8. Reparación de esquema + seguridad
- Migración **011**: DDL versionado (con RLS) para `lead_sources`, `ad_campaigns`, `activity_log` + `cron_runs`. Idempotente — segura aunque las tablas ya existan a mano en prod.
- Guard de admin explícito en `/panel/daniela` (asesor → redirect, antes página de error).
- El ejemplo "$89K" del prompt quedó marcado como "ejemplo de FORMA — precios reales SIEMPRE del catálogo" (resuelve la contradicción $89K vs $242K).

### 9. Panel reorganizado (hub Daniela, 10 tabs)
`Estado · Personalidad · Objetivos · Entrenamiento · Conocimiento · Playbook · Guiones · Escalamiento · Media · Ajustes`

---

## Verificación
- **395/395 tests verdes** (38 tests nuevos: bloques del prompt, objetivos, parser de conversaciones, entrenamiento, settings extendidos, pausa global en webhook).
- `tsc --noEmit` limpio en código de producción.
- `next build` (Next 16) exitoso.

---

## 🧑‍💼 Para activar TODO (pasos del CEO — sin código)

1. **Correr en Supabase (SQL Editor), EN ORDEN**: migraciones `008` → `009` → `010` → `011` → `012`. Todas son idempotentes (re-correrlas no daña nada).
2. Deploy a Vercel (push del repo).
3. Entrar a `/panel/daniela` → tab **Estado** y verificar que el interruptor global responde.
4. Probar el tab **Entrenamiento** pegando una conversación real.
5. (Pendientes previos que siguen vivos: Fluid Compute/plan Pro en Vercel, plantillas HSM en la WABA, rotar las 6 llaves expuestas, PDF de Portacelli a URL pública.)

> Nota Vercel: hay 3 crons configurados — el plan Hobby permite máx. 2 y sin precisión de horario. Con Pro corren como están; en Hobby, los botones "Ejecutar ahora" del tab Estado cubren el hueco manualmente.

---

## Qué queda para el 10/10 (no bloqueante, siguiente sprint)
- Validador post-generación en código (frases prohibidas / largo máximo forzado, no solo pedido en prompt).
- Histéresis de stages (hot→cold solo con señal explícita).
- Golden conversations en CI + Sentry (observabilidad externa).
- Señal de resultado en aprendizajes (atar cada patrón a si el lead avanzó → reforzar lo que convierte).
