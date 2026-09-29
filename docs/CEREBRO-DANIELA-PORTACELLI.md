# Cerebro de Daniela: Portacelli

> ⚠️ **Foto del 18-sep-2026 — no es la fuente de verdad vigente.** El inventario, los precios y las fechas de este documento caducan (los precios cambian el 30-sep, el inventario se mueve a diario) y varios problemas del §6 ya cambiaron (p. ej. el Ecosistema ya sirve brochure, plano e imágenes). Antes de usar cualquier cifra, confirmarla con Michael o con el catálogo. Lo que sí sigue vigente es el análisis de cómo se vende (§1–4).

Análisis de cómo vende Grupo Terranova y qué hay que cargarle a Daniela para que hable igual que nosotros.

**Corte:** 18 de septiembre de 2026
**Base empírica:** 120 conversaciones exportadas en `data/whatsapp-exports` (17,463 mensajes útiles). De esas, **83 son chats de prospectos de Portacelli**: 14,328 mensajes, 5,814 nuestros y 8,514 del cliente.
**Complemento:** operación en vivo del 16 al 18 de septiembre (recontacto de 42 leads, apertura de la Colección Raíces, cierre de la unidad 505).

---

## 1. Lo primero: el dato que más importa

El cliente escribe **el doble que nosotros** (8,514 mensajes contra 5,814) y escribe **corto**: 53 caracteres de promedio contra 106 nuestros. Traducción operativa para Daniela:

- Nunca contestar con un bloque largo a un mensaje de cinco palabras.
- Un mensaje del cliente casi nunca trae toda la intención. Vienen en ráfaga. El debounce de 2 a 8 segundos que ya existe en `lib/debounce.ts` no es un lujo, es la única forma de no contestarle a media idea.
- Si Daniela habla más que el cliente en una conversación, algo se rompió. La proporción sana es de 1 a 2.

---

## 2. Cómo vendemos realmente: la secuencia canónica

Reconstruí la secuencia de los chats que llegaron a reserva. Todos siguen el mismo esqueleto, con desvíos:

```
saludo → calificación → contexto → ubicación → precio → plan de pago → escasez → cita → cierre
```

De los 83 chats de prospectos: **16 llegaron a cita agendada, 28 a reserva y 50 mencionan promesa de venta** (muchos son clientes que ya venían de reserva y siguieron en el mismo chat).

Lo que hace que funcione no es el orden, es una regla que el equipo aplica sin escribirla: **nunca se manda el precio antes de saber para qué lo quiere el cliente.** Primero las dos preguntas, después el número. Cuando se manda el precio primero, la conversación se apaga.

### Las dos preguntas que ordenan todo

Aparecen 33 veces textuales y son el corazón del método:

> 1. ¿Lo busca para vivir o como inversión?
> 2. ¿Su compra sería prima de contado (con descuento especial) o con plan de pagos?

Con esas dos respuestas se decide todo lo demás:

| Respuesta | Hacia dónde llevamos la conversación |
|---|---|
| Vivir + plan de pagos | Calidad de vida, vistas, área verde, pet friendly, estudio flex como tercera habitación. Plan de 24 meses sin intereses. |
| Vivir + contado | Lo mismo, más el 3% de descuento y el ahorro de impuestos al escriturar. |
| Inversión + contado | Plusvalía de Fase 1, precio por m2 bajo mercado, respaldo Cayalá, descuento por contado. |
| Inversión + plan | Plusvalía y apalancamiento: entra con $3,000 y paga la prima mientras el proyecto se valoriza. |

### Los bloques que ya tenemos probados

Estos son los mensajes que más repetimos, con el número de veces que aparecen en los chats. Son el material que Daniela debe saber de memoria:

