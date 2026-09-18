import './assets/styles/index.css';
import { storage } from './services/storage/localStorageAdapter.js';
import { authService } from './services/authService.js';
import { STORAGE_KEYS, TITULOS_PAGINAS } from './core/constants.js';
import { toast } from './components/toast.js';

// Pages
import { setupLoginPage, setupPasswordChangePage } from './pages/loginPage.js';
import { renderPainel, abrirSeletorPeriodo } from './pages/dashboardPage.js';
import {
  prepararFormularioAgendamento,
  setupBookingFormPage,
  popularSelects,
  iniciarEdicaoAgendamento,
  checarDisponibilidadeLive,
  estaEditandoAgendamento
} from './pages/bookingFormPage.js';
import { renderAdminAgendamentos } from './pages/bookingsAdminPage.js';
import { renderCarros, setupFleetPage } from './pages/fleetPage.js';
import { renderUsuarios, setupUsersPage } from './pages/usersPage.js';
import { renderRelatorio, setupReportsPage } from './pages/reportsPage.js';
import { setupProfilePage } from './pages/profilePage.js';

let paginaAtual = 'painel';
let atualizacaoLembreteTimer = null;

function menuEstaAberto() {
  return document.querySelector('.sidebar')?.classList.contains('aberta');
}

function atualizarMenuMobile(aberto) {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const botaoMenu = document.getElementById('btn-menu');

  if (!sidebar || !overlay || !botaoMenu) return;

  sidebar.classList.toggle('aberta', aberto);
  overlay.classList.toggle('ativa', aberto);
  overlay.setAttribute('aria-hidden', String(!aberto));
  botaoMenu.setAttribute('aria-expanded', String(aberto));
  botaoMenu.setAttribute('aria-label', aberto ? 'Fechar menu de navegacao' : 'Abrir menu de navegacao');
  document.body.classList.toggle('menu-mobile-aberto', aberto);
}

function fecharMenuMobile() {
  atualizarMenuMobile(false);
}

/* ============================================================
   TEMA CLARO / ESCURO
============================================================ */
async function carregarTema() {
  let tema = 'claro';
  try {
    const salvo = await storage.get(STORAGE_KEYS.THEME);
    if (salvo) tema = salvo;
  } catch (e) {
    console.warn('Erro ao carregar tema:', e);
  }
  aplicarTema(tema);
}

function aplicarTema(tema) {
  document.body.classList.toggle('tema-escuro', tema === 'escuro');
  const icone = tema === 'escuro' ? '☀️' : '🌙';
  const btnLogin = document.getElementById('btn-tema-login');
  const btnApp = document.getElementById('btn-tema-app');
  if (btnLogin) btnLogin.textContent = icone;
  if (btnApp) btnApp.textContent = icone;
}

async function alternarTema() {
  const escuroAtivo = document.body.classList.contains('tema-escuro');
  const novoTema = escuroAtivo ? 'claro' : 'escuro';
  aplicarTema(novoTema);
  try {
    await storage.set(STORAGE_KEYS.THEME, novoTema);
  } catch (e) {
    console.warn('Erro ao salvar tema:', e);
  }
}

