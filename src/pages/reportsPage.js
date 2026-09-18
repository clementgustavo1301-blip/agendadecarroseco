import { reportService } from '../services/reportService.js';
import { fleetService } from '../services/fleetService.js';
import { userService } from '../services/userService.js';
import { fmtDataHora } from '../utils/dateUtils.js';
import { escapeHtml } from '../utils/dom.js';
import { toast } from '../components/toast.js';

export async function renderRelatorio(currentUser) {
  const carroFiltro = document.getElementById('rel-carro').value;
  const usuarioFiltro = currentUser.isAdmin
    ? document.getElementById('rel-usuario').value
    : currentUser.id;
  const de = document.getElementById('rel-de').value;
  const ate = document.getElementById('rel-ate').value;

  const lista = await reportService.filtrarRelatorios({
    carroId: carroFiltro,
    usuarioId: usuarioFiltro,
    dataDe: de,
    dataAte: ate
  }, currentUser);

  const cars = await fleetService.listarCarros();
  const users = await userService.listarUsuarios();
  const tabela = document.getElementById('rel-tabela');

  if (lista.length === 0) {
    tabela.innerHTML = '<tr><td><div class="vazio">Nenhum agendamento encontrado para esse filtro.</div></td></tr>';
    return;
  }

  const colunaStatus = currentUser.isAdminMestre;
  const linhas = lista.map(s => {
    const carro = cars.find(c => c.id === s.carroId);
    const usuario = users.find(u => u.id === s.usuarioId);
    const criador = users.find(u => u.id === s.criadoPorId);

    let statusCel = '';
    if (colunaStatus) {
      if (s.excluido) {
        const nomeQuemExcluiu = s.excluidoPorNome || users.find(u => u.id === s.excluidoPorId)?.nome;
        statusCel = `
          <td>
            <span class="badge badge-inativo">Excluído</span><br>
            <span style="font-size:.72rem;color:var(--texto-suave);">
              ${fmtDataHora(s.excluidoEm)}${nomeQuemExcluiu ? ' por ' + escapeHtml(nomeQuemExcluiu) : ''}
            </span>
          </td>
        `;
      } else {
        statusCel = '<td><span class="badge badge-ativo">Ativo</span></td>';
      }
    }

    return `
      <tr>
        <td>${carro ? escapeHtml(carro.nome) : '—'}<br><span class="placa-chip">${carro ? escapeHtml(carro.placa) : ''}</span></td>
        <td>${usuario ? escapeHtml(usuario.nome) : '—'}</td>
        <td>${fmtDataHora(s.inicio)}</td>
        <td>${fmtDataHora(s.fim)}</td>
        <td>${escapeHtml(s.itinerario || '—')}</td>
        <td>${escapeHtml(s.objetivo || '—')}</td>
        <td>${escapeHtml(s.observacao || '—')}</td>
        <td>${criador ? escapeHtml(criador.nome) : '—'}</td>
        <td>${escapeHtml(reportService.resumoChecklistSaida(s))}</td>
        <td>${escapeHtml(reportService.resumoChecklistChegada(s))}</td>
        ${statusCel}
      </tr>
    `;
  }).join('');

  tabela.innerHTML = `
    <tr>
      <th>Veículo</th>
      <th>Motorista</th>
      <th>Início</th>
      <th>Fim</th>
      <th>Itinerário</th>
      <th>Objetivo</th>
      <th>Observação</th>
      <th>Criado por</th>
      <th>Checklist saída</th>
      <th>Checklist devolução</th>
      ${colunaStatus ? '<th>Status</th>' : ''}
    </tr>
    ${linhas}
  `;
}

export function setupReportsPage(currentUserGetter) {
  const btnFiltrar = document.getElementById('btn-filtrar-relatorio');
  const btnExportar = document.getElementById('btn-exportar-csv');

  btnFiltrar.addEventListener('click', () => {
    const currentUser = currentUserGetter();
    renderRelatorio(currentUser);
  });

  btnExportar.addEventListener('click', async () => {
    const currentUser = currentUserGetter();
    const carroFiltro = document.getElementById('rel-carro').value;
    const usuarioFiltro = currentUser.isAdmin
      ? document.getElementById('rel-usuario').value
      : currentUser.id;
    const de = document.getElementById('rel-de').value;
    const ate = document.getElementById('rel-ate').value;

    try {
      await reportService.exportarCSV({
        carroId: carroFiltro,
        usuarioId: usuarioFiltro,
        dataDe: de,
        dataAte: ate
      }, currentUser);
      toast('Relatório exportado com sucesso.', 'sucesso');
    } catch (err) {
      toast('Erro ao exportar relatório: ' + err.message, 'erro');
    }
  });
}
