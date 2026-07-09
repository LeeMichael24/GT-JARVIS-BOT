# Manual de Operación y Go-Live — Daniela / Meta WhatsApp

Manual completo para operar Daniela, mantenerla segura, agregar números de prueba para socios, y hacer el paso a producción con el número oficial cuando lleguen los leads reales. Última actualización: 7 julio 2026.

---

## 0. Identificadores del sistema (para tenerlos a mano)

| Qué | Valor |
|-----|-------|
| App de Meta | `GT-JARVIS` · App ID `830567833077990` |
| Business ID | `1269675754231381` |
| **Cuenta WhatsApp de PRUEBA** (WABA) | `2250586295770563` — número +1 555-651-3045 |
| **Cuenta WhatsApp REAL** (WABA) | `1314044236741483` — número **+503 7141 8717** (Grupo Terranova) |
| Bot corre hoy sobre | Número de PRUEBA (`WA_PHONE_NUMBER_ID` = `1071614939376823`) |
| Proyecto Vercel | `gt-jarvis-bot-qrro` |
| Proyecto Supabase | `hpszcxekqymxmjokjcdo` |

> El número del CEO que recibe las alertas se guarda en la variable `CEO_PHONE_NUMBER` (Vercel). Hoy = tu número personal.

---

## 1. 🗺️ Dónde se modifica CADA cosa (el mapa maestro)

Esta es la respuesta a "¿dónde cambio esto?". Cada ajuste vive en un solo lugar:

| Quiero cambiar… | Dónde | Cómo | Requiere |
|-----------------|-------|------|----------|
| **Ver / crear plantillas** | WhatsApp Manager → Message templates | `business.facebook.com/wa/manage/message-templates/?business_id=1269675754231381` | — |
| **Contenido de una plantilla** | Ídem (botón Edit) | Editar el texto | ⚠️ Re-aprobación de Meta (24-48h) |
| **Qué plantilla usa el bot** | Vercel → Environment Variables | `WA_TEMPLATE_CEO_ALERT`, `WA_TEMPLATE_FOLLOWUP` | Redeploy |
| **A qué número llegan las alertas del CEO** | Vercel → Environment Variables | `CEO_PHONE_NUMBER` | Redeploy |
| **Desde qué número envía el bot** | Vercel → Environment Variables | `WA_PHONE_NUMBER_ID` | Redeploy |
| **Números de prueba autorizados** | Dev console → WhatsApp → API Setup | "Manage phone number list" | — |
| **Guiones por proyecto** | Panel de Daniela | `/panel/daniela` → tab **Guiones** | — (al instante) |
| **Conocimiento / cerebro** | Panel de Daniela | `/panel/daniela` → tab **Conocimiento** | — |
| **Reglas de escalamiento** | Panel de Daniela | `/panel/daniela` → tab **Escalamiento** | — |
| **Material (PDF/fotos/videos)** | Ecosistema Terranova (o SQL) | tabla `project_media` | Sync (ver brief) |
| **Esquema de base de datos** | Supabase SQL Editor | `supabase.com/dashboard/project/hpszcxekqymxmjokjcdo/sql/new` | — |
| **Cualquier variable / secreto** | Vercel → Environment Variables | `vercel.com/.../gt-jarvis-bot-qrro/settings/environment-variables` | Redeploy |

**Regla de oro:** la *lógica y el contenido editable en vivo* → el **panel**. La *conexión con Meta y los secretos* → **Vercel**. Las *plantillas* → **WhatsApp Manager**. La *base de datos* → **Supabase**.

---

## 2. 🔒 Seguridad — cómo dejarlo "ultra seguro"

