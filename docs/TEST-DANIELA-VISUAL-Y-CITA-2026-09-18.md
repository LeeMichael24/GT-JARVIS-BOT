# Test de Daniela: material visual, entendimiento y cierre de cita

> ⚠️ **Resultado con gpt-4.1 (18-sep-2026).** Hoy Daniela responde con gpt-5.6-terra y el catálogo/material del Ecosistema cambió; los hallazgos hay que re-medirlos (`npm run eval:visual`) antes de darlos por vigentes.

**Fecha:** 18 de septiembre de 2026
**Corrida:** `.eval/eval-visual-2026-09-18-23-01.json` · modelo `gpt-4.1` · crítico `o4-mini` · juez `o4-mini` a 3 votos
**Cómo repetirlo:** `npm run eval:visual` (16 escenarios, ~11 minutos, cuesta centavos)

---

## Qué se probó y por qué

De los 120 chats reales exportados de WhatsApp, **en el 58% el cliente pidió material visual**:

| Lo que pide el cliente | Chats | % |
|---|---|---|
| Ubicación / mapa | 36 | 30% |
| Brochure, PDF o ficha | 33 | 28% |
| Fotos o renders | 29 | 24% |
| Plano o distribución | 26 | 22% |
| Video | 20 | 17% |
| Lista de precios / disponibilidad | 19 | 16% |

Por eso la batería (`tests/eval/escenarios-visual.ts`) son 16 conversaciones en tres bloques: **material** (7), **entendimiento** (5) y **cita** (4). Cada una corre por el pipeline real —el mismo camino del webhook, con crítico y reescritura— y después **simula la entrega del archivo igual que producción**: resuelve lo que Daniela pidió mandar contra la tabla `project_media` y registra si el archivo de verdad le habría llegado al cliente. Un texto impecable que promete una ficha inexistente queda marcado como promesa rota.

Califica un juez independiente (3 votos, mediana) de 0 a 2 en cuatro ejes —entendió, visual, conduce, cita— y encima corren chequeos duros que no dependen del juez: material correcto, promesa sin adjuntar, datos obligatorios presentes y cita concreta con día o modalidad.

---

## Resultado global

| Métrica | Resultado |
|---|---|
| Puntaje promedio | **5.56 / 8** |
| Entendió lo que le preguntaron | 1.88 / 2 |
| Uso del material | 1.81 / 2 |
| Conduce la conversación | 1.50 / 2 |
| **Empuja a la cita** | **0.38 / 2** |
| Material correcto | 9 / 16 |
| Promesas de material sin adjuntar | 1 |
| Cita concreta cuando tocaba | **1 / 4** |
| Frases de call center | 0 |
| Reescritas por el crítico | 6 / 16 |
| Tiempo de respuesta (mediana) | 29 s |

Por bloque: material 5.57, entendimiento 5.00, cita 6.25 sobre 8.

**Lectura corta:** Daniela contesta bien y con datos duros; lo que está flojo es lo que el negocio necesita — mostrar todo lo que hay que mostrar y aterrizar la cita.

---

## Hallazgos, en orden de riesgo

### 1. Inventa la lista de precios por unidad (CRÍTICO)

Escenario V7, cliente: *"Me pasa la lista de precios de todas las unidades con nivel y número"*. Respondió:

> Nivel 1: unidades 101, 102, 103, 104 ($252,500)
> Nivel 2: unidades 201, 202, 203, 204 ($253,500)
> Nivel 3: unidades 301, 302, 303, 304 ($255,000)

**Nada de eso existe.** Los precios $253,500 y $255,000 no están en ninguna fuente, y la numeración contradice la realidad (se vendieron unidades 505, 302, 501). Su propio conocimiento dice lo contrario: *"Da siempre el precio de lista y aclara que el de la unidad específica lo confirma el equipo"*.

El 16% de los clientes reales pide exactamente esto. Es el único escenario donde Daniela puede mandar un precio falso a un cliente.

### 2. Ofrece documentos que no existen

- **V6 · casa de Raíces.** El texto es correcto y completo (lote 5B, 428.8 v², 309 m², $599,999, reserva $5,000, las dos opciones de pago), pero cierra con *"Quedo pendiente si desea la ficha detallada en PDF"*. **Esa ficha no está cargada**: si el cliente dice que sí, no hay nada que mandar. Es la única promesa rota de la batería, y es justo el caso de una clienta de esta mañana, que el equipo tuvo que resolver a mano.
- **V2 · plano del 101 m².** Contestó *"en el brochure oficial viene el plano acotado del modelo de 101 m²"*. Daniela no puede ver el contenido del brochure —su propio prompt se lo prohíbe— y nadie verificó que ese plano esté ahí. Si no está, el cliente abre el PDF y la promesa se cae.

