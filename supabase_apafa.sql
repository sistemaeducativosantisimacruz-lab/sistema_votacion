-- ====================================================================
-- SISTEMA DE VOTACIÓN APAFA (ASOCIACIÓN DE PADRES DE FAMILIA)
-- Script de creación de tablas para Supabase
-- ====================================================================

-- 1. Tabla de Apoderados / Padrón de Padres de Familia
CREATE TABLE IF NOT EXISTS public.apoderados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dni VARCHAR(20) UNIQUE NOT NULL,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    parentesco VARCHAR(50) DEFAULT 'PADRE', -- 'PADRE' | 'MADRE' | 'APODERADO'
    familia_id TEXT NOT NULL,                -- Identificador único de la familia
    hijos TEXT,                             -- Descripción de los hijos (ej: 'FERNANDO BARRANZUELA (1° A)')
    nivel TEXT,                             -- 'primaria' | 'secundaria' | 'mixto'
    grado TEXT,                             -- Grado(s) de referencia
    seccion TEXT,                           -- Sección(es) de referencia
    ya_voto BOOLEAN DEFAULT FALSE,          -- Estado de votación de la familia
    voto_emitido_por TEXT,                  -- 'Votó el PADRE: Carlos Barranzuela (DNI 80537851)'
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apoderados_dni ON public.apoderados(dni);
CREATE INDEX IF NOT EXISTS idx_apoderados_familia_id ON public.apoderados(familia_id);

-- 2. Tabla de Elecciones de APAFA
CREATE TABLE IF NOT EXISTS public.elecciones_apafa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    fecha_votacion DATE,
    esta_activa BOOLEAN DEFAULT FALSE,
    snapshot_historico JSONB,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de Cargos de APAFA
CREATE TABLE IF NOT EXISTS public.cargos_apafa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    descripcion TEXT NOT NULL,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar cargos directivos reglamentarios de APAFA si no existen
INSERT INTO public.cargos_apafa (descripcion, orden)
SELECT descripcion, orden FROM (
    VALUES 
        ('Presidente(a)', 1),
        ('Vicepresidente(a)', 2),
        ('Secretario(a)', 3),
        ('Tesorero(a)', 4),
        ('Vocal 1', 5),
        ('Vocal 2', 6),
        ('Fiscal / Vigilancia', 7)
) AS t(descripcion, orden)
WHERE NOT EXISTS (SELECT 1 FROM public.cargos_apafa LIMIT 1);

-- 4. Tabla de Partidos / Listas de APAFA
CREATE TABLE IF NOT EXISTS public.partidos_apafa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleccion_id UUID REFERENCES public.elecciones_apafa(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    numero_lista TEXT,
    logo_url TEXT,
    color TEXT,
    candidatos JSONB, -- Formato: [{ cargo: 'Presidente(a)', nombre: '...', dni: '...' }]
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partidos_apafa_eleccion ON public.partidos_apafa(eleccion_id);

-- 5. Tabla de Votos de APAFA
CREATE TABLE IF NOT EXISTS public.votos_apafa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleccion_id UUID REFERENCES public.elecciones_apafa(id) ON DELETE CASCADE,
    partido_id UUID REFERENCES public.partidos_apafa(id) ON DELETE SET NULL, -- NULL = Voto en blanco / nulo
    familia_id TEXT,
    nivel_votante TEXT,
    grado_votante TEXT,
    seccion_votante TEXT,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_votos_apafa_eleccion ON public.votos_apafa(eleccion_id);

-- ====================================================================
-- POLÍTICAS DE ACCESO (Row Level Security)
-- ====================================================================
ALTER TABLE public.apoderados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica apoderados" ON public.apoderados;
CREATE POLICY "Permitir lectura publica apoderados" ON public.apoderados FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir full acceso service role apoderados" ON public.apoderados;
CREATE POLICY "Permitir full acceso service role apoderados" ON public.apoderados USING (true) WITH CHECK (true);

ALTER TABLE public.elecciones_apafa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica elecciones_apafa" ON public.elecciones_apafa;
CREATE POLICY "Permitir lectura publica elecciones_apafa" ON public.elecciones_apafa FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir full acceso service role elecciones_apafa" ON public.elecciones_apafa;
CREATE POLICY "Permitir full acceso service role elecciones_apafa" ON public.elecciones_apafa USING (true) WITH CHECK (true);

ALTER TABLE public.cargos_apafa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica cargos_apafa" ON public.cargos_apafa;
CREATE POLICY "Permitir lectura publica cargos_apafa" ON public.cargos_apafa FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir full acceso service role cargos_apafa" ON public.cargos_apafa;
CREATE POLICY "Permitir full acceso service role cargos_apafa" ON public.cargos_apafa USING (true) WITH CHECK (true);

ALTER TABLE public.partidos_apafa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica partidos_apafa" ON public.partidos_apafa;
CREATE POLICY "Permitir lectura publica partidos_apafa" ON public.partidos_apafa FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir full acceso service role partidos_apafa" ON public.partidos_apafa;
CREATE POLICY "Permitir full acceso service role partidos_apafa" ON public.partidos_apafa USING (true) WITH CHECK (true);

ALTER TABLE public.votos_apafa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica votos_apafa" ON public.votos_apafa;
CREATE POLICY "Permitir lectura publica votos_apafa" ON public.votos_apafa FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir full acceso service role votos_apafa" ON public.votos_apafa;
CREATE POLICY "Permitir full acceso service role votos_apafa" ON public.votos_apafa USING (true) WITH CHECK (true);

