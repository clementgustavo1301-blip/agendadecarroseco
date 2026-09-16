import { supabase } from './supabaseClient.js';
import { limparCPF } from '../utils/formatters.js';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.usuarioEmTrocaObrigatoria = null;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  async login(cpfInput, senha) {
    const cpf = limparCPF(cpfInput);
    // Para contornar a obrigatoriedade de email no Supabase Auth,
    // criamos um formato de email fictício usando o CPF: cpf@ecofrotas.com
    const emailFicticio = `${cpf}@ecofrotas.com`;

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: emailFicticio,
      password: senha
    });

    if (authError) {
      throw new Error(authError.message || 'CPF ou senha inválidos.');
    }

    // Após logar no Auth, buscamos o perfil em 'profiles'
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Perfil do usuário não encontrado.');
    }

    const user = profile;
    
    // Adaptar retorno do Supabase para o formato esperado pelo frontend
    const authUser = {
      id: user.id,
      nome: user.name,
      cpf: user.cpf,
      isAdmin: user.role === 'admin' || user.role === 'admin_mestre',
      isAdminMestre: user.role === 'admin_mestre',
      senhaProvisoria: user.requires_password_change,
      role: user.role
    };

    if (authUser.senhaProvisoria) {
      this.usuarioEmTrocaObrigatoria = authUser;
      return { requiresPasswordChange: true, user: authUser };
    }

    this.currentUser = authUser;
    return { success: true, user: authUser };
  }

  async confirmarTrocaObrigatoria(novaSenha, confSenha) {
    if (!this.usuarioEmTrocaObrigatoria) {
      throw new Error('Nenhum usuário em processo de troca de senha.');
    }
    if (!novaSenha || novaSenha.length < 4) {
      throw new Error('A senha deve ter ao menos 4 caracteres.');
    }
    if (novaSenha !== confSenha) {
      throw new Error('As senhas não coincidem.');
    }

    const { error: authError } = await supabase.auth.updateUser({
      password: novaSenha
    });

    if (authError) {
      throw new Error(authError.message || 'Erro ao atualizar a senha.');
    }

    // Atualiza a flag na tabela profiles
    await supabase
      .from('profiles')
      .update({ requires_password_change: false })
      .eq('id', this.usuarioEmTrocaObrigatoria.id);

    this.usuarioEmTrocaObrigatoria.senhaProvisoria = false;
    this.currentUser = this.usuarioEmTrocaObrigatoria;
    this.usuarioEmTrocaObrigatoria = null;
    
    return this.currentUser;
  }

  async alterarMinhaSenha(senhaAtual, novaSenha, confSenha) {
    if (!this.currentUser) {
      throw new Error('Usuário não autenticado.');
    }
    if (!novaSenha || novaSenha.length < 4) {
      throw new Error('A nova senha deve ter ao menos 4 caracteres.');
    }
    if (novaSenha !== confSenha) {
      throw new Error('A confirmação não coincide com a nova senha.');
    }

    // Tenta re-autenticar o usuário para confirmar a senha atual
    const emailFicticio = `${this.currentUser.cpf}@ecofrotas.com`;
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: emailFicticio,
      password: senhaAtual
    });

    if (loginError) {
      throw new Error('Senha atual incorreta.');
    }

    const { error: authError } = await supabase.auth.updateUser({
      password: novaSenha
    });

    if (authError) {
      throw new Error(authError.message || 'Erro ao alterar a senha.');
    }

    // Atualiza a flag na tabela profiles
    await supabase
      .from('profiles')
      .update({ requires_password_change: false })
      .eq('id', this.currentUser.id);

    this.currentUser.senhaProvisoria = false;
    return true;
  }

  async logout() {
    await supabase.auth.signOut();
    this.currentUser = null;
    this.usuarioEmTrocaObrigatoria = null;
  }
}

export const authService = new AuthService();