| Veces | Bloque | Cuándo entra |
|---|---|---|
| 33 | Apertura con calificación (las dos preguntas) | Primer contacto |
| 21 | "Punto de referencia: justo a la par de Shop USA, o contiguo al centro comercial Las Azaleas en colonia La Mascota" | Ubicación de oficinas |
| 18 | Master plan: torres corporativas, distritos comerciales, hospital con estándares de USA | Contexto, después de calificar |
| 13 | "Construido el primer puente y construyéndose el otro, nos entregan la calle completa a mediados del 2026" | Prueba de avance |
| 12 | Pitch de inversión: familia Leal, Ciudad Cayalá, demanda asegurada, precios de lanzamiento | Perfil inversionista |
| 11 | Fase 1 en la parte alta, topografía que da vista a casi todas las unidades | Diferenciador |
| 9 | Radiografía financiera de las dos opciones de pago | Después del precio |
| 9 | Mensaje del CEO abriendo unidades exclusivas | Reactivación de leads fríos |
| 7 | Explicación de acceso: frente al Centro de Investigación Forense, 800 m de carretera, comparte acceso con Portales del Bosque y Torre Artea | Cuando no ubican la zona |

### El cierre

El patrón de cierre es siempre el mismo y es importante que Daniela **no lo ejecute sola**:

> "Si gustas, para que yo pueda congelarte el precio de la unidad y la disponibilidad de manera oficial, me puedes brindar los siguientes datos por favor:"

Pide DUI, dirección y correo. **La cuenta bancaria nunca la manda Daniela**: la migración 013 ya bloqueó eso y está bien. En los exports la cuenta aparece 21 veces escrita por el equipo; ese es exactamente el momento en que un humano toma la conversación.

---

## 3. Qué pregunta la gente, en orden de frecuencia real

Sobre 1,537 preguntas de clientes:

| Preguntas | Tema | Lo que realmente están preguntando |
|---|---|---|
| 132 | Tipo de producto | "¿Son solo apartamentos o también casas y townhomes?" |
| 91 | Visita o cita | Quieren ver algo físico o conocer al desarrollador |
| 87 | Precio | "¿Cómo están los precios?", "¿el rango?" |
| 71 | Disponibilidad | "¿Qué unidades tienen?", "¿todavía queda?" |
| 61 | Prima y reserva | "¿La prima es del 20%?", "¿la reserva a nombre de quién?" |
| 55 | Legal | Promesa de venta, escrituras, documentos |
| 52 | Nivel, piso y vista | "¿Vista al mar?", "¿el último nivel es losa o lámina?" |
| 51 | Plan de pagos | "¿Entre inicial y mensualidades es el 30%?" |
| 40 | Entrega | "¿Cuándo estiman entregar?" |
| 36 | Financiamiento | Banco, tasa, precalificación, fiador |
| 35 | Inversión | Plusvalía, renta, Airbnb |
| 31 | Áreas y planos | "¿Plano con medidas y cotas?" |
| 29 | Ubicación | "¿Dónde queda?" |
| 22 | Parqueo | "¿Los m2 incluyen parqueo?" |
| 17 | Desarrolladora | "¿Quién construye?, referencias" |
| 11 | Modificaciones | "¿Se puede hacer un cuarto de servicio?" |
| 11 | Habitaciones | "¿Es de 2 o de 3?" |
| 8 | Amenidades | Piscina, gimnasio, seguridad |
| 6 | Compra desde el exterior | Diáspora |

**Lectura estratégica:** el tema número uno no es el precio, es **qué producto hay**. Y ese es justamente el dato que Daniela hoy tiene desactualizado. Por eso la primera prioridad del cerebro no son técnicas de venta, es inventario correcto.

---

## 4. Objeciones, con las palabras que usa la gente

| Objeción | Casos | Cómo la contesta el equipo hoy |
|---|---|---|
| "Lo hablo con mi esposo / esposa" | 20 | No se pelea. Se le da material para decidir en pareja y se ancla la urgencia real: "espero puedan aprovechar esta etapa de preventa, los precios del documento finalizan en [fecha]". |
| "La entrega está muy lejos" | 16 | Se convierte en argumento: entregar en 2028 es lo que permite el precio de hoy y la plusvalía. Se apoya con avance de obra real. |
| "No me interesa" / "por el momento no" | 15 | Se acepta sin insistir y se deja la puerta abierta. En la práctica pasa a nutrición mensual. |
| "Lo voy a pensar" | 5 | Se propone un siguiente paso concreto y pequeño (mandar el plano, la cotización a su nombre), no se pide la decisión. |
| "Ya tengo otra opción" | 1 | Comparación honesta por precio por m2, sin hablar mal del competidor. |
| "No califico en el banco" | 1 | Se revisa el escenario con números antes de descartar. |

