# Guía Maestra — Cómo crear un Bot SDR de WhatsApp (lecciones de Daniela)

> Bitácora viva del proyecto GT-JARVIS (Daniela). Documenta la arquitectura, el paso a paso
> para levantar un bot nuevo desde cero, y TODOS los problemas reales que nos topamos con su
> solución — para que el próximo bot se construya en días y no en semanas.
> Última actualización: 3 julio 2026

---

## 1. Stack probado

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Hosting | Vercel (serverless + crons) | Deploy por git push, webhooks con `waitUntil` |
| Framework | Next.js (App Router) | API routes + panel CRM en un solo repo |
| Base de datos | Supabase (Postgres + Auth + RLS) | Auth del panel incluida, service role para el bot |
| IA | OpenAI GPT-4o (JSON mode) | Respuesta estructurada: reply + acciones + memoria |
| Mensajería | WhatsApp Cloud API (Meta) | Oficial, plantillas HSM, typing indicator |
| Transcripción | OpenAI Whisper | Notas de voz → texto |
| Calendario | Google Calendar API | Agendar citas automáticas |

## 2. Mapa del sistema

```
WhatsApp → webhook (verifica firma) → parse TODOS los mensajes del batch
  → dedup (unique wa_message_id) → upsert lead → guardar mensaje
  → pausar secuencias → ¿bot activo? → debounce adaptativo (2-10s)
  → ¿soy el último del burst? → typing indicator ON
  → contexto: catálogo vivo + playbook + cerebro + reglas escalación + memoria del deal
  → GPT-4o (JSON) → acciones (escalar/agendar/secuencia/media) → enviar reply
  → guardar respuesta + observaciones del cerebro
```

**Fuentes de conocimiento del agente (5):**
1. **Catálogo vivo** — API del sitio web (cache 1h). Todo lo publicado, el bot lo sabe.
2. **Playbook** (`knowledge_base`) — pitches, objeciones, técnicas. Seed por SQL.
3. **Cerebro** (`agent_brain`) — conocimiento profundo + aprendizajes. Editable desde el panel.
4. **Reglas de escalación** (`escalation_rules`) — triggers que fuerzan escalar. Panel.
5. **Memoria del deal** (`deal_summaries`) — resumen por cliente, lo escribe GPT solo.

## 3. Checklist para lanzar un bot nuevo (en orden)

### Fase A — Meta / WhatsApp (1-2 días por aprobaciones)
1. Crear app en `developers.facebook.com` → tipo Business → agregar producto **WhatsApp**
2. Conseguir: `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN` (token PERMANENTE de system user en Business Settings, NO el temporal de 24h), `WA_APP_SECRET` (App Settings → Basic)
3. Inventar un `WA_WEBHOOK_VERIFY_TOKEN` (string aleatorio propio)
4. **Plantillas HSM** — crearlas el DÍA 1 (la aprobación tarda hasta 48h):
   - URL directa: `https://business.facebook.com/wa/manage/message-templates/?business_id=<BUSINESS_ID>`
   - Ruta manual: business.facebook.com → WhatsApp Manager → Account tools → Message templates
   - Mínimo 2 plantillas:
     - `alerta_lead_hot` (Utility): "🚨 Alerta de Daniela: el cliente {{1}} ({{2}}) requiere tu atención inmediata. Motivo: {{3}}. Abre el panel para ver la conversación."
     - `seguimiento_interes` (Marketing): "Hola {{1}}, soy Daniela de Grupo Terranova 😊 Quedamos pendientes sobre {{2}}. ¿Te comparto más detalles?" + botones quick reply
5. Configurar webhook: URL `https://<dominio>/api/webhook/whatsapp`, suscribirse a `messages`

### Fase B — Supabase
1. Crear proyecto → guardar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. Correr TODAS las migraciones de `migrations/` en el SQL Editor **en orden**
3. Verificar RLS: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';` — TODO debe estar en `true`
4. Crear el primer admin en `team_members` + usuario en Auth

