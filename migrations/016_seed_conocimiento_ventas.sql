-- 016 — Base de conocimiento UNIVERSAL de ventas para Daniela (4-sep-2026)
-- CERO datos de proyectos (precios/unidades/entregas): eso llega VIVO del API
-- de Terranova. Aquí solo lo que no caduca: método de venta, cierres,
-- psicología, y el pack de sector inmobiliario SV (swappable al clonar).
-- Ejecutar en Supabase SQL Editor. Requiere el deploy con presupuesto de
-- playbook en 12K chars (lib/knowledge-base.ts) para que todo quepa al prompt.
--
-- FUENTES (principios destilados, sin reproducir texto):
--  · Ventas/psicología: R. Cialdini "Influence"; N. Rackham "SPIN Selling";
--    D. Carnegie "Cómo ganar amigos"; Z. Ziglar "Secrets of Closing the Sale";
--    Fisher & Ury "Sí, de acuerdo" (Harvard); D. Kahneman "Pensar rápido,
--    pensar despacio" (anclaje, aversión a la pérdida).
--  · Legal/financiero SV (documentos públicos y gratuitos): Ley de Impuesto
--    sobre Transferencia de Bienes Raíces (taiia.gob.sv); portal FSV
--    (portal.fsv.gob.sv, condiciones 2026); eRegulations El Salvador
--    (tramites.gob.sv, proceso de compraventa e inscripción CNR).
--  · Datos de proyectos: grupoterranovasv.com (páginas oficiales, 4-sep-2026).

-- ── A. FUERA LOS DATOS QUEMADOS DE PROYECTOS ──────────────────────────────
-- El conocimiento de proyectos NO vive aquí: llega VIVO desde Terranova en
-- cada mensaje (GET /listings → modelos, precios, disponibilidad, amenidades,
-- entrega, descripción) y, para ángulos curados, vía GET /daniela/knowledge
-- (sync diario). Así: proyecto nuevo en Terranova = Daniela ya lo vende, y
-- Daniela queda clonable a cualquier vertical (carros, cintas, lo que sea).
UPDATE knowledge_base SET active = false, updated_at = now()
WHERE category = 'project_pitch';


-- Idempotente: si esta migración (o una versión previa) ya corrió, se limpia
-- y re-siembra. Los pitches quemados de la versión previa desaparecen aquí.
DELETE FROM knowledge_base WHERE topic IN ('principio_reciprocidad', 'principio_compromiso', 'metodo_spin', 'escucha_70_30', 'aversion_perdida', 'anclaje_precio', 'rapport_carnegie', 'negociacion_harvard', 'cliente_exterior', 'confianza_sv', 'cierre_visita', 'cierre_resumen', 'cierre_condicional', 'cierre_etapa_precio', 'cierre_silencio', 'impuesto_transferencia', 'financiamiento_fsv', 'financiamiento_banca', 'proceso_compra', 'costos_cierre', 'inversion_roi', 'promesa_venta', 'registro_cnr', 'ley_condominio', 'sismo_resistencia', 'metros_utiles', 'etapas_construccion', 'acabados_preguntas', 'obj_muy_caro', 'obj_desconfianza_preventa', 'obj_mejor_espero',
  'portacelli_ecosistema_v2', 'pitch_portacelli_raices', 'pitch_portacelli_alba',
  'pitch_portacelli_alta', 'pitch_foresta');

-- ── C. PSICOLOGÍA Y MÉTODO DE VENTA (universal — sobrevive a cualquier producto) ──
INSERT INTO knowledge_base (category, topic, title, content, project_slug, priority) VALUES
('sales_playbook', 'principio_reciprocidad', 'Reciprocidad: da valor primero (Cialdini)',
'Antes de pedir (datos, cita), da algo útil: un dato de plusvalía de la zona, una comparación de precio por m², un consejo honesto. La gente corresponde a quien le aporta. Un cliente que recibió valor gratis responde mejor a "¿te agendo la visita?" que uno interrogado desde el saludo.', null, 6),

('sales_playbook', 'principio_compromiso', 'Compromisos chicos escalan (Cialdini)',
'Nadie firma de un salto. Consigue microcompromisos en orden: que responda una pregunta → que acepte recibir la ficha → que elija entre dos modelos → que agende visita. Cada "sí" pequeño hace más probable el siguiente. Nunca pidas el compromiso grande sin haber cobrado dos o tres chicos antes.', null, 6),

('sales_playbook', 'metodo_spin', 'Pregunta por implicación, no por ficha (SPIN)',
'Las preguntas que venden no son de formulario, son de implicación: "¿qué te está costando seguir alquilando?", "¿qué pasa si el precio sube en la siguiente etapa?", "¿cómo les afecta el espacio actual ahora que la familia crece?". Hacen que el CLIENTE diga en voz alta el costo de no comprar. Tú solo guías.', null, 6),

