# Auditoría de Producto — De bot interno a producto nivel San Francisco
**Fecha:** 3 julio 2026 · **Alcance:** producto, mercado, features — complementa la auditoría técnica (`AUDITORIA-ENTERPRISE-2026-06.md`, 7.2/10 infra)

---

## 1. Veredicto ejecutivo

**Lo que somos hoy:** un agente SDR vertical de bienes raíces sobre WhatsApp, con cerebro editable, memoria de deals, escalamiento configurable y CRM propio. **Eso ya es más de lo que el 90% del mercado LatAm vende como "AI agent".**

**Lo que nos falta para "SF-grade":** medición (no sabemos cuánto dinero produce cada conversación), coaching del agente (no hay forma sistemática de evaluar/mejorar sus respuestas), y empaquetado (todo lo custom vive en código, no en el panel).

**La tesis de producto:** los AI SDRs de San Francisco (11x, Artisan, AiSDR) cobran **$850–$10,000/mes** por agentes de EMAIL en frío con tasas de respuesta del 1-5%. Nosotros operamos en WhatsApp LatAm donde la tasa de respuesta es 10-30x mayor y el mercado hizo **$18.2B en 2025 (72% vía WhatsApp)**. Mismo cerebro, canal infinitamente mejor. El gap no es tecnología — es pulido de producto.

**Viento a favor regulatorio:** desde el 15 de enero 2026 Meta prohíbe chatbots de IA de propósito general en WhatsApp (adiós wrappers de ChatGPT). Los agentes verticales de negocio como Daniela son exactamente lo que Meta SÍ permite. La purga nos limpia la competencia barata.

---

## 2. Benchmark — dónde estamos vs el mercado

### vs. Plataformas WhatsApp LatAm (Yalo, Leadsales, Wati, Treble, Botmaker)

| Capacidad | Ellos | Daniela hoy |
|-----------|-------|-------------|
| Flujos de botones/menús | ✅ Su núcleo | ✅ Botones interactivos cuando aporta |
| IA conversacional real (no árbol de decisión) | ⚠️ Recién llegando ("Lead Agent" de Leadsales, 2026) | ✅✅ GPT-4o con contexto total del negocio |
| Conocimiento profundo del negocio | ⚠️ FAQs + catálogo plano | ✅✅ 5 fuentes: catálogo vivo, playbook, cerebro, reglas, memoria por deal |
| Memoria entre conversaciones | ❌ Mayormente sin estado | ✅ deal_summaries + señales |
| Escalamiento inteligente a humano | ⚠️ Por keyword simple | ✅ Reglas + juicio del modelo + alertas al CEO |
| CRM incluido | ✅ Su fuerte (inbox, kanban) | ✅ Panel propio completo |
| Campañas salientes / plantillas | ✅✅ Su fuerte | ⚠️ Secuencias construidas, plantillas en aprobación |
| Analytics de ventas | ✅ Dashboards maduros | ⚠️ Dashboard básico |
| Multi-agente / multi-número | ✅ | ❌ Un número, una Daniela |
| Self-service onboarding | ✅ | ❌ Requiere a Claude 😄 |

**Lectura:** les ganamos en INTELIGENCIA (lo difícil), nos ganan en EMPAQUE (lo tedioso pero copiable).

### vs. AI SDRs de San Francisco (11x, Artisan, AiSDR)

| Capacidad | Ellos | Daniela hoy |
|-----------|-------|-------------|
| Canal | Email frío + LinkedIn (respuesta 1-5%) | WhatsApp inbound caliente (respuesta 40%+) |
| Prospección / data (300M contactos Artisan) | ✅✅ | ❌ (no aplica igual — inbound + ads) |
| Calidad de copy obsesiva (AiSDR) | ✅✅ A/B testing de mensajes | ⚠️ Prompt bueno, sin A/B |
| Autonomía con handoff a humano | ✅ | ✅✅ Takeover en vivo + escalamiento |
| Conversation intelligence (tipo Gong) | ✅ Scoring, coaching, "por qué se perdió" | ❌ **El gap más grande** |
| Precio | $850–$10,000/mes | — (interno) |

---

## 3. Qué copiar de cada quien (lo mejor de cada casa)

