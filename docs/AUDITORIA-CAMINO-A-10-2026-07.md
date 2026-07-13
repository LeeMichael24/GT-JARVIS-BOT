# Auditoría — Camino a 10/10 y Go-Live con número real

**Fecha:** 12 julio 2026 · **Quinta auditoría** — la más profunda. Método: **4 auditorías en paralelo sobre el código ACTUAL** (pipeline+WhatsApp · cerebro/respuestas/stages/aprendizaje · configurabilidad del panel · catálogo/datos/media+higiene), + suite de tests (**311/311 verdes**) + 2 hallazgos directos (CI de calidad y observabilidad).

A diferencia de la auditoría del 8-jul (que midió *comportamiento* y dio 8.4/10), esta miró **debajo del capó, línea por línea**, y encontró bugs de correctitud reales que el número de prueba no expone pero un número en vivo sí.

---

## Veredicto

| Escenario | Nota | Lectura |
|-----------|------|---------|
| **Go-live controlado** (vos probando, sin anunciar) | **8/10** | Listo tras 3 arreglos rápidos + correr migraciones |
| **Producción abierta** (ads, tráfico real, sin supervisión) | **7/10 hoy** | Hay P0/P1 de correctitud que hay que cerrar primero |

**El cimiento es real y bueno.** El prompt/personalidad es de primer nivel, los tests están verdes, la degradación es segura (nada crashea), y la arquitectura modular está bien pensada. Lo que falta para el 10/10 **no es rehacer nada** — es cerrar ~15 fugas concretas, casi todas de código (las arreglo yo) y unas pocas de infraestructura (las hacés vos).

### Puntuación por área

| Área | Nota | Techo del gap |
|------|------|---------------|
| Respuestas / personalidad | **8/10** | Las reglas de estilo son solo del prompt; el modelo puede ignorarlas bajo carga. Falta validador en código. |
| Lógica de stages | **5/10** | El stage lo decide el modelo **sin validación en runtime** → puede corromper el CRM. |
| Aprendizaje autónomo | **6/10** | El loop **no se cierra solo**: lo que Daniela aprende no llega a las respuestas sin que un humano lo apruebe. |
| Pipeline / WhatsApp | **6.5/10** | Riesgo de corte por timeout + carrera de doble-respuesta + respuesta perdida si falla el envío. |
| Catálogo / datos / media | **6.5/10** | Sin timeout en el fetch del catálogo, RLS faltante en 2 tablas, privacidad no forzada en la BD. |
| Configurabilidad del panel | **7/10** | El 80% del contenido es editable en vivo; faltan ~10 constantes por sacar del código. |
| Observabilidad | **4/10** | Cero alertas externas (sin Sentry). Un fallo a las 2am lo descubre un cliente. |
| CI de calidad | **3/10** | No hay "golden conversations" — un cambio de prompt puede degradar a Daniela y nada lo atrapa. |

---

## Lo que YA es sólido (no tocar)

- **Prompt de primer nivel** — "reacciona primero, informa después", familia de frases prohibidas de call-center, no repetir aperturas, espejeo de energía/longitud, psicología de precio LatAm ("el cliente compra PAGOS, no precios"), disciplina de emojis, honestidad de media (no puede ofrecer un PDF que no existe). Diseño top-decil.
- **Manejo del `{}` de GPT** — parse falla → reintento con corrección → 3 fallbacks humanos variados, con el mensaje del cliente ya guardado. Grado producción.
- **HMAC correcto y timing-safe** (`webhook.ts:81-88`), firma inválida → 401, sin fail-open.
- **Dedup a nivel de almacenamiento** — índice único en `wa_message_id` (`schema.sql:31-33`).
- **Crons fail-closed** — sin `CRON_SECRET`, 401. Nada abierto.
- **Degradación segura en todo** — GT API caída → Daniela pregunta en vez de inventar; tabla sin migrar → defaults; ningún camino crashea.
- **Memoria de deals** re-entra cada turno y advierte al modelo que el historial son inferencias, no hechos.
- **Auth del panel sólida** — cada acción mutante valida `requireAdmin()`/`requireMember()` en el servidor, no por ocultar botones.
- **Sin secretos commiteados** — `.env*` en `.gitignore`.

---

## 🔴 Bloqueadores de go-live (arreglar antes del número real)

Ordenados por cuánto duelen con un cliente real enfrente.

