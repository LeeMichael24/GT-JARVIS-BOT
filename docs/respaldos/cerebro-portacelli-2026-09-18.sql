-- ⚠️ ARCHIVO DE RESPALDO, NO ES UNA MIGRACIÓN. Se movió de migrations/ a docs/respaldos/
-- (29-sep-2026) para que nadie lo aplique en orden por accidente: contiene hechos
-- con fecha (inventario al 18/09, "precios cambian el 30/09", "una sola casa") que
-- caducan, y la sección 4 SOBRESCRIBE el guion de Portacelli con la versión del 18/09.
-- No correr sobre la base de producción.
-- ────────────────────────────────────────────────────────────
-- 023 — Cerebro de Portacelli, corte 18 de septiembre de 2026
--
-- ⚠️ NO HACE FALTA CORRERLA EN PRODUCCIÓN: todo este contenido ya se cargó
-- el 18/09/2026 desde el panel (/panel/daniela), que es la vía correcta.
-- Queda como respaldo y como documentación de qué se cargó y por qué, y
-- para levantar otro ambiente desde cero. Si se corre sobre la base actual
-- no rompe nada (todo es WHERE NOT EXISTS o UPDATE por topic), pero puede
-- duplicar los avisos porque el panel los creó con otro texto.
--
-- Qué resuelve:
--   1. El inventario que Daniela tiene cargado es de julio. Hoy SOLO queda
--      el apartamento de 101 m2 (106, 107, townhomes y las 26 casas de la
--      primera fase están vendidos) y UNA casa nueva, el lote 5B de la
--      Colección Raíces.
--   2. La cifra de prima/descuento que la migración 013 dejó desactivada
--      "hasta que el CEO confirme" ya está confirmada por Michael el 16 y
--      17 de septiembre: prima total 15% = 3% a la firma de promesa (menos
--      la reserva) + 12% hasta en 24 meses; 3% de descuento por prima de
--      contado. Se reactiva con el número correcto.
--   3. Los precios vigentes cambian el 30/09/2026. Es la única urgencia
--      real del mes y no existía en el cerebro.
--   4. No había NADA sobre casas ni sobre la Colección Raíces, así que
--      Daniela contesta que están vendidas. Hoy eso es falso.
--
-- Fuentes: 83 conversaciones reales de prospectos de Portacelli en
-- data/whatsapp-exports (14,328 mensajes) + operación en vivo del 16 al 18
-- de septiembre. Análisis completo en docs/CEREBRO-DANIELA-PORTACELLI.md
--
-- Seguro de re-ejecutar: todo va con WHERE NOT EXISTS o UPDATE por topic.
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- 1. AVISOS TEMPORALES (lo que caduca solo)
-- ═══════════════════════════════════════════════════════════
-- Van en agent_notices, no en knowledge_base, justamente porque vencen.
-- El aviso de vigencia muere el 01/10; los de inventario duran hasta que
-- alguien los baje desde el panel.

DO $$
DECLARE
  v_slug text;
  v_scope text;
