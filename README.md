# GT Bot — WhatsApp AI para Grupo Terranova SV

Bot de WhatsApp que atiende leads como "Daniela", asesora virtual de Grupo Terranova. Califica leads automáticamente con GPT-4o, guarda todo en Supabase, y ahora incluye un panel CRM en `/panel` para el equipo.

## Stack

- **Next.js 16** (App Router) en Vercel
- **OpenAI GPT-4o** via API
- **WhatsApp Cloud API** (Meta)
- **Supabase** (PostgreSQL)
- **grupoterranovasv.com/api** para contexto de proyectos

## Setup rápido

### 1. Cuentas necesarias

| Servicio | Dónde crear | Costo |
|----------|------------|-------|
| Meta for Developers | developers.facebook.com | Gratis |
| Anthropic | console.anthropic.com | Pay-as-you-go |
| Supabase | supabase.com | Free tier disponible |
| Vercel | vercel.com | Hobby $20/mes recomendado |

### 2. WhatsApp Cloud API

1. Ir a https://developers.facebook.com → Create App → Business
2. Agregar el producto "WhatsApp"
3. En **API Setup**: copiar el Phone Number ID y generar un Access Token permanente
4. En **App Settings → Basic**: copiar el App Secret
5. El webhook URL se configura después del deploy (Paso 6)

### 3. Base de datos (Supabase)

1. Crear proyecto en https://supabase.com
2. Ir a **SQL Editor → New Query**
3. Pegar el contenido de `database/schema.sql` y ejecutar
4. Ir a **Settings → API** y copiar `Project URL` y `service_role` key

### 4. Variables de entorno local

```bash
cp .env.example .env.local
# Editar .env.local con los valores reales
```

### 5. Deploy a Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

Después del deploy, copiar la URL del proyecto (e.g. `https://gt-bot.vercel.app`).

### 6. Configurar el webhook en Meta

1. Meta for Developers → tu App → WhatsApp → Configuration
2. **Callback URL**: `https://tu-url.vercel.app/api/webhook/whatsapp`
3. **Verify Token**: el valor que pusiste en `WA_WEBHOOK_VERIFY_TOKEN`
4. Click en **Verify and Save**
5. Suscribirse al campo `messages`

### 7. Variables de entorno en Vercel

En Vercel → tu proyecto → Settings → Environment Variables, agregar todas las variables de `.env.example` con sus valores reales.

### 8. Test del flujo completo

Enviar un mensaje de WhatsApp al número configurado y verificar en Supabase → Table Editor:
- ✅ `leads`: nuevo registro con el número del remitente
- ✅ `conversations`: 2 filas (user + assistant)
- ✅ `leads.stage` actualizado según la calificación de Claude
- ✅ Daniela responde en WhatsApp

## Desarrollo local con ngrok

```bash
# Terminal 1: Next.js dev server
npm run dev

# Terminal 2: túnel público
ngrok http 3000
```

Usar la URL de ngrok como Callback URL en Meta durante el desarrollo.

## Tests

```bash
npm run test:run   # todos los tests una vez (135 tests)
npm run test       # modo watch
```

## Estructura del código

| Archivo | Responsabilidad |
|---------|----------------|
| `app/api/webhook/whatsapp/route.ts` | Recibe y procesa webhooks de WhatsApp |
| `services/whatsapp/webhook.ts` | Parsea el payload del webhook, verifica firma HMAC |
| `services/whatsapp/client.ts` | Envía mensajes con typing delay realista |
| `services/claude/client.ts` | Llama a Claude Sonnet, parsea respuesta JSON |
| `services/claude/prompts.ts` | Construye el prompt de Daniela con contexto dinámico |
| `services/projects/gt-api.ts` | Fetch de proyectos desde grupoterranovasv.com |
| `services/projects/cache.ts` | Cache en memoria con TTL (1 hora para proyectos) |
| `lib/supabase.ts` | Todas las queries a la base de datos |
| `types/index.ts` | Tipos TypeScript compartidos |
| `database/schema.sql` | Schema de Supabase (ejecutar manualmente) |
| `proxy.ts` | Protege /panel/* — chequeo de sesión + refresh de cookies (Next 16: ex-middleware) |
| `app/panel/` | Panel CRM: login, inbox, chat con takeover, ficha de lead, config |
| `components/panel/` | Componentes del panel: inbox (lista/kanban), chat, ficha, config |
| `app/panel/actions.ts` | Server actions del panel (re-validan rol en servidor) |
| `lib/auth.ts` | Sesión del equipo + guards admin/asesor |
| `lib/panel-data.ts` | Lecturas del panel (inbox, ficha) con service role |
| `lib/wa-window.ts` | Regla de ventana de 24h de WhatsApp |
| `migrations/003_panel_crm.sql` | Equipo, tags, notas, asignación, RLS del panel |
| `lib/proactive/` | Motor proactivo: elegibilidad, matching, render, engine, datos |
| `app/api/cron/daily/route.ts` | Cron diario (radar + reglas) protegido por CRON_SECRET |
| `app/panel/(authed)/campanas/` | Cola de aprobación de campañas |
| `migrations/004_proactive.sql` | Plantillas, reglas, campañas, radar, opt-out |

## Roadmap post-MVP

| Fase | Feature |
|------|---------|
| B | Rich media — PDFs y brochures por proyecto |
| B | Handoff humano — pausar bot, notificar asesor |
| C | Google Calendar — agendamiento de citas + Meet |
| D | Meta CAPI — atribución de leads calificados |
| D | ✅ Fase 2b: recontactos + radar de oportunidades con aprobación |
| E | ✅ Panel CRM (Fase 1): inbox en vivo, takeover, tags, roles |
| F | n8n — migrar flujos para configuración visual |
