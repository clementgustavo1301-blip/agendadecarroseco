import { supabase } from './supabaseClient.js';
import { fmtDataHora } from '../utils/dateUtils.js';

class BookingService {
  async listarAgendamentos(opcoes = {}) {
    const { incluirExcluidos = false } = opcoes;

    let query = supabase
      .from('bookings')
      .select(`
        *,
        vehicles(*),
        driver:profiles!driver_id(*),
        creator:profiles!created_by_id(*)
      `);

    if (!incluirExcluidos) {
      query = query.eq('is_deleted', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao listar agendamentos no Supabase:', error);
      return [];
    }

    // Buscar os checklists associados
    const { data: checklists } = await supabase.from('checklists').select('*');

    return (data || []).map(b => {
      const bChecklists = checklists ? checklists.filter(c => c.booking_id === b.id) : [];
      const saida = bChecklists.find(c => c.type === 'saida');
      const chegada = bChecklists.find(c => c.type === 'devolucao');

      return {
        id: b.id,
        usuarioId: b.driver_id,
        carroId: b.vehicle_id,
        inicio: b.start_time,
        fim: b.end_time,
        itinerario: b.route_itinerary,
        objetivo: b.purpose,
        observacao: b.notes,
        criadoPorId: b.created_by_id,
        criadorNome: b.creator?.name || null,
        motoristaNome: b.driver?.name || null,
        criadoEm: b.created_at,
        excluido: Boolean(b.is_deleted),
        excluidoPorId: b.deleted_by_id,
        excluidoEm: b.deleted_at,
        checklistSaida: saida ? {
          km: saida.odometer_km,
          combustivel: saida.fuel,
          avarias: saida.has_damages,
          avariasObs: saida.damages_description,
          pneus: saida.tires_ok,
          documentos: saida.documents_ok,
          kitSeguranca: saida.safety_kit_ok,
          luzes: saida.lights_ok
        } : null,
        checklistChegada: chegada ? {
          km: chegada.odometer_km,
          combustivel: chegada.fuel,
          avarias: chegada.has_damages,
          avariasObs: chegada.damages_description,
          pneus: chegada.tires_ok,
          documentos: chegada.documents_ok,
          kitSeguranca: chegada.safety_kit_ok,
          luzes: chegada.lights_ok
        } : null
      };
    });
  }

  async obterAgendamentoPorId(id) {
    if (!id) return null;
    const { data: b, error } = await supabase
      .from('bookings')
      .select(`
        *,
        vehicles(*),
        driver:profiles!driver_id(*),
        creator:profiles!created_by_id(*)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error || !b) {
      const schedules = await this.listarAgendamentos({ incluirExcluidos: true });
      return schedules.find(s => String(s.id) === String(id)) || null;
    }

    return {
      id: b.id,
      usuarioId: b.driver_id,
      carroId: b.vehicle_id,
      inicio: b.start_time,
      fim: b.end_time,
      itinerario: b.route_itinerary,
      objetivo: b.purpose,
      observacao: b.notes,
      criadoPorId: b.created_by_id,
      criadorNome: b.creator?.name || null,
      motoristaNome: b.driver?.name || null,
      criadoEm: b.created_at,
      excluido: Boolean(b.is_deleted),
      excluidoPorId: b.deleted_by_id,
      excluidoEm: b.deleted_at
    };
  }

  async obterConflito(carroId, inicioDate, fimDate, excluirId = null) {
    // Na nova arquitetura, o PostgreSQL tem um TRIGGER que impede o conflito (fn_prevent_booking_conflict)
    // Mas podemos verificar preventivamente no frontend também.
    const schedules = await this.listarAgendamentos();
    return schedules.find(s => {
      if (s.excluido) return false;
      if (s.carroId !== carroId) return false;
      if (excluirId && s.id === excluirId) return false;
      const sInicio = new Date(s.inicio);
      const sFim = new Date(s.fim);
      return sInicio < fimDate && sFim > inicioDate;
    }) || null;
  }

  async existeConflito(carroId, inicioDate, fimDate, excluirId = null) {
    return Boolean(await this.obterConflito(carroId, inicioDate, fimDate, excluirId));
  }

  mensagemConflito(conflito) {
    const responsavel = conflito.criadorNome || 'outro usuário';
    return `Este veículo já está reservado nesse período: ${fmtDataHora(conflito.inicio)} até ${fmtDataHora(conflito.fim)} (agendado por ${responsavel}). Escolha outro horário ou veículo.`;
  }

  checklistSaidaObrigatorio(inicio, fim, agora = new Date()) {
    return inicio <= agora && fim >= agora;
  }

  async inserirChecklistSaida(bookingId, checklistSaida, currentUser) {
    const { error } = await supabase
      .from('checklists')
      .insert({
        booking_id: bookingId,
        type: 'saida',
        odometer_km: parseInt(checklistSaida.km, 10),
        fuel: checklistSaida.combustivel,
        has_damages: checklistSaida.avarias || false,
        damages_description: checklistSaida.avariasObs || '',
        tires_ok: checklistSaida.pneusOk !== false,
        documents_ok: checklistSaida.documentoOk !== false,
        safety_kit_ok: checklistSaida.segurancaOk !== false,
        lights_ok: checklistSaida.luzesOk !== false,
        inspected_by_id: currentUser.id
      });

    if (error) {
      throw new Error('Agendamento salvo, mas falhou ao salvar o checklist de saída.');
    }
  }

  podeEditar(agendamento, currentUser) {
    if (!currentUser || !agendamento) return false;
    const currentUserId = String(currentUser.id || '');
    const criadoPorId = String(agendamento.criadoPorId || agendamento.created_by_id || '');

    return (
      Boolean(currentUser.isAdmin) ||
      (criadoPorId && criadoPorId === currentUserId)
    );
  }

  podeExcluir(agendamento, currentUser) {
    if (!currentUser || !agendamento) return false;
    const currentUserId = String(currentUser.id || '');
    const criadoPorId = String(agendamento.criadoPorId || agendamento.created_by_id || '');

    return (
      Boolean(currentUser.isAdmin) ||
      (criadoPorId && criadoPorId === currentUserId)
    );
  }

  podeEditarOuExcluir(agendamento, currentUser) {
    return this.podeEditar(agendamento, currentUser) || this.podeExcluir(agendamento, currentUser);
  }

  async salvarAgendamento(dados, editandoId, currentUser) {
    const { usuarioId, carroId, inicio, fim, rota, objetivo, obs, checklistSaida } = dados;

    if (!usuarioId || !carroId || !inicio || !fim) {
      throw new Error('Preencha motorista, veículo, data e horário de início e fim.');
    }
    if (fim <= inicio) {
      throw new Error('A data/horário final deve ser depois do início.');
    }

    if (!rota) throw new Error('O itinerário é obrigatório.');
    if (!objetivo) throw new Error('O objetivo da viagem é obrigatório.');
    
    const checklistObrigatorio = this.checklistSaidaObrigatorio(inicio, fim);
    if (checklistObrigatorio) {
      if (!checklistSaida || !checklistSaida.km || !checklistSaida.combustivel) {
        throw new Error('Preencha a quilometragem e o nível de combustível no checklist de saída.');
      }
      if (checklistSaida.avarias && !checklistSaida.avariasObs) {
        throw new Error('Descreva a avaria encontrada no checklist de saída.');
      }
    }

    const conflito = await this.obterConflito(carroId, inicio, fim, editandoId);
    if (conflito) {
      throw new Error(this.mensagemConflito(conflito));
    }

    if (editandoId) {
      // UPDATE Booking
      const { data, error } = await supabase
        .from('bookings')
        .update({
          driver_id: usuarioId,
          vehicle_id: carroId,
          start_time: inicio.toISOString(),
          end_time: fim.toISOString(),
          route_itinerary: rota,
          purpose: objetivo,
          notes: obs,
          updated_at: new Date().toISOString()
        })
        .eq('id', editandoId)
        .select()
        .single();

      if (error) {
        const conflitoAtual = await this.obterConflito(carroId, inicio, fim, editandoId);
        if (conflitoAtual) throw new Error(this.mensagemConflito(conflitoAtual));
        throw new Error(error.message || 'Erro ao editar agendamento. Pode haver um conflito de horário.');
      }

      if (checklistObrigatorio) {
        const { data: checklistExistente, error: checklistConsultaErro } = await supabase
          .from('checklists')
          .select('id')
          .eq('booking_id', editandoId)
          .eq('type', 'saida')
          .maybeSingle();

        if (checklistConsultaErro) {
          throw new Error('Agendamento salvo, mas não foi possível verificar o checklist de saída.');
        }
        if (!checklistExistente) {
          await this.inserirChecklistSaida(editandoId, checklistSaida, currentUser);
        }
      }

      return data;
    } else {
      // INSERT Booking
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          vehicle_id: carroId,
          driver_id: usuarioId,
          created_by_id: currentUser.id,
          start_time: inicio.toISOString(),
          end_time: fim.toISOString(),
          route_itinerary: rota,
          purpose: objetivo,
          notes: obs
        })
        .select()
        .single();

      if (bookingError) {
        const conflitoAtual = await this.obterConflito(carroId, inicio, fim);
        if (conflitoAtual) throw new Error(this.mensagemConflito(conflitoAtual));
        throw new Error(bookingError.message || 'Conflito de agenda: o veículo já possui uma reserva ativa neste período.');
      }

      if (checklistObrigatorio) {
        await this.inserirChecklistSaida(bookingData.id, checklistSaida, currentUser);
      }

      return bookingData;
    }
  }

  async excluirAgendamento(id, currentUser) {
    if (!currentUser) {
      throw new Error('Você precisa estar autenticado para excluir um agendamento.');
    }

    const agendamento = await this.obterAgendamentoPorId(id);
    if (!agendamento) {
      throw new Error('Agendamento não encontrado.');
    }

    if (!this.podeExcluir(agendamento, currentUser)) {
      throw new Error('Apenas quem criou o agendamento ou um administrador pode excluí-lo.');
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('cancelar_agendamento', {
      p_booking_id: id,
      p_user_id: currentUser.id
    });

    if (rpcError) {
      console.error('Erro ao excluir (cancelar) agendamento via RPC:', rpcError);
      throw new Error(rpcError.message || 'Erro ao excluir (cancelar) o agendamento. Tente atualizar a página ou verificar as permissões.');
    }

    return true;
  }

  async salvarChecklist(tipo, agendamentoId, dadosChecklist, currentUser) {
    const { error } = await supabase
      .from('checklists')
      .insert({
        booking_id: agendamentoId,
        type: tipo === 'saida' ? 'saida' : 'devolucao',
        odometer_km: parseInt(dadosChecklist.km, 10),
        fuel: dadosChecklist.combustivel,
        has_damages: dadosChecklist.avarias || dadosChecklist.avariaNova || false,
        damages_description: dadosChecklist.avariasObs || dadosChecklist.avariaNovaObs || '',
        tires_ok: dadosChecklist.pneusOk !== false,
        documents_ok: dadosChecklist.documentoOk !== false,
        safety_kit_ok: dadosChecklist.segurancaOk !== false,
        lights_ok: dadosChecklist.luzesOk !== false,
        inspected_by_id: currentUser.id
      });

    if (error) {
      throw new Error('Erro ao salvar checklist. Talvez ele já tenha sido preenchido.');
    }

    return true;
  }
}

export const bookingService = new BookingService();
