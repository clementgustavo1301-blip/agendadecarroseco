-- ==============================================================================
-- EcoFrotas - Arquitetura de Banco de Dados para Supabase (PostgreSQL 15+)
-- ==============================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS (TIPOS CUSTOMIZADOS)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('usuario', 'admin', 'admin_mestre');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE fuel_level AS ENUM ('Reserva', '1/4', '1/2', '3/4', 'Cheio');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE checklist_type AS ENUM ('saida', 'devolucao');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. TABELAS PRINCIPAIS

-- TABELA: profiles (Usuários do sistema)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    cpf CHAR(11) NOT NULL UNIQUE,
    role user_role NOT NULL DEFAULT 'usuario',
    requires_password_change BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_cpf_format CHECK (cpf ~ '^[0-9]{11}$')
);

-- TABELA: vehicles (Veículos da frota)
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    license_plate VARCHAR(10) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TABELA: bookings (Agendamentos e reservas de veículos)
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
    driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_by_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    route_itinerary TEXT NOT NULL,
    purpose VARCHAR(255) NOT NULL,
    notes TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_booking_time_validity CHECK (end_time > start_time)
);

-- TABELA: checklists (Vistorias de saída e retorno)
CREATE TABLE IF NOT EXISTS public.checklists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    type checklist_type NOT NULL,
    odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
    fuel fuel_level NOT NULL,
    has_damages BOOLEAN NOT NULL DEFAULT false,
    damages_description TEXT,
    tires_ok BOOLEAN NOT NULL DEFAULT true,
    documents_ok BOOLEAN NOT NULL DEFAULT true,
    safety_kit_ok BOOLEAN NOT NULL DEFAULT true,
    lights_ok BOOLEAN NOT NULL DEFAULT true,
    inspected_by_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    inspected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_booking_checklist_type UNIQUE (booking_id, type)
);

-- TABELA: audit_logs (Trilha de auditoria para ações sensíveis)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. ÍNDICES DE ALTA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_bookings_conflict_search 
    ON public.bookings (vehicle_id, start_time, end_time) 
    WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_bookings_driver 
    ON public.bookings (driver_id);

CREATE INDEX IF NOT EXISTS idx_bookings_created_by 
    ON public.bookings (created_by_id);

CREATE INDEX IF NOT EXISTS idx_checklists_booking 
    ON public.checklists (booking_id);

CREATE INDEX IF NOT EXISTS idx_vehicles_active 
    ON public.vehicles (is_active);

-- 5. FUNCTION & TRIGGER DE INTEGRIDADE: PREVENÇÃO DE CONFLITO DE HORÁRIOS
-- Garante a nível de ACID no PostgreSQL que nenhum carro seja agendado duas vezes no mesmo período
CREATE OR REPLACE FUNCTION public.fn_prevent_booking_conflict()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_deleted = false THEN
        IF EXISTS (
            SELECT 1 FROM public.bookings
            WHERE vehicle_id = NEW.vehicle_id
              AND is_deleted = false
              AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
              AND (start_time < NEW.end_time AND end_time > NEW.start_time)
        ) THEN
            RAISE EXCEPTION 'Conflito de agenda: o veículo já possui uma reserva ativa neste período.'
                USING ERRCODE = '23P01';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_booking_conflict ON public.bookings;
CREATE TRIGGER trg_prevent_booking_conflict
    BEFORE INSERT OR UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prevent_booking_conflict();

-- 6. ROW LEVEL SECURITY (RLS) & POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para Veículos
CREATE POLICY "Permitir leitura de veículos para todos autenticados"
    ON public.vehicles FOR SELECT
    USING (true);

CREATE POLICY "Apenas administradores podem inserir/alterar veículos"
    ON public.vehicles FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'admin_mestre')
        )
    );

-- Políticas para Agendamentos
CREATE POLICY "Todos podem visualizar agendamentos ativos para verificar disponibilidade"
    ON public.bookings FOR SELECT
    USING (
        is_deleted = false OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin_mestre'
        )
    );

CREATE POLICY "Usuários autenticados podem criar agendamentos"
    ON public.bookings FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Criador ou Administradores podem alterar/cancelar agendamento"
    ON public.bookings FOR UPDATE
    USING (
        created_by_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'admin_mestre')
        )
    )
    WITH CHECK (
        created_by_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'admin_mestre')
        )
    );

-- Políticas para Checklists
CREATE POLICY "Leitura de checklists para usuários autenticados"
    ON public.checklists FOR SELECT
    USING (true);

CREATE POLICY "Condutor ou criador pode registrar checklist"
    ON public.checklists FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.bookings
            WHERE id = booking_id AND (driver_id = auth.uid() OR created_by_id = auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin_mestre'
        )
    );

CREATE OR REPLACE FUNCTION public.is_admin_mestre()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin_mestre'
  );
$$;

-- Políticas para Profiles
CREATE POLICY "Leitura de perfis permitida para todos autenticados"
    ON public.profiles FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Permitir update no próprio perfil ou por admin mestre"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid() OR public.is_admin_mestre());

CREATE POLICY "Apenas Administrador Mestre pode inserir perfis"
    ON public.profiles FOR INSERT
    WITH CHECK (public.is_admin_mestre());

CREATE POLICY "Apenas Administrador Mestre pode excluir perfis"
    ON public.profiles FOR DELETE
    USING (public.is_admin_mestre());