### 1. Timeout de Vercel puede CORTAR el pipeline y dejar al cliente en visto — sin reintento
`route.ts:36` pone `maxDuration = 60`, pero **eso solo aplica con Fluid Compute o plan Pro.** En Hobby clásico el tope es **10s**. El camino crítico antes de la primera respuesta es: debounce (hasta 8s) + ~10 idas a la BD + GPT (hasta 30s) + tipeo (2.6s). Si el tope real es 10s, la función muere a media ejecución — pero el "visto azul" ya se mandó y Meta ya recibió su 200, así que **el cliente queda en visto, sin respuesta y sin que Meta reintente = mensaje perdido.**
→ **Fix (vos + yo):** verificar en Vercel que Fluid Compute está encendido (o subir a Pro), y hacer una prueba de carga con ráfaga de mensajes antes de apuntar al número real. Es el riesgo #1.

### 2. Entrega duplicada del webhook → Daniela responde DOS veces
Meta reintenta webhooks. El dedup tiene una carrera (TOCTOU): `isMessageProcessed` (`route.ts:111`) y el insert (`route.ts:150`) están a ~2 idas de BD de distancia, así que dos entregas casi simultáneas del mismo `wa_message_id` **ambas pasan el chequeo**; el perdedor choca con el índice único pero el error se ignora en silencio y **continúa igual** → dos llamadas a GPT, dos mensajes al cliente.
→ **Fix (yo):** que `saveConversation` devuelva si fue insert nuevo o duplicado, y cortar el procesamiento cuando fue duplicado.

### 3. Si el envío falla (429/red), la respuesta se PIERDE para siempre
Sabemos que hay 429s (límite de 30K tokens/min). Si `sendText` falla tras sus 3 reintentos, se loguea, `waMessageId` queda null, **pero la respuesta se guarda igual** (`route.ts:511-518`). El cliente no recibió nada, pero el sistema cree que ese turno ya fue contestado → la respuesta no enviada se pierde sin reintento.
→ **Fix (yo):** cuando el envío falla, NO guardar la fila del asistente (o marcarla como no entregada) para que la ráfaga siga abierta.

### 4. Stage y calificación se guardan SIN validación → corrupción silenciosa del CRM
`client.ts:68,71` aceptan **cualquier** string que devuelva el modelo como `stage`/`qualification_data` (a diferencia de `agent_action`/`urgency`, que sí están en whitelist). Un `stage:"qualified"` o `purpose:"casa"` inventado se escribe directo a la BD y rompe el scoring (`lead-scoring.ts:59`) y el ruteo de secuencias.
→ **Fix (yo):** whitelist de stage `['new','warm','hot','cold']` (fallback al stage anterior, no a 'new') + validar cada campo de `qualification_data` contra su enum.

### 5. Sin validación de variables de entorno al arrancar
Si falta `WA_APP_SECRET` → 500 en cada mensaje entrante. Si falta `SUPABASE_*` → cada consulta truena → cliente en visto. Ninguna falla *abierta* (sin bypass de seguridad), pero todas **dejan al cliente colgado** y solo te enterás cuando ya pasó.
→ **Fix (yo):** validar el set de envs requeridas al boot y en `/api/health`; bloquear go-live si falta alguna.

### 6. Sin timeout en el fetch del catálogo + una caída externa borra 6 fuentes internas
`gt-api.ts:22` hace `fetch` sin `AbortSignal` → un GT API colgado se come el presupuesto de la función y **el cliente no recibe nada** (peor que degradado). Además, `route.ts:228-238` mete `getAllProjects()` (externo) en el mismo `Promise.all` que playbook/cerebro/guiones/media/settings (internos) → si el fetch externo falla, **se caen los 6** aunque Supabase estuviera bien.
→ **Fix (yo):** `AbortSignal.timeout(5000)` en los fetches + `Promise.allSettled` (o sacar el externo a su propio try/catch) + servir caché viejo cuando el GT falle.

### 7. Plantillas HSM son obligatorias, pero hoy degradan en silencio
Fuera de la ventana de 24h son la **única** forma de contactar. Si `WA_TEMPLATE_FOLLOWUP` no está seteada, el cron **avanza el paso y lo salta** (la secuencia se quema sin contactar al lead); si falta `WA_TEMPLATE_CEO_ALERT`, una escalación fuera de ventana **truena y se pierde**.
→ **Fix (vos):** aprobar ambas plantillas `es` en la WABA real y setear ambas env vars antes del go-live (conteo de params: followup=2, ceo_alert=3).

---

## 🔵 Seguridad y privacidad (hallazgos)