| De quién | Qué copiar | Cómo se ve en Daniela |
|----------|-----------|----------------------|
| **Gong** | Conversation intelligence: score por conversación, razones de pérdida, coaching | Módulo "Calidad": cada conversación cerrada se auto-evalúa (¿calificó? ¿ofreció cita? ¿tiempo de respuesta?) + razones de no-venta agregadas |
| **AiSDR** | Obsesión por el copy: A/B de mensajes, aprender de los que convierten | Marcar qué respuestas llevaron a cita/venta → alimentar el cerebro automáticamente |
| **11x** | "Digital worker" como categoría: reportes semanales del agente como si fuera empleada | Reporte lunes 8am por WhatsApp: "Esta semana atendí 47 leads, 12 calificados, 5 citas, 2 escalados. Perdimos 8 por precio." |
| **Leadsales** | Vibe selling + onboarding simple para PyMEs | Wizard de configuración: pega tu catálogo → elige personalidad → conecta número |
| **Yalo** | Flows de comercio (pedido/pago dentro del chat) | Fase reserva: apartado de $500-3,000 con link de pago DENTRO del chat |
| **Intercom/Crisp** | Inbox UX pulido: notas colaborativas, asignación, snooze | Mejoras incrementales al panel |
| **Clay** | Enriquecimiento de leads | Cruzar teléfono/nombre con redes para pre-calificar (fase 3, cuidado privacidad) |

---

## 4. Los 7 pilares del producto de primer nivel (con score actual)

### P1 — Inteligencia de ventas 📊 (hoy: 4/10 — EL gap #1)
El CEO debe abrir el panel y ver DINERO, no mensajes:
- **Embudo completo**: leads → respondidos → calificados → cita → visita → reserva → venta (conversión % por etapa)
- **Revenue pipeline**: valor estimado por etapa (ya sabemos proyecto + presupuesto del deal)
- **Atribución**: qué campaña de Meta Ads produce leads que COMPRAN (ya trackeamos lead_sources → cerrar el loop)
- **Lead scoring visible**: A/B/C por engagement + presupuesto + timeline (los datos YA existen en qualification_data)
- **Razones de pérdida** agregadas: "35% precio, 20% zona, 15% financiamiento" → decisiones de negocio
- **Tiempos**: primera respuesta, ciclo completo, horas calientes del día

### P2 — Psicología de ventas LatAm 🧠 (hoy: 7/10 — nuestra ventaja diferencial, profundizarla)
Ya tenemos: calidez, confianza, urgencia suave, referidos, celebración. Falta sistematizar:
- **Venta en cuotas mentales**: LatAm compra pagos, no precios. "Desde $890/mes" > "$242,000" — regla de presentación de precio en el prompt
- **El apartado chiquito**: reduce fricción — "con $500 congelas el precio 15 días" (micro-compromiso)
- **Familia como unidad de decisión**: detectar "lo consulto con mi esposo/a" → contenido para compartir + oferta de llamada familiar
- **Voz**: los latinos AMAN las notas de voz — fase 2: Daniela responde con nota de voz (TTS) cuando el cliente manda voz
- **Timing cultural**: seguimiento post-quincena (15 y 30), evitar domingos familiares, aprovechar aguinaldo (nov-dic)
- **Formalidad adaptativa**: "usted" para +50 años y corporativos, "vos/tú" para jóvenes — detectar y ajustar
- **Prueba social localizada**: "3 familias de San Miguel reservaron este mes" > testimonios genéricos

### P3 — Full customizable desde el panel 🎛 (hoy: 5/10)
Todo lo que hoy es código debe ser configuración:
- **Persona builder**: nombre, tono, emojis, horarios, mensaje de presentación — editable
- **Playbook editor**: el `knowledge_base` (32 entradas) editable como el cerebro (hoy solo SQL)
- **Media library en DB**: subir PDF desde el panel → disponible al instante (hoy: código + deploy)
- **Editor de secuencias**: pasos, tiempos y propósitos de follow-up configurables
- **Horario del agente**: cuándo responde al instante vs cuándo avisa "te escribo a primera hora"

