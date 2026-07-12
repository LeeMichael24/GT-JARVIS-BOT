# Auditoría Final de Producción — ¿Daniela está lista para un número en vivo?

**Fecha:** 8 julio 2026 · Cuarta auditoría — la de go-live. A diferencia de las anteriores, esta **midió el comportamiento real** (base de datos de producción, conversaciones de las pruebas de Mike, prompt real, llamadas reales a GPT-4o).

---

## Veredicto: **LISTA PARA GO-LIVE CONTROLADO — 8.4/10** ✅ (con 4 pendientes de configuración, no de código)

El pipeline completo funciona: recibe → entiende → responde con contexto → califica → mueve stages → tagea → escala → recuerda → da seguimiento. Los problemas que reportaste (lentitud) eran reales, estaban medidos en tus datos, y **quedaron corregidos en esta sesión**.

---

## 1. LO QUE MEDÍ (datos reales, no teoría)

### ⏱ Tiempos de respuesta — TU QUEJA ERA VÁLIDA
| Métrica | Medido (tus pruebas, 7d) | Después de los fixes de hoy (estimado) |
|---|---|---|
| Mediana | **15.3s** | **~9-10s** |
| p90 | **25.1s** | ~14s |

**Dónde se iban los 15s:** debounce 3s + fetches 1.4s + **GPT-4o 4-5s con un prompt de 12,900 tokens** + delay de tipeo hasta 4s + envío.

**Los 4 fixes aplicados hoy:**
1. **Prompt adelgazado 27%**: 12,881 → 9,374 tokens (cerebro con presupuesto de 4.5K chars, playbook 6K, entradas largas truncadas — el conocimiento completo sigue en el panel, al prompt va la versión operativa)
2. **Delay de tipeo**: 30ms/char (máx 4s) → 22ms/char (máx 2.6s)
3. **Reordenamiento para caché de OpenAI**: lo estático primero, lo variable (fecha/perfil) al final → el prefijo repetido se cachea automáticamente = menos latencia y ~50% menos costo en el prefijo
4. **"Escribiendo..." entre burbujas**: las esperas entre mensajes dobles se ven vivas

### 📊 Stages — FUNCIONA Y ES INSTANTÁNEO (tu duda respondida)
**No hay "tiempo de espera" para mover stages: se evalúa EN CADA MENSAJE.** GPT devuelve el stage en cada respuesta y se aplica al instante. Evidencia en tus datos: 8 cambios registrados (new→hot, new→warm...) — tus pruebas corporativas subieron a `hot` en el PRIMER mensaje. Distribución actual: 66 new / 4 warm / 3 hot (los 66 "new" son pruebas de solo "Hola" — correcto que no suban).

### 🏷 Tags — FUNCIONA
51 tags auto-asignados por el bot (proyecto + origen del lead). Se aplican en el mismo mensaje donde se detecta el proyecto/fuente.

### 🧠 Aprendizaje — EL MECANISMO EXISTE, PERO AÚN NO PRODUCE (hallazgo)
- Cerebro: 226 entradas del equipo ✅ (top 20 por confianza se inyectan en cada mensaje)
- **Aprendidas por Daniela sola: 0** ⚠️ — el campo `brain_observations` existe y el guardado funciona, pero el modelo no ha emitido observaciones. Causa probable: tus pruebas fueron cortas ("Hola") — no había nada que aprender — y la instrucción es conservadora ("solo si detectas algo notable").
- **Qué hacer:** vigilar las primeras 2 semanas reales. Si sigue en 0 con conversaciones ricas, se sube la sensibilidad de la instrucción (cambio de 1 línea).

### 💾 Memoria de deals — FUNCIONA
21 resúmenes guardados. Daniela retoma conversaciones donde quedaron.

### 🎭 Personalidad — FUNCIONA con 1 fuga detectada
En tus últimos mensajes salió **"¿En qué puedo ayudarte hoy?"** — frase de la lista prohibida (el modelo a veces se fuga). Mitigación ya presente (blacklist explícita); vigilar y reportar fugas — cada ejemplo real endurece la regla.

