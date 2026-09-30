  -- ────────────────────────────────────────────────────────────
  -- 023 — Memoria vectorial persistente (RAG de Daniela)
  --
  -- Antes los vectores del conocimiento (~88 entradas) y del cerebro (~234) vivían
  -- solo en la memoria del proceso. En Vercel casi cada mensaje arranca en frío:
  -- se volvían a pedir a OpenAI ~320 vectores por mensaje, con 4 s de límite, y si
  -- no alcanzaba se metía TODO el conocimiento al prompt (~4.4K tokens de más).
  --
  -- Ahora cada texto se vectoriza UNA vez en la vida (se identifica por el sha1 de
  -- su contenido; si se edita, cambia el hash y se vectoriza de nuevo) y la
  -- búsqueda por similitud la hace Postgres: al código solo vuelven los hashes
  -- ganadores, no 320 vectores.
  --
  -- Lo mismo sirve para la memoria de cada cliente: sus mensajes viejos (fuera de
  -- la ventana del historial) se vectorizan una vez y Daniela recupera solo los
  -- que tienen que ver con lo que pregunta hoy.
  --
  -- Si esta migración no está aplicada, el código sigue funcionando como antes.
  -- ────────────────────────────────────────────────────────────
  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE TABLE IF NOT EXISTS memoria_vectores (
    hash       TEXT NOT NULL,           -- sha1 del texto vectorizado
    modelo     TEXT NOT NULL,           -- modelo de embeddings (text-embedding-3-small)
    fuente     TEXT NOT NULL,           -- conocimiento | cerebro | conversacion
    vector     vector(1536) NOT NULL,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (hash, modelo)
  );

  -- Solo el servidor (service role) la toca
  ALTER TABLE memoria_vectores ENABLE ROW LEVEL SECURITY;

  -- Cuáles de estos hashes todavía no tienen vector
  CREATE OR REPLACE FUNCTION memoria_faltantes(p_hashes TEXT[], p_modelo TEXT)
  RETURNS SETOF TEXT
  LANGUAGE sql STABLE
  AS $$
    SELECT h FROM unnest(p_hashes) AS h
    WHERE NOT EXISTS (SELECT 1 FROM memoria_vectores m WHERE m.hash = h AND m.modelo = p_modelo)
  $$;

  -- Los k más parecidos a la consulta, solo entre los candidatos de ESTE turno
  -- (el conocimiento ya filtrado por proyecto, o los mensajes de ESTE cliente)
  CREATE OR REPLACE FUNCTION memoria_cercanos(p_consulta vector(1536), p_hashes TEXT[], p_modelo TEXT, p_k INT)
  RETURNS TABLE (hash TEXT, similitud FLOAT)
  LANGUAGE sql STABLE
  AS $$
    SELECT m.hash, 1 - (m.vector <=> p_consulta) AS similitud
    FROM memoria_vectores m
    WHERE m.hash = ANY(p_hashes) AND m.modelo = p_modelo
    ORDER BY m.vector <=> p_consulta
    LIMIT p_k
  $$;

  REVOKE ALL ON FUNCTION memoria_faltantes(TEXT[], TEXT) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION memoria_cercanos(vector, TEXT[], TEXT, INT) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION memoria_faltantes(TEXT[], TEXT) TO service_role;
  GRANT EXECUTE ON FUNCTION memoria_cercanos(vector, TEXT[], TEXT, INT) TO service_role;

  -- Verificación
  SELECT count(*) AS vectores_guardados FROM memoria_vectores;
