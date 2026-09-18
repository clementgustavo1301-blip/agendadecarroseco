import { supabase } from './supabaseClient.js';
import { limparCPF } from '../utils/formatters.js';

const TEMPO_INATIVIDADE_MS = 2 * 60 * 1000; // 2 minutos
const CHAVE_ULTIMA_ATIVIDADE = 'ecofrotas_ultima_atividade';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.usuarioEmTrocaObrigatoria = null;
    this.intervaloInatividade = null;
    this.listenerAtividade = null;
    this.ultimoRegistroLocal = 0;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  registrarAtividade() {
    const agora = Date.now();
    // Throttle de 1 segundo para não sobrecarregar localStorage
    if (agora - this.ultimoRegistroLocal >= 1000) {
      this.ultimoRegistroLocal = agora;
      try {
        localStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(agora));
      } catch (e) {
        // Ignora possíveis erros de quota
      }
    }
  }

  obterUltimaAtividade() {
    try {
      const val = localStorage.getItem(CHAVE_ULTIMA_ATIVIDADE);
      return val ? parseInt(val, 10) : 0;
    } catch {
      return 0;
    }
  }

  estaExpiradoPorInatividade() {
    const ultima = this.obterUltimaAtividade();
    if (!ultima) return false;
    return (Date.now() - ultima) >= TEMPO_INATIVIDADE_MS;
  }

  iniciarMonitorInatividade(aoExpirar) {
    this.pararMonitorInatividade();
    this.registrarAtividade();

    const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    this.listenerAtividade = () => {
      if (this.currentUser && this.estaExpiradoPorInatividade()) {
        aoExpirar();
        return;
      }
      this.registrarAtividade();
    };

    eventos.forEach(ev => {
      window.addEventListener(ev, this.listenerAtividade, { passive: true });
    });

    window.addEventListener('focus', this.listenerAtividade);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (this.currentUser && this.estaExpiradoPorInatividade()) {
          aoExpirar();
        } else {
          this.registrarAtividade();
        }
      }
    });

    this.intervaloInatividade = setInterval(() => {
      if (this.currentUser && this.estaExpiradoPorInatividade()) {
        aoExpirar();
      }
    }, 2000);
  }

  pararMonitorInatividade() {
    if (this.intervaloInatividade) {
      clearInterval(this.intervaloInatividade);
      this.intervaloInatividade = null;
    }
    if (this.listenerAtividade) {
      const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
      eventos.forEach(ev => {
        window.removeEventListener(ev, this.listenerAtividade);
      });
      window.removeEventListener('focus', this.listenerAtividade);
      this.listenerAtividade = null;
    }
  }

  async restaurarSessao() {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session || !session.user) {
        this.currentUser = null;
        return null;
      }

      // Se a sessão expirou por inatividade de 2 minutos
      if (this.estaExpiradoPorInatividade()) {
        await this.logout();
        return { expiradoPorInatividade: true };
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile) {
        await this.logout();
        return null;
      }

      const authUser = {
        id: profile.id,
        nome: profile.name,
        cpf: profile.cpf,
        isAdmin: profile.role === 'admin' || profile.role === 'admin_mestre',
        isAdminMestre: profile.role === 'admin_mestre',
        senhaProvisoria: profile.requires_password_change,
        role: profile.role
      };

      if (authUser.senhaProvisoria) {
        this.usuarioEmTrocaObrigatoria = authUser;
        return { requiresPasswordChange: true, user: authUser };
      }

      this.currentUser = authUser;
      this.registrarAtividade();
      return { success: true, user: authUser };
    } catch (e) {
      console.warn('Erro ao restaurar sessão:', e);
      return null;
    }
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
    this.registrarAtividade();
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
    this.pararMonitorInatividade();
    try {
      localStorage.removeItem(CHAVE_ULTIMA_ATIVIDADE);
    } catch {}
    try {
      await supabase.auth.signOut();
    } catch {}
    this.currentUser = null;
    this.usuarioEmTrocaObrigatoria = null;
  }
}

export const authService = new AuthService();
