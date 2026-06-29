/**
 * Stress test: bots simulan personas reales contactando a Daniela
 * simultaneamente. Cada bot tiene personalidad, intereses y patrones
 * de conversacion distintos.
 *
 * Uso: npx tsx scripts/stress-test.ts [--bots=10] [--rounds=5] [--delay=2000]
 *
 * --bots    Cantidad de bots simultaneos (default: 10)
 * --rounds  Mensajes por bot (default: 5)
 * --delay   ms entre rondas (default: 3000)
 */

import { createHmac } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

function loadEnv(filePath: string) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    } else {
      // Match dotenv behavior: strip inline comments (space + #)
      const ci = val.indexOf(' #')
      if (ci > 0) val = val.slice(0, ci).trim()
    }
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnv(join(__dirname, '..', '.env.local'))
loadEnv(join(__dirname, '..', '.env'))

const WEBHOOK_URL = process.env.STRESS_TEST_URL ?? 'http://localhost:3000/api/webhook/whatsapp'
const SECRET = process.env.WA_APP_SECRET!

if (!SECRET) {
  console.error('WA_APP_SECRET not found in .env')
  process.exit(1)
}

// --- Personas ---

interface Persona {
  name: string
  phone: string
  style: string
  project: string | null
  messages: string[]
}

