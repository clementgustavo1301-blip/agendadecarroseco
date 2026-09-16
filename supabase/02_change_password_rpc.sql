-- ==============================================================================
-- Função RPC para Troca de Senha
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.change_password(p_user_id UUID, p_new_password TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.profiles
    SET password_hash = crypt(p_new_password, gen_salt('bf')),
        requires_password_change = false,
        updated_at = now()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário não encontrado.';
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
