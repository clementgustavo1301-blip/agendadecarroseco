-- ==============================================================================
-- Função RPC para Login Customizado
-- ==============================================================================
-- Deve ser executada no SQL Editor do Supabase.
-- Como a tabela 'profiles' tem RLS ativado sem políticas de leitura para 'anon',
-- precisamos usar SECURITY DEFINER para que esta função consiga ler a tabela.

CREATE OR REPLACE FUNCTION public.login_user(p_cpf CHAR(11), p_password TEXT)
RETURNS JSON AS $$
DECLARE
    v_user public.profiles;
BEGIN
    -- Busca o usuário pelo CPF
    SELECT * INTO v_user
    FROM public.profiles
    WHERE cpf = p_cpf;

    -- Se não encontrar
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CPF ou senha inválidos.';
    END IF;

    -- Verifica a senha usando pgcrypto
    IF v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
        RAISE EXCEPTION 'CPF ou senha inválidos.';
    END IF;

    -- Retorna os dados do usuário, omitindo o hash da senha por segurança
    RETURN json_build_object(
        'id', v_user.id,
        'name', v_user.name,
        'cpf', v_user.cpf,
        'role', v_user.role,
        'requires_password_change', v_user.requires_password_change,
        'created_at', v_user.created_at,
        'updated_at', v_user.updated_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
