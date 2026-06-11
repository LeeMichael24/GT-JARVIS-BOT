# Guía: crear las plantillas de recontacto en Meta (hazlo YA — la aprobación tarda horas/días)

Las plantillas son los únicos mensajes que WhatsApp permite enviar a clientes que
llevan más de 24h sin escribirte. Se crean UNA vez, Meta las aprueba, y el panel
las usará rellenando las variables `{{1}}`, `{{2}}` con el nombre y el interés de
cada cliente.

## Dónde se crean

1. Entra a **https://business.facebook.com** con la cuenta dueña del WhatsApp del bot.
2. Menú → **WhatsApp Manager** (o entra directo: https://business.facebook.com/wa/manage/message-templates/).
3. Selecciona tu cuenta de WhatsApp Business (la del número de Daniela).
4. Botón **"Crear plantilla"**.

## Plantilla 1 — Seguimiento general

| Campo | Valor |
|---|---|
| Categoría | **Marketing** |
| Nombre | `recontacto_seguimiento` (exacto, en minúsculas) |
| Idioma | **Español** |

**Cuerpo (pegar tal cual):**

```
Hola {{1}} 👋 Soy Daniela de Grupo Terranova. Hace unos días conversamos sobre {{2}} y quería contarte que seguimos teniendo opciones que encajan con lo que buscabas. ¿Te gustaría que te comparta las novedades?
```

**Muestras de variables** (Meta las pide para aprobar): `{{1}}` → `Carlos` · `{{2}}` → `Portacelli`

## Plantilla 2 — Novedades de inversión

| Campo | Valor |
|---|---|
| Categoría | **Marketing** |
| Nombre | `novedades_inversion` |
| Idioma | **Español** |

**Cuerpo:**

```
Hola {{1}} 👋 Soy Daniela de Grupo Terranova. Entraron nuevas oportunidades de inversión al ecosistema con rentabilidades atractivas y me acordé de tu interés. ¿Te comparto los detalles?
```

Muestra: `{{1}}` → `Carlos`

## Plantilla 3 — Nueva oportunidad detectada (la usa el radar)

| Campo | Valor |
|---|---|
| Categoría | **Marketing** |
| Nombre | `nueva_oportunidad` |
| Idioma | **Español** |

**Cuerpo:**

```
Hola {{1}} 👋 Soy Daniela de Grupo Terranova. Acaba de entrar al ecosistema {{2}} y por lo que buscabas creo que te puede interesar. ¿Quieres que te mande la información completa?
```

Muestras: `{{1}}` → `Carlos` · `{{2}}` → `Torre Vista Verde en Nuevo Cuscatlán`

## Consejos para que Meta apruebe a la primera

- **No** uses palabras tipo "GRATIS", "¡OFERTA!", todo mayúsculas, ni muchos signos de exclamación.
- El tono conversacional y con pregunta final (como están redactadas) aprueba bien.
- Si Meta rechaza alguna, edítala suavizando el texto y reenvía — el rechazo no penaliza.
- El estado se ve en WhatsApp Manager: **En revisión → Aprobada** (verde). Con eso ya están listas para registrarse en el panel (Fase 2b, Configuración → Plantillas).

## Costo de referencia

Conversación de marketing iniciada por plantilla en la región: aproximadamente
**$0.03–0.08 USD por cliente contactado** (verifica la tarifa vigente de El Salvador en
https://developers.facebook.com/docs/whatsapp/pricing). Las respuestas que el
cliente mande después abren la ventana de 24h y la conversación de Daniela ahí es
del flujo normal. El panel siempre te mostrará el costo estimado antes de aprobar
cualquier envío.