/* ============================================================
   NAVEGAÇÃO
============================================================ */
export async function irPara(pagina) {
  const currentUser = authService.getCurrentUser();
  if (!currentUser) return;

  if ((pagina === 'carros' || pagina === 'usuarios') && !currentUser.isAdmin) {
    toast('Apenas administradores acessam essa área.', 'erro');
    pagina = 'painel';
  }

  paginaAtual = pagina;
  fecharMenuMobile();

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('ativo', el.dataset.pagina === pagina);
  });
  document.querySelectorAll('.pagina').forEach(el => {
    el.classList.remove('ativa');
  });

  const targetEl = document.getElementById('pg-' + pagina);
  if (targetEl) targetEl.classList.add('ativa');

  const tituloEl = document.getElementById('topo-titulo');
  if (tituloEl) {
    if (pagina === 'admin') {
      tituloEl.textContent = currentUser.isAdmin ? 'Agendamentos' : 'Meus agendamentos';
    } else if (pagina === 'relatorio') {
      tituloEl.textContent = currentUser.isAdmin ? 'Relatório' : 'Meu relatório';
    } else {
      tituloEl.textContent = TITULOS_PAGINAS[pagina] || pagina;
    }
  }

  const btnFecharTela = document.getElementById('btn-fechar-tela');
  if (btnFecharTela) btnFecharTela.hidden = pagina === 'painel';

  if (pagina === 'painel') {
    await renderPainel({
      onQuickBooking: (carroId, dataISO) => novoAgendamentoRapido(carroId, dataISO),
      onEditBooking: (id) => iniciarEdicaoAgendamento(id, currentUser, irPara),
      currentUser
    });
  } else if (pagina === 'novo') {
    if (!estaEditandoAgendamento()) {
      await prepararFormularioAgendamento(currentUser);
    } else {
      await popularSelects(currentUser);
    }
  } else if (pagina === 'relatorio') {
    const podeVerTudo = currentUser.isAdmin;
    document.getElementById('rel-usuario-campo').style.display = podeVerTudo ? 'block' : 'none';
    document.getElementById('rel-sub').textContent = podeVerTudo
      ? 'Todas as reservas para conferência e auditoria.'
      : 'Seus agendamentos, para conferência.';
    await renderRelatorio(currentUser);
  } else if (pagina === 'admin') {
    document.getElementById('admin-agend-sub').textContent = currentUser.isAdmin
      ? 'Aqui estão todas as reservas da frota. Como administrador ou quem agendou, você pode editar ou excluir agendamentos. Preencha o checklist de saída e devolução de cada viagem.'
      : 'Aqui estão os seus agendamentos. Você pode editar ou excluir os agendamentos feitos por você. Preencha o checklist de saída e devolução de cada viagem sua.';
    await renderAdminAgendamentos(currentUser, {
      onEditar: (id) => iniciarEdicaoAgendamento(id, currentUser, irPara),
      onAtualizar: () => irPara('admin')
    });
  } else if (pagina === 'carros') {
    await renderCarros(currentUser, {
      onAtualizar: async () => {
        await renderCarros(currentUser, { onAtualizar: () => irPara('carros') });
        await popularSelects(currentUser);
      }
    });
  } else if (pagina === 'usuarios') {
    document.getElementById('usr-admin-campo').style.display = currentUser.isAdminMestre ? 'flex' : 'none';
    await renderUsuarios(currentUser, {
      onAtualizar: async () => {
        await renderUsuarios(currentUser, { onAtualizar: () => irPara('usuarios') });
        await popularSelects(currentUser);
      }
    });
  }
}

async function novoAgendamentoRapido(carroId, dataISO) {
  const currentUser = authService.getCurrentUser();
  await irPara('novo');
  await prepararFormularioAgendamento(currentUser);
  document.getElementById('ag-carro').value = carroId;
  document.getElementById('ag-data-ini').value = dataISO;
  document.getElementById('ag-data-fim').value = dataISO;
  await checarDisponibilidadeLive();
}

function iniciarAtualizacaoLembretes() {
  if (atualizacaoLembreteTimer) clearInterval(atualizacaoLembreteTimer);

  atualizacaoLembreteTimer = setInterval(() => {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || paginaAtual !== 'painel') return;

    renderPainel({
      onQuickBooking: (carroId, dataISO) => novoAgendamentoRapido(carroId, dataISO),
      onEditBooking: (id) => iniciarEdicaoAgendamento(id, currentUser, irPara),
      currentUser
    });
  }, 30000);
}

async function entrarNoApp(user) {
  document.getElementById('tela-login').style.display = 'none';
  document.getElementById('tela-troca-obrigatoria').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  document.getElementById('quem-nome').textContent = user.nome;
  document.getElementById('quem-tag').innerHTML = user.isAdminMestre
    ? '<span class="tag-admin">Administrador mestre</span>'
    : (user.isAdmin ? '<span class="tag-admin">Administrador</span>' : '');

  document.getElementById('nav-usuarios').style.display = user.isAdmin ? 'flex' : 'none';
  document.getElementById('nav-carros').style.display = user.isAdmin ? 'flex' : 'none';
  document.getElementById('sep-admin').style.display = user.isAdmin ? 'block' : 'none';

  document.getElementById('nav-admin-label').textContent = user.isAdmin ? 'Agendamentos' : 'Meus agendamentos';

  const agora = new Date();
  document.getElementById('topo-data').textContent = agora.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  // Monitor de inatividade de 2 minutos
  authService.iniciarMonitorInatividade(() => {
    deslogarPorInatividade();
  });

  await irPara('painel');
  iniciarAtualizacaoLembretes();
}

