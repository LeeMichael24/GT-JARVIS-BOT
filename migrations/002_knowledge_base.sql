-- Knowledge base: sales playbook, objection handling, and conversation examples
-- Run this in Supabase SQL Editor

create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  category text not null,          -- 'sales_playbook' | 'objection' | 'closing_technique' | 'project_pitch' | 'faq'
  topic text not null,             -- short label e.g. 'reserva_proceso', 'plusvalia_pitch', 'descuento_contado'
  title text not null,             -- human-readable title
  content text not null,           -- the actual knowledge/script
  project_slug text,               -- null = applies to all; 'portacelli-alta' = project-specific
  priority int default 0,          -- higher = more important, shown first
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_kb_category on knowledge_base(category);
create index if not exists idx_kb_project on knowledge_base(project_slug);
create index if not exists idx_kb_active on knowledge_base(active) where active = true;

-- Seed with sales playbook extracted from real team conversations

insert into knowledge_base (category, topic, title, content, project_slug, priority) values

-- ELEVATOR PITCHES
('project_pitch', 'portacelli_ecosistema', 'Pitch principal Portacelli',
'Portacelli es un ecosistema de 300 manzanas que transformará Nuevo Cuscatlán. El Master Plan a futuro incluirá torres corporativas, distritos comerciales y se tienen platicas con un hospital de emergencias con estándares de USA. Actualmente se lanza la Fase 1 Habitacional (33 manzanas), ubicada en la parte más alta. Gracias a la topografía privilegiada, los apartamentos del 3er nivel en adelante dominan la vista hasta el mar. El 50% del área es verde protegida.',
null, 10),

('project_pitch', 'respaldo_cayala', 'Respaldo Ciudad Cayalá',
'Portacelli está desarrollado por la Familia Leal de Guatemala, dueños de Ciudad Cayalá. Su modelo siempre garantiza alta plusvalía y calidad. Otros proyectos que han desarrollado: Torre Kaliako en Escalón, Torre Foresta El Encanto, Torre Utila 4-10 Santa Tecla, Foresta Townhomes El Encanto.',
null, 9),

('project_pitch', 'avance_obra', 'Estado de construcción actual',
'Actualmente se construye la calle de acceso de 4 carriles y el apartado comercial en la entrada del proyecto. Se han invertido $9M en la calle, incluidos 3 puentes construidos. La calle completa se entrega a mediados del 2026. A finales del 2026 comienza la construcción del área habitacional. Entrega de unidades proyectada para Q2-Q4 2028.',
null, 8),

-- SALES PLAYBOOK
('sales_playbook', 'primera_pregunta', 'Primera pregunta clave',
'Siempre abrir con: "¿Buscas esta propiedad para vivir o como inversión para rentabilidad?" Esto dirige toda la conversación. Si dice vivienda: enfocarse en calidad de vida, vistas, amenidades, PET friendly. Si dice inversión: enfocarse en plusvalía, preventa, precio por m2 más competitivo. Si dice ambos: combinar ambos ángulos.',
null, 10),

('sales_playbook', 'plan_pago_estandar', 'Plan de pago estándar',
'1. Reserva: apartamentos $3,000, townhomes $4,000, casas $5,000. 2. Luego de 60 días, firma la promesa de venta con un 15% de prima. 3. La prima se divide hasta en 24 meses (letra corrida, bimensual, trimestral, como el cliente prefiera). 4. A la prima se le resta el monto de la reserva. 5. Hay descuento del 20% en la prima por pago de contado.',
null, 10),

('sales_playbook', 'crear_urgencia', 'Crear urgencia natural',
'Nunca presionar al cliente. Crear urgencia de forma natural mencionando: "Las unidades se están reservando super rápido", "Aún estamos en preventa, estos precios ya no se verán", "En marzo/abril comenzarán a subir los precios", "Te comento porque hay otro cliente interesado en esa misma unidad". Compartir cuántas unidades se reservaron esa semana.',
null, 9),

('sales_playbook', 'escalar_reunion', 'Escalar a reunión con CEO/desarrolladores',
'Cuando el cliente muestra interés serio, ofrecer: "Con mucho gusto le podemos agendar una cita con el Ing. Michael Narváez, nuestro CEO, quien gestiona personalmente este proyecto con los inversionistas." Las reuniones pueden ser virtuales (Google Meet) o presenciales en oficinas de Grupo Fidelis (Colonia La Mascota, a la par de Shop USA). Siempre pedir nombre completo y correo para enviar invitación de Google Calendar.',
null, 9),

('sales_playbook', 'proceso_reserva', 'Proceso de reserva paso a paso',
'1. Cliente envía DUI (revés y derecho), dirección de residencia y correo electrónico. 2. Se comparte cuenta bancaria: CUENTA BAC CORRIENTE INVERSIONES PORTACELI SA DE CV N 201614849. 3. Al recibir transferencia, se entrega recibo oficial. 4. Se redacta documento de reserva con notario y representante legal (3-5 días hábiles). 5. Cliente llega a firmar cuando esté listo. 6. La promesa de compraventa se firma 60-90 días después de la reserva.',
null, 10),

