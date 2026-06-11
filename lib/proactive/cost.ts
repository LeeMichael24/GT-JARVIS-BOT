// Costo estimado por mensaje de plantilla (USD). Solo informativo en el panel;
// la tarifa real la define Meta por país/categoría.
// Guard: env vacía o no-numérica cae al default (Number('') sería 0 — "gratis" engañoso).
const parsed = Number(process.env.COST_PER_TEMPLATE_USD)
export const COST_PER_TEMPLATE_USD = Number.isFinite(parsed) && parsed > 0 ? parsed : 0.06