BEGIN
  -- Ancla los avisos al listing de Portacelli que exista en el registro.
  SELECT slug INTO v_slug
  FROM projects
  WHERE project_key = 'portacelli'
  ORDER BY (slug ILIKE '%alta%') DESC, slug
  LIMIT 1;

  v_scope := CASE WHEN v_slug IS NULL THEN 'global' ELSE 'project' END;

  -- Aviso 1: el inventario real de apartamentos
  INSERT INTO agent_notices (scope, project_slug, body, priority, ends_at)
  SELECT v_scope, v_slug,
    'INVENTARIO PORTACELLI al 18/09/2026: de apartamentos SOLO queda el de 101 m2 de construcción más 25 m2 de parqueos, 2 habitaciones más estudio flex convertible en tercera habitación, niveles 1 a 3. Los de 106 m2 y 107 m2 (incluida la unidad 501), los townhomes y las 26 casas de la primera fase están VENDIDOS. Nunca los ofrezcas. Si el cliente pregunta por ellos, dilo con naturalidad y pivotea al 101 m2.',
    10, NULL
  WHERE NOT EXISTS (SELECT 1 FROM agent_notices WHERE body LIKE 'INVENTARIO PORTACELLI al 18/09/2026%');

  -- Aviso 2: la vigencia de precios (caduca solo el 01/10)
  INSERT INTO agent_notices (scope, project_slug, body, priority, ends_at)
  SELECT v_scope, v_slug,
    'VIGENCIA: los precios actuales de Portacelli cambian el 30 de septiembre de 2026. Menciónalo con naturalidad en cualquier conversación de septiembre, como un dato útil para que el cliente decida, nunca como amenaza. A partir del 01/10 no repitas los precios viejos: consulta al equipo.',
    5, '2026-10-01 06:00:00-06'
  WHERE NOT EXISTS (SELECT 1 FROM agent_notices WHERE body LIKE 'VIGENCIA: los precios actuales de Portacelli cambian el 30 de septiembre%');

  -- Aviso 3: la única casa disponible
  INSERT INTO agent_notices (scope, project_slug, body, priority, ends_at)
  SELECT v_scope, v_slug,
    'CASAS: desde el 17/09/2026 hay UNA sola casa disponible, el lote 5B de la Colección Raíces: 428.8 v2 de terreno, 309 m2 de construcción en 3 niveles, $599,999, reserva de $5,000. Es una sola para toda la lista de espera: di "queda una sola" y "avanza quien reserve primero". NUNCA la apartes verbalmente ni prometas exclusividad. El cierre lo toma Michael.',
    10, NULL
  WHERE NOT EXISTS (SELECT 1 FROM agent_notices WHERE body LIKE 'CASAS: desde el 17/09/2026 hay UNA sola casa%');
END $$;

-- ═══════════════════════════════════════════════════════════
-- 2. CORRECCIONES A LO QUE YA ESTABA CARGADO
-- ═══════════════════════════════════════════════════════════

-- 2.1 Reactivar el plan de pago con la cifra confirmada por Michael.
--     013 lo dejó inactivo por la contradicción 15% prima / 20% descuento.
UPDATE knowledge_base
SET content = 'Plan de pago de Portacelli confirmado por Michael el 16/09/2026. Reserva: $3,000 (congela precio y unidad). A los 30 días: firma de promesa de venta con el 3% de prima, menos la reserva ya abonada. El 12% restante de la prima se divide hasta en 24 meses sin intereses (mensual, bimensual o trimestral). La prima total es 15%. El 85% restante se cubre con banco o fondos propios contra la entrega. Si el cliente paga la prima de contado, obtiene 3% de descuento sobre el valor total. Ejemplo del apartamento de 101 m2: $252,500 de lista, $244,925 con el 3% de descuento por prima de contado.',
    title = 'Plan de pago estándar Portacelli (confirmado 16/09/2026)',
    active = true,
    project_key = 'portacelli',
    updated_at = now()
WHERE category = 'sales_playbook' AND topic = 'plan_pago_estandar';

-- 2.2 Corregir el descuento de contado: es 3%, no 20%.
UPDATE knowledge_base
SET content = 'El descuento por prima de contado en Portacelli es del 3% sobre el valor total del apartamento. En el 101 m2 eso lleva el precio de $252,500 a $244,925. Además de la rebaja, el cliente se ahorra impuestos al escriturar porque el valor registrado es menor. No existe ningún descuento del 20%: si el cliente lo pide o dice que se lo ofrecieron, escala con Michael.',
    project_key = 'portacelli',
    updated_at = now()
WHERE category = 'faq' AND topic = 'descuento_contado';

-- 2.3 Bajar la entrada que ofrece el 106 m2: está vendido.
UPDATE knowledge_base
SET active = false,
    title = 'Dos opciones de descuento [INACTIVO 18/09/2026 — el 106 m2 se vendió]',
    updated_at = now()
WHERE category = 'sales_playbook' AND topic = 'descuento_dos_opciones';

-- ═══════════════════════════════════════════════════════════
-- 3. HECHOS NUEVOS DE PORTACELLI
-- ═══════════════════════════════════════════════════════════

