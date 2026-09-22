-- Remove por completo usuários excluídos e reaproveita CPFs de contas órfãs.

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
    IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
    RETURN TRUE;
END;
$$;

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

    -- Corrige contas Auth sem perfil deixadas por exclusões antigas.
    DELETE FROM auth.users au
    WHERE au.email = fake_email
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = au.id);

    encrypted_pw := crypt(p_password, gen_salt('bf'));
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new,
        email_change_token_current, phone_change, phone_change_token)
    VALUES ('00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated',
        'authenticated', fake_email, encrypted_pw, now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        json_build_object('name', p_name, 'cpf', p_cpf, 'role', p_role)::jsonb,
        now(), now(), encode(gen_random_bytes(32), 'hex'), encode(gen_random_bytes(32), 'hex'),
        '', '', '', '', '');
    INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), fake_email, new_user_id,
        json_build_object('sub', new_user_id::text, 'email', fake_email), 'email', now(), now(), now());

    SELECT json_build_object('id', id, 'name', name, 'cpf', cpf, 'role', role,
        'requires_password_change', requires_password_change, 'created_at', created_at)
    INTO result FROM public.profiles WHERE id = new_user_id;
    RETURN result;
END;
$$;
