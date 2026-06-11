# Guía de activación del Panel CRM (Fase 1)

Tiempo total: ~20 minutos. Sigue los pasos **EN ORDEN** — el orden importa.

## Los 3 lugares donde vas a trabajar

| Lugar | Qué es | Dónde |
|---|---|---|
| **Supabase** | La base de datos del bot (leads, conversaciones) | https://supabase.com |
| **Vercel** | El servidor donde corre el bot y el panel | https://vercel.com |
| **Terminal** | La app "Terminal" de tu Mac, para subir el código | Cmd+Espacio → escribe "Terminal" |

---

## PASO 1 — Preparar la base de datos (Supabase) · 5 min

> ⚠️ Este paso va PRIMERO. Si despliegas el código nuevo sin esto, el bot deja de responder.

1. Entra a **https://supabase.com** → **Sign in** → abre el proyecto de tu bot (el que creaste para GT Bot).
2. En el menú de la izquierda, click en **SQL Editor** (ícono que parece una hoja con `>_`).
3. Click en **"+ New query"** (arriba a la izquierda).
4. En tu Mac, abre la carpeta del proyecto: `Documents → CLAUDE → BOT ESPECIAL → gt-bot → migrations` y abre el archivo **`003_panel_crm.sql`** (doble click; se abre con TextEdit o VS Code).
5. Selecciona TODO el contenido (Cmd+A), cópialo (Cmd+C) y pégalo en el editor de Supabase (Cmd+V).
6. Click en el botón verde **"Run"** (o Cmd+Enter).
7. Debe decir: **"Success. No rows returned"** ✅
8. Verifica: menú izquierdo → **Table Editor** → deben aparecer 4 tablas nuevas: `team_members`, `tags`, `lead_tags`, `lead_notes`.

---

## PASO 2 — Crear TU usuario admin (Supabase) · 3 min

1. Menú izquierdo → **Authentication** → pestaña **Users**.
2. Botón verde **"Add user"** → **"Create new user"**.
3. Llena:
   - **Email:** leemichaeln24@gmail.com
   - **Password:** inventa una segura (la usarás para entrar al panel — guárdala)
   - Si aparece la opción **"Auto Confirm User"**, márcala ✓
4. Click **Create user**.
5. En la lista de usuarios, busca el tuyo y **copia su ID** (es un código largo tipo `a1b2c3d4-...`; hay un botoncito de copiar al lado).
6. Vuelve a **SQL Editor** → **+ New query** → pega esto, **reemplazando `PEGA-AQUI-TU-ID`** por el ID que copiaste:

```sql
INSERT INTO team_members (id, name, email, role)
VALUES ('PEGA-AQUI-TU-ID', 'Michael Narváez', 'leemichaeln24@gmail.com', 'admin');
```

7. **Run** → "Success" ✅

---

## PASO 3 — Las 3 variables nuevas (Vercel) · 5 min

Primero consigue los 2 valores en Supabase:

1. En Supabase: menú izquierdo → **Settings** (engranaje, hasta abajo) → **API** (o "API Keys").
2. Ahí verás:
   - **Project URL** → algo como `https://abcdefgh.supabase.co` → cópialo
   - **Project API keys → `anon` `public`** → una clave larga → cópiala
   - ⚠️ NO uses la que dice `service_role` — esa es secreta y no va aquí.

Ahora ponlas en Vercel:

3. Entra a **https://vercel.com** → abre tu proyecto del bot.
4. Arriba: **Settings** → menú izquierdo: **Environment Variables**.
5. Agrega estas 3 (una por una, con **Environment: Production** marcado; si te deja, marca también Preview):

| Name (cópialo exacto) | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | El **Project URL** que copiaste |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | La clave **anon public** que copiaste |
| `NEXT_PUBLIC_SITE_URL` | La URL de tu app, ej. `https://gt-jarvis-bot.vercel.app` |

