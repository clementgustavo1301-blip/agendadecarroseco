import { supabase } from './supabaseClient.js';
import { formatPlaca } from '../utils/formatters.js';

class FleetService {
  async listarCarros() {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('name');
      
    if (error) {
      console.error('Erro ao listar carros:', error);
      return [];
    }

    return data.map(c => ({
      id: c.id,
      nome: c.name,
      placa: c.license_plate,
      ativo: c.is_active,
      criadoEm: c.created_at
    }));
  }

  async listarCarrosAtivos() {
    const carros = await this.listarCarros();
    return carros.filter(c => c.ativo);
  }

  async obterCarroPorId(id) {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();
      
    if (error || !data) return null;
    
    return {
      id: data.id,
      nome: data.name,
      placa: data.license_plate,
      ativo: data.is_active,
      criadoEm: data.created_at
    };
  }

  async cadastrarCarro(nome, placaInput) {
    const placa = formatPlaca(placaInput);
    if (!nome || !placa) {
      throw new Error('Informe nome e placa do veículo.');
    }

    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        name: nome.trim(),
        license_plate: placa,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // unique violation
        throw new Error('Já existe um carro cadastrado com essa placa.');
      }
      throw new Error('Erro ao cadastrar carro.');
    }

    return {
      id: data.id,
      nome: data.name,
      placa: data.license_plate,
      ativo: data.is_active,
      criadoEm: data.created_at
    };
  }

  async alternarAtivo(id) {
    const carro = await this.obterCarroPorId(id);
    if (!carro) throw new Error('Carro não encontrado.');

    const { data, error } = await supabase
      .from('vehicles')
      .update({ is_active: !carro.ativo })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error('Erro ao atualizar status do carro.');

    return {
      id: data.id,
      nome: data.name,
      placa: data.license_plate,
      ativo: data.is_active,
      criadoEm: data.created_at
    };
  }

  async excluirCarro(id, usuarioId) {
    // Soft delete não está previsto no schema.sql para vehicles.
    // O ideal seria apenas desativar (alternarAtivo) ou fazer delete hard.
    // Como há dependência (FK) com bookings, o delete hard pode falhar.
    
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '23503') { // Foreign Key Violation
        throw new Error('Não é possível excluir este veículo pois já possui agendamentos. Você pode inativá-lo.');
      }
      throw new Error('Erro ao excluir carro.');
    }

    return true;
  }
}

export const fleetService = new FleetService();