const PERSONAS: Persona[] = [

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 1: COMPRADORES REALES (los originales)
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Roberto Mendez',
    phone: '50370001001',
    style: 'inversionista serio, directo, pide numeros',
    project: 'Portacelli',
    messages: [
      'Buenas tardes, me interesa informacion sobre Portacelli',
      'Cual es el precio por metro cuadrado?',
      'Tienen unidades de 2 habitaciones? Cuanto es la reserva?',
      'Cual es la proyeccion de plusvalia a 3 anos?',
      'Ok me interesa. Puedo agendar una reunion para esta semana?',
      'Tienen financiamiento propio o solo bancario?',
      'Perfecto, quedo pendiente entonces',
    ],
  },
  {
    name: 'Maria Elena Castro',
    phone: '50370001002',
    style: 'mama buscando casa para su familia, emocional',
    project: 'Foresta',
    messages: [
      'Hola! vi su anuncio de Foresta en Instagram',
      'Es seguro para ninos? tiene areas verdes?',
      'ay que bonito! y cuanto cuesta mas o menos?',
      'uy esta un poco caro para nosotros... no hay algo mas accesible?',
      'mi esposo dice que le interesa igual, podemos ir a ver el sabado?',
      'tienen casa modelo que se pueda visitar?',
      'ok muchas gracias por la info ❤️',
    ],
  },
  {
    name: 'Carlos Rivas',
    phone: '50370001003',
    style: 'salvadoreno en USA, quiere invertir desde lejos',
    project: 'Portacelli',
    messages: [
      'Hey que tal, estoy en Los Angeles y quiero invertir en El Salvador',
      'Que proyectos tienen disponibles ahorita?',
      'Se puede hacer todo el proceso desde aca? papeleria y todo?',
      'Cuanto es el retorno si lo pongo en renta?',
      'Ustedes manejan la administracion del alquiler?',
      'Ok suena bien. Puedo hablar con alguien por videollamada?',
      'Dale pues, coordinen conmigo por favor',
    ],
  },
  {
    name: 'Jose Hernandez',
    phone: '50370001004',
    style: 'desconfiado, hace muchas preguntas de seguridad legal',
    project: null,
    messages: [
      'Buenas. Quienes son ustedes exactamente?',
      'Y que garantia tengo yo de que esto no es estafa?',
      'Tienen personeria juridica? donde estan registrados?',
      'Cual es la diferencia entre ustedes y una inmobiliaria normal?',
      'Y si el desarrollador quiebra que pasa con mi dinero?',
      'Necesito ver documentos legales antes de dar un centavo',
      'Ok dejeme pensarlo y les aviso',
    ],
  },
  {
    name: 'Ana Gabriela Lopez',
    phone: '50370001005',
    style: 'joven profesional, primer apartamento, presupuesto limitado',
    project: 'Portacelli',
    messages: [
      'Holaa! estoy buscando mi primer depa',
      'algo por los $80,000-$100,000 tienen?',
      'se puede con credito hipotecario?',
      'que bancos trabajan con ustedes?',
      'y la cuota mensual mas o menos de cuanto seria?',
      'esta cerca del trabajo en San Salvador? cuanto se hace en carro?',
      'vale gracias! voy a platicarlo con mi novio',
    ],
  },
  {
    name: 'Luis Fernando Aguilar',
    phone: '50370001006',
    style: 'empresario, quiere comprar varias unidades para renta',
    project: 'Foresta',
    messages: [
      'Buen dia. Estoy interesado en adquirir 3-4 unidades como inversion',
      'Cuales son los townhomes disponibles en Foresta?',
      'Hay descuento por volumen? por compra multiple?',
      'Necesito proyeccion de renta mensual por unidad',
      'Cuanto es el cap rate estimado?',
      'Quiero hablar directamente con el director o CEO',
      'Perfecto, arreglen una reunion lo antes posible',
    ],
  },
  {
    name: 'Patricia Figueroa',
    phone: '50370001007',
    style: 'indecisa, cambia de opinion, compara con competencia',
    project: null,
    messages: [
      'Hola buenas, estoy viendo opciones de compra',
      'Que ventaja tienen ustedes sobre Lateral o Tuscania?',
      'Mmm no se, en Tuscania me ofrecieron mejor precio',
      'Pero la ubicacion de ustedes esta mejor verdad?',
      'Ay no se, dejeme ver bien... cuanto es lo minimo de reserva?',
      'Mi hermana me dice que compre en Santa Tecla mejor',
      'Voy a seguir comparando, luego les escribo',
    ],
  },
  {
    name: 'Diego Ramos',
    phone: '50370001008',
    style: 'impaciente, quiere respuestas rapidas, no le gusta esperar',
    project: 'Portacelli',
    messages: [
      'Precios de Portacelli YA por favor',
      'No me manden brochures, solo diganme cuanto cuesta',
      'Cuanto es la entrada?',
      'Cuando entregan?',
      'Se puede negociar el precio?',
      'Ok necesito respuesta hoy, si no me voy con otro',
      'Bueno decidido, como reservo?',
    ],
  },
  {
    name: 'Claudia Menjivar',
    phone: '50370001009',
    style: 'diaspora en Canada, nostalgica, quiere algo para regresar',
    project: 'Foresta',
    messages: [
      'Hola desde Toronto! vi los townhomes de Foresta',
      'Es verdad que son como los de Cayala en Guatemala?',
      'Yo quiero algo bonito para cuando regrese a El Salvador',
      'Tienen jardin o patio? me encantan las plantas',
      'Mi mama vive en Santa Ana, le quedaria cerca?',
      'Y si compro ahora cuando estaria lista para mudarme?',
      'Mandeme los renders y fotos por favor',
    ],
  },
  {
    name: 'Ricardo Montes',
    phone: '50370001010',
    style: 'abogado, lenguaje formal, quiere todo por escrito',
    project: 'Portacelli',
    messages: [
      'Estimados, solicito informacion detallada del proyecto Portacelli',
      'Requiero copia del contrato de promesa de venta para revision',
      'Cual es la razon social de la empresa desarrolladora?',
      'El fideicomiso esta constituido? en que banco?',
      'Necesito el regimen de propiedad horizontal del proyecto',
      'Pueden enviar la ficha catastral y permisos de construccion?',
      'Agradezco su pronta respuesta. Quedo atento.',
    ],
  },
  {
    name: 'Fernanda Ayala',
    phone: '50370001011',
    style: 'influencer, habla en spanglish, usa muchos emojis',
    project: 'Foresta',
    messages: [
      'OMG hola!! vi los townhomes en mi feed 😍',
      'estan super cute! how much son? 💰',
      'tienen rooftop? necesito un spot nice para mis fotos lol',
      'wait es en Nuevo Cuscatlan? thats like far no?',
      'ok but si compro me dejan hacer un home tour para mi content? 📸',
      'les conviene el exposure que les doy tbh 💅',
      'ok ok mandenme todo pls, lo voy a pensar 🤔',
    ],
  },
  {
    name: 'Oscar Portillo',
    phone: '50370001012',
    style: 'jubilado, tranquilo, quiere algo pequeño y seguro',
    project: null,
    messages: [
      'Buenos dias jovenes. Disculpen la molestia',
      'Ando buscando algo pequeno para mi retiro',
      'No necesito nada grande, somos mi esposa y yo nada mas',
      'Lo importante es la seguridad y que este cerca de hospitales',
      'Cuanto es lo mas economico que tienen?',
      'Y se puede pagar de contado con descuento?',
      'Muy amables. Voy a consultarlo con mis hijos primero',
    ],
  },
  {
    name: 'Kevin Alexander',
    phone: '50370001013',
    style: 'joven salvadoreno, casual, usa jerga local',
    project: 'Portacelli',
    messages: [
      'Quiubo! que onda con los depas',
      'estan chivos los del anuncio, cuanto cuestan?',
      'nel nel, mucho billete jaja. no hay plan de pagos?',
      'a ya, y la reserva es mucho?',
      'puchica esta bueno. y entregan amueblado o pelado?',
      'simon me interesa, pero hasta que me paguen la quincena',
      'va pues gracias maje',
    ],
  },
  {
    name: 'Adriana Reyes',
    phone: '50370001014',
    style: 'madre soltera, pregunta por seguridad y escuelas',
    project: 'Foresta',
    messages: [
      'Buenas tardes. Soy madre soltera con 2 ninos',
      'Me interesa Foresta pero necesito saber si hay escuelas cerca',
      'La zona es segura? hay vigilancia 24/7?',
      'Tengo un presupuesto ajustado, hay opciones de financiamiento?',
      'Cuanto seria la cuota mensual minima?',
      'Es posible agendar una visita el domingo? entre semana trabajo',
      'Gracias por la paciencia, se que hago muchas preguntas',
    ],
  },
  {
    name: 'Mauricio Quintanilla',
    phone: '50370001015',
    style: 'medico, quiere invertir sus ahorros, analitico',
    project: 'Portacelli',
    messages: [
      'Buenas noches. Soy medico y quiero diversificar mis inversiones',
      'Que opciones manejan con retorno por renta?',
      'Cual es el yield anual promedio en sus proyectos?',
      'Tienen data historica de apreciacion en la zona?',
      'Se puede deducir fiscalmente la inversion?',
      'Prefiero algo llave en mano, ustedes hacen eso?',
      'Bien, agendemos. Tengo libre los miercoles por la tarde',
    ],
  },
  {
    name: 'Sandra Mejia',
    phone: '50370001016',
    style: 'agresiva compradora, quiere descuento o se va',
    project: 'Portacelli',
    messages: [
      'Mire yo quiero comprar pero necesito un buen precio',
      'En Briko me dieron 15% de descuento en preventa',
      'Si no me igualan el precio me voy con ellos',
      'Cuanto es lo maximo que me pueden bajar?',
      'Y si pago de contado? ahi si hay descuento verdad?',
      'No me salgan con que el precio es fijo',
      'Bueno haganme su mejor oferta y les digo',
    ],
  },
  {
    name: 'Eduardo Castillo',
    phone: '50370001017',
    style: 'arquitecto, pregunta detalles tecnicos del proyecto',
    project: 'Foresta',
    messages: [
      'Hola. Soy arquitecto y me interesa el proyecto Foresta',
      'Cual es el sistema constructivo? marcos rigidos o mamposteria?',
      'Tienen las especificaciones tecnicas de los acabados?',
      'El diseno es de que firma? es local o internacional?',
      'Cuantos metros cuadrados de construccion tiene el townhome grande?',
      'Hay planos que pueda revisar antes de la visita?',
      'Interesante. Me gustaria verlo en persona',
    ],
  },
  {
    name: 'Gabriela Torres',
    phone: '50370001018',
    style: 'referida por amigo, alta confianza inicial',
    project: 'Portacelli',
    messages: [
      'Hola! mi amigo Carlos Rivas me recomendo con ustedes',
      'El compro en Portacelli y esta muy contento',
      'Yo quiero lo mismo que el. Que opciones hay todavia?',
      'Hay algún descuento por referido?',
      'Me dijo que el trato con Michael fue excelente',
      'Puedo ir con Carlos a ver la unidad que el compro?',
      'Super! coordinen conmigo por favor',
    ],
  },
  {
    name: 'Francisco Salazar',
    phone: '50370001019',
    style: 'solo quiere info, no va a comprar, curioso',
    project: null,
    messages: [
      'Hola solo para preguntar',
      'Son ustedes los del proyecto en Nuevo Cuscatlan?',
      'Ah ok, y mas o menos cuanto cuestan esas casas?',
      'Aja, y la gente si esta comprando o esta lento?',
      'Interesante. No es para mi pero tengo un primo que anda buscando',
      'Le paso su numero y que el los contacte',
      'Ok gracias, buena tarde',
    ],
  },
  {
    name: 'Valentina Orellana',
    phone: '50370001020',
    style: 'pareja joven, decision conjunta, va y viene',
    project: 'Foresta',
    messages: [
      'Holaaa! mi novio y yo estamos buscando nuestro primer hogar juntos',
      'Nos gustan los townhomes de Foresta, son hermosos 😊',
      'Mi novio dice que pregunte por los de 3 habitaciones',
      'Esperen, el dice que mejor de 2 porque somos solo nosotros dos',
      'Jaja perdón, ya decidimos: 3 habitaciones por si vienen bebes 🤭',
      'Podemos ir los dos el sábado a conocer?',
      'Perfecto! ahi estaremos',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 2: PIDEN COSAS QUE GT NO TIENE / NO OFRECE
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Ernesto Villalobos',
    phone: '50370001021',
    style: 'quiere alquilar, no comprar — GT no maneja alquileres',
    project: null,
    messages: [
      'Hola buenas, ando buscando un apartamento en alquiler',
      'Algo por $400-$500 mensuales en zona de San Salvador',
      'No me interesa comprar, solo alquilar por ahora',
      'Tienen alguna unidad disponible para renta?',
      'Y no saben de alguien que alquile por ahi cerca?',
      'Ah ok, entonces ustedes solo venden? no rentan nada?',
      'Ya bueno gracias, voy a buscar en otro lado',
    ],
  },
  {
    name: 'Lorena Gutierrez',
    phone: '50370001022',
    style: 'quiere terreno — GT vende unidades construidas no lotes',
    project: null,
    messages: [
      'Buen dia! estoy buscando un terreno para construir mi casa',
      'Algo como 300-400 varas en zona residencial',
      'No quiero casa hecha, quiero construir a mi gusto',
      'Tienen lotes disponibles? en que zona?',
      'Pero si no venden terrenos que venden entonces?',
      'Ay no, yo no quiero departamento, quiero mi propio terreno',
      'Bueno si saben de terrenos me avisan',
    ],
  },
  {
    name: 'Marco Antonio Fuentes',
    phone: '50370001023',
    style: 'quiere local comercial — GT es residencial/inversion',
    project: null,
    messages: [
      'Hola necesito un local comercial para mi negocio',
      'Algo en zona de Escalon o San Benito, 50-100m2',
      'Es para poner un restaurante',
      'No me interesa residencial, necesito comercial',
      'Tienen algo comercial dentro de sus proyectos?',
      'Ni un local en planta baja? nada de uso mixto?',
      'Mmm ok, conocen a alguien que tenga locales?',
    ],
  },
  {
    name: 'Carmen Rosa Perez',
    phone: '50370001024',
    style: 'quiere casa usada barata — GT es preventa/nuevo',
    project: null,
    messages: [
      'Hola ando buscando una casita usada, algo economico',
      'Mi presupuesto es $30,000 maximo',
      'No tiene que ser nueva, puede ser de segunda mano',
      'Tienen algo asi? aunque sea viejita pero en buen estado',
      'Ay $100,000+ es demasiado para mi, yo gano salario minimo',
      'No hay opcion de cuotas de $100 mensuales?',
      'Entiendo, muchas gracias de todos modos',
    ],
  },
  {
    name: 'Jaime Hernandez Luna',
    phone: '50370001025',
    style: 'quiere comprar en Guatemala no en El Salvador',
    project: null,
    messages: [
      'Hola! ustedes venden en Guatemala tambien?',
      'Me dijeron que los de Cayala son ustedes',
      'Quiero comprar en zona 15 de Guatemala, no en El Salvador',
      'No tienen ningun proyecto alla? ni en Antigua?',
      'Pero si dicen que son de Cayala, como no tienen en Guatemala?',
      'A ver explicame bien entonces, cual es la relacion con Cayala?',
      'Ah ok ya entendi, son de El Salvador nomas. Gracias',
    ],
  },
  {
    name: 'Rodrigo Castellanos',
    phone: '50370001026',
    style: 'quiere construir en su terreno — GT no es constructora',
    project: null,
    messages: [
      'Buenas, yo ya tengo mi terreno en Santa Tecla',
      'Necesito quien me construya una casa ahi',
      'Ustedes hacen construccion a medida?',
      'Entonces no son constructores? que hacen exactamente?',
      'Ah solo venden proyectos de otros? entiendo',
      'Pero conocen un ingeniero bueno para contratar?',
      'Va pues gracias por la info',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 3: PREGUNTAN POR COSAS YA VENDIDAS / PUBLICADAS PERO NO DISPONIBLES
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Raul Estrada',
    phone: '50370001027',
    style: 'vio unidad vendida publicada, se enoja que ya no hay',
    project: 'Portacelli',
    messages: [
      'Hola vi el apartamento de $95,000 en Portacelli que publicaron',
      'Es el de 2 habitaciones con vista, ese mismo quiero',
      'Como que ya no esta disponible? lo tienen publicado todavia!',
      'Eso es publicidad enganosa pues',
      'Bueno hay algo similar al mismo precio?',
      'Pero el que publicaron se veia mas bonito...',
      'Va pues, que opciones quedan entonces?',
    ],
  },
  {
    name: 'Silvia Contreras',
    phone: '50370001028',
    style: 'quiere modelo agotada de Foresta, insiste',
    project: 'Foresta',
    messages: [
      'Hola quiero el townhome de 106m2 de Foresta',
      'Si ese, el modelo que sale en el anuncio de Instagram',
      'Como que ya se vendieron todos los de ese modelo??',
      'Pero apenas lo vi hoy publicado! como es posible?',
      'No tienen ni uno solo? ni lista de espera?',
      'Si alguien cancela me pueden avisar? yo lo quiero',
      'Ponganme en lista de espera entonces, por favor',
    ],
  },
  {
    name: 'Jorge Alvarado',
    phone: '50370001029',
    style: 'lo contactaron hace meses, el precio subio, se queja',
    project: 'Portacelli',
    messages: [
      'Hola me escribieron hace 6 meses sobre Portacelli',
      'Me dijeron que el precio era $120,000 y ahora sale mas caro',
      'Como subio $20,000 en 6 meses? eso no es normal',
      'Pueden respetar el precio que me dieron antes?',
      'Pero yo tengo los mensajes guardados donde me dijeron el otro precio',
      'Eso no es justo, deberian respetar su palabra',
      'Bueno haganme algo o me voy con la competencia',
    ],
  },
  {
    name: 'Diana Molina',
    phone: '50370001030',
    style: 'quiere unidad especifica que ya esta reservada',
    project: 'Foresta',
    messages: [
      'Buenas! quiero el townhome 4B de Foresta, el de la esquina',
      'Ese es el unico que me gusta por la ubicacion',
      'Reservado? y no se puede desreservar?',
      'Cuanto tiempo tienen para pagar? si no pagan me lo dan a mi?',
      'Que pasa si esa persona no cierra? yo tengo el dinero hoy',
      'Me pueden avisar si se cae esa reserva?',
      'Ok dejeme su numero del encargado para estar pendiente',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 4: ALQUILER Y ADMINISTRACION DE PROPIEDADES
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Marta Eugenia Diaz',
    phone: '50370001031',
    style: 'ya compro en Portacelli, quiere que GT le administre el alquiler',
    project: 'Portacelli',
    messages: [
      'Hola soy propietaria en Portacelli, ya compre el ano pasado',
      'Quiero poner mi unidad en alquiler pero no tengo tiempo de manejarla',
      'Ustedes ofrecen servicio de administracion de alquileres?',
      'Quien busca inquilinos, cobra la renta, mantenimiento, todo eso?',
      'Entonces no manejan eso? a quien me recomiendan?',
      'Y cuanto deberia cobrar de renta segun ustedes?',
      'Ok gracias. Si conocen a alguien interesado en rentar me avisan',
    ],
  },
  {
    name: 'Henry Recinos',
    phone: '50370001032',
    style: 'quiere Airbnb en la playa — GT no tiene playa',
    project: null,
    messages: [
      'Que tal! me interesa comprar algo para Airbnb',
      'Pero necesito que sea en la playa, zona de La Libertad o El Tunco',
      'Tienen algun proyecto en la costa?',
      'Solo en Nuevo Cuscatlan? no hay nada de playa?',
      'Es que para Airbnb la playa es lo que jala turistas',
      'Un departamento en la ciudad no me renta igual que playa',
      'Bueno si sacan algo de playa me avisan',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 5: PRESUPUESTOS MUY BAJOS / FUERA DE RANGO
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Josefina Ramos',
    phone: '50370001033',
    style: 'presupuesto de $15,000 — muy debajo del minimo',
    project: null,
    messages: [
      'Hola buenos dias, estoy ahorrando para una casita',
      'Tengo $15,000 ahorrados, con eso alcanza?',
      'No hay algo pequeño? un cuartito aunque sea',
      'Ay no $100,000 es imposible para mi',
      'Ni siquiera con credito? yo gano $400 al mes',
      'Conocen algun programa del gobierno de vivienda?',
      'Bueno gracias, voy a seguir ahorrando entonces',
    ],
  },
  {
    name: 'Nelson Campos',
    phone: '50370001034',
    style: 'quiere pagar en cuotas de $50 — no es realista',
    project: 'Portacelli',
    messages: [
      'Hola me interesa Portacelli',
      'Puedo pagar $50 mensuales?',
      'Es lo que me alcanza con mi salario',
      'No hay un plan a 30 anos con cuotas bajitas?',
      'Y si doy $500 de reserva y luego $50 al mes?',
      'Uy el credito del banco me piden mucho de entrada',
      'Que lastima, cuando tengan algo mas accesible me avisan',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 6: SITUACIONES CONFLICTIVAS / QUEJAS
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Arturo Lemus',
    phone: '50370001035',
    style: 'compro y esta enojado con retrasos en la entrega',
    project: 'Foresta',
    messages: [
      'Necesito hablar con alguien de la empresa URGENTE',
      'Compre mi townhome hace 2 anos y no me lo han entregado',
      'Me dijeron que en 18 meses y ya van 24, que pasa?',
      'Yo ya pague toda la prima, no me pueden tener esperando',
      'Quiero hablar con Michael Narvaez directamente',
      'Si no me dan respuesta esta semana voy a poner demanda',
      'Mi abogado ya esta preparando todo, avisenle a su jefe',
    ],
  },
  {
    name: 'Rosa Amelia Guardado',
    phone: '50370001036',
    style: 'quiere devolucion de reserva — politica de reembolso',
    project: 'Portacelli',
    messages: [
      'Hola reserve en Portacelli el mes pasado pero ya no quiero',
      'Necesito que me devuelvan mi dinero de la reserva',
      'Como que no es 100% reembolsable? me dijeron que si!',
      'Quiero ver en el contrato donde dice eso',
      'Mire yo necesito mi dinero, tuve una emergencia',
      'No me importa si pierdo un porcentaje, cuanto me devuelven?',
      'Pasenme con el encargado de esto por favor',
    ],
  },
  {
    name: 'Hector Flores Guzman',
    phone: '50370001037',
    style: 'dice que le prometieron cosas que no eran, amenaza redes',
    project: 'Foresta',
    messages: [
      'Oigan el asesor que me atendio me dijo que el townhome venia con piscina',
      'Y ahora me dicen que la piscina es solo area comun? no era privada?',
      'Tengo los audios guardados donde dice piscina privada',
      'Si no me cumplen lo que me prometieron lo subo a redes sociales',
      'Quiero que el gerente me llame hoy',
      'Ustedes no pueden andar prometiendo cosas que no son',
      'Lo voy a subir a TikTok y que la gente juzgue',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 7: PREGUNTAS FUERA DE TEMA / CONFUNDIDOS
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Pedro Pablo Reyes',
    phone: '50370001038',
    style: 'numero equivocado, cree que es otra empresa',
    project: null,
    messages: [
      'Hola necesito un plomero urgente, se me esta inundando la casa',
      'Es la ferreteria verdad? me dieron este numero',
      'Ah no son ferreteria? perdon',
      'Pero ya que estoy aqui, ustedes que venden?',
      'A casas? interesante, cuanto cuestan?',
      'Uy no, primero necesito arreglar la que tengo jaja',
      'Bueno disculpe, buena tarde',
    ],
  },
  {
    name: 'Lucia Esperanza',
    phone: '50370001039',
    style: 'cree que GT es el desarrollador, no el comercializador',
    project: 'Foresta',
    messages: [
      'Hola ustedes son los que estan construyendo Foresta?',
      'Necesito hablar con el ingeniero de obra',
      'Es que paso por ahi todos los dias y quiero saber del avance',
      'Tambien quiero saber si estan contratando albaniles',
      'Ah ustedes no son los constructores? y quienes son entonces?',
      'O sea que venden lo que otros construyen?',
      'Ya entiendo. Bueno y cuanto cuesta un townhome de esos?',
    ],
  },
  {
    name: 'Roberto Carlos Duran',
    phone: '50370001040',
    style: 'quiere criptomonedas, no bienes raices',
    project: null,
    messages: [
      'Hey vi que son fintech, ustedes manejan criptomonedas?',
      'Quiero invertir en Bitcoin pero a traves de una empresa seria',
      'Me dijeron que ustedes son proptech, eso es como cripto verdad?',
      'Ah no? es bienes raices? nada de cripto entonces?',
      'Pero aceptan pago en Bitcoin para las propiedades?',
      'En El Salvador es moneda legal, deberian aceptar',
      'Bueno piensen en agregar cripto, seria buena idea',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 8: CONDOMINIOS / COSTOS OCULTOS
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Karla Beatriz Romero',
    phone: '50370001041',
    style: 'pregunta por cuota de mantenimiento/condominio',
    project: 'Portacelli',
    messages: [
      'Hola me interesa Portacelli pero tengo una duda importante',
      'Cuanto es la cuota de mantenimiento mensual del condominio?',
      'Y que incluye? seguridad, piscina, gym, areas verdes?',
      'Quien administra el condominio? ustedes o un tercero?',
      'He escuchado que en otros residenciales la cuota sube cada ano',
      'Hay garantia de que la cuota no va a duplicarse en 5 anos?',
      'Eso es muy importante para mi decision, gracias',
    ],
  },
  {
    name: 'Walter Molina',
    phone: '50370001042',
    style: 'pregunta todos los costos ocultos — cierre, escritura, etc',
    project: 'Foresta',
    messages: [
      'Buenas, aparte del precio del townhome que otros costos hay?',
      'Cuanto sale la escrituracion?',
      'Y el impuesto de transferencia? el notario? registro?',
      'Hay que pagar IVA sobre la propiedad?',
      'Cual es el costo total real de cerrar? con todo incluido',
      'Es que en otros proyectos me salieron $15,000 extras que no me dijeron',
      'Necesito el desglose completo antes de decidir',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 9: DIASPORA CON SITUACIONES COMPLICADAS
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Marvin Escobar',
    phone: '50370001043',
    style: 'en USA sin papeles, puede comprar? tiene ITIN no SSN',
    project: 'Portacelli',
    messages: [
      'Hola estoy en Houston pero no tengo papeles aqui',
      'Puedo comprar propiedad en El Salvador? soy salvadoreno',
      'El problema es que no tengo SSN, solo ITIN',
      'Los bancos de alla me dan credito con solo DUI?',
      'Y si no califico para credito puedo pagar directo a ustedes?',
      'Cuanto seria el plan de pagos directo sin banco?',
      'Va pues me interesa, como empiezo desde aca?',
    ],
  },
  {
    name: 'Blanca Estela Rivera',
    phone: '50370001044',
    style: 'quiere comprar a nombre de familiar — complicacion legal',
    project: 'Foresta',
    messages: [
      'Hola quiero comprar un townhome pero a nombre de mi mama',
      'Yo vivo en USA y ella vive en El Salvador',
      'Puedo pagar yo pero que salga a nombre de ella?',
      'Que documentos necesita mi mama?',
      'Y si mi mama no puede ir a firmar, hay poder notarial?',
      'Se puede hacer el poder desde el consulado de aca?',
      'Ok pero necesito que me expliquen bien el proceso legal',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 10: COMPETENCIA DIRECTA / ESPIAS
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Fernando Molina R',
    phone: '50370001045',
    style: 'trabaja en la competencia, pide precios para comparar',
    project: 'Portacelli',
    messages: [
      'Buenas, quiero toda la info de precios de Portacelli',
      'Necesito tabla de precios de todas las unidades disponibles',
      'Cual es la comision que pagan a corredores externos?',
      'Cuantas unidades les quedan sin vender?',
      'Cual es su velocidad de venta mensual?',
      'Y la estructura de precios por piso cual es?',
      'Ok gracias, es para un estudio de mercado',
    ],
  },
  {
    name: 'Isabel Quintero',
    phone: '50370001046',
    style: 'agente inmobiliaria quiere alianza, GT ya tiene equipo',
    project: null,
    messages: [
      'Hola soy agente inmobiliaria certificada en El Salvador',
      'Quiero saber si trabajan con corredores externos',
      'Tengo una cartera de 200 clientes buscando inversion',
      'Cuanto pagan de comision por referido?',
      'Podemos hacer una alianza formal? yo les traigo clientes',
      'Tengo certificacion AMPI y todo en regla',
      'Denme el contacto del gerente comercial para coordinar',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 11: MULTIPLES MENSAJES RAPIDOS / PRESION DE TIEMPO
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Emilio Vega',
    phone: '50370001047',
    style: 'manda 5 mensajes seguidos sin esperar respuesta',
    project: 'Portacelli',
    messages: [
      'Hola',
      'Me interesa Portacelli',
      'Cuanto cuesta',
      'Hay disponibilidad?',
      'Hola? Alguien me puede atender?',
      'Bueno ya vi que tardan en contestar',
      'Si me responden antes de las 5 me interesa, si no ya no',
    ],
  },
  {
    name: 'Yolanda de Menjivar',
    phone: '50370001048',
    style: 'abuela que escribe como habla, mensajes cortados',
    project: 'Foresta',
    messages: [
      'ola',
      'esk mi hijo',
      'me dijo q le buskara',
      'de los taunjoums',
      'kmo se yaman los de nuevo cuskatan?',
      'si esos. kuanto balen?',
      'ba le digo a mi hijo grasias',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 12: INGLES / OTROS IDIOMAS
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Michael Johnson',
    phone: '50370001049',
    style: 'americano que no habla espanol, inversionista extranjero',
    project: 'Portacelli',
    messages: [
      'Hello, do you speak English?',
      'I heard about real estate opportunities in El Salvador',
      'What are the prices for the Portacelli project?',
      'Is it safe to invest as a foreigner? property rights?',
      'What is the expected ROI on rental income?',
      'Can I buy without being a resident?',
      'I would like to schedule a video call with someone who speaks English',
    ],
  },
  {
    name: 'Jean Pierre Duval',
    phone: '50370001050',
    style: 'frances, habla en ingles/espanol basico mezclado',
    project: 'Foresta',
    messages: [
      'Bonjour, je cherche investissement immobilier au Salvador',
      'Sorry my Spanish is not good. Foresta project please?',
      'How much for the townhome? I live in Paris',
      'Is Nuevo Cuscatlan close to the airport?',
      'Mon ami salvadorien me recommande votre company',
      'What documents I need as European citizen?',
      'Thank you, I will discuss with my financial advisor',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 13: PROYECTOS INVENTADOS / CONFUSIONES
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Antonio Barrera',
    phone: '50370001051',
    style: 'pregunta por proyecto que no existe, confundio nombre',
    project: null,
    messages: [
      'Hola me interesa el proyecto Las Terrazas que vi en Facebook',
      'Si, Las Terrazas de Nuevo Cuscatlan, lo anunciaron la semana pasada',
      'No se llama asi? mmm a ver dejeme buscar el anuncio',
      'Puede ser Terranova? o Terracota? algo con Terra',
      'Es el de los departamentos con vista a las montanas',
      'Ah puede ser Portacelli? no estoy seguro del nombre',
      'Si ese! Portacelli. Perdon jaja. Cuanto cuesta?',
    ],
  },
  {
    name: 'Maricela Jovel',
    phone: '50370001052',
    style: 'confunde GT con otra inmobiliaria, trae datos cruzados',
    project: null,
    messages: [
      'Hola ustedes son los que tienen el proyecto en Santa Elena?',
      'El de los penthouses con club house en el ultimo piso',
      'Un amigo compro ahi y me dijo que ustedes se lo vendieron',
      'Se llama algo como Portanova o Portaleon... algo asi',
      'Ah Portacelli? pero eso no esta en Santa Elena verdad?',
      'Mmm no se, me dijo Santa Elena. Tal vez es otra empresa',
      'Va pues, pero me interesa lo que ustedes si tengan',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 14: MASCOTAS, PET FRIENDLY, RESTRICCIONES
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Daniela Esmeralda Cruz',
    phone: '50370001053',
    style: 'tiene 3 perros grandes, pet friendly es dealbreaker',
    project: 'Foresta',
    messages: [
      'Hola me gustan los townhomes pero tengo una pregunta crucial',
      'Tengo 3 perros grandes, un golden retriever y 2 labradores',
      'Es pet friendly el condominio? pueden estar mis perros?',
      'Hay restriccion de tamano o raza? porque son grandes',
      'Tienen area para pasear perros? parque canino?',
      'Si no es pet friendly no me interesa, asi de simple',
      'Ok y los vecinos no se quejan? hay reglas del condominio?',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 15: HERENCIA / TESTAMENTO
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Don Rafael Menendez',
    phone: '50370001054',
    style: 'quiere comprar como herencia para hijos — temas legales',
    project: 'Portacelli',
    messages: [
      'Buenas tardes joven, le consulto algo',
      'Quiero comprar un apartamento para dejarselo de herencia a mis hijos',
      'Si yo lo compro se puede poner a nombre de los 3? son menores',
      'Que pasa si yo fallezco antes de pagar todo? pierde la familia?',
      'Hay seguro de desgravamen incluido?',
      'Mi esposa puede seguir pagando si algo me pasa?',
      'Esas cosas hay que dejarlas claras antes de firmar nada',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 16: QUEJAS DE OTROS CLIENTES REALES
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Alejandra Pineda',
    phone: '50370001055',
    style: 'su vecina en Portacelli le dijo que hay problemas',
    project: 'Portacelli',
    messages: [
      'Hola es cierto que en Portacelli hay problemas con el agua?',
      'Mi vecina que ya vive ahi dice que el agua es intermitente',
      'Tambien me dijo que la administracion no sirve',
      'Yo estaba por comprar ahi pero eso me da miedo',
      'Me pueden asegurar que esos problemas ya se resolvieron?',
      'Puedo hablar con alguien que ya viva ahi para que me cuente?',
      'Necesito confianza antes de meter mi dinero',
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 17: SPAM / BOTS / MENSAJES RAROS
  // ══════════════════════════════════════════════════════════════

  {
    name: 'Bot Spam 1',
    phone: '50370001056',
    style: 'spam tipico, links sospechosos',
    project: null,
    messages: [
      'Felicidades! has ganado un iPhone 15 Pro Max! Reclama aqui: bit.ly/xxx',
      'URGENTE: Tu cuenta bancaria ha sido comprometida. Verifica aqui',
      'Hola te gustaria ganar $5000 diarios desde tu casa?',
      'Trabaja con nosotros en trading de forex! 500% de retorno',
      'Increible oportunidad! Invertir en crypto con ganancia garantizada',
      'Prestamos inmediatos sin requisitos, aprobacion en 5 minutos',
      'Ultima oportunidad! Esta oferta se acaba en 24 horas',
    ],
  },
  {
    name: 'Numero Mudo',
    phone: '50370001057',
    style: 'solo manda emojis y stickers, no escribe nada',
    project: null,
    messages: [
      '👋',
      '🏠',
      '💰',
      '?',
      '👍',
      '🤔',
      '😅',
    ],
  },
]

// --- Helpers ---

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex')
}

function buildPayload(phone: string, message: string, msgIndex: number): string {
  const msgId = `wamid.stress_${phone}_${msgIndex}_${Date.now()}`
  const timestamp = Math.floor(Date.now() / 1000).toString()

  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'stress_test',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15551234567', phone_number_id: 'stress' },
          contacts: [{ profile: { name: phone }, wa_id: phone }],
          messages: [{
            id: msgId,
            from: phone,
            timestamp,
            type: 'text',
            text: { body: message },
          }],
        },
        field: 'messages',
      }],
    }],
  })
}

interface BotResult {
  persona: string
  phone: string
  round: number
  message: string
  status: number
  timeMs: number
  error?: string
}

async function sendMessage(persona: Persona, msgIndex: number): Promise<BotResult> {
  const message = persona.messages[msgIndex % persona.messages.length]
  const body = buildPayload(persona.phone, message, msgIndex)
  const signature = sign(body)

  const start = Date.now()
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signature,
      },
      body,
    })
    return {
      persona: persona.name,
      phone: persona.phone,
      round: msgIndex + 1,
      message,
      status: res.status,
      timeMs: Date.now() - start,
    }
  } catch (err) {
    return {
      persona: persona.name,
      phone: persona.phone,
      round: msgIndex + 1,
      message,
      status: 0,
      timeMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2)
  const getArg = (name: string, def: number) => {
    const found = args.find(a => a.startsWith(`--${name}=`))
    return found ? parseInt(found.split('=')[1], 10) : def
  }

  const botCount = Math.min(getArg('bots', 10), PERSONAS.length)
  const rounds = getArg('rounds', 5)
  const delay = getArg('delay', 3000)

  const bots = PERSONAS.slice(0, botCount)

  console.log('\n=== STRESS TEST: Daniela bajo presion ===')
  console.log(`Bots: ${botCount} | Rondas: ${rounds} | Delay: ${delay}ms`)
  console.log(`Webhook: ${WEBHOOK_URL}`)
  console.log('==========================================\n')

  // Verificar que el server responde
  try {
    const health = await fetch(WEBHOOK_URL.replace('/api/webhook/whatsapp', '/api/health'))
    if (!health.ok) {
      console.error('Server no responde en /api/health. Asegurate que este corriendo.')
      process.exit(1)
    }
    console.log('Server OK\n')
  } catch {
    console.error(`No se puede conectar a ${WEBHOOK_URL}. Asegurate que el server este corriendo.`)
    process.exit(1)
  }

  const allResults: BotResult[] = []
  const startTime = Date.now()

  for (let round = 0; round < rounds; round++) {
    console.log(`--- Ronda ${round + 1}/${rounds} ---`)

    // Enviar todos los mensajes de esta ronda en paralelo
    const promises = bots.map(bot => sendMessage(bot, round))
    const results = await Promise.all(promises)

    for (const r of results) {
      allResults.push(r)
      const status = r.status === 200 ? '✓' : `✗ ${r.status}`
      const err = r.error ? ` [${r.error}]` : ''
      console.log(`  ${status} ${r.persona.padEnd(22)} ${r.timeMs}ms  "${r.message.slice(0, 50)}..."${err}`)
    }

    if (round < rounds - 1) {
      // Agregar jitter para simular realismo
      const jitter = Math.random() * delay * 0.5
      const wait = delay + jitter
      console.log(`  ... esperando ${Math.round(wait)}ms ...\n`)
      await new Promise(r => setTimeout(r, wait))
    }
  }

  // --- Reporte final ---
  const totalTime = Date.now() - startTime
  const successes = allResults.filter(r => r.status === 200).length
  const failures = allResults.filter(r => r.status !== 200).length
  const avgTime = Math.round(allResults.reduce((a, r) => a + r.timeMs, 0) / allResults.length)
  const maxTime = Math.max(...allResults.map(r => r.timeMs))
  const minTime = Math.min(...allResults.map(r => r.timeMs))

  console.log('\n==========================================')
  console.log('           REPORTE FINAL')
  console.log('==========================================')
  console.log(`Total mensajes:     ${allResults.length}`)
  console.log(`Exitosos:           ${successes}`)
  console.log(`Fallidos:           ${failures}`)
  console.log(`Tiempo total:       ${(totalTime / 1000).toFixed(1)}s`)
  console.log(`Resp. promedio:     ${avgTime}ms`)
  console.log(`Resp. min:          ${minTime}ms`)
  console.log(`Resp. max:          ${maxTime}ms`)
  console.log(`Mensajes/segundo:   ${(allResults.length / (totalTime / 1000)).toFixed(1)}`)

  if (failures > 0) {
    console.log('\n--- Errores ---')
    for (const r of allResults.filter(r => r.status !== 200)) {
      console.log(`  ${r.persona} (ronda ${r.round}): ${r.status} ${r.error ?? ''}`)
    }
  }

  // Resumen por persona
  console.log('\n--- Por persona ---')
  for (const bot of bots) {
    const botResults = allResults.filter(r => r.phone === bot.phone)
    const ok = botResults.filter(r => r.status === 200).length
    const avg = Math.round(botResults.reduce((a, r) => a + r.timeMs, 0) / botResults.length)
    console.log(`  ${bot.name.padEnd(22)} ${ok}/${botResults.length} OK  avg ${avg}ms  [${bot.style.slice(0, 40)}]`)
  }

  console.log('\n==========================================')
  console.log('Revisa la base de datos para ver las respuestas de Daniela')
  console.log('Panel: http://localhost:3000/panel')
  console.log('==========================================\n')
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