('sales_playbook', 'seguimiento', 'Técnicas de seguimiento',
'Hacer seguimiento cálido y constante sin ser invasivo. Cada mensaje abrir con "Buen día [nombre], un gusto saludarte!" Cerrar con "Quedamos atentos, con mucho gusto" o "Feliz día y bendiciones". Si hay noticias (descuentos, nuevas fases), compartirlas proactivamente. Si el cliente no responde en 2-3 días, hacer check-in amable. Siempre dar actualizaciones sobre documentos pendientes.',
null, 8),

('sales_playbook', 'celebrar_compra', 'Celebrar la inversión',
'Al concretar reserva, felicitar efusivamente pero profesionalmente: "Muchas felicidades, hicieron una excelente inversión", "Ya está reservado tu apartamento, felicidades por esta increíble inversión". Esto refuerza la decisión y genera referidos.',
null, 7),

-- OBJECTION HANDLING
('objection', 'no_modelo_fisico', 'No hay apartamento modelo',
'Estamos en etapa temprana (preventa), únicamente se tienen los planos acotados. Los renders 3D son plantillas generales. Para referencia visual de calidad y acabados, pueden tomar como referencia Ciudad Cayalá de Guatemala, los dueños del proyecto. Esta etapa temprana es justamente la ventaja: compras al precio más bajo posible.',
null, 8),

('objection', 'construccion_no_iniciada', 'Construcción no ha iniciado',
'La fase comercial ya está en construcción (visible desde la carretera principal). El área habitacional comienza a finales del 2026. Las preventas son atractivas justamente porque al comprar antes de construir, congelan el precio por m2 más competitivo del mercado. Cuando inicie la construcción, los precios subirán significativamente.',
null, 8),

('objection', 'reembolso_reserva', 'Reembolso de la reserva',
'La reserva es 50% reembolsable. Esto se cambió del 100% anterior debido a la alta demanda de personas que reservaban sin estar seguras, quitándole la oportunidad a inversionistas comprometidos. Ser completamente transparente con esta información.',
null, 8),

('objection', 'precio_alto', 'El precio parece alto',
'Contextualizar: "Tenemos el precio por m2 más competitivo de Nuevo Cuscatlán." Los precios de preventa son significativamente menores que el valor de mercado futuro. Comparar con propiedades similares en la zona. Mencionar que unidades que se vendieron hace meses ya ganaron $10k+ en plusvalía. El plan de pago está diseñado para no descapitalizar.',
null, 8),

('objection', 'quiere_ver_permisos', 'Cliente pide permisos de construcción',
'Los permisos medioambientales ya están aprobados. Los permisos de construcción se activan cuando lleguen a la zona de construcción (planos finales en proceso). Ofrecer reunión presencial en oficinas para mostrar documentación. Siempre gestionar con los desarrolladores para proporcionar la información solicitada.',
null, 7),

-- FAQ
('faq', 'pet_friendly', 'PET friendly',
'Sí, Portacelli es PET friendly. Confirmar esto con seguridad al cliente.',
null, 7),

('faq', 'airbnb_permitido', 'Airbnb en Portacelli',
'Se permite Airbnb y rentas largas. La torre tiene una lógica de negocio separada: su propio acceso para vivienda permanente y su propio acceso para Airbnb. Son independientes.',
null, 7),

('faq', 'parqueos', 'Parqueos incluidos',
'Todos los apartamentos incluyen 2 parqueos que NO se cuentan en el metraje de la unidad. Los parqueos son techados y asignados.',
null, 7),

('faq', 'ubicacion_proyecto', 'Ubicación del proyecto',
'La entrada está justamente frente al centro de investigación forense de Nuevo Cuscatlán. Comparte acceso inicial con Portales del Bosque, luego es totalmente independiente con calle de 4 carriles. Oficinas en Colonia La Mascota, a la par de Shop USA (Grupo Fidelis).',
null, 7),

('faq', 'descuento_contado', 'Descuento por pago de contado',
'Si el cliente paga el 15% de la prima de contado a la firma de la promesa, recibe un 20% de descuento en la prima. Ejemplo para 101m2: prima $36,360 - reserva $3,000 = $33,360. Con 20% de descuento paga $26,688. Este descuento aplica al valor de la prima, no al precio total.',
null, 9),

('faq', 'financiamiento_bancario', 'Financiamiento bancario',
'El financiamiento bancario comienza cuando se entrega el edificio (Q2-Q4 2028). Durante la preventa solo se paga la prima del 15%. El equipo puede orientar con aliados ejecutivos bancarios para revisión de perfil crediticio.',
null, 7),

-- NEW ENTRIES FROM ADDITIONAL CONVERSATIONS

