/**
 * BATERÍA VISUAL Y DE CITA — 18-sep-2026.
 *
 * La batería de venta (escenarios.ts) mide si Daniela responde como vendedora.
 * Esta mide lo otro, que es lo difícil: si sabe MOSTRAR (mandar el material
 * correcto, o ser honesta cuando no lo tiene), si el cliente termina
 * entendiendo el proyecto, y si la conversación llega a una cita — virtual o
 * presencial — que es donde el equipo cierra.
 *
 * Los casos salen de preguntas reales de los chats de WhatsApp de Portacelli
 * (exports en data/whatsapp-exports) y del corte de inventario del 17-sep:
 * apartamento de 101 m² y la única casa que quedó, el lote 5B de Raíces.
 */
export type Msg = { role: 'user' | 'assistant'; content: string }
export type TipoMaterial = 'document' | 'image' | 'video' | 'link' | 'ninguno'

export interface EscenarioVisual {
  id: string
  bloque: 'material' | 'entendimiento' | 'cita'
  /** Prefijo del nombre del listing en el catálogo. Default: Portacelli Alta. */
  proyecto?: string
  msgs: Msg[]
  /** Qué material DEBERÍA salir. 'ninguno' = no existe y tiene que decirlo sin prometerlo. */
  espera_material: TipoMaterial
  /** Datos que la respuesta tiene que traer (al menos uno de cada grupo). */
  datos?: { nombre: string; re: RegExp }[]
  /** El turno tiene que empujar a una cita concreta (día, hora o modalidad). */
  debe_pedir_cita?: boolean
}

const u = (content: string): Msg => ({ role: 'user', content })
const a = (content: string): Msg => ({ role: 'assistant', content })

const saludo = a('Buen día! Le saluda Daniela de Grupo Terranova, gracias por su interés en el megaproyecto Portacelli 🌿 ¿Con quién tengo el gusto de platicar?')
const anuncio = u('Hello! Me gustaría mas información sobre el 3% OFF en apartamentos Portacelli 🌿')

// Datos duros del corte 17-sep-2026 (memoria del pipeline + panel de Daniela)
const D = {
  precio101: { nombre: 'precio 101 m² ($252,500 / $244,925 contado)', re: /252[.,]?500|244[.,]?925/ },
  reserva: { nombre: 'reserva $3,000', re: /3[.,]?000/ },
  prima: { nombre: 'prima 15% (3% firma + 12% en 24 meses)', re: /15\s?%|12\s?%|24\s+(meses|cuotas)/i },
  entrega: { nombre: 'entrega 4T-2028', re: /2028/ },
  penalidad: { nombre: 'penalidad 10% / cesión de derechos', re: /10\s?%|cesi[óo]n de derechos/i },
  casaPrecio: { nombre: 'casa 5B $599,999', re: /599[.,]?999/ },
  casaTerreno: { nombre: '428.8 v² de terreno', re: /428[.,]?8/ },
  casaConstruccion: { nombre: '309 m² de construcción', re: /309/ },
  casaReserva: { nombre: 'reserva $5,000', re: /5[.,]?000/ },
  ubicacion: { nombre: 'Nuevo Cuscatlán / CIF', re: /nuevo cuscatl[áa]n|forense|CIF/i },
  habitaciones: { nombre: '2 habitaciones + estudio flex', re: /estudio|flex|junior/i },
}

