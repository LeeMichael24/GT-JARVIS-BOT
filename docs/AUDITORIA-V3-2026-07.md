# Auditoría V3 — Estado del sistema y camino a software global
**Fecha:** 4 julio 2026 · Tercera auditoría (v1 técnica 29-jun: 7.2/10 · v2 producto 3-jul · v3 = estado post-sprint + visión global)

---

## 1. Dónde estamos HOY — nota global: **8.1/10** (era 7.2 hace 5 días)

| Área | v1 (29 jun) | HOY | Qué cambió |
|------|------------|-----|-----------|
| Confiabilidad del flujo | 6/10 | **8.5/10** | Race conditions, batches, timeout, auto-reintento GPT, fallback variado |
| Pipeline de deploys | ROTO | **9/10** | Causa raíz (cron Hobby) resuelta — push = deploy automático |
| Calidad de conversación | 7.5/10 | **8.5/10** | Personalidad viva validada por contexto (análisis abajo) |
| Cumplimiento WhatsApp 24h | 4/10 | **7/10** | Guardias + fallback plantilla listos; falta aprobación de Meta |
| Inteligencia de ventas | 4/10 | **6.5/10** | Scoring A/B/C, embudo, objeciones, reporte semanal |
| Presencia humana (seen/typing) | 0/10 | **9/10** | Visto azul + "escribiendo..." nativos en producción |
| Observabilidad | 3/10 | **4/10** | Logs útiles con finish_reason; falta Sentry/alertas |
| Customización sin código | 5/10 | **5/10** | Sin avance — siguiente frente |

## 2. Análisis de respuestas por contexto (pruebas en vivo, 4 jul)

| Contexto | Respuesta de Daniela | Veredicto |
|----------|---------------------|-----------|
| Inversionista directo con prisa | "¡Entiendo la urgencia!... te propongo análisis personalizado, ¿agendamos?" | ✅ 7.5 — espejea el ritmo, CTA claro |
| Mamá primera vivienda con miedo | "¡Qué emocionante!... entiendo que pueda dar miedo... ¿zona o presupuesto en mente?" | ✅ 8 — empatía real. ⚠️ usó "estoy aquí para guiarte" → blacklist ampliada a toda la familia "estoy aquí para..." |
| Objeción de precio | Defendió valor + alternativas + videollamada | ⚠️ 7 — empezó con "aunque..." (defensivo) → nueva regla: validar emoción PRIMERO, luego reencuadrar |
| Corporativo formal | — | ❌ 429 rate limit de OpenAI (ver riesgo R1) |
| Cliente molesta por espera | "Lamento mucho la espera, Marta. Déjame agilizarlo para ti..." | ✅ 9 — disculpa + acción concreta, cero libreto |

**Bug cazado y resuelto en esta sesión**: GPT-4o devolvía `{}` (JSON vacío) ocasionalmente con prompts grandes → el cliente veía el mensaje de emergencia. Ahora: auto-reintento con corrección explícita antes del fallback, max_tokens 1024→2048, temperature 0.85, log de finish_reason, y 3 fallbacks rotativos.

## 3. Riesgos nuevos detectados

- **R1 — Límite de OpenAI: 30,000 tokens/min (org).** Con prompts de ~5K tokens = ~6 respuestas/min en ráfaga. Un ad viral = 429s en cadena. Mitigar: (a) pedir upgrade de tier a OpenAI (automático con uso/pago), (b) recortar catálogo del prompt a proyectos relevantes al mensaje, (c) colas con reintento.
- **R2 — Consistencia de escalación bajo estrés**: cuando el modelo se degrada (429/reintento), verificar que escalate_ceo no se pierda. Cubierto parcialmente por reglas de escalación (matching por keyword pre-GPT).
- **R3 — Plantillas Meta aún en review** — los seguimientos fuera de 24h siguen en espera de eso.

## 4. Rumbo "software global y personalizable" — los 5 frentes

1. **Multi-idioma (el más barato de los globales)**: El Salvador recibe inversionistas gringos y de la diáspora. Regla de prompt: detectar idioma del cliente y responder igual (inglés/español). 1 día de trabajo, abre mercado de remesas/expats.
2. **Persona Builder en panel**: nombre del agente, tono (formal↔cercano), emojis on/off, presentación — por tenant. Es la base del "full customizable".
3. **Media library + playbook editor en DB** (ya en roadmap v2 — sigue pendiente): cero deploys para contenido.
4. **Multi-tenant**: tabla `tenants` + scoping por tenant_id en todas las tablas + un número WhatsApp por tenant. Es el paso que convierte a Daniela en producto vendible ($300-600/mes por inmobiliaria, debajo de los $850+ gringos).
5. **Golden conversations en CI**: la suite de contextos de hoy (inversionista/mamá/objeción/corporativo/molesta) convertida en test permanente con umbrales — cada cambio de prompt se valida solo.

## 5. Qué copiar del mercado (delta v3)

| De quién | Qué | Por qué ahora |
|----------|-----|---------------|
| Intercom Fin | Métrica de "resolución": % conversaciones resueltas sin humano | Ya tenemos los datos (escalaciones vs total) |
| Sierra AI | Pricing por outcomes (por conversación resuelta) — no por asiento | Modelo de venta para el SaaS |
| Gong | "Deal warnings": alertas cuando un deal A lleva >48h sin seguimiento | Scoring ya existe; falta el trigger |
| HubSpot Breeze | El agente sugiere y el humano aprueba con 1 click (draft mode) | Para corporativos que no confían aún en full-auto |

## 6. Próximos 30 días (v3)

1. ⬜ Aprobar plantillas Meta → activar `WA_TEMPLATE_FOLLOWUP` (bloqueado por Meta)
2. ⬜ Detección de idioma + respuesta bilingüe (1 día)
3. ⬜ Golden conversations en CI (los 5 contextos de hoy, automatizados)
4. ⬜ Alerta "deal A abandonado >48h" al CEO
5. ⬜ Sentry + alerta de errores
6. ⬜ Media library en Supabase + editor panel
7. ⬜ Recorte inteligente de catálogo en prompt (mitiga R1 y baja costo/mensaje)
8. ⬜ Decisión multi-tenant: ¿vendemos Daniela-as-a-Service? → diseño de tenants