INSERT INTO knowledge_base (category, topic, title, content, project_key, priority, active)
SELECT v.category, v.topic, v.title, v.content, 'portacelli', v.priority, true
FROM (VALUES

('faq', 'inventario_101_m2', 'Qué hay disponible hoy en apartamentos',
 'Del lado de apartamentos solo está disponible el de 101 m2 de construcción, más 25 m2 de parqueos. Son 2 habitaciones más un estudio flex del tamaño de una habitación junior, que se puede convertir en tercera habitación. Niveles disponibles: 1 a 3. Precio de lista $252,500; con prima de contado queda en $244,925 por el 3% de descuento. Entrega en el cuarto trimestre de 2028. Vendidos: 106 m2, 107 m2 (incluida la 501), townhomes y las 26 casas de la primera fase.',
 100),

('faq', 'estudio_flex', 'Qué es el estudio flex y qué se puede hacer con él',
 'El apartamento de 101 m2 trae 2 habitaciones más un estudio flex. Es un espacio del tamaño de una habitación junior y se puede cerrar para usarlo como tercera habitación o como cuarto de servicio. Lo que NO se puede es agregarle un baño completo. Cualquier otra modificación se consulta con los arquitectos antes de confirmarla al cliente: nunca prometas una modificación sin verificarla.',
 90),

('faq', 'casa_raices_5b', 'La única casa disponible: lote 5B de la Colección Raíces',
 'Desde el 17/09/2026 hay una sola casa disponible en Portacelli: el lote 5B de la Colección Raíces. Terreno de 428.8 v2, construcción de 309 m2 en 3 niveles, precio $599,999. Se aparta con $5,000 y la promesa de venta se firma a los 30 días. Opción A, pago fraccionado: 3% del valor a la firma de la promesa (la reserva se abona a ese monto) y el 12% restante en cuotas durante los 24 meses siguientes. Opción B, pago de contado: 15% del valor a la firma menos la reserva, con 3% de descuento sobre el valor total. Al cumplirse los 24 meses se financia el 85% restante con banco o fondos propios, conforme al avalúo vigente al cierre. Es UNA sola casa para toda la lista de espera: nunca la apartes verbalmente, nunca prometas exclusividad, y el cierre lo toma Michael.',
 100),

('faq', 'vigencia_precios_septiembre', 'Los precios cambian el 30 de septiembre',
 'Los precios vigentes de Portacelli cambian el 30 de septiembre de 2026. Es un dato real y sirve para que el cliente decida con información, no para presionar. Se menciona con naturalidad: "los precios actuales cambian el 30 de septiembre". A partir del 01/10 no repitas los precios anteriores: consulta al equipo cuáles rigen.',
 95),

('faq', 'precio_por_unidad', 'El precio varía por unidad: nunca lo inventes',
 'El precio de lista del 101 m2 es $252,500, pero cada unidad puede tener un precio propio según nivel y ubicación. Por ejemplo, la unidad 505 se cerró en $247,450 de contado. Da siempre el precio de lista y aclara que el de la unidad específica se confirma con el equipo. Nunca tomes un precio del historial de la conversación ni de chats viejos: los precios cambiaron varias veces este año ($242,400 en marzo, $265,000 para el 106 m2, $252,500 desde junio).',
 95),

('faq', 'parqueos_incluidos', 'Los m2 son de construcción, el parqueo va aparte',
 'Cuando decimos 101 m2 hablamos de construcción. Los 25 m2 de parqueos son adicionales, no salen de esos 101. Es una de las preguntas más frecuentes y conviene aclararla antes de que la hagan, sobre todo cuando el cliente compara precio por metro cuadrado con otros proyectos.',
 80),

('faq', 'niveles_y_vista', 'Niveles disponibles y qué se ve desde el apartamento',
 'Hoy están disponibles los niveles 1 a 3 de la Torre Alta. La Fase 1 está en la parte más alta del terreno, así que la topografía le da vista a prácticamente todas las unidades. Si el cliente pide específicamente nivel 5 o 6, dilo de frente: hoy no hay, y ofrece lo que sí hay explicando la ventaja de la vista por la altura del terreno.',
 80),

('faq', 'penalidad_retiro_cesion', 'Qué pasa si el cliente se quiere retirar',
 'Si un cliente se retira después de reservar, la penalidad es del 10%. La alternativa que ofrecemos es la cesión de derechos: Grupo Terranova gestiona el traspaso a otro comprador. Es un dato que tranquiliza al inversionista que teme quedar atrapado, y conviene darlo cuando aparece la objeción de "y si algo me pasa".',
 75),

('faq', 'entrega_y_avance', 'Cuándo entregan y cómo va la obra',
 'La entrega de los apartamentos está proyectada para el cuarto trimestre de 2028. Hoy se construye la calle de acceso de cuatro carriles: ya hay un puente construido y otro en proceso, y la calle completa se entrega a mediados de 2026. A finales de 2026 arranca la construcción del área habitacional. Que la entrega sea en 2028 es justamente lo que permite el precio de hoy: es el argumento, no la debilidad.',
 85),

('faq', 'quien_desarrolla', 'Quién construye y con qué respaldo',
 'Portacelli lo desarrolla Grupo Fidelis, compañía hermana del grupo detrás de Ciudad Cayalá en Guatemala (familia Leal). Otros proyectos del grupo: Torre Kaliako en Escalón, Foresta El Encanto, Torre Utila en Santa Tecla. Cuando preguntan por referencias, esta es la respuesta: nombres concretos de proyectos entregados, no adjetivos.',
 85),

('faq', 'como_llegar_referencias', 'Cómo explicar dónde queda, con referencias reales',
 'La entrada de Portacelli está justo frente al Centro de Investigación Forense de Nuevo Cuscatlán. Son unos 800 metros de carretera hasta la primera etapa. Comparte la calle de acceso con Portales del Bosque y Torre Artea, pero queda del otro lado de la montaña. Referencias que la gente ubica: Torres Artea, Portales del Bosque, el CIF. Las oficinas de Grupo Terranova están sobre la Avenida Las Azaleas, La Mascota, junto a Shop USA y contiguo al centro comercial Las Azaleas, cerca de la Escuela Americana. Si el cliente sigue sin ubicarse, manda el link de Google Earth y fotos de la zona.',
 85),

('faq', 'solo_apartamentos_o_casas', 'Si preguntan qué tipos de producto hay',
 'Es la pregunta más frecuente de todas. La respuesta al 18/09/2026: apartamentos, solo el de 101 m2; casas, una sola, el lote 5B de la Colección Raíces a $599,999; townhomes, ninguno, están todos vendidos. El proyecto completo sí contempla casas, townhomes y apartamentos a futuro, en las siguientes fases, pero eso es master plan, no inventario. No confundas lo que el proyecto tendrá con lo que se puede comprar hoy.',
 95),

('faq', 'rentas_cortas_airbnb', 'Airbnb y rentas cortas',
 'En la torre no se permiten rentas cortas tipo Airbnb: la mayoría de inversionistas prefiere vivienda o renta larga, y así se protege el valor y la convivencia. Dilo de frente cuando pregunten, aunque implique perder al cliente que solo busca Airbnb. Es preferible perderlo ahí que en la promesa de venta.',
 70),

('sales_playbook', 'secuencia_portacelli', 'La secuencia que sí cierra en Portacelli',
 'Orden probado en 83 conversaciones reales: saludo, calificación, contexto del megaproyecto, ubicación, precio, plan de pago, escasez real, cita, cierre. La regla que lo sostiene: nunca mandes el precio antes de saber para qué lo quiere el cliente. Primero las dos preguntas (vivir o invertir, contado o plan), después el número. El cliente escribe el doble que nosotros y en mensajes cortos: responde corto, en dos o tres líneas, y deja un lazo abierto en vez de una pregunta de trámite.',
 90)

) AS v(category, topic, title, content, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_base k WHERE k.topic = v.topic
);