('sales_playbook', 'descuento_dos_opciones', 'Dos opciones de descuento por pago de contado',
'Al pagar la prima de contado, el inversionista puede elegir entre 2 opciones (ambas valen el mismo descuento). Ejemplo para 106m2 ($265,000): Opción 1 — Descuento en la prima: prima original $36,750, con 20% OFF paga $29,400. El precio en escritura queda $265,000. Opción 2 — Descuento en el precio total: 3% OFF al apartamento = $257,050. Prima a pagar $35,557.50. El precio en escritura queda $257,050 (reduce costos de escrituración). En ambos casos el ahorro es $7,950. Muchos inversionistas prefieren la opción 2 porque al ser menor el monto en escritura, el porcentaje de inscripción es menor.',
null, 9),

('sales_playbook', 'compra_corporativa', 'Compra a nombre de empresa',
'Si el inversionista desea comprar a nombre de una empresa (SA de CV), se necesitan: 1. NIT y NRC de la empresa. 2. Credencial del representante legal. 3. Escritura de constitución de la sociedad. 4. DUI del representante legal. 5. Correo electrónico corporativo. 6. Dirección de oficina. El proceso de reserva es idéntico, solo cambia la documentación.',
null, 8),

('sales_playbook', 'generar_referidos', 'Generar referidos naturalmente',
'Los clientes satisfechos generan referidos. Ejemplos reales: Lourdes contó a su hermano y casi reserva otra unidad. Gerardo recomendó a familiares (René Alvarenga, Solange Lavagnino). Monique conectó ejecutivos bancarios. Cuando el cliente mencione familia o amigos interesados, decir: "Con mucho gusto los recibimos en la oficina para mostrarles todo el proyecto." Para referidos múltiples: "Si ambos reservan, hay descuentos especiales."',
null, 8),

('faq', 'sistema_constructivo', 'Sistema constructivo y calidad',
'El edificio es de concreto con técnicas antisísmicas estándares del mercado. Pared sólida entre apartamentos para reducir ruido. El proyecto es categorizado tipo A+ (top en construcciones habitacionales). Los diseños los trabaja AVIT, compañía guatemalteca. Se están licitando constructoras como Grupo Nabla y Pretec (experta en los townhomes El Encanto).',
null, 7),

('faq', 'cesion_derechos', 'Cesión de derechos a terceros',
'Sí se puede ceder el derecho a un familiar o tercero. Se gestiona directamente con Gustavo en la firma. Es con total transparencia y se agenda en el contrato.',
null, 6),

('faq', 'modificaciones_planos', 'Modificaciones a los planos',
'Como el proyecto está en etapa de planos, es posible solicitar modificaciones internas (convertir cuarto de empleada en oficina, combinar unidades, etc.). Se debe consultar con los arquitectos. Hay un costo extra según la modificación. El momento ideal es ahora, antes de iniciar construcción.',
null, 7),

('faq', 'cocina_gas_electrica', 'Cocina de gas o eléctrica',
'El cuerpo de bomberos de El Salvador normalmente requiere cocina eléctrica en edificios. Se están evaluando opciones híbridas (gas + eléctrica). Consultar con el equipo de desarrollo para la respuesta definitiva.',
null, 6),

('faq', 'extranjeros_financiamiento', 'Financiamiento para extranjeros',
'Banco Cuscatlán no presta a extranjeros directamente. Solución: un familiar salvadoreño puede ser fiador. El banco necesita las últimas 2-3 declaraciones de impuestos del fiador. Se envían a Gustavo Munguía quien coordina con el banco. El crédito se aprueba normalmente.',
null, 7),

('objection', 'cliente_indeciso', 'Cliente que no se decide',
'No presionar. Decir: "Es de tener la seguridad al 100%, con mucho gusto lo recibimos en la oficina para mostrarle todo el proyecto." Ofrecer reunión con CEO o desarrolladores para resolver dudas. Crear sentido de oportunidad: "Ahorita que aún no suben los precios deberían aprovechar." Compartir actualizaciones de unidades reservadas esa semana para mostrar movimiento.',
null, 8),

('sales_playbook', 'seguimiento_postventa', 'Seguimiento post-reserva',
'Después de la reserva: 1. Confirmar recepción de transferencia con equipo de finanzas (1-2 días). 2. Entregar recibo de caja sellado. 3. Redactar documento de reserva con notario (3-5 días hábiles). 4. Compartir borrador de promesa de venta para revisión con abogado del cliente. 5. Coordinar fecha de firma en oficinas. 6. Para pagos trimestrales, detallar línea de pagos con fechas exactas. 7. Enviar actualizaciones de avance de obra periódicamente. Siempre ser proactivo: "Le estamos dando seguimiento prioritario."',
null, 9),

('sales_playbook', 'manejar_demoras', 'Cómo manejar demoras y disculparse',
'Ser transparente sobre las demoras. Ejemplos reales del equipo: "Una disculpa que he pasado en reuniones todo el día." "Fíjate que Gustavo tuvo viajes imprevistos a Panamá, el lunes regresa y sigue con tu documento." "No te preocupes que le estamos dando seguimiento prioritario." Nunca dejar al cliente sin respuesta por más de 24h. Si no tienes la respuesta, di: "Déjame gestionarlo y te comento en cuanto tenga noticias."',
null, 8);
