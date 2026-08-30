// Simulador de webhook de WhatsApp para pruebas LOCALES.
//
// Inyecta un mensaje entrante firmado en el webhook local sin tocar la
// configuración de Meta — producción sigue recibiendo su tráfico normal.
// La RESPUESTA del bot sí sale por la WhatsApp Cloud API real, así que llega
// al número que pongas en --from (usa tu propio número para verla).
//
// Uso:
//   node --env-file=.env scripts/simulate-wa.mjs "hola me interesa portacelli"
//   node --env-file=.env scripts/simulate-wa.mjs --from 503XXXXXXX "cuánto cuesta?"
//   node --env-file=.env scripts/simulate-wa.mjs --url https://mi-tunel.trycloudflare.com "hola"
//
// Nota: WhatsApp solo permite texto libre si ese número escribió al negocio en
// las últimas 24h. Si ves el error 131047, escribe primero desde tu WhatsApp.

import { createHmac } from 'node:crypto'

const args = process.argv.slice(2)

function takeFlag(name, fallback) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const value = args[i + 1]
  if (value === undefined) {
    console.error(`Falta el valor de --${name}`)
    process.exit(1)
  }
  args.splice(i, 2)
  return value
}

const baseUrl = takeFlag('url', 'http://localhost:3000').replace(/\/$/, '')
// OJO: no usar CEO_PHONE_NUMBER ni un wa_phone del equipo — el webhook los
// cortocircuita como números internos y el mensaje se ignora en silencio.
const from = takeFlag('from', '50370000000').replace(/\D/g, '')
const text = args.join(' ').trim()

if (!text) {
  console.error('Uso: node --env-file=.env scripts/simulate-wa.mjs "tu mensaje"')
  process.exit(1)
}

const secret = process.env.WA_APP_SECRET
if (!secret) {
  console.error('Falta WA_APP_SECRET — corré con: node --env-file=.env scripts/simulate-wa.mjs "..."')
  process.exit(1)
}

// messageId único por corrida: el webhook deduplica por id y saltaría el mensaje
const messageId = `wamid.SIMULATED.${process.hrtime.bigint()}`

const payload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'SIMULATED_WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: from,
              phone_number_id: process.env.WA_PHONE_NUMBER_ID ?? 'SIMULATED_PHONE_ID',
            },
            contacts: [{ profile: { name: 'Prueba Local' }, wa_id: from }],
            messages: [
              {
                from,
                id: messageId,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: 'text',
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
}

const body = JSON.stringify(payload)
const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
const endpoint = `${baseUrl}/api/webhook/whatsapp`

console.log(`→ POST ${endpoint}`)
console.log(`   from: ${from}`)
console.log(`   text: ${text}`)

const started = Date.now()
let response
try {
  response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body,
  })
} catch (err) {
  console.error(`\n✗ No pude conectar con ${endpoint}`)
  console.error(`  ${err instanceof Error ? err.message : err}`)
  console.error('  ¿Está corriendo "npm run dev"?')
  process.exit(1)
}

const responseText = await response.text()
console.log(`\n← ${response.status} ${responseText} (${Date.now() - started}ms)`)

if (response.status === 401) {
  console.error('  Firma rechazada: el WA_APP_SECRET del script y el del server no coinciden.')
  process.exit(1)
}

console.log('\nLa respuesta del bot se genera en el server — mirá los logs de "npm run dev".')
console.log('En dev el webhook procesa en línea, así que cualquier error aparece ahí mismo.')