> ¿No sabes tu URL de Vercel? En la página principal de tu proyecto en Vercel, arriba aparece bajo **"Domains"** — es la que termina en `.vercel.app`.

6. **Save** en cada una.

---

## PASO 4 — Permitir el link de invitaciones (Supabase) · 1 min

Para que cuando invites a un asesor, el correo lo lleve a crear su contraseña:

1. En Supabase: **Authentication** → **URL Configuration** (en el menú de esa sección).
2. En **Redirect URLs** → **Add URL** → pega: `https://TU-APP.vercel.app/panel/set-password` (con tu URL real de Vercel).
3. **Save**.

---

## PASO 5 — Subir el código y desplegar (Terminal) · 3 min

1. Abre **Terminal** en tu Mac.
2. Pega estos dos comandos (Enter después de cada uno):

```bash
cd "/Users/michaelnarvaez/Documents/CLAUDE/BOT ESPECIAL/gt-bot"
git push
```

3. ¿Cómo saber si eso ya desplegó?
   - Ve a **vercel.com → tu proyecto → pestaña Deployments**.
   - Si aparece un deploy nuevo "Building…" → tu Vercel está conectado a GitHub y se despliega solo. Espera a que diga **"Ready"** ✅ (1–2 min).
   - Si NO aparece nada nuevo después de 2 minutos → despliega manual con: `vercel --prod` (en la misma Terminal).

---

## PASO 6 — Probar que todo funciona · 5 min

1. Abre `https://TU-APP.vercel.app/panel` → te debe mandar a la pantalla de login.
2. Entra con **tu correo y la contraseña del Paso 2**.
3. Debes ver el **inbox** con tus leads reales. 🎉
4. **Prueba el takeover**: abre un chat (idealmente uno de prueba — tu propio número), escribe un mensaje y envía:
   - Te debe llegar al WhatsApp.
   - En el panel aparece el banner naranja **"✋ Daniela pausada — atiendes tú"**.
5. Responde desde el WhatsApp del cliente de prueba → el mensaje aparece **en vivo** en el panel (con sonido).
6. Click **"Reactivar a Daniela"** → escribe otra vez desde el WhatsApp de prueba → Daniela vuelve a responder sola.
7. Ve a **Configuración** (arriba a la derecha) → crea tus primeros tags (sugerencia: `inversionista`, `vivienda`, `VIP`, `frío`).
8. Cuando quieras sumar a alguien del equipo: **Configuración → Equipo → Invitar** (le llega un correo para crear su contraseña; como asesor SOLO verá los leads que tú le asignes desde la ficha de cada chat).

---

## Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| El SQL da error "already exists" | Ya corriste la migración antes | Todo bien, sigue al paso 2 |
| Login dice "Correo o contraseña incorrectos" | El usuario no se confirmó | Paso 2: borra el usuario y créalo de nuevo con "Auto Confirm" marcado |
| `/panel` da error o pantalla en blanco | Faltan las variables del Paso 3, o se agregaron DESPUÉS del deploy | Vercel → Deployments → botón "⋯" del último deploy → **Redeploy** |
| El correo de invitación no llega | Spam, o límite de Supabase (3-4 correos/hora en plan gratis) | Revisa spam; espera una hora y reintenta |
| El bot dejó de responder en WhatsApp | Se desplegó SIN correr la migración del Paso 1 | Corre el Paso 1 ya — el bot se recupera solo, y los mensajes de los clientes durante la falla quedan en WhatsApp (no en el panel) |
| Entro al panel pero no veo ningún lead | Entraste con un usuario asesor sin leads asignados | Entra como admin, o asigna leads al asesor desde la ficha |

## Qué NO tienes que tocar

- **Nada de WhatsApp/Meta** — el número y el webhook siguen igual.
- **Nada de OpenAI** — misma clave.
- **No hay costos nuevos** — Supabase free tier aguanta esto, Vercel igual que hoy.