('sales_playbook', 'escucha_70_30', 'El cliente habla 70, tú 30',
'Vendedor que habla mucho, vende poco. Por cada dato que des, devuelve una pregunta corta. Resume lo que el cliente dijo con sus propias palabras antes de responder ("o sea que buscas algo para rentar, cerca de tu trabajo…") — sentirse escuchado abre la billetera más que cualquier descuento.', null, 6),

('sales_playbook', 'aversion_perdida', 'Duele más perder que ganar (Kahneman)',
'El cerebro pesa las pérdidas el doble que las ganancias. Enmarca en lo que se PIERDE por no actuar, siempre con datos reales: "en la siguiente etapa este modelo sube de precio", "quedan pocas unidades con esta vista". Nunca inventes escasez: si es mentira, destruye la confianza completa.', null, 6),

('sales_playbook', 'anclaje_precio', 'Ancla alto, aterriza accesible (Kahneman)',
'Presenta primero el valor completo del ecosistema o el modelo premium, luego el ticket de entrada: "hay casas hasta de $620K en Portacelli; tu entrada a este mismo ecosistema empieza en $252,500". El primer número ancla la percepción y el segundo se siente alcanzable.', null, 6),

('sales_playbook', 'rapport_carnegie', 'Rapport real: nombre, interés, espejo (Carnegie)',
'Usa el nombre del cliente (sin abusar), interésate genuinamente por su situación antes de vender, y espejea su estilo: si escribe corto, responde corto; si es formal, sé formal; si usa voseo relajado, relájate. La gente compra a quien siente parecido y a quien le cae bien.', null, 6),

('sales_playbook', 'negociacion_harvard', 'Negocia intereses, no posiciones (Harvard)',
'Cuando el cliente pelea un número ("bájame $10K"), pregunta qué hay detrás: ¿cuota mensual que no le alcanza? ¿miedo a pagar de más? Cada interés tiene más de una solución (otro modelo, otro plazo, otra etapa). Sobre la posición solo se puede regatear; el descuento especial se escala al CEO.', null, 6),

('sales_playbook', 'cliente_exterior', 'Salvadoreño en el exterior: el comprador estrella',
'Gran parte de la compra inmobiliaria en El Salvador viene de compatriotas en EE.UU. Sus motivos: patrimonio en su tierra, casa para la familia o para el retorno, e inversión en dólares. Manéjalo 100% remoto: video llamadas, tours virtuales, documentos digitales, y un familiar local puede visitar por él. La compra a distancia con poder notarial es práctica común — el detalle lo coordina el equipo.', null, 6),

('sales_playbook', 'confianza_sv', 'Contra la desconfianza: pruebas verificables',
'El comprador salvadoreño ha visto estafas de bienes raíces y desconfía con razón. No pidas confianza: da pruebas que él mismo pueda verificar — proyecto inscrito, desarrollador con obras entregadas, sitio oficial, visita presencial cuando quiera, y NUNCA pedir dinero por chat (los pagos se coordinan con el equipo, con documentos). La transparencia es tu mejor argumento de venta.', null, 6),

-- ── D. TÉCNICAS DE CIERRE (Ziglar y clásicos, adaptados) ───────────────────
('closing_technique', 'cierre_visita', 'El cierre de la visita (puppy dog)',
'La visita vende sola: quien pisa el proyecto y se imagina viviendo ahí, ya compró la mitad. Tu cierre número 1 SIEMPRE es agendar: "¿te queda mejor sábado en la mañana o entre semana por la tarde?". No vendas la casa por chat — vende la visita.', null, 6),

('closing_technique', 'cierre_resumen', 'Cierre por resumen (Ziglar)',
'Antes de pedir el siguiente paso, resume TODO lo que el cliente ya aceptó: "buscas 3 habitaciones, presupuesto hasta $270K, para estrenar en 2028, te gustó la vista de ALTA…". Cada punto es un sí acumulado. Luego el paso: "con eso, lo natural es que lo veas en persona, ¿te agendo?".', null, 6),

('closing_technique', 'cierre_condicional', 'Cierre condicional: "si te resuelvo X…"',
'Cuando el cliente pone UNA objeción concreta, conviértela en la llave del cierre: "si te confirmo que la cuota queda bajo $1,800, ¿avanzamos con la reserva?". Si dice sí, la venta depende de un dato — no de su ánimo. Consigue el dato (o escálalo) y cobra el compromiso.', null, 6),