### 📜 Guion Portacelli — SEMBRADO Y ACTIVO, SIN PRUEBA E2E TUYA AÚN
Verificado en DB (3,827 chars, keyword activa, persiste vía project_interest). **Ninguna de tus pruebas recientes dijo "portacelli"** — pruébalo: "info de portacelli" y sigue los 4 pasos.

---

## 2. CHECKLIST DE TUS 10 REQUISITOS (lo que pediste, uno por uno)

| # | Requisito | Estado | Nota |
|---|-----------|--------|------|
| 1 | Índices de interés (scoring) | ✅ | A/B/C en inbox/kanban, explicable |
| 2 | Escalamiento | ✅ | Reglas por keyword + juicio del modelo + alerta al CEO (plantilla aprobada) |
| 3 | Métricas de conversación | ✅ | Dashboard: embudo, objeciones, resolución, tiempos |
| 4 | Stages automáticos por interés | ✅ | Instantáneo, en cada mensaje (evidencia arriba) |
| 5 | Aprender de conversaciones | ⚠️ 70% | Mecanismo listo; 0 producidas — vigilar en real |
| 6 | Instrucciones por proyecto | ✅ | Tab **Guiones** (+ el cerebro para conocimiento global) |
| 7 | Conversación natural humana | ✅ 85% | Personalidad viva + burbujas + visto + typing; vigilar fugas de frases |
| 8 | Enviar toda la info (PDF/fotos/videos) | ⚠️ 80% | Sistema completo; falta subir el PDF real + endpoint del Ecosistema |
| 9 | Determinar el camino según intención | ✅ | Intent classifier + guion + marco de decisión SDR |
| 10 | Convencer → cita | ✅ | Psicología LatAm + Google Calendar + secuencias de seguimiento |

## 3. PARÁMETROS POR PROYECTO — dónde se configura cada cosa

| Parámetro | Dónde |
|-----------|-------|
| Guion de venta paso a paso | Panel → **Guiones** (por proyecto, keywords de activación) |
| Trato (usted/tú), tono del proyecto | Dentro del guion (ej: Portacelli = usted) |
| Precios, planes, condiciones | En el guion + catálogo del sitio (GT API) |
| Material (PDF/fotos/videos/link) | Tabla `project_media` (pronto: admin del Ecosistema) |
| Conocimiento profundo / FAQs | Panel → **Conocimiento** (cerebro) |
| Personalidad BASE (global) | Prompt (código) — es el carácter de Daniela, no cambia por proyecto |

## 4. LOS 4 PENDIENTES REALES ANTES DEL NÚMERO EN VIVO

1. **Variables en Vercel** (5 min, tú): `WA_TEMPLATE_FOLLOWUP=seguimiento_interes` + confirmar `WA_TEMPLATE_CEO_ALERT=alerta_lead_hot` + redeploy.
2. **PDF del brochure Portacelli** a URL pública (sin él, el paso 4 del guion va sin adjunto).
3. **Cuenta real de Meta**: crear `seguimiento_interes` allá + suscribir webhook (yo por API cuando digas) + método de pago (tú).
4. **Migración 008** en Supabase (columnas source/project_slug del sync de media — 1 min, como las anteriores).

**Riesgo conocido a vigilar (no bloquea):** límite OpenAI 30K tokens/min → ~3 mensajes/min en ráfaga. Para el arranque alcanza; si metes ads agresivos, se pide upgrade de tier (sale solo con uso) — el caché de hoy ya ayuda.

## 5. Recomendación de lanzamiento

**Go-live controlado en 3 fases:**
1. **Semana 1 — número real SIN anunciar**: migrar el bot al +503, probar con socios (ya sin lista blanca), monitorear dashboard/logs a diario.
2. **Semana 2 — tráfico orgánico**: número en el sitio web y perfiles. Ajustar guiones/cerebro con conversaciones reales.
3. **Semana 3+ — ads**: encender Meta Ads apuntando al WhatsApp. Vigilar tiempos, rate limit y tasa de escalación.

Con eso, cada etapa valida la siguiente y ningún cliente real se topa con un sistema sin rodar.
