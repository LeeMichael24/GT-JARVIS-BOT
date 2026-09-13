/**
 * Escenarios FIJOS de la batería de venta. Salen de conversaciones reales de
 * prueba de Mike y de los casos que fallaron. Van escritos aquí —no leídos de la
 * base— porque los leads de prueba se borran y la comparación antes/después
 * tiene que ser siempre sobre las mismas conversaciones.
 *
 * Para agregar un caso: una conversación que haya salido mal en la vida real.
 */
export type Msg = { role: 'user' | 'assistant'; content: string }
export interface Escenario { id: string; msgs: Msg[] }

const u = (content: string): Msg => ({ role: 'user', content })
const a = (content: string): Msg => ({ role: 'assistant', content })

// A — capturas del 12-sep 11:27: prometió el brochure tres veces y nunca llegó
// (la primera respuesta del bot está completada a mano; el resto es textual)
const CONV_A: Msg[] = [
  u('Hello! Me gustaría mas información sobre el 3% OFF en apartamentos Portacelli 🌿'),
  a('¡Hola! Te saluda Daniela de Grupo Terranova. El descuento del 3% aplica a los apartamentos de Portacelli para pagos de contado. Estos precios aún están en preventa.'),
  u('Perfecto y adonde está el proyecto'),
  a('Portacelli está ubicado en Nuevo Cuscatlán, una zona en desarrollo acelerado que promete una excelente plusvalía a mediano plazo. Es un lugar ideal tanto para vivir como para invertir.'),
  u('No me ubico'),
  u('No se adonde está'),
  a('Portacelli se encuentra en una zona bastante accesible en Nuevo Cuscatlán, cerca de áreas urbanas pero con un entorno tranquilo. ¿Te gustaría que te comparta un enlace con la ubicación exacta?'),
  u('Si'),
  a('Te envío el enlace con la ubicación exacta de Portacelli para que puedas verlo en el mapa.'),
  u('Y el pdf o broshure?'),
]

// B — prueba real del 13-sep 13:15, ya con el arreglo del brochure: respondió
// "estoy aquí para ayudarte" y cerró en seco
const CONV_B: Msg[] = [
  u('Hello! Me gustaría mas información sobre el 3% OFF en apartamentos Portacelli 🌿'),
  u('Y adonde están ubicados'),
  a('¡Hola! El descuento del 3% aplica sobre el valor total del apartamento al pagar de contado, lo que genera una ganancia de plusvalía y ahorra en costos al escriturar. \n\nPortacelli está ubicado en Nuevo Cuscatlán, La Libertad. La entrada está frente al Centro de Investigación Forense. Se está desarrollando un bulevar de 4 carriles que conectará todo el proyecto.'),
  a('[Material enviado al cliente: link — Ubicación exacta de Portacelli en Google Earth 🌍]'),
  u('Ok'),
  a('Perfecto, si tienes cualquier otra pregunta o necesitas más información, estoy aquí para ayudarte. Quedamos en comunicación.'),
  u('Tienes el broshure o pdf de los renders?'),
  a('Claro, te envío el brochure de los apartamentos Alta en Portacelli.'),
  a('[Material enviado al cliente: brochure — Broshure apartamentos alta]'),
]

const saludo = a('Buen día! Le saluda Daniela Lemus de Grupo Terranova, gracias por su interés en el megaproyecto Portacelli 🌿 ¿Con quién tengo el gusto de platicar?')
const paso2 = a('Un gusto, Laura! 🤝 Portacelli es el nuevo polo de mayor plusvalía de Nuevo Cuscatlán. Hoy estamos en preventa de apartamentos, vendiendo el m² por debajo del precio de mercado 📈')

export const ESCENARIOS: Escenario[] = [
  // El ejemplo textual de Mike: "no tiene sentido tener una agente de ventas si responde esto"
  { id: 'M interesa + ubicación', msgs: [u('Hola, me interesa Portacelli, ¿adónde está ubicado?')] },
  { id: 'A1 anuncio 3% OFF', msgs: CONV_A.slice(0, 1) },
  { id: 'A2 adónde está', msgs: CONV_A.slice(0, 3) },
  { id: 'A3 no me ubico', msgs: CONV_A.slice(0, 6) },
  { id: 'A5 pdf o brochure', msgs: CONV_A.slice(0, 10) },
  { id: 'B2 "Ok"', msgs: CONV_B.slice(0, 5) },
  { id: 'B3 brochure de renders', msgs: CONV_B.slice(0, 7) },
  { id: 'S precio 101 m²', msgs: [u('Hola, vi el anuncio de Portacelli'), saludo, u('Laura'), paso2, u('¿Y cuánto sale el de 101 m²?')] },
  { id: 'S pide tiempo', msgs: [u('Hola, vi el anuncio de Portacelli'), saludo, u('Laura'), paso2, u('Ok gracias, déjame pensarlo y lo platico con mi esposa')] },
  { id: 'F nombre + dónde queda', msgs: [u('Hola, vi el anuncio de Portacelli'), saludo, u('Soy Carlos. ¿Dónde queda exactamente?')] },
  { id: 'F quiere invertir', msgs: [u('Hola, vi el anuncio de Portacelli'), saludo, u('Soy Ana, me interesa para invertir, ¿qué me conviene?')] },
  { id: 'F qué incluye el precio', msgs: [u('Hola, vi el anuncio de Portacelli'), saludo, u('Roberto. ¿Qué incluye el precio de los apartamentos?')] },
]