### 2.1 Secretos (lo más importante)
- **Nunca** se suben a git. El `.gitignore` excluye `.env*` sin excepción. (Tienes `.env` abierto en tu editor — ese archivo es local y NO se sube; ahí están las llaves reales.)
- Viven **solo** en dos lugares: tu `.env` local (desarrollo) y Vercel Environment Variables (producción).
- Si una llave alguna vez tocó un commit → **rotarla** (generar una nueva y reemplazar). Aplica a: `WA_ACCESS_TOKEN`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WA_APP_SECRET`, `GT_API_SECRET`, `CRON_SECRET`.

### 2.2 Los candados que ya están puestos en el código
| Candado | Qué protege |
|---------|-------------|
| Firma HMAC (`WA_APP_SECRET`) | Verifica que cada webhook venga de Meta — nadie puede inyectar mensajes falsos |
| `CRON_SECRET` | Protege los endpoints de cron (fail-closed: sin el secreto, 401) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo en el servidor, nunca llega al navegador |
| RLS (Row Level Security) | Activo en todas las tablas — el panel solo ve lo que su rol permite |
| Roles admin/asesor | Un asesor solo ve sus leads; solo admin edita guiones/config |
| `daniela_visible` (media) | Daniela solo envía material marcado público — nunca contenido de clientes registrados |
| Lista blanca (número de prueba) | En pruebas, solo números autorizados pueden chatear |

### 2.3 Buenas prácticas de contenido
- Las plantillas UTILITY (alertas internas) no llevan tono comercial → menos riesgo de rechazo/bloqueo.
- Nunca metas datos sensibles de clientes en el texto de una plantilla (van variables, no PII fija).
- El material que Daniela envía a prospectos = solo lo marcado `daniela_visible`. Los avances de obra privados y documentos de clientes quedan fuera.

---

## 3. 👥 Agregar números de prueba (para que los socios vean cómo funciona)

Mientras el bot está en el número de PRUEBA, solo pueden chatear con él los números en la lista blanca (máximo 5). Para que un socio lo pruebe:

1. Entra a **developers.facebook.com** → app **GT-JARVIS** → menú **WhatsApp** → **API Setup** (o "Step 1. Try it out").
2. En la sección **"Send a message from your test number"**, busca el campo **"Recipient"**.
3. Abre el dropdown → **"Manage phone number list"**.
4. **"Add phone number"** → escribe el número del socio con código de país (ej: `+503 7777 8888`).
5. A ese número le llega un **código de verificación por WhatsApp** — el socio lo confirma.
6. Listo: ese socio ya puede escribirle al bot de prueba (+1 555-651-3045) y ver a Daniela en acción.

> Repite hasta 5 números. **Importante:** para que las **alertas al CEO** lleguen en pruebas, el número de `CEO_PHONE_NUMBER` (+503 6208 7916) **también** debe estar en esta lista. Hoy la lista tiene tu +503 7141 8717 — agrega el del CEO si quieres probar el escalamiento completo.

**Enlace directo del número de prueba y la lista:**
`developers.facebook.com/apps/830567833077990/whatsapp-business/wa-dev-console/`

---

## 4. 🚀 MANUAL DE GO-LIVE — pasar al número oficial +503 7141 8717

Cuando decidas que Daniela atienda con el número real y empiecen a llegar leads de verdad. **Lee todo antes de empezar** — es irreversible en el sentido de que clientes reales empezarán a escribir.

### 4.1 Diferencia clave: en producción NO hay lista blanca
En el número de prueba solo 5 autorizados pueden escribir. En el **número real, CUALQUIER persona** que le escriba al +503 7141 8717 hablará con Daniela. Por eso el go-live es el momento en que Daniela sale "a la luz".

### 4.2 Estado actual de la cuenta real (verificado hoy)
| Requisito | Estado | Acción |
|-----------|--------|--------|
| Número +503 7141 8717 registrado en Cloud API | ✅ CONNECTED | — |
| Plantilla `alerta_lead_hot` | ✅ APROBADA en la cuenta real | — |
| Plantilla `seguimiento_interes` | ❌ **NO existe en la cuenta real** | Crearla + esperar aprobación |
| Webhook suscrito en la cuenta real | ❌ **Vacío** | Suscribir la app GT-JARVIS |
| Verificación del número (`code_verification_status`) | ⚠️ NOT_VERIFIED | Confirmar/registrar con PIN si Meta lo pide |
| Método de pago | ⚠️ Pendiente (checklist de Meta) | Agregar tarjeta para mensajes business-initiated |
| Verificación del negocio (Business Verification) | Recomendada | Sube el tier de 250 → 1,000+ conversaciones/día |

### 4.3 Checklist de go-live (en orden)

**PASO 1 — Plantilla faltante en la cuenta real**
Crear `seguimiento_interes` en la WABA de producción (`1314044236741483`). Se puede por API (lo hago yo) o en WhatsApp Manager. Esperar aprobación (minutos-48h).

**PASO 2 — Suscribir el webhook en la cuenta real**
Sin esto, los mensajes al +503 no llegan al bot. Se hace por API (`POST /1314044236741483/subscribed_apps`) o en WhatsApp Manager → Configuración → Webhooks. *(Lo puedo hacer yo por API en segundos.)*

**PASO 3 — Método de pago + verificación del negocio**
En WhatsApp Manager: agregar tarjeta (necesario para enviar plantillas/mensajes iniciados por el negocio). Iniciar Business Verification para subir el límite de mensajes.

**PASO 4 — Confirmar el número (si Meta lo pide)**
Si `code_verification_status` sigue NOT_VERIFIED al enviar, Meta manda un PIN al +503 7141 8717 — alguien con acceso a ese WhatsApp lo confirma.

**PASO 5 — Cambiar las variables en Vercel**
```
WA_PHONE_NUMBER_ID   = 713936255145171     ← el id del número real (hoy es el de prueba)
WA_TEMPLATE_CEO_ALERT = alerta_lead_hot     (ya existe en la cuenta real)
WA_TEMPLATE_FOLLOWUP  = seguimiento_interes  (una vez aprobada en la cuenta real)
CEO_PHONE_NUMBER      = +50362087916         (verificar)
```
El resto (`WA_ACCESS_TOKEN`, `WA_APP_SECRET`) NO cambian — es la misma app.

**PASO 6 — Redeploy** y verificar `GET /api/health` → `healthy`.

**PASO 7 — Prueba controlada antes de anunciar**
Desde un teléfono cualquiera, escríbele al +503 7141 8717: "Hola, info de Portacelli". Confirma: visto azul → "escribiendo…" → saludo del guion → escalamiento llega al CEO. Recién ahí lo pones en anuncios/ads.

### 4.4 Plan de reversa (rollback)
Si algo sale mal en vivo: cambia `WA_PHONE_NUMBER_ID` de vuelta al de prueba (`1071614939376823`) en Vercel + redeploy. El número real deja de estar atendido por el bot en 1 minuto. (Los mensajes que lleguen mientras tanto quedan guardados, pero sin respuesta automática.)

---

## 5. 📈 Operación diaria una vez en vivo

| Herramienta | Para qué | Dónde |
|-------------|----------|-------|
| **Inbox / Kanban** | Ver y tomar conversaciones, mover etapas | `/panel` |
| **Score A/B/C** | Priorizar leads calientes | En cada tarjeta del inbox/kanban |
| **Dashboard** | Embudo, conversión, objeciones, % resolución | `/panel/dashboard` |
| **Alerta de leads A abandonados** | Cron diario avisa al CEO leads calientes sin seguimiento +48h | WhatsApp del CEO |
| **Reporte semanal** | Resumen de la semana | WhatsApp del CEO, lunes 8am |
| **Takeover humano** | Pausar Daniela y responder tú desde el panel | Botón en el chat |
| **Guiones / cerebro** | Ajustar cómo vende sin tocar código | `/panel/daniela` |

### Qué vigilar las primeras semanas
- **Tiempos de respuesta** (dashboard) — deben quedar bajo 30s.
- **Tasa de escalamiento** — si Daniela escala demasiado, ajustar reglas; si escala poco, reforzarlas.
- **Objeciones más comunes** — te dicen qué mejorar en el pitch o el precio.
- **Mensajes fallidos** (logs de Vercel) — si un envío falla repetido, revisar plantilla/ventana 24h.
- **Costo OpenAI** — con volumen alto, vigilar el límite de 30K tokens/min (subir tier si hace falta).

---

## 6. Resumen de "lo que falta" para dejar Meta 100% listo

**Para seguir probando (número +1):**
1. En Vercel: `WA_TEMPLATE_FOLLOWUP=seguimiento_interes` (verifica que `WA_TEMPLATE_CEO_ALERT=alerta_lead_hot` esté puesto) + redeploy.
2. Agregar el número del CEO a la lista blanca de prueba para probar alertas.

**Para el go-live (número real +503), cuando decidas:**
1. Crear `seguimiento_interes` en la cuenta real (yo, por API).
2. Suscribir el webhook en la cuenta real (yo, por API).
3. Método de pago + Business Verification (tú, en WhatsApp Manager).
4. Cambiar `WA_PHONE_NUMBER_ID` a `713936255145171` + redeploy.
5. Prueba controlada → anunciar.