### 3. Habla de material que no adjunta (límite de 1 pieza por turno)

El webhook manda **una sola pieza por respuesta** (salvo imágenes, hasta 3). Daniela no lo sabe, así que menciona un segundo material y lo deja en el aire:

| Escenario | Mandó | Mencionó y no mandó |
|---|---|---|
| V4 no se ubica | link de Google Earth | *"En el video de avance se ve…"* |
| C2 cliente en Houston | brochure | *"En el video que le comparto después…"* |
| C4 quiere apartar | brochure | video |

### 4. No lleva a la cita — el eje más flojo (0.38 / 2)

Solo concretó cita en **1 de 4** escenarios donde tocaba:

- **C3 (8/8), lo que sí funciona:** *"¿Te queda mejor sábado a las 10:00 am o domingo a las 11:00 am para la visita?"* — alternativa cerrada, con imagen de avance adjunta.
- **C2 (3/8), el más caro:** el cliente dice *"no estoy en el país"* y **nunca ofrece videollamada ni tour virtual**. Le manda el brochure y promete un video.
- **C1 (6/8):** el cliente dice que anda ocupado y Daniela le quita la cita de encima: *"puede congelar el precio y el descuento sin necesidad de agendar visita ya mismo"*.
- En los 7 escenarios de material, después de mandar el archivo **no invita a nada** en 5 de 7.

Esto no es una falla del modelo: el bloque `closing` le dice que la propuesta directa va solo *"cuando el cliente da señal de avance"*. La regla se escribió para que no repitiera "¿te agendo una visita?" en cada turno, y cumplió de más.

### 5. La misma pregunta, dos calidades distintas

- **E1 (plan de pago):** perfecto. Desglosa con números reales — 15% de $252,500 = $37,875, reserva $3,000, $4,575 a la firma, $30,300 en 24 cuotas de $1,262.50. Aritmética correcta.
- **E5 (crédito bancario):** la misma familia de pregunta y solo promete — *"Le armo el ejemplo de cómo queda la prima mensual"*. Dejó al cliente esperando un cálculo que ya sabía hacer.

---

## Lo que Daniela tiene contra lo que manda el equipo

Inventario real en `project_media` hoy: **4 piezas, todas de Portacelli Alta**.

| Pieza | Estado |
|---|---|
| Imagen de avances (bulevar) | cargada |
| Brochure apartamentos Alta | cargada |
| Video de avance y ubicación | cargada |
| Link de ubicación en Google Earth | cargada (común a toda la familia) |
| Ficha Colección Raíces (casa 5B) | **no existe** |
| Brochure Raíces 29 páginas | **no existe** |
| Plano Fase 1 Raíces | **no existe** |
| Amueblada tipo B | **no existe** |
| Plano / distribución del 101 m² | **no existe** |
| Lista de precios por unidad | **no existe** |

El 18/09 a las 10:07 am el equipo le mandó a una clienta seis piezas a mano. Daniela solo tenía una de ellas.

**Aviso para cuando se carguen:** el panel (`createProjectMediaItem`) inserta sin `project_slug`, y una fila sin slug es material **común a todos los listings de la familia**. Si la ficha de Raíces se carga así, va a salir como "el documento" en conversaciones de apartamentos Alta. Hay que escribirle el `project_slug` de Raíces a esa fila.

---

## Qué arreglar, en orden

1. **Tapar la lista de precios inventada.** Regla dura en el conocimiento y en el bloque de precios: cuando pidan precios por unidad, dar el de lista ($252,500 / $244,925 de contado), decir que el de la unidad específica lo confirma el equipo y escalar. Se vuelve a correr V7 para verificar.
2. **Cargar el material que falta** con su `project_slug` correcto: ficha y brochure de Raíces, plano del 101 m², plano Fase 1, amueblada tipo B. Hoy no hay dónde alojarlos (no existe bucket en Supabase Storage y las 4 piezas actuales viven en Cloudinary del sitio); hay que subirlos y registrar la URL pública.
3. **Prohibir ofrecer material que no está en el inventario**, incluso "en PDF si lo desea". La regla existe para lo que envía; falta para lo que promete a futuro.
4. **Decirle que solo puede mandar una pieza por turno**, y que si quiere mandar una segunda la anuncie para el siguiente mensaje con un compromiso explícito, no con un "después".
5. **Regla de cita:** cliente fuera del país o que no puede visitar → ofrecer videollamada con día y hora, siempre con alternativa cerrada de dos opciones, como en C3. Y después de mandar material, invitar al siguiente paso.
6. **Verificar qué trae el brochure** y escribirlo en el conocimiento, para que pueda decir con verdad si el plano está adentro.

