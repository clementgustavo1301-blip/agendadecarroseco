-- ==============================================================================
-- Políticas RLS para a tabela profiles e RPC de gestão
-- ==============================================================================

-- 1. Leitura: Todos os usuários podem ler (pois precisamos mostrar nomes nos agendamentos)
CREATE POLICY "Leitura de perfis permitida para todos"
    ON public.profiles FOR SELECT
    USING (true);

-- 2. Atualização e Exclusão limitadas ao Administrador Mestre via Policy (ou podemos fazer via RPC)
CREATE POLICY "Administrador Mestre pode gerenciar perfis"
    ON public.profiles FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin_mestre'
        )
    );

-- 3. Função RPC para registrar usuários (já aplica o hash na senha)
CREATE OR REPLACE FUNCTION public.create_user(
    p_name VARCHAR(150),
    p_cpf CHAR(11),
    p_password TEXT,
    p_role user_role
) RETURNS public.profiles AS $$
DECLARE
    v_new_user public.profiles;
BEGIN
    INSERT INTO public.profiles (name, cpf, password_hash, role, requires_password_change)
    VALUES (
        p_name,
        p_cpf,
        crypt(p_password, gen_salt('bf')),
        p_role,
        true
    ) RETURNING * INTO v_new_user;

    RETURN v_new_user;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Função RPC para redefinir a senha de um usuário (apenas Admin)
CREATE OR REPLACE FUNCTION public.reset_user_password(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_new_password TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_admin_role user_role;
BEGIN
    -- Verifica se quem está executando é admin
    SELECT role INTO v_admin_role FROM public.profiles WHERE id = p_admin_id;
    IF v_admin_role NOT IN ('admin', 'admin_mestre') THEN
        RAISE EXCEPTION 'Sem permissão.';
    END IF;

    UPDATE public.profiles
    SET password_hash = crypt(p_new_password, gen_salt('bf')),
        requires_password_change = true,
        updated_at = now()
    WHERE id = p_target_user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
