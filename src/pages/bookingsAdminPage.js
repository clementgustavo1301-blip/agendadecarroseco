import { bookingService } from '../services/bookingService.js';
import { fleetService } from '../services/fleetService.js';
import { userService } from '../services/userService.js';
import { fmtDataHora } from '../utils/dateUtils.js';
import { escapeHtml } from '../utils/dom.js';
import { abrirModal } from '../components/modal.js';
import { abrirModalChecklist } from '../components/checklistModal.js';
import { toast } from '../components/toast.js';

export async function renderAdminAgendamentos(currentUser, { onEditar, onAtualizar }) {
  const tabela = document.getElementById('admin-agend-tabela');
  const schedules = await bookingService.listarAgendamentos();
  const cars = await fleetService.listarCarros();
  const users = await userService.listarUsuarios();

  let base = schedules.filter(s => !s.excluido);
  if (!currentUser.isAdmin) {
    base = base.filter(s => s.usuarioId === currentUser.id || s.criadoPorId === currentUser.id);
  }

  const lista = base.sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
  const agora = new Date();

  if (lista.length === 0) {
    tabela.innerHTML = '<tr><td><div class="vazio">Nenhum agendamento encontrado.</div></td></tr>';
    return;
  }

  const linhas = lista.map(s => {
    const carro = cars.find(c => c.id === s.carroId);
    const usuario = users.find(u => u.id === s.usuarioId);
    const responsavel = users.find(u => u.id === s.criadoPorId);
    const podeEditar = bookingService.podeEditar(s, currentUser);
    const podeExcluir = bookingService.podeExcluir(s, currentUser);
    const emPeriodoDeUso = new Date(s.inicio) <= agora && new Date(s.fim) >= agora;
    const agendamentoFuturo = new Date(s.inicio) > agora;

    const botoesAcao = [];
    if (podeEditar) {
      botoesAcao.push(`<button class="icon-btn btn-editar-ag" data-id="${s.id}">Editar</button>`);
    }
    if (podeExcluir) {
      botoesAcao.push(`<button class="icon-btn perigo btn-excluir-ag" data-id="${s.id}">Excluir</button>`);
    }

    const acoes = botoesAcao.length > 0
      ? botoesAcao.join('')
      : '<span class="vazio" style="padding:0;">sem permissão</span>';

    const podeChecklist = podeEditar || podeExcluir;
    let checklistCel;
    if (!podeChecklist) {
      checklistCel = '<span class="vazio" style="padding:0;">—</span>';
    } else if (!s.checklistSaida && emPeriodoDeUso) {
      checklistCel = `<button class="icon-btn destaque btn-chk" data-tipo="saida" data-id="${s.id}">Preencher saída</button>`;
    } else if (!s.checklistSaida && agendamentoFuturo) {
      checklistCel = '<span class="vazio" style="padding:0;">Disponível no início da reserva</span>';
    } else if (!s.checklistSaida) {
      checklistCel = '<span class="vazio" style="padding:0;">Checklist de saída pendente</span>';
    } else if (!s.checklistChegada) {
      const tituloAvaria = s.checklistSaida.avarias
        ? ` title="Avaria na saída: ${escapeHtml(s.checklistSaida.avariasObs || '')}"`
        : '';
      const avisoAvaria = s.checklistSaida.avarias
        ? `<br><span class="badge badge-avaria"${tituloAvaria}>avaria na saída</span>`
        : '';
      checklistCel = `<button class="icon-btn destaque btn-chk" data-tipo="chegada" data-id="${s.id}">Preencher devolução</button>${avisoAvaria}`;
    } else {
      const avaria = s.checklistSaida.avarias || s.checklistChegada.avariaNova;
      const descricaoAvaria = [
        s.checklistSaida.avarias ? s.checklistSaida.avariasObs : '',
        s.checklistChegada.avariaNova ? s.checklistChegada.avariaNovaObs : ''
      ].filter(Boolean).join(' / ');
      checklistCel = `<span class="badge badge-ativo">Checklist completo</span>${avaria ? `<br><span class="badge badge-avaria" title="${escapeHtml(descricaoAvaria)}">avaria reportada</span>` : ''}`;
    }

    return `
      <tr>
        <td>${carro ? escapeHtml(carro.nome) : '—'} <span class="placa-chip">${carro ? escapeHtml(carro.placa) : ''}</span></td>
        <td>${usuario ? escapeHtml(usuario.nome) : '—'}</td>
        <td>${responsavel ? escapeHtml(responsavel.nome) : '—'}</td>
        <td>${fmtDataHora(s.inicio)} — ${fmtDataHora(s.fim)}</td>
        <td>${escapeHtml(s.itinerario || '—')}</td>
        <td>${checklistCel}</td>
        <td class="acoes-tbl">${acoes}</td>
      </tr>
    `;
  }).join('');

  tabela.innerHTML = `
    <tr>
      <th>Veículo</th>
      <th>Motorista</th>
      <th>Responsável</th>
      <th>Período</th>
      <th>Itinerário</th>
      <th>Checklist</th>
      <th>Ação</th>
    </tr>
    ${linhas}
  `;

  // Listeners dos botões de ação
  tabela.querySelectorAll('.btn-editar-ag').forEach(btn => {
    btn.onclick = () => onEditar(btn.dataset.id);
  });

  tabela.querySelectorAll('.btn-excluir-ag').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      abrirModal(
        'Excluir agendamento',
        'Tem certeza que deseja excluir este agendamento? Ele deixará de aparecer nas telas normais, mas o administrador mestre continua com o registro no histórico.',
        async () => {
          try {
            await bookingService.excluirAgendamento(id, currentUser);
            toast('Agendamento excluído.', 'sucesso');
            onAtualizar();
          } catch (err) {
            toast(err.message, 'erro');
          }
        }
      );
    };
  });

  tabela.querySelectorAll('.btn-chk').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const tipo = btn.dataset.tipo;
      const agendamento = await bookingService.obterAgendamentoPorId(id);
      const carro = agendamento ? await fleetService.obterCarroPorId(agendamento.carroId) : null;

      abrirModalChecklist({
        tipo,
        agendamento,
        carro,
        aoSalvar: async (dados) => {
          await bookingService.salvarChecklist(tipo, id, dados, currentUser);
          onAtualizar();
        }
      });
    };
  });
}