- **RLS FALTANTE en `knowledge_base` (mig. 002) y `escalation_rules` (mig. 006).** Todas las demás tablas la tienen; estas dos no. Con la anon key pública en uso, **el playbook de ventas y las reglas de escalación son potencialmente legibles** vía PostgREST. → `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + policy `TO authenticated`. **(P1 seguridad — yo, en migración.)**
- **`daniela_visible` no se fuerza en ningún lado.** Tu requisito de privacidad (contenido solo-clientes que no debe llegar a prospectos) existe solo como *contrato con el endpoint externo*, no como columna ni filtro en la BD. Una fila mal etiquetada → Daniela manda material privado a un prospecto. → agregar `daniela_visible boolean DEFAULT false` a `project_media` y filtrar siempre. **(P1 privacidad — yo.)**
- **PII commiteada en un seed:** `scripts/seed-company-knowledge.ts:61` tiene hardcodeados "+503 7141 8717", el WhatsApp del CEO y el email. Es contenido semilla, pero es PII en el repo. → mover a env/placeholder.
- **Llaves a ROTAR** (expuestas antes en git): `WA_ACCESS_TOKEN`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WA_APP_SECRET`, `GT_API_SECRET`, `CRON_SECRET`. Pendiente tuyo, ya anotado.

---

## 🟡 Camino a 10/10 — por área

### Respuestas 8 → 10
- **Validador post-generación** en `parseClaudeResponse`: escanear `reply` + `extra_messages` por la familia de frases prohibidas y por markdown/viñetas; forzar el límite de 500 chars en **código** (hoy es solo del prompt); ante violación, un regen dirigido. Hoy cada regla de estilo es una sugerencia que el modelo puede ignorar bajo carga.
- **No-repetir-apertura en código**: trackear las últimas aperturas por lead e inyectar "ya abriste con X" para que sobreviva más allá de la ventana de 15 mensajes.
- Bajar `temperature` de 0.85 a ~0.6-0.7 y recuperar variedad con los datos de no-repetición → más estabilidad de formato sin sonar a libreto.