### Fase C — Vercel
1. Importar el repo de GitHub (Connect Git Repository)
2. Cargar TODAS las env vars (tabla en sección 4)
3. Verificar `vercel.json`: maxDuration 60 en webhook y cron, crons configurados
4. `CRON_SECRET`: string aleatorio, mismo valor en env var
5. **Verificar que el deploy automático funciona**: push de prueba → debe aparecer deployment nuevo con hash de commit (NO "Redeploy of...")

### Fase D — Pruebas antes de salir a la luz
1. `/api/health` responde `healthy`
2. Mensaje de texto real → visto azul + "escribiendo..." + respuesta
3. Nota de voz → transcribe y responde
4. Frase con keyword de escalación ("precio final") → alerta llega al CEO
5. Stress test: 2 mensajes rápidos de número nuevo (race), mensaje larguísimo (cards)
6. Panel: inbox, kanban desktop Y mobile, chat, ficha

## 4. Catálogo de variables de entorno

| Variable | Para qué | De dónde sale |
|----------|----------|---------------|
| `WA_ACCESS_TOKEN` | Enviar mensajes | Meta Business Settings → System users (permanente) |
| `WA_PHONE_NUMBER_ID` | Número emisor | App → WhatsApp → API Setup |
| `WA_APP_SECRET` | Verificar firma del webhook | App Settings → Basic |
| `WA_WEBHOOK_VERIFY_TOKEN` | Handshake del webhook | Lo inventas tú |
| `WA_TEMPLATE_CEO_ALERT` | Plantilla de alertas al CEO | Nombre de la plantilla aprobada |
| `CEO_PHONE_NUMBER` | Destino de alertas internas | El número del jefe (con código de país) |
| `OPENAI_API_KEY` | GPT-4o + Whisper | platform.openai.com |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | DB del bot (server-only) | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth del panel (browser) | Ídem |
| `GT_API_URL` / `GT_API_SECRET` | Catálogo vivo de propiedades | Backend del sitio web (¡URL del BACKEND, no del frontend!) |
| `CRON_SECRET` | Proteger endpoints de cron | Lo inventas tú |
| `GOOGLE_*` | Calendar | Google Cloud Console |

**REGLA DE ORO**: `.gitignore` con `.env*` SIN excepciones. Ni siquiera `.env.example` con valores reales.

## 5. URLs que siempre buscamos y nunca encontramos

| Qué | URL |
|-----|-----|
| Plantillas de mensajes (crear/ver estado) | `https://business.facebook.com/wa/manage/message-templates/?business_id=<BUSINESS_ID>` |
| App de desarrolladores (webhook, tokens) | `https://developers.facebook.com/apps/<APP_ID>/` |
| WhatsApp Manager (números, límites) | `https://business.facebook.com/wa/manage/` |
| Supabase SQL Editor | `https://supabase.com/dashboard/project/<REF>/sql/new` |
| Vercel deployments | `https://vercel.com/<team>/<proyecto>/deployments` |
| Vercel env vars | `https://vercel.com/<team>/<proyecto>/settings/environment-variables` |

## 6. Bitácora de problemas reales y sus soluciones

### Infraestructura y deploy