-- 7. SEED INICIAL E TRIGGERS
-- Trigger para criar o perfil automaticamente quando um usuário for criado no auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, cpf, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Usuário Novo'),
    COALESCE(NEW.raw_user_meta_data->>'cpf', '00000000000'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'usuario'::user_role)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. FUNÇÕES RPC PARA GERENCIAMENTO DE USUÁRIOS
CREATE OR REPLACE FUNCTION public.create_user(
    p_name VARCHAR,
    p_cpf CHAR(11),
    p_password VARCHAR,
    p_role user_role DEFAULT 'usuario'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    new_user_id UUID;
    fake_email VARCHAR;
    encrypted_pw VARCHAR;
    result JSONB;
BEGIN
    fake_email := p_cpf || '@ecofrotas.com';

    IF EXISTS (SELECT 1 FROM public.profiles WHERE cpf = p_cpf) THEN
        RAISE EXCEPTION 'Já existe um usuário com esse CPF.';
    END IF;

    -- Limpa uma conta de autenticação órfã deixada por versões antigas da exclusão.
    -- Sem isso, o e-mail técnico do CPF continuaria bloqueando um novo cadastro.
    DELETE FROM auth.users au
    WHERE au.email = fake_email
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = au.id);

    encrypted_pw := crypt(p_password, gen_salt('bf'));
    new_user_id := gen_random_uuid();

    -- Inserir no auth.users
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change,
        email_change_token_new,
        email_change_token_current,
        phone_change,
        phone_change_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        fake_email,
        encrypted_pw,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        json_build_object('name', p_name, 'cpf', p_cpf, 'role', p_role)::jsonb,
        now(),
        now(),
        encode(gen_random_bytes(32), 'hex'),
        encode(gen_random_bytes(32), 'hex'),
        '',
        '',
        '',
        '',
        ''
    );

    -- Inserir identidade
    INSERT INTO auth.identities (
        id,
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        fake_email,
        new_user_id,
        json_build_object('sub', new_user_id::text, 'email', fake_email)::jsonb,
        'email',
        now(),
        now(),
        now()
    );

    SELECT json_build_object(
        'id', id,
        'name', name,
        'cpf', cpf,
        'role', role,
        'requires_password_change', requires_password_change,
        'created_at', created_at
    ) INTO result
    FROM public.profiles
    WHERE id = new_user_id;

    RETURN result;
END;
$$;

-- Exclui a conta de autenticação, que por cascata remove seu perfil.
CREATE OR REPLACE FUNCTION public.delete_user(p_target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NOT public.is_admin_mestre() THEN
        RAISE EXCEPTION 'Acesso negado: apenas o Administrador Mestre pode excluir usuários.';
    END IF;

    IF p_target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Você não pode excluir a si mesmo.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id AND role = 'admin_mestre') THEN
        RAISE EXCEPTION 'O Administrador Mestre não pode ser excluído.';
    END IF;

    DELETE FROM auth.users WHERE id = p_target_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário não encontrado.';
    END IF;

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_user_password(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_new_password VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = p_admin_id AND role = 'admin_mestre'
    ) THEN
        RAISE EXCEPTION 'Acesso negado: apenas o Administrador Mestre pode redefinir senhas.';
    END IF;

    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = p_target_user_id;

    UPDATE public.profiles
    SET requires_password_change = true,
        updated_at = now()
    WHERE id = p_target_user_id;

    RETURN TRUE;
END;
$$;

-- Atualiza o perfil e o e-mail técnico usado no login por CPF.
CREATE OR REPLACE FUNCTION public.update_user_profile(
    p_target_user_id UUID,
    p_name VARCHAR,
    p_cpf CHAR(11)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    result JSONB;
    fake_email VARCHAR;
BEGIN
    IF NOT public.is_admin_mestre() THEN
        RAISE EXCEPTION 'Acesso negado: apenas o Administrador Mestre pode editar usuários.';
    END IF;

    IF p_name IS NULL OR btrim(p_name) = '' OR p_cpf !~ '^[0-9]{11}$' THEN
        RAISE EXCEPTION 'Informe nome e CPF válido.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE cpf = p_cpf AND id <> p_target_user_id) THEN
        RAISE EXCEPTION 'Já existe um usuário com esse CPF.';
    END IF;

    fake_email := p_cpf || '@ecofrotas.com';

    UPDATE public.profiles
    SET name = btrim(p_name), cpf = p_cpf, updated_at = now()
    WHERE id = p_target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário não encontrado.';
    END IF;

    UPDATE auth.users
    SET email = fake_email,
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
            || jsonb_build_object('name', btrim(p_name), 'cpf', p_cpf),
        updated_at = now()
    WHERE id = p_target_user_id;

    UPDATE auth.identities
    SET provider_id = fake_email,
        identity_data = COALESCE(identity_data, '{}'::jsonb)
            || jsonb_build_object('email', fake_email),
        updated_at = now()
    WHERE user_id = p_target_user_id AND provider = 'email';

    SELECT jsonb_build_object(
        'id', id, 'name', name, 'cpf', cpf, 'role', role,
        'requires_password_change', requires_password_change, 'created_at', created_at
    ) INTO result
    FROM public.profiles WHERE id = p_target_user_id;

    RETURN result;
END;
$$;