async function sair(silencioso = false) {
  if (atualizacaoLembreteTimer) {
    clearInterval(atualizacaoLembreteTimer);
    atualizacaoLembreteTimer = null;
  }
  await authService.logout();
  document.getElementById('app').style.display = 'none';
  document.getElementById('tela-troca-obrigatoria').style.display = 'none';
  document.getElementById('tela-login').style.display = 'flex';
  document.getElementById('login-cpf').value = '';
  document.getElementById('login-senha').value = '';
  if (!silencioso) {
    toast('Você saiu do sistema.', 'sucesso');
  }
}

async function deslogarPorInatividade() {
  await sair(true);
  toast('Sua sessão expirou por inatividade (2 minutos sem uso). Faça login novamente.', 'aviso');
}

/* ============================================================
   INICIALIZAÇÃO DO SISTEMA
============================================================ */
async function init() {
  const seedResult = await storage.initSeed();
  await carregarTema();

  if (seedResult.isFirstRun) {
    const seedAviso = document.getElementById('login-seed-aviso');
    if (seedAviso) {
      seedAviso.style.display = 'block';
      seedAviso.textContent = 'Primeiro acesso: CPF 000.000.000-00, senha admin123 (você trocará a senha em seguida).';
    }
  }

  // Eventos de tema
  document.getElementById('btn-tema-login').onclick = alternarTema;
  document.getElementById('btn-tema-app').onclick = alternarTema;

  // Botão sair
  document.getElementById('btn-sair').onclick = sair;

  const btnMenu = document.getElementById('btn-menu');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (btnMenu) btnMenu.onclick = () => atualizarMenuMobile(!menuEstaAberto());
  if (sidebarOverlay) sidebarOverlay.onclick = fecharMenuMobile;

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuEstaAberto()) fecharMenuMobile();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) fecharMenuMobile();
  });

  document.getElementById('btn-fechar-tela').onclick = () => irPara('painel');

  // Navegação na Sidebar
  document.querySelectorAll('.nav-item[data-pagina]').forEach(item => {
    item.addEventListener('click', () => {
      irPara(item.dataset.pagina);
    });
  });

  // Seletor de período no dashboard
  const btnPeriodo = document.getElementById('btn-abrir-seletor-periodo');
  if (btnPeriodo) {
    btnPeriodo.onclick = () => {
      abrirSeletorPeriodo({
        onPeriodChange: () => {
          const currentUser = authService.getCurrentUser();
          renderPainel({
            onQuickBooking: (cId, dISO) => novoAgendamentoRapido(cId, dISO),
            onEditBooking: (id) => iniciarEdicaoAgendamento(id, currentUser, irPara),
            currentUser
          });
        }
      });
    };
  }

  // Setup de páginas
  setupLoginPage({
    onLoginSuccess: (user) => entrarNoApp(user),
    onRequirePasswordChange: () => {
      document.getElementById('tela-login').style.display = 'none';
      document.getElementById('tela-troca-obrigatoria').style.display = 'block';
    }
  });

  setupPasswordChangePage({
    onSuccess: (user) => {
      toast('Senha definida com sucesso!', 'sucesso');
      entrarNoApp(user);
    }
  });

  setupBookingFormPage({
    onSaved: () => irPara('painel')
  });

  setupFleetPage({
    onAtualizar: async () => {
      const currentUser = authService.getCurrentUser();
      await renderCarros(currentUser, { onAtualizar: () => irPara('carros') });
      await popularSelects(currentUser);
    }
  });

  setupUsersPage({
    onAtualizar: async () => {
      const currentUser = authService.getCurrentUser();
      await renderUsuarios(currentUser, { onAtualizar: () => irPara('usuarios') });
      await popularSelects(currentUser);
    }
  });

  setupReportsPage(() => authService.getCurrentUser());
  setupProfilePage();

  // Restaura sessão existente caso a página tenha sido recarregada
  try {
    const sessao = await authService.restaurarSessao();
    if (sessao?.expiradoPorInatividade) {
      toast('Sua sessão expirou por inatividade (2 minutos sem uso).', 'aviso');
    } else if (sessao?.requiresPasswordChange) {
      document.getElementById('tela-login').style.display = 'none';
      document.getElementById('tela-troca-obrigatoria').style.display = 'block';
    } else if (sessao?.success && sessao.user) {
      await entrarNoApp(sessao.user);
    }
  } catch (err) {
    console.warn('Erro ao restaurar sessão no carregamento:', err);
  } finally {
    // Finaliza tela de carregamento inicial
    const telaCarregando = document.getElementById('tela-carregando');
    if (telaCarregando) {
      telaCarregando.style.display = 'none';
    }
  }
}

window.addEventListener('DOMContentLoaded', init);