### Stages 5 → 10
- Whitelist + clamp (bloqueador #4) + **histéresis anti-degradación**: hoy un solo mensaje ambiguo puede tirar un lead de `hot` a `cold` y sacarlo del ranking proactivo — riesgo de ingreso real. Bloquear hot/warm→cold salvo señal explícita (`opt_out`, "no me interesa").
- **Cross-check de consistencia**: si `qualification_data` dice presupuesto-ok + plazo-inmediato + decisor pero el modelo devolvió `warm`, auto-subir a `hot` (y viceversa), para que el stage y las señales deterministas no se contradigan.
- Loguear cada transición con la evidencia que la disparó (auditable por vos).

### Análisis de interés → 10
- Validar cada campo de `qualification_data` en el parse.
- Convertir `buying_signals`/`objections` de texto libre a un **enum controlado** → se vuelven datos filtrables. (Las columnas `top_objections`/`top_projects_asked` ya existen en la mig. 005 y **nada las llena hoy** — quedaría un panel "top objeciones/señales de la semana" gratis.)
- Detección de proyecto más allá de keywords: honrar también el interés detectado por el modelo, para que menciones implícitas o con typo igual etiqueten.

### Aprendizaje 6 → 10 (tu "aprende sola")
- **Cerrar el loop (bloqueador de producto):** hoy ambos caminos escriben a `confidence 0.5`, pero el prompt solo jala aprendizajes con `≥0.7` → **nada de lo que Daniela aprende sola llega a sus respuestas** hasta que vos lo subís a mano en el panel. Solución: auto-promover un aprendizaje cuando **N reflexiones convergen** en el mismo tema, o una bandeja "candidatos" con promover-en-1-click. Sin esto, la reflexión nocturna llena una cola que nadie mira.
- **Dedup** de `brain_observations` (hoy es `insert` plano sin restricción → con sensibilidad "alta" se acumulan miles de casi-duplicados a 0.5).
- Reflexión a `temperature ~0.3` (hoy corre a 0.85, alto para una tarea de extracción → invita a alucinar "aprendizajes").
- **Señal de resultado**: atar cada aprendizaje a si el lead avanzó/agendó → el sistema refuerza lo que *convierte*, no lo meramente "interesante". Esa es la diferencia entre loguear observaciones y **aprender a vender mejor**.

### Configurabilidad 7 → 10 ("todo desde el panel")
- **Correr migración 009** (y 008) — hoy el tab Ajustes está inerte hasta eso.
- **Subir ~10 constantes a `agent_settings`** (cada una tiene un solo punto de consumo, es mecánico): `escalation_phone` y `ceo_name` (hoy hardcodeados — cambiar de closer necesita dev), umbrales de escalación ($300k / 3+ unidades, hoy duplican el tab Escalamiento), largo de respuesta, `temperature`, `debounce`, umbral de renta ($30k).
- **Horario de atención** (no existe): Daniela responde 24/7 idéntico; falta un modo fuera-de-horario.
- **Precios del catálogo, no del prompt** (ver abajo).
- Rieles UX: dropdown de proyectos reales para la clave de Media (hoy es texto libre invisible — un typo y nunca hace match), medidor de presupuesto del playbook, y un guard de admin en `/panel/daniela`.

### Datos / catálogo / media 6.5 → 10
- Timeout + `allSettled` + caché viejo (bloqueador #6).
- **Detección de proyecto precisa**: hoy matchea cualquier palabra del nombre ≥4 letras → "busco una **casa**" puede matchear "Casa Club El Encanto" y pegarse el guion equivocado toda la conversación. Exigir nombre completo/slug o solape de ≥2 palabras.
- Forzar `daniela_visible` en la capa de datos (privacidad).
- Validar **tamaño** de media al sincronizar (los límites de WhatsApp están documentados pero no se aplican → un asset gigante falla en silencio al enviar).

### Precios hardcodeados e INCONSISTENTES (lo cazaron 2 agentes)
`prompts.ts:295-303` hornea precios fijos ("Portacelli Alta $242k-$265k", etc.) que **quedan aunque el catálogo en vivo esté caído** → riesgo de cotización vieja. Peor: **se contradicen** — los ejemplos de `prompts.ts:254-258` dicen "Portacelli desde **$89K**" mientras la guía dice desde **$242k**. Daniela puede dar dos precios distintos del mismo proyecto. → derivar del catálogo o marcar como ilustrativo y reconciliar el $89K vs $242K. **(P1 — yo.)**

### Observabilidad 4 → 10 y CI de calidad 3 → 10 (nuevos)
- **Sentry** (o similar) — sin esto, un incidente en producción lo reporta un cliente, no una alerta.
- **Golden conversations en CI**: los 5 contextos de la v3 (inversionista/mamá/objeción/corporativo/molesta) como test permanente con umbrales → cada cambio de prompt se valida solo. Es el seguro que evita que "mejorar" a Daniela la rompa.
- **PII fuera de los logs**: hoy se loguea contenido de notas de voz, respuesta cruda de GPT y teléfono del cliente. Para una firma que guarda datos financieros, truncar/scrubbing.

---

## El cron (tu punto) — ✅ ya documentado

Reforzado en `ARQUITECTURA-Y-SETUP.md §7`. La nota ahora dice explícito:
- **En Hobby los crons corren 1 vez al día** → Daniela **espera todo un día** para analizar conversaciones y aprender, y un seguimiento sale al día siguiente, no a las horas.
- **Para acelerar → Vercel Pro** (`0 */6 * * *` = aprende 4× más rápido; secuencias cada hora) **o pinger gratis** (cron-job.org con `Bearer $CRON_SECRET`, ya protegido).
- Se mantiene la advertencia de la trampa de deploy (expresión sub-diaria en Hobby = rechazo silencioso de deploys).

---

## Plan de acción priorizado

### 🔧 Sprint 1 — Bloqueadores de go-live (código, lo hago yo)
1. Anti doble-respuesta (dedup a nivel de procesamiento).
2. No perder la respuesta cuando el envío falla.
3. Whitelist + clamp de stage/qualification.
4. Timeout + `allSettled` + caché viejo en el catálogo.
5. Validación de envs al boot + `/api/health` completo.
6. RLS en `knowledge_base` y `escalation_rules` (migración).

### 🔧 Sprint 2 — Camino a 10/10 (código, lo hago yo)
7. Cerrar el loop de aprendizaje (auto-promoción) + dedup + temp 0.3.
8. Validador post-generación de respuestas + histéresis de stage.
9. Precios del catálogo (des-hardcodear) + reconciliar $89K/$242K.
10. Subir ~10 constantes a `agent_settings` + `daniela_visible` + detección de proyecto precisa.
11. Golden conversations en CI + Sentry.

### 🧑‍💼 Solo vos (infra / Meta / cuentas)
- **Verificar Fluid Compute en Vercel** (o subir a Pro) + prueba de carga — bloqueador #1.
- **Correr migraciones 008 + 009** (+ las nuevas que escriba) en Supabase.
- **Env vars en Vercel Producción**: `WA_TEMPLATE_FOLLOWUP`, `WA_TEMPLATE_CEO_ALERT`, y todas las del número real.
- **Meta**: aprobar plantillas HSM en la WABA real, publicar la app en Live, suscribir el webhook, método de pago.
- **PDF del brochure Portacelli** a URL pública.
- **Rotar las 6 llaves** expuestas.

---

## Anexo — dónde mirar
Pipeline `app/api/webhook/whatsapp/route.ts` · WhatsApp `services/whatsapp/client.ts` · HMAC `services/whatsapp/webhook.ts` · cerebro `services/claude/{prompts,client}.ts` · aprendizaje `lib/reflection.ts` + `lib/agent-brain.ts` · catálogo `services/projects/gt-api.ts` + `services/projects/cache.ts` · media `lib/project-media.ts` + `lib/media-sync.ts` · panel `app/panel/actions.ts` + `components/panel/*` · settings `lib/agent-settings.ts` · migraciones `migrations/002-009` + `database/schema.sql`.
