import { supabase } from './supabaseClient.js';
import { limparCPF } from '../utils/formatters.js';
import { authService } from './authService.js';

class UserService {
  async listarUsuarios() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('name');
      
    if (error) {
      console.error('Erro ao listar usuários:', error);
      return [];
    }
    
    // Adaptar para o formato do frontend
    return data.map(u => ({
      id: u.id,
      nome: u.name,
      cpf: u.cpf,
      isAdmin: u.role === 'admin' || u.role === 'admin_mestre',
      isAdminMestre: u.role === 'admin_mestre',
      role: u.role,
      senhaProvisoria: u.requires_password_change,
      criadoEm: u.created_at
    }));
  }

  async obterUsuarioPorId(id) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
      
    if (error || !data) return null;
    
    return {
      id: data.id,
      nome: data.name,
      cpf: data.cpf,
      isAdmin: data.role === 'admin' || data.role === 'admin_mestre',
      isAdminMestre: data.role === 'admin_mestre',
      role: data.role,
      senhaProvisoria: data.requires_password_change,
      criadoEm: data.created_at
    };
  }

  async cadastrarUsuario({ nome, cpf: cpfInput, senha, isAdmin }) {
    const cpf = limparCPF(cpfInput);
    if (!nome || cpf.length !== 11 || !senha) {
      throw new Error('Preencha nome, CPF válido (11 dígitos) e senha mestre.');
    }

    const role = isAdmin ? 'admin' : 'usuario';

    const { data, error } = await supabase.rpc('create_user', {
      p_name: nome.trim(),
      p_cpf: cpf,
      p_password: senha,
      p_role: role
    });

    if (error) {
      if (error.message.includes('cpf')) {
        throw new Error('Já existe um usuário com esse CPF.');
      }
      throw new Error(error.message || 'Erro ao cadastrar usuário.');
    }

    return {
      id: data.id,
      nome: data.name,
      cpf: data.cpf,
      isAdmin: data.role === 'admin' || data.role === 'admin_mestre',
      isAdminMestre: data.role === 'admin_mestre',
      role: data.role,
      senhaProvisoria: data.requires_password_change,
      criadoEm: data.created_at
    };
  }

  async redefinirSenhaMestre(id, novaSenha) {
    if (!novaSenha) throw new Error('Informe uma senha.');
    
    const currentUser = authService.getCurrentUser();
    if (!currentUser) throw new Error('Acesso negado.');

    const { error } = await supabase.rpc('reset_user_password', {
      p_admin_id: currentUser.id,
      p_target_user_id: id,
      p_new_password: novaSenha
    });

    if (error) {
      throw new Error(error.message || 'Erro ao redefinir senha.');
    }
    
    return true;
  }

  async editarUsuario(id, { nome, cpf: cpfInput }) {
    const cpf = limparCPF(cpfInput);
    if (!nome?.trim() || cpf.length !== 11) {
      throw new Error('Informe nome e CPF válido (11 dígitos).');
    }

    const { data, error } = await supabase.rpc('update_user_profile', {
      p_target_user_id: id,
      p_name: nome.trim(),
      p_cpf: cpf
    });

    if (error) {
      if (error.message?.toLowerCase().includes('já existe um usuário com esse cpf')) {
        throw new Error('Já existe um usuário com esse CPF.');
      }
      throw new Error(error.message || 'Erro ao atualizar usuário.');
    }

    return {
      id: data.id,
      nome: data.name,
      cpf: data.cpf,
      isAdmin: data.role === 'admin' || data.role === 'admin_mestre',
      isAdminMestre: data.role === 'admin_mestre',
      role: data.role,
      senhaProvisoria: data.requires_password_change,
      criadoEm: data.created_at
    };
  }

  async alterarStatusAdmin(id, isAdmin) {
    const role = isAdmin ? 'admin' : 'usuario';
    
    const { data, error } = await supabase
      .from('profiles')
      .update({ role: role })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error('Erro ao alterar status de administrador.');
    }

    return data;
  }

  async excluirUsuario(id, currentUser) {
    if (id === currentUser.id) {
      throw new Error('Você não pode excluir a si mesmo.');
    }
    
    // A API bloqueia exclusões diretas dependendo da restrição no banco.
    // O ideal seria soft-delete ou verificar permissão. Como as foreign keys (RESTRICT) bloqueiam se houver histórico,
    // devemos fazer a chamada de delete.
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '23503') { // Foreign Key Violation
        throw new Error('Não é possível excluir o usuário pois ele já possui agendamentos/histórico vinculado.');
      }
      throw new Error('Erro ao excluir usuário. Verifique se ele não é o administrador mestre.');
    }
    
    return true;
  }
}

export const userService = new UserService();