---

## Escenario por escenario

| # | Escenario | Nota | E | V | C | Cita | Material esperado → entregado |
|---|---|---|---|---|---|---|---|
| V1 | Pide fotos del proyecto | 6/8 | 2 | 2 | 1 | 1 | imagen → imagen |
| V2 | Pide el plano del 101 m² | 7/8 | 2 | 2 | 2 | 1 | ninguno → brochure (dice que trae el plano) |
| V3 | Pide el brochure | 6/8 | 2 | 2 | 2 | 0 | documento → brochure |
| V4 | No se ubica | 3/8 | 1 | 1 | 1 | 0 | link → link (menciona video que no manda) |
| V5 | Pide video de obra | 6/8 | 2 | 2 | 2 | 0 | video → video |
| V6 | Casa Raíces: pide la ficha | 6/8 | 2 | 2 | 2 | 0 | ninguno → **promete PDF inexistente** |
| V7 | Lista de precios por unidad | 5/8 | 2 | 2 | 1 | 0 | ninguno → **inventa la tabla de precios** |
| E1 | No entiende el plan de pago | 5/8 | 2 | 2 | 1 | 0 | ninguno (respuesta modelo) |
| E2 | Cuántas habitaciones son | 6/8 | 2 | 2 | 2 | 0 | ninguno |
| E3 | Por qué aquí y no Santa Elena | 5/8 | 2 | 2 | 1 | 0 | brochure (extra, correcto) |
| E4 | Entrega y arrepentimiento | 5/8 | 2 | 2 | 1 | 0 | ninguno (4T-2028, 10%, cesión) |
| E5 | Crédito bancario | 4/8 | 2 | 1 | 1 | 0 | ninguno (promete el cálculo) |
| C1 | Interesado pero ocupado | 6/8 | 2 | 2 | 2 | 0 | brochure (le quita la visita) |
| C2 | Cliente en EE. UU. | 3/8 | 1 | 1 | 1 | 0 | brochure (**no ofrece virtual**) |
| C3 | Solo fines de semana | **8/8** | 2 | 2 | 2 | 2 | imagen + cita sábado/domingo |
| C4 | Quiere apartar | **8/8** | 2 | 2 | 2 | 2 | brochure + pasos de reserva |

Detalle completo, con las burbujas textuales de cada respuesta, en `.eval/eval-visual-2026-09-18-23-01.json`.

---

## Re-medición del 29-sep-2026 con gpt-5.6-terra

Corrida `.eval/eval-visual-2026-09-29-03-22.json` · modelo `gpt-5.6-terra` · crítico `o4-mini` · juez `o4-mini` a 3 votos · 16 escenarios · mediana 23.5 s.

| Métrica | 18-sep (gpt-4.1) | 29-sep (terra) |
|---|---|---|
| Puntaje promedio | 5.56 / 8 | 5.19 / 8 |
| Entendió | 1.88 | 1.63 |
| Empuja a la cita | 0.38 | 0.25 |
| Cita concreta cuando tocaba | 1 / 4 | **0 / 4** |
| Material correcto | 9 / 16 | 10 / 16 |
| Promesas de material sin adjuntar | 1 | 1 (C4; ver nota) |
| Reescritas por el crítico | 6 / 16 | 7 / 16 |

**Hallazgo 1 (lista de precios inventada): resuelto.** En V7 ya no inventa precios por unidad: da el de lista ($252,500 / $244,925), dice que el valor cambia por número y ubicación, y que el cuadro oficial lo valida el equipo.

**Sigue abierto: la cita.** 0 de 4 con propuesta concreta. C2 (cliente en EE. UU.) no ofrece videollamada; C1 y C4 no proponen fecha; tras mandar material casi nunca invita a un siguiente paso.

**Notas de lectura (verificadas a mano):**
- Los "errores de cálculo" que marca el juez en V6 y E1 son falsos: 3 % de $599,999 menos la reserva de $5,000 = $13,000 y 12 % = $72,000 (V6); 15 % de $252,500 = $37,875, 3 % menos reserva = $4,575 y 12 % = $30,300 en 24 cuotas de $1,262.50 (E1). El juez de un solo modelo es ruidoso.
- La "promesa sin adjuntar" de C4 es "le comparta el canal formal de pago", promesa del equipo y no de un archivo: probable falso positivo del detector.
- V6 sigue diciendo que la ficha "se la confirma el equipo": correcto mientras no exista la ficha de Raíces.
- Una sola corrida por modelo; con el ruido del juez, las diferencias de puntaje entre fechas no son concluyentes.