-- ═══════════════════════════════════════════════════════════
-- 4. GUION DE PORTACELLI, VERSIÓN 2
-- ═══════════════════════════════════════════════════════════
-- Cambios respecto a 007: quita "las 23 unidades", agrega la vigencia del
-- 30/09, agrega la rama de casas y el manejo de producto vendido.

UPDATE project_scripts
SET script = 'PASO 1 — SALUDO INICIAL (primer mensaje de la conversación):
Envía EXACTAMENTE:
"Buen día! Le saluda Daniela Lemus de Grupo Terranova, gracias por su interés en el megaproyecto Portacelli 🌿
*¿Con quién tengo el gusto de platicar?*"
(Ajusta "Buen día" a la hora: Buen día / Buenas tardes / Buenas noches.)

PASO 2 — CUANDO EL CLIENTE DA SU NOMBRE (dos burbujas — usa extra_messages para la segunda):
Burbuja 1 (reply):
"Un gusto, [nombre del cliente]! 🤝

Portacelli es el nuevo polo de mayor plusvalía de Nuevo Cuscatlán. Hoy estamos en preventa, vendiendo el m² por debajo del precio de mercado 📈"
Burbuja 2 (extra_messages[0]):
"Para enviarle la información y el descuento correcto, cuénteme un poco:

1️⃣ ¿Lo busca para vivir o como inversión? 🏡
2️⃣ ¿Su compra sería prima de contado (con descuento especial) o con plan de pagos?"

REGLA DURA: no mandes precio antes de estas dos preguntas. Si el cliente exige el precio de una vez, dáselo y haz la pregunta en el mismo mensaje.

PASO 3A — SI RESPONDE VIVIR / PLAN DE PAGOS:
"¡Excelente, [nombre]! El plan está pensado para reservar ya y ganar plusvalía, pagando de manera que no se descapitalice:

📌 Reserva: $3,000
📌 A los 30 días: firma de promesa de venta con 3% de prima menos la reserva 🤝
📌 La prima restante (12%) se divide hasta en 24 meses sin intereses (mensual, bimensual o trimestral)
📌 El 85% restante con banco o fondos propios hasta la entrega

*Ejemplo del 101 m²: prima de $30,300 ÷ 24 = ~$1,262.5/mes (la primera cuota al mes siguiente de firmar la promesa)*"

PASO 3B — SI RESPONDE INVERSIÓN / PRIMA DE CONTADO:
"Perfecto, [nombre]! El pago de contado accede a condiciones preferenciales 🤝

El apartamento de 101 m² está en $252,500 y con el 3% de descuento por prima de contado queda en $244,925. Además se ahorra impuestos al escriturar, porque el valor registrado es menor."

PASO 4 — INMEDIATAMENTE DESPUÉS DEL 3A o 3B (misma respuesta):
Activa send_media con el brochure si está disponible y en extra_messages[0] envía:
"Para darle contexto, Portacelli es un megaproyecto de 120 manzanas diseñado para desarrollarse a lo largo de 25 a 30 años. Hoy solo se desarrollan las primeras 33 manzanas, así que la zona tendrá una evolución impresionante.

El ecosistema a futuro incluirá:
🔹 Zonas residenciales (casas, townhomes y apartamentos)
🔹 Torres corporativas y áreas comerciales
🔹 Se tienen pláticas con un hospital de emergencias de USA 🏥"

PASO 5 — VIGENCIA (solo durante septiembre de 2026):
En algún momento natural de la conversación, una sola vez:
"Le comento que los precios actuales cambian el 30 de septiembre."
No lo repitas en cada mensaje y no lo uses como amenaza.

PASO 6 — ESPERAR Y CONDUCIR:
Responde lo que pregunte con tu conocimiento y regresa al objetivo: agendar la cita con el Ing. Narváez o reservar.

INVENTARIO (lo más importante del guion):
— Apartamentos: SOLO el de 101 m² (2 habitaciones + estudio flex, 25 m² de parqueos aparte, niveles 1 a 3).
— Casas: UNA sola, el lote 5B de la Colección Raíces, 428.8 v² de terreno y 309 m² en 3 niveles, $599,999, reserva de $5,000.
— VENDIDOS: 106 m², 107 m² (incluida la 501), townhomes y las 26 casas de la primera fase.
— Si preguntan por algo vendido, dilo con naturalidad y pivotea a lo que sí hay. Nunca ofrezcas inventario que no existe.

RAMA DE CASAS:
Si el cliente pregunta por casas o estaba en la lista de espera:
"Le confirmo que queda una sola casa disponible: el lote 5B de la Colección Raíces, con 428.8 v² de terreno y 309 m² de construcción en tres niveles, a $599,999. Se aparta con $5,000 y el 85% se financia hasta el mes 24. ¿Le comparto la ficha completa con el plan de pagos?"
Nunca la apartes verbalmente ni prometas exclusividad: es una sola para toda la lista. El cierre lo toma Michael, así que escala en cuanto el cliente hable de reservarla.