Una respuesta real que vale como doctrina, cuando preguntaron por otros proyectos en Nuevo Cuscatlán:

> "Para ser sincero, hay muchos proyectos más, pero el precio por m2 está increíblemente fuera de mercado. Nosotros conocemos muy bien y no le mostraremos cualquier proyecto a nuestros clientes."

Eso es lo que hay que enseñarle a Daniela: **honestidad con criterio**, no defensa del producto a ciegas.

---

## 5. La verdad de Portacelli hoy (18/09/2026)

Esta es la tabla que manda. Todo lo que contradiga esto en el catálogo, en el knowledge base o en un chat viejo, está mal.

### Apartamentos, Torre Alta

| Dato | Valor |
|---|---|
| Único producto disponible | Apartamento de 101 m2 de construcción + 25 m2 de parqueos |
| Distribución | 2 habitaciones + estudio flex (del tamaño de una habitación junior, convertible en tercera habitación) |
| Precio de lista | $252,500 |
| Precio con prima de contado (3% de descuento) | $244,925 |
| Reserva | $3,000 |
| Prima total | 15%: 3% a la firma de promesa (menos la reserva, a los 30 días) + 12% hasta en 24 meses sin intereses |
| Saldo | 85% con banco o fondos propios contra entrega |
| Entrega | Cuarto trimestre de 2028 |
| Niveles disponibles | 1 a 3 |
| Vigencia | **Los precios actuales cambian el 30 de septiembre de 2026** |
| Penalidad por retiro | 10%. Alternativa: cesión de derechos gestionada por GT |

### Vendido, no ofrecer

106 m2, 107 m2 (incluida la unidad 501), townhomes y las 26 casas de la primera fase.

### Casas, Colección Raíces (nuevo el 17/09)

| Dato | Valor |
|---|---|
| Disponibilidad | **Una sola casa**, lote 5B |
| Terreno | 428.8 v2 |
| Construcción | 309 m2 en 3 niveles |
| Precio | $599,999 |
| Reserva | $5,000 |
| Promesa de venta | A los 30 días |
| Opción A, pago fraccionado | 3% a la firma de promesa (la reserva se abona) + 12% en 24 cuotas |
| Opción B, pago de contado | 15% a la firma menos la reserva, con 3% de descuento sobre el valor total |
| Saldo | 85% financiado al mes 24, con banco o fondos propios, conforme al avalúo vigente al cierre |

### Precio por unidad

La unidad 505 se cerró el 17/09 en **$247,450 de contado**. El precio no es uniforme por tipología: hay que consultar la unidad concreta. Daniela debe dar el precio de lista y aclarar que la unidad específica se confirma con el equipo.

### El proyecto

120 manzanas, 25 a 30 años de desarrollo, primeras 33 manzanas en construcción, 50% de área verde permanente. Desarrolla Grupo Fidelis, compañía hermana del grupo detrás de Ciudad Cayalá en Guatemala. Acceso frente al Centro de Investigación Forense de Nuevo Cuscatlán, bulevar de cuatro carriles, comparte entrada con Portales del Bosque y Torre Artea.

---

## 6. Lo que Daniela tiene cargado hoy y está mal

Esto es lo que encontré en el código y la base, y que hay que corregir antes de soltarla:

| Dónde | Qué dice hoy | Problema |
|---|---|---|
| `migrations/007`, guion de Portacelli, paso 3B | "Las 23 unidades entran a este precio de preventa $252,500" | El número de unidades cambió. Prometer 23 unidades es prometer inventario que no existe. |
| `knowledge_base`, topic `descuento_dos_opciones` | 106 m2 a $265,000 | El 106 m2 está vendido. Ofrecerlo quema la conversación, como ya pasó con dos clientes esta semana. |
| `knowledge_base`, topic `plan_pago_estandar` | Desactivado desde agosto por contradicción: 15% de prima con 20% de descuento | **Resuelto**: la cifra real es 15% de prima (3% + 12%) y 3% de descuento por prima de contado. Se puede reactivar con el número correcto. |
| `project_media`, brochure de Portacelli | URL `PENDIENTE-SUBIR-PDF`, `active = false` | Daniela no puede mandar el brochure. Hoy el equipo lo manda a mano. |
| Todo el cerebro | No existe la Colección Raíces ni la casa 5B | Si alguien pregunta por casas, Daniela responde que están vendidas. Hoy eso es falso. |
| Todo el cerebro | No existe la vigencia del 30/09 | Se pierde la única urgencia real que tenemos este mes. |