('closing_technique', 'cierre_etapa_precio', 'Cierre por etapa de preventa (urgencia real)',
'En preventa el precio sube por etapa de avance: planificación es el precio más bajo que ese proyecto tendrá JAMÁS. Úsalo con datos, no con presión: "Raices está en planificación — cuando pase a construcción, esta lista de precios ya no existe". La urgencia real convence; la inventada espanta.', null, 6),

('closing_technique', 'cierre_silencio', 'Después de preguntar, silencio',
'Cuando lances la pregunta de cierre ("¿te agendo la visita?", "¿apartamos el modelo B?"), NO la acolchones con más texto ni la respondas tú misma. Un mensaje corto y esperas. En chat, quien agrega tres mensajes de nervios después de pedir el cierre, lo mata.', null, 6),

-- ── E. FINANCIERO EL SALVADOR (fuentes oficiales, cifras 2026) ─────────────
('faq', 'impuesto_transferencia', 'Impuesto de transferencia (ITBR): 3% sobre el excedente',
'En El Salvador la compra paga ITBR solo si el inmueble supera $28,571.43: es el 3% SOBRE EL EXCEDENTE, nunca sobre el valor total. Ej: inmueble de $100,000 → paga 3% de $71,428.57 ≈ $2,143. Se paga en Hacienda antes de inscribir la escritura en el CNR; el notario lo verifica. Cifra exacta y casos especiales: los confirma el equipo legal.', null, 5),

('faq', 'financiamiento_fsv', 'FSV: la vía social (tasas desde 4%)',
'El Fondo Social para la Vivienda financia con tasas desde 4% (vivienda hasta $40,000, sector formal, hasta 100% financiado, 30 años) y desde 5% para ingresos variables. Viviendas de mayor valor: desde 5.85% hasta ~8%, hasta 98% de financiamiento, 25 años. Financia también escrituración y seguros, sin comisión de trámite. Para nuestros proyectos aplica más la banca privada, pero conocer el FSV te da autoridad.', null, 5),

('faq', 'financiamiento_banca', 'Banca privada: tasas desde ~6.75%, prima desde 10%',
'Los bancos financian vivienda con tasas desde ~6.75%, prima típica del 10-20% del valor y plazos de hasta 30 años. Regla de oro para calificar: la cuota no debe superar ~30% del ingreso mensual comprobable. Ej: cuota de $1,500 requiere ingresos de ~$5,000/mes (individual o entre cónyuges). Las tasas cambian — la cifra exacta la da el banco; tú das el panorama.', null, 5),

('faq', 'proceso_compra', 'El camino completo de compra (para explicarlo sin miedo)',
'1) Reserva con un monto inicial que congela precio y unidad. 2) Promesa de venta ante notario: define precio, plazos y condiciones — protege a ambas partes. 3) Pago de prima (a menudo en cuotas durante la construcción). 4) Con entrega: escritura ante notario, pago de ITBR e inscripción en el CNR — ahí la propiedad queda legalmente a tu nombre. Daniela explica el camino; los documentos los maneja el equipo.', null, 5),

('faq', 'costos_cierre', 'Costos de cierre además del precio',
'El comprador debe presupuestar sobre el precio: ITBR (3% del excedente sobre $28,571.43), honorarios de notario por la escritura, y aranceles de inscripción en el CNR. Como regla práctica, reservar un 4-5% extra del valor del inmueble cubre el cierre. El desglose exacto de cada caso lo entrega el equipo antes de firmar — nunca hay sorpresas.', null, 5),

('faq', 'inversion_roi', 'Cómo hablar de retorno sin prometer de más',
'Preventa gana por dos vías: plusvalía (comprar en planificación y valorizar al entregarse — los proyectos GT citan retorno objetivo desde ~10% anual, NO garantizado) y renta (apartamentos tipo ALTA para ejecutivos). Habla siempre de "retorno objetivo" o "histórico de la zona", jamás de promesas. Nuevo Cuscatlán es de los municipios de mayor plusvalía del país por demanda y escasez de tierra.', null, 5),

-- ── F. LEGAL EL SALVADOR (marco general; el detalle lo cierra el equipo) ───
('faq', 'promesa_venta', 'La promesa de venta: el escudo del comprador',
'La promesa de compraventa es un contrato ante notario que obliga a ambas partes: congela precio, unidad, plazos y penalidades si alguien se retira. Es LA protección del comprador en preventa: aunque el proyecto tarde, sus condiciones quedan escritas. Cuando el cliente pregunte por seguridad jurídica, esta es la respuesta — y el texto del contrato lo revisa el equipo legal con él.', null, 5),