**P1. "No veo los cambios en producción" — 3 semanas de deploys rechazados EN SILENCIO (el más caro de todos)**
- *Síntoma*: pusheábamos a main y producción seguía igual. Ni el push, ni "Create Deployment", ni un Deploy Hook generaban builds. Todo parecía "conectado".
- *Causa REAL*: `vercel.json` tenía un cron `0 */2 * * *` (cada 2 horas). **El plan Hobby de Vercel solo permite crons de 1 vez al día** — cualquier expresión más frecuente hace que el deployment sea RECHAZADO en validación, sin build visible ni error en el dashboard. Cada push desde que se agregó ese cron fue rechazado en silencio; los "Redeploy" solo reconstruían el último build bueno (viejo).
- *Pistas falsas que perseguimos*: reconectar GitHub↔Vercel (no era eso), webhooks del repo (no era eso), permisos de la app (no era eso).
- *Fix*: todos los crons a frecuencia diaria o menor en Hobby (`30 15 * * *`). Para cadencia mayor: (a) plan Pro, o (b) pinger externo gratis (cron-job.org) llamando al endpoint con `Authorization: Bearer $CRON_SECRET`.
- *Prevención*: tras CADA push, verificar que Deployments muestra un build con el HASH nuevo. Si un deploy "no aparece", buscar el error de validación: en Hobby los límites son crons diarios y 60s de maxDuration.

**P2. GitHub Push Protection bloquea el push**
- *Síntoma*: `git push` rechazado por "secret detected".
- *Causa*: credenciales reales en `.env.example` en el historial de commits.
- *Fix*: squash de commits + force push con historial limpio; `.gitignore` con `.env*` total.
- *Prevención*: nunca poner valores reales en ejemplos; rotar toda llave que haya tocado un commit.

**P3. `waitUntil` no ejecuta en dev (Turbopack)**
- *Síntoma*: webhook responde 200 pero el bot nunca procesa en localhost.
- *Fix*: `if (NODE_ENV === 'development') await processMessage(...)` — sync en dev, `waitUntil` solo en prod.

**P4. Puerto 3000 ocupado / `npx run dev`**
- `npx run dev` instala un paquete ajeno — es `npm run dev`. Puerto ocupado: `lsof -ti:3000 | xargs kill`.

**P5. Migraciones: no existe `exec_sql` por REST**
- *Síntoma*: intentar correr SQL vía supabase-js falla (PGRST202).
- *Fix*: las migraciones DDL se corren en el SQL Editor del dashboard (o psql con connection string). El SDK solo hace CRUD.
- *Bonus*: cuidado con el drift — verificar índices en vivo vs migraciones.

### WhatsApp / Meta

**P6. Los seguimientos automáticos nunca llegan (ventana de 24h)**
- *Síntoma*: cron de secuencias "envía" pero el cliente no recibe nada. Error 131047.
- *Causa*: Meta solo permite texto libre dentro de 24h del último mensaje DEL CLIENTE.
- *Fix*: plantillas HSM aprobadas + `sendTemplate()` fuera de ventana; guardia `isWithin24h` ANTES de gastar la llamada GPT.

**P7. Alertas al CEO se pierden (misma ventana)**
- *Causa*: si el CEO no le escribió al bot en 24h, el aviso de "LEAD HOT" es rechazado.
- *Fix*: fallback automático a plantilla `alerta_lead_hot` (env `WA_TEMPLATE_CEO_ALERT`). El destinatario NO lo decide Meta — va en el campo `to` de cada llamada; nuestro código usa `CEO_PHONE_NUMBER`.

**P8. Visto azul y "escribiendo..." no se ven**
- *Causa 1*: errores del `markAsRead` tragados en silencio (sin log del status de Meta).
- *Causa 2*: API version vieja (v19, expirada) — el typing indicator requiere versión reciente.
- *Fix*: v23.0 + `typing_indicator: { type: 'text' }` en el endpoint de mark-as-read + loguear todo fallo. El typing se enciende DESPUÉS del debounce (solo cuando realmente vamos a responder).
- *Nota*: si el probador tiene "Confirmaciones de lectura" apagadas en su teléfono, no verá vistos.

**P9. Meta agrupa varios mensajes en UN webhook**
- *Síntoma*: bajo carga, mensajes ignorados sin rastro.
- *Causa*: el parser solo leía `entry[0].changes[0].value.messages[0]`.
- *Fix*: iterar TODOS los entries × changes × messages.

