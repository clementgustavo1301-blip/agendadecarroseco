-- Permite ao Administrador Mestre editar nome e CPF sem quebrar o login por CPF.
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
    IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;

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

    SELECT jsonb_build_object('id', id, 'name', name, 'cpf', cpf, 'role', role,
        'requires_password_change', requires_password_change, 'created_at', created_at)
    INTO result FROM public.profiles WHERE id = p_target_user_id;
    RETURN result;
END;
$$;
