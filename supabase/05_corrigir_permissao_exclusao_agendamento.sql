-- Regra de exclusão: somente criador, admin ou admin_mestre.
-- Corrige bancos que já receberam a versão anterior da RPC.

DROP POLICY IF EXISTS "Responsáveis ou Administrador Mestre podem alterar/cancelar agendamento" ON public.bookings;
DROP POLICY IF EXISTS "Responsáveis ou Administradores podem alterar/cancelar agendamento" ON public.bookings;
DROP POLICY IF EXISTS "Criador ou Administradores podem alterar/cancelar agendamento" ON public.bookings;

CREATE POLICY "Criador ou Administradores podem alterar/cancelar agendamento"
    ON public.bookings FOR UPDATE
    USING (
        created_by_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'admin_mestre')
        )
    )
    WITH CHECK (
        created_by_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'admin_mestre')
        )
    );

CREATE OR REPLACE FUNCTION public.cancelar_agendamento(
    p_booking_id UUID,
    p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking public.bookings;
    v_user_role user_role;
BEGIN
    IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agendamento não encontrado.';
    END IF;

    SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;

    IF v_booking.created_by_id <> p_user_id
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
$$;