**P10. Retries de envío matan el flujo completo**
- *Síntoma*: el bot dejó de responder a TODOS tras un stress test con números falsos.
- *Causa*: `sendText` reintenta 3x y lanza; el throw mataba el resto del procesamiento (guardar respuesta, log de actividad).
- *Fix*: try/catch alrededor de cada envío; guardar la respuesta aunque el envío falle; logs independientes de las notificaciones.

### Agente / IA

**P11. Catálogo vacío en silencio (projects=[])**
- *Causa*: `GT_API_URL` apuntaba al FRONTEND del sitio en vez del BACKEND API.
- *Fix*: URL correcta + log del conteo de proyectos al arrancar.

**P12. GPT dice "te conecto con el CEO" pero no escala**
- *Causa*: el modelo escribía la reply correcta pero elegía `type: "sell"`.
- *Fix*: triggers explícitos en el prompt + regla literal: "si tu reply menciona al CEO pero tu type es sell, es un ERROR".

**P13. El bot promete PDFs que no existen**
- *Causa*: el prompt decía "ofrece la ficha" pero el catálogo de media estaba vacío → promesa rota al cliente.
- *Fix*: prompt media-aware — solo ofrece documentos de proyectos que REALMENTE los tienen configurados.

**P14. GPT falla y el cliente queda en visto**
- *Fix*: fallback "Dame un momento, estoy confirmando ese detalle y ya te escribo 🙌" + timeout de 30s en OpenAI + 1 retry.

**P15. Respuestas tipo catálogo (bloques de 800 caracteres)**
- *Fix*: prompt estilo WhatsApp: 2-3 líneas, máx 5; anti-patrones (sin bullets, sin listas, sin volcar el catálogo); igualar la energía del cliente; límite 500 chars.

### Datos / concurrencia

**P16. Lead nuevo manda 2 mensajes rápidos → el 2° muere**
- *Causa*: SELECT→INSERT sin manejar la colisión del unique en `phone`.
- *Fix*: capturar el 23505 y re-leer la fila ganadora.

**P17. Mensajes duplicados de Meta**
- *Fix*: unique index en `wa_message_id` + ignorar violación al insertar. El dedup vive en la DB, no en memoria (serverless = sin estado).

### Panel / UI

**P18. Cards que crecen con el largo del mensaje**
- *Fix*: alturas fijas (inbox `h-[80px]`, kanban `h-[140px]`) + `ExpandableText` (límite de caracteres uniforme con "Ver más") en chat, notas, cerebro. Mismo largo en desktop y mobile.

**P19. Datos personales en tests**
- *Síntoma*: número real del CEO en un test a punto de subir a GitHub.
- *Fix*: SIEMPRE números/datos falsos en tests y ejemplos.

## 7. Operación diaria (ajustar al agente sin deploy)

| Quiero... | Dónde |
|-----------|-------|
| Enseñarle algo nuevo / prioridades del mes | Panel → Daniela → Conocimiento (entrada tipo "Patrón", confianza alta) |
| Que escale si mencionan X | Panel → Daniela → Escalamiento |
| Ver qué documentos puede enviar | Panel → Daniela → Media |
| Pausarla en un chat | Chat → botón pausa (takeover humano) |
| Nuevas propiedades | Publicar en el sitio web — las toma solo (cache 1h) |

## 8. Deuda pendiente conocida (julio 2026)

- [ ] Conectar `sendTemplate` al cron de secuencias cuando las plantillas de seguimiento estén aprobadas
- [ ] Llenar `lib/project-media.ts` con URLs reales de brochures (→ luego migrar a tabla editable)
- [ ] Sentry + alertas de errores (hoy: solo logs de Vercel)
- [ ] Procesar webhooks de `statuses` (mensajes fallidos visibles en panel)
- [ ] Rotar llaves expuestas en historial git viejo (si no se hizo)
- [ ] Test de carga (50 conversaciones simultáneas)
- [ ] Multi-tenancy si el bot se vende como producto (cada empresa: su número, su catálogo, su panel)
