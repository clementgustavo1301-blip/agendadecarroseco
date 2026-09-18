-- ==============================================================================
-- RPC e Políticas para cancelamento/exclusão de agendamentos
-- ==============================================================================

-- 1. Função RPC com SECURITY DEFINER para garantir exclusão sem bloqueio de RLS
CREATE OR REPLACE FUNCTION public.cancelar_agendamento(
    p_booking_id UUID,
    p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_booking public.bookings;
    v_user_role user_role;
BEGIN
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agendamento não encontrado.';
    END IF;

    SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;

    -- Permissão: quem criou o agendamento, o motorista ou administrador
    IF v_booking.created_by_id <> p_user_id 
       AND v_booking.driver_id <> p_user_id 
       AND (v_user_role IS NULL OR v_user_role NOT IN ('admin', 'admin_mestre')) THEN
        RAISE EXCEPTION 'Você não tem permissão para excluir este agendamento.';
    END IF;

    UPDATE public.bookings
    SET is_deleted = true,
        deleted_by_id = p_user_id,
        deleted_at = now(),
        updated_at = now()
    WHERE id = p_booking_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualizar políticas RLS de bookings para permitir Administradores e Responsáveis
DROP POLICY IF EXISTS "Responsáveis ou Administrador Mestre podem alterar/cancelar agendamento" ON public.bookings;
DROP POLICY IF EXISTS "Responsáveis ou Administradores podem alterar/cancelar agendamento" ON public.bookings;

CREATE POLICY "Responsáveis ou Administradores podem alterar/cancelar agendamento"
    ON public.bookings FOR UPDATE
    USING (
        created_by_id = auth.uid() OR 
        driver_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'admin_mestre')
        )
    )
    WITH CHECK (
        created_by_id = auth.uid() OR 
        driver_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'admin_mestre')
        )
    );