export const ESCENARIOS_VISUAL: EscenarioVisual[] = [
  // ── BLOQUE 1 · MATERIAL VISUAL ────────────────────────────────────────────
  {
    id: 'V1 pide fotos del proyecto',
    bloque: 'material',
    msgs: [anuncio, saludo, u('Soy Marcela'), a('Un gusto, Marcela! Portacelli es el nuevo polo de plusvalía de Nuevo Cuscatlán, hoy en preventa de apartamentos.'), u('Me manda fotos de cómo va el proyecto?')],
    espera_material: 'image',
  },
  {
    id: 'V2 pide el plano del 101 m²',
    bloque: 'material',
    msgs: [anuncio, saludo, u('Soy Julio'), a('Un gusto, Julio! En Torre 1 tenemos el apartamento de 101 m² más 25 m² de parqueos.'), u('Tiene el plano de la distribución? Quiero ver cómo quedan los cuartos')],
    espera_material: 'ninguno',
    datos: [D.habitaciones],
  },
  {
    id: 'V3 pide el brochure',
    bloque: 'material',
    msgs: [anuncio, saludo, u('Ana'), a('Un gusto, Ana! Estamos vendiendo el m² por debajo del precio de mercado de la zona.'), u('Me pasa el brochure o pdf del proyecto porfa')],
    espera_material: 'document',
  },
  {
    id: 'V4 no se ubica',
    bloque: 'material',
    msgs: [anuncio, saludo, u('Soy Rodrigo. Y dónde queda exactamente?'), a('Portacelli está en Nuevo Cuscatlán, La Libertad, con la entrada frente al Centro de Investigación Forense.'), u('No me ubico la verdad')],
    espera_material: 'link',
    datos: [D.ubicacion],
  },
  {
    id: 'V5 pide video de avance de obra',
    bloque: 'material',
    msgs: [anuncio, saludo, u('Soy Karla'), a('Un gusto, Karla! La obra ya está en movimiento, se está construyendo el bulevar de 4 carriles.'), u('Tiene algún video de cómo va la construcción? Para verlo con mi esposo')],
    espera_material: 'video',
  },
  {
    id: 'V6 casa Raíces: pide la ficha',
    bloque: 'material',
    proyecto: 'Portacelli Raices',
    msgs: [u('Buenas, me dijeron que se liberó una casa en Portacelli'), a('Así es! Quedó disponible el lote 5B de la Colección Raíces.'), u('Me manda la ficha con el plan de pagos porfavor')],
    espera_material: 'ninguno',
    datos: [D.casaPrecio, D.casaReserva],
  },
  {
    id: 'V7 pide lista de precios por unidad',
    bloque: 'material',
    msgs: [anuncio, saludo, u('Soy Enrique, ando viendo para invertir'), a('Un gusto, Enrique! Para inversión el 101 m² es el que mejor entra hoy.'), u('Me pasa la lista de precios de todas las unidades con nivel y número')],
    espera_material: 'ninguno',
    datos: [D.precio101],
  },

  // ── BLOQUE 2 · QUE EL CLIENTE ENTIENDA ────────────────────────────────────
  {
    id: 'E1 no entiende el plan de pago',
    bloque: 'entendimiento',
    msgs: [anuncio, saludo, u('Soy Gabriela'), a('Un gusto, Gabriela! El 101 m² está en $252,500 y con pago de contado baja a $244,925.'), u('No entendí lo de la prima, me hablaron de 15% y también de un 3%. Cuánto tengo que dar al inicio y cuánto mensual?')],
    espera_material: 'ninguno',
    datos: [D.reserva, D.prima],
  },
  {
    id: 'E2 cuántas habitaciones son',
    bloque: 'entendimiento',
    msgs: [anuncio, saludo, u('Soy Diana'), a('Un gusto, Diana! En Torre 1 queda el apartamento de 101 m².'), u('Y son 2 o 3 habitaciones? Vi que decía 3 pero también leí estudio')],
    espera_material: 'ninguno',
    datos: [D.habitaciones],
  },
  {
    id: 'E3 por qué aquí y no Santa Elena',
    bloque: 'entendimiento',
    msgs: [anuncio, saludo, u('Soy Marvin, ando comparando'), a('Un gusto, Marvin! Portacelli está en Nuevo Cuscatlán, en preventa.'), u('Por qué me conviene Portacelli y no un apartamento ya hecho en Santa Elena? Sinceramente')],
    espera_material: 'ninguno',
  },
  {
    id: 'E4 entrega y arrepentimiento',
    bloque: 'entendimiento',
    msgs: [anuncio, saludo, u('Soy Wendy'), a('Un gusto, Wendy! Está en preventa, por eso el precio está por debajo del mercado de la zona.'), u('Cuándo entregan? Y si a medio camino ya no puedo seguir pagando, pierdo todo lo que abone?')],
    espera_material: 'ninguno',
    datos: [D.entrega, D.penalidad],
  },
  {
    id: 'E5 crédito bancario',
    bloque: 'entendimiento',
    msgs: [anuncio, saludo, u('Soy Luis'), a('Un gusto, Luis! El 101 m² está en $252,500 con 25 m² de parqueos incluidos.'), u('Yo necesito crédito, no tengo todo de contado. Ustedes me ayudan con el banco o yo lo tramito?')],
    espera_material: 'ninguno',
    datos: [D.prima],
  },

  // ── BLOQUE 3 · LLEVAR A LA CITA ───────────────────────────────────────────
  {
    id: 'C1 interesado pero ocupado',
    bloque: 'cita',
    msgs: [anuncio, saludo, u('Soy Fernando'), a('Un gusto, Fernando! El 101 m² está en $252,500, con 3% de descuento pagando de contado.'), u('Me interesa bastante, pero ando full esta semana con trabajo')],
    espera_material: 'ninguno',
    debe_pedir_cita: true,
  },
  {
    id: 'C2 cliente en EE. UU. (cita virtual)',
    bloque: 'cita',
    msgs: [anuncio, saludo, u('Soy Silvia, le escribo desde Houston'), a('Un gusto, Silvia! Muchos salvadoreños en el exterior están entrando en preventa.'), u('Me gustaría entender bien el proyecto antes de decidir, pero yo no estoy en el país')],
    espera_material: 'ninguno',
    debe_pedir_cita: true,
  },
  {
    id: 'C3 solo fines de semana',
    bloque: 'cita',
    msgs: [anuncio, saludo, u('Soy Óscar'), a('Un gusto, Óscar! La obra ya arrancó y el bulevar de 4 carriles está en construcción.'), u('Quiero ir a ver el proyecto, pero yo solo puedo fines de semana')],
    espera_material: 'ninguno',
    debe_pedir_cita: true,
  },
  {
    id: 'C4 quiere apartar',
    bloque: 'cita',
    msgs: [anuncio, saludo, u('Soy Patricia'), a('Un gusto, Patricia! El 101 m² está en $252,500 y con contado queda en $244,925.'), u('Me gustó. Cómo hago para apartarlo antes de que suban los precios?')],
    espera_material: 'ninguno',
    datos: [D.reserva],
    debe_pedir_cita: true,
  },
]