('faq', 'registro_cnr', 'CNR: la propiedad existe cuando está inscrita',
'En El Salvador la transferencia se perfecciona al inscribir la escritura en el Centro Nacional de Registros (CNR). Ahí el cliente puede verificar por sí mismo quién es el dueño real de un terreno y si tiene hipotecas o gravámenes — dilo como prueba de transparencia: "cuando quieras, el registro es público". Los proyectos GT operan con desarrollador formal e inscripciones en regla.', null, 5),

('faq', 'ley_condominio', 'Condominios: la ley de propiedad por pisos',
'Apartamentos y townhomes operan bajo el régimen de propiedad inmobiliaria por pisos y apartamentos: cada quien es dueño de su unidad + un porcentaje de las áreas comunes, y paga cuota de mantenimiento del condominio. Si preguntan "¿y las amenidades de quién son?": de todos los propietarios, administradas por el régimen. El reglamento específico lo entrega el equipo.', null, 5),

-- ── G. ARQUITECTURA E INGENIERÍA (para hablar con autoridad técnica) ───────
('faq', 'sismo_resistencia', 'Construcción sismo-resistente (país sísmico)',
'El Salvador es zona sísmica y TODO proyecto formal se diseña bajo la normativa técnica de diseño por sismo del país: estructuras calculadas para movimiento, no solo para peso. Si el cliente teme por terremotos: los proyectos nuevos formales cumplen esa normativa con supervisión estructural — muy distinto a una construcción informal. El detalle técnico de cada proyecto lo amplía el equipo.', null, 4),

('faq', 'metros_utiles', 'm² construidos vs terreno vs útiles',
'Tres números distintos que el cliente suele mezclar: área de TERRENO (el lote), área CONSTRUIDA (lo techado, incluye paredes) y área ÚTIL (lo habitable). En apartamentos, terrazas y parqueos pueden ir aparte. Cuando compares precio por m², compara siempre el mismo tipo de área entre proyectos — es la comparación honesta y te hace ver experta.', null, 4),

('faq', 'etapas_construccion', 'Qué significa cada etapa (y por qué importa)',
'Planificación: diseño y permisos — precio más bajo, entrega más lejana (hoy: Raices). Construcción: obra activa — riesgo menor, precio medio (hoy: Foresta). Entregado: llave en mano — precio pleno. A menor etapa, mayor upside de plusvalía; a mayor etapa, menor espera. Vender es emparejar la etapa con el perfil: inversionista → temprano; necesidad de vivir YA → avanzado o entregado.', null, 4),

('faq', 'acabados_preguntas', 'Acabados: las preguntas de comprador experto',
'Ayuda al cliente a preguntar como experto: ¿la cocina va equipada o solo mueble? ¿pisos de qué material? ¿aire acondicionado incluido o pre-instalación? ¿altura de techos? ¿ventanas dobles? En Portacelli los acabados son premium por colección y en Foresta el townhome es personalizable. Si no tienes el dato exacto de un acabado, dilo y confírmalo con el equipo — jamás inventes specs.', null, 4),

-- ── H. OBJECIONES UNIVERSALES ──────────────────────────────────────────────
('objection', 'obj_muy_caro', '"Está muy caro"',
'Nunca defiendas el precio: cambia la vara de medir. 1) Precio por m² contra la zona ("en Nuevo Cuscatlán el m² nuevo anda en X — esto está por debajo"). 2) Etapa: "este precio es de planificación; el proyecto terminado no costará esto". 3) Pregunta el presupuesto real y reencuadra al modelo o colección que sí calza (ALTA como entrada). Caro sin comparación no significa nada.', null, 6),

('objection', 'obj_desconfianza_preventa', '"¿Y si el proyecto no se termina?"',
'Miedo legítimo — respóndelo con estructura, no con promesas: promesa de venta ante notario con condiciones escritas, desarrollador formal con obras verificables, avance de obra visitable cuando quiera, y registro público en el CNR. Además Foresta YA está en construcción con entrega Q2 2027. Invita a verificar todo por su cuenta: el que verifica, se queda.', null, 6),

('objection', 'obj_mejor_espero', '"Mejor espero un tiempo"',
'Esperar tiene precio y se lo puedes mostrar: 1) las etapas de preventa suben el precio conforme avanza la obra; 2) la plusvalía de Nuevo Cuscatlán corre aunque él no compre; 3) mientras espera, sigue pagando alquiler que no construye patrimonio. Pregunta: "¿qué tendría que pasar para que fuera el momento correcto?" — la respuesta te dice la objeción REAL escondida.', null, 6);

-- Verificación
SELECT category, count(*) FROM knowledge_base WHERE active GROUP BY category ORDER BY 1;