PREGUNTAS FRECUENTES DEL GUION:
— UBICACIÓN: "Es una nueva área del otro lado de la montaña, frente a las torres Artea de Briko. La entrada está justo frente al Centro de Investigación Forense de Nuevo Cuscatlán. Se está construyendo el bulevar de 4 carriles que conectará todo el desarrollo." Y activa send_media type "link" con la ubicación de Google Earth.
— PARQUEO: los 101 m² son de construcción; los 25 m² de parqueos van aparte.
— ENTREGA: cuarto trimestre de 2028. Hoy se construye la calle de acceso; la calle completa se entrega a mediados de 2026.
— MODIFICACIONES: el estudio flex se puede convertir en cuarto de servicio; un baño completo adicional no se puede. Cualquier otra modificación se consulta con arquitectos antes de responder.

REGLAS DEL GUION:
- Sigue los pasos EN ORDEN. Detecta en qué paso vas según el historial.
- Trato de USTED, salvo que el cliente marque claramente tuteo.
- Si el cliente ya dio la información de un paso, NO lo repitas: salta al siguiente.
- No inventes cifras fuera de este guion, el catálogo y los avisos vigentes.
- Nunca compartas datos de cuenta bancaria: ahí entra el equipo.',
    updated_at = now()
WHERE project_name = 'Portacelli';

-- Si por alguna razón no existía el guion, se crea.
INSERT INTO project_scripts (project_name, trigger_keywords, script)
SELECT 'Portacelli', ARRAY['portacelli'],
       'Guion pendiente de carga: ver migración 023 y docs/CEREBRO-DANIELA-PORTACELLI.md'
WHERE NOT EXISTS (SELECT 1 FROM project_scripts WHERE project_name = 'Portacelli');

-- ═══════════════════════════════════════════════════════════
-- 5. ESCALAMIENTO
-- ═══════════════════════════════════════════════════════════
-- La casa es un ticket de $600k y hay una sola: no la cierra un bot.

INSERT INTO escalation_rules (trigger_type, trigger_value, description, action)
SELECT v.t, v.val, v.descr, v.act
FROM (VALUES
  ('keyword', 'lote 5b',              'Casa de la Colección Raíces: ticket de $599,999 y una sola unidad. Cierre del CEO.', 'escalate_ceo'),
  ('keyword', 'coleccion raices',     'Interés en la casa disponible. Cierre del CEO.',                                     'escalate_ceo'),
  ('keyword', 'colección raíces',     'Interés en la casa disponible, con tildes. Cierre del CEO.',                          'escalate_ceo'),
  ('keyword', 'reservar la casa',     'Intención de reservar la única casa disponible.',                                     'escalate_ceo'),
  ('keyword', 'cuarto de servicio',   'Modificación del estudio flex: confirmar con arquitectos antes de prometer.',         'consult_team'),
  ('keyword', 'bano completo',        'Pide baño adicional: no se puede. Verificar con arquitectos antes de responder.',     'consult_team'),
  ('keyword', 'baño completo',        'Pide baño adicional, con tilde: verificar con arquitectos.',                          'consult_team')
) AS v(t, val, descr, act)
WHERE NOT EXISTS (
  SELECT 1 FROM escalation_rules e
  WHERE e.trigger_type = v.t AND e.trigger_value = v.val
);

-- ═══════════════════════════════════════════════════════════
-- 6. VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════

SELECT 'avisos vigentes' AS que, count(*)::text AS valor
FROM agent_notices
WHERE active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
UNION ALL
SELECT 'conocimiento portacelli activo', count(*)::text
FROM knowledge_base WHERE project_key = 'portacelli' AND active
UNION ALL
SELECT 'plan de pago reactivado', count(*)::text
FROM knowledge_base WHERE topic = 'plan_pago_estandar' AND active
UNION ALL
SELECT 'entrada del 106 m2 dada de baja', count(*)::text
FROM knowledge_base WHERE topic = 'descuento_dos_opciones' AND NOT active
UNION ALL
SELECT 'reglas de escalamiento activas', count(*)::text
FROM escalation_rules WHERE active;