### P4 — Coaching & QA del agente 🎓 (hoy: 3/10 — lo que separa juguete de producto)
- **Sandbox de pruebas**: chat de prueba en el panel contra Daniela SIN WhatsApp (probar cambios del cerebro al instante)
- **Golden conversations**: suite de 20-30 conversaciones críticas que corren en CI — si un cambio del prompt rompe el manejo de "precio final", el deploy avisa
- **Score automático post-conversación**: ¿capturó nombre? ¿calificó? ¿ofreció siguiente paso? → tendencia semanal
- **Botón "¿por qué dijiste esto?"**: ver el contexto que recibió el modelo en cualquier respuesta (debug de confianza)
- **Corrección → aprendizaje**: cuando un humano corrige a Daniela en takeover, ofrecer "¿guardar como corrección en el cerebro?"

### P5 — Estructura empresarial 🏢 (hoy: 7/10)
Ya: roles admin/asesor, activity log, RLS, auth. Falta:
- Exportes (CSV de leads/conversaciones) para contabilidad/directorio
- SLA visible: "ningún lead sin respuesta humana >2h tras escalamiento"
- Retención y privacidad documentadas (LOPD SV / GDPR-like para corporativos)

### P6 — Confiabilidad y observabilidad 🛡 (hoy: 6/10)
Cubierto en la auditoría técnica: Sentry + alertas, procesar `statuses` (mensajes fallidos), load testing. **Prerequisito de todo lo demás: el pipeline de deploy (pendiente HOY).**

### P7 — Productización multi-tenant 💰 (hoy: 2/10 — solo si se vende como SaaS)
- Multi-empresa: cada tenant su número, catálogo, cerebro, panel
- Onboarding self-service + billing (Stripe) + white-label
- **Pricing de referencia del mercado**: $850-900/mes los gringos por email; Yalo/Leadsales $60-500/mes por WhatsApp básico. Un "Daniela para inmobiliarias LatAm" a **$300-600/mes** está debajo de los gringos y arriba de los bots tontos — con demo en vivo por WhatsApp como cierre.

---

## 5. Roadmap 30/60/90 (priorizado por ROI)

### Días 1–30 — "Ver el dinero" (todo con datos que YA tenemos)
1. ⬜ Desbloquear pipeline de deploy (HOY — sin esto nada existe)
2. ⬜ Dashboard de inteligencia de ventas v1: embudo + conversiones + razones de pérdida + tiempos
3. ⬜ Lead scoring A/B/C visible en inbox/kanban
4. ⬜ Reporte semanal de Daniela al CEO por WhatsApp (plantilla ya en aprobación)
5. ⬜ Reglas de precio en cuotas + apartado en el prompt (P2 quick wins)
6. ⬜ Conectar plantillas aprobadas al cron de secuencias

### Días 31–60 — "Confianza y control"
7. ⬜ Sandbox de pruebas en el panel
8. ⬜ Score automático de conversaciones + tendencia
9. ⬜ Media library en Supabase (subir PDFs desde panel)
10. ⬜ Playbook editor en panel
11. ⬜ Golden conversations en CI
12. ⬜ Sentry + statuses de mensajes fallidos

### Días 61–90 — "Escala"
13. ⬜ Notas de voz salientes (TTS)
14. ⬜ Formalidad adaptativa + timing cultural en secuencias
15. ⬜ Apartado con link de pago en chat
16. ⬜ Decisión estratégica: ¿Daniela-as-a-Service? → multi-tenant + pricing

---

## 6. Quick wins de esta semana (sin esperar el roadmap)

1. **Deploy pipeline** — Disconnect/Reconnect en Vercel (2 clicks, TODO depende de esto)
2. **Regla de cuotas en el prompt** — 30 min de trabajo, impacto directo en conversión
3. **Reporte semanal** — cron dominical que arma el resumen con datos existentes
4. **Exporte CSV de leads** — 1 hora, lo pide cualquier corporativo

---

## Fuentes del benchmark
- Mercado AI SDR US 2026: Amplemarket, SyncGTM, Coldreach (11x $5-10K/mes; Artisan $850/mes, G2 3.8; AiSDR $900/mes)
- LatAm: TechCrunch/LatamRepublic (Leadsales Lead Agent 2026), Yalo.ai, EasySell ($18.2B conversational commerce 2025, 72% WhatsApp, prohibición Meta ene-2026)