En los exports también se ve la deriva de precios: $242,400 en marzo y abril, $265,000 para el 106 m2, $252,500 desde junio. **Daniela no debe tomar precios del historial de conversaciones.** El bloque `truth_source` ya dice esto; hay que reforzarlo con el catálogo y los avisos.

---

## 7. Cómo queda el cerebro cargado

El respaldo `docs/respaldos/cerebro-portacelli-2026-09-18.sql` (respaldo, no migración) carga todo lo anterior en las tablas que el sistema ya lee:

| Capa | Qué se carga | Por qué ahí |
|---|---|---|
| `agent_notices` | Solo queda el 101 m2; precios cambian el 30/09 (vence el 01/10); una sola casa 5B | Es temporal y caduca solo. Entra al prompt con peso alto. |
| `project_scripts` | Guion de Portacelli v2, con inventario real, vigencia y rama de casas | Es el paso a paso que Daniela sigue. |
| `knowledge_base` | 14 entradas nuevas con `project_key = 'portacelli'`: inventario, casa 5B, estudio flex, vigencia, niveles, parqueos, precio por unidad, penalidad y cesión, más 6 FAQ sacadas de las preguntas reales | Es conocimiento estable, recuperable por semejanza. |
| `knowledge_base` | Corrección de `descuento_contado`, reactivación de `plan_pago_estandar`, baja de `descuento_dos_opciones` | Quita las contradicciones documentadas. |
| `escalation_rules` | Casa 5B y reserva de $5,000 al CEO; modificaciones estructurales al equipo | La casa es un ticket de $600k: no la cierra un bot. |

---

## 8. Reglas de comportamiento que hay que respetar

Daniela ya tiene 23 bloques de personalidad bien escritos. Lo que agrega este análisis:

1. **Inventario antes que argumento.** Si no está seguro de qué hay disponible, pregunta al equipo. Nunca ofrece un producto para "ver si pica".
2. **El precio se da después de las dos preguntas**, no antes. Si el cliente lo exige antes, se da el precio de lista y se hace la pregunta en el mismo mensaje.
3. **Una sola casa.** Al hablar de la 5B, nunca prometer exclusividad ni reservarla verbalmente. La frase es "queda una sola" y "avanza quien reserve primero".
4. **La vigencia del 30/09 se menciona en septiembre**, con naturalidad, no como amenaza.
5. **Nada de cuentas bancarias.** Ya está bloqueado, se mantiene.
6. **Modificaciones**: el estudio flex se puede convertir en cuarto de servicio. Un baño completo adicional no se puede. Cualquier otra modificación se consulta con arquitectos antes de responder.
7. **Trato de usted** salvo que el cliente marque tuteo claramente.

---

## 9. Lo que solo Michael puede resolver

Quedan cinco cosas que no puedo confirmar desde los datos y que bloquean el 100% de la autonomía:

1. **Cuántas unidades quedan de verdad.** El equipo dijo 13 de 42 en Torre 1. El guion dice 23. Hasta tener la ficha única, Daniela dice "disponibilidad limitada" sin número.
2. **El precio por unidad.** La 505 se cerró en $247,450 y la lista dice $252,500. Hace falta la tabla de precios por unidad y nivel.
3. **El PDF del brochure y la ficha de la Colección Raíces** en una URL pública, para activar `project_media` y que Daniela los mande sola.
4. **Los precios que rigen a partir del 01/10.** Sin eso, el 30 de septiembre Daniela se queda muda.
5. **Si la casa 5B la trabaja Daniela o solo el equipo.** Mi recomendación: Daniela informa y califica, el cierre lo toma Michael.
