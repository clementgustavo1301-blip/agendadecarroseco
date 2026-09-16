import { fleetService } from '../services/fleetService.js';
import { bookingService } from '../services/bookingService.js';
import { escapeHtml } from '../utils/dom.js';
import { abrirModal } from '../components/modal.js';
import { toast } from '../components/toast.js';

export async function renderCarros(currentUser, { onAtualizar }) {
  const tabela = document.getElementById('carros-tabela');
  const cars = await fleetService.listarCarros();

  if (cars.length === 0) {
    tabela.innerHTML = '<tr><td><div class="vazio">Nenhum veículo cadastrado ainda.</div></td></tr>';
    return;
  }

  const linhas = cars.map(c => `
    <tr>
      <td><b>${escapeHtml(c.nome)}</b></td>
      <td><span class="placa-chip">${escapeHtml(c.placa)}</span></td>
      <td><span class="badge ${c.ativo ? 'badge-ativo' : 'badge-inativo'}">${c.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td class="acoes-tbl">
        <button class="icon-btn btn-toggle-carro" data-id="${c.id}">${c.ativo ? 'Desativar' : 'Ativar'}</button>
        <button class="icon-btn perigo btn-excluir-carro" data-id="${c.id}">Excluir</button>
      </td>
    </tr>
  `).join('');

  tabela.innerHTML = `
    <tr>
      <th>Nome</th>
      <th>Placa</th>
      <th>Status</th>
      <th>Ações</th>
    </tr>
    ${linhas}
  `;

  tabela.querySelectorAll('.btn-toggle-carro').forEach(btn => {
    btn.onclick = async () => {
      try {
        await fleetService.alternarAtivo(btn.dataset.id);
        onAtualizar();
      } catch (err) {
        toast(err.message, 'erro');
      }
    };
  });

  tabela.querySelectorAll('.btn-excluir-carro').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const carro = await fleetService.obterCarroPorId(id);
      const schedules = await bookingService.listarAgendamentos();
      const temAgendamentos = schedules.some(s => s.carroId === id && !s.excluido);

      abrirModal(
        'Excluir veículo',
        temAgendamentos
          ? `O carro "${carro ? carro.nome : ''}" possui agendamentos ativos. Excluí-lo também encerrará esses agendamentos no histórico. Deseja continuar?`
          : `Tem certeza que deseja excluir o carro "${carro ? carro.nome : ''}" (${carro ? carro.placa : ''})?`,
        async () => {
          try {
            await fleetService.excluirCarro(id, currentUser.id);
            toast('Carro excluído.', 'sucesso');
            onAtualizar();
          } catch (err) {
            toast(err.message, 'erro');
          }
        }
      );
    };
  });
}

export function setupFleetPage({ onAtualizar }) {
  const btnCadastrar = document.getElementById('btn-cadastrar-carro');
  const carroNome = document.getElementById('carro-nome');
  const carroPlaca = document.getElementById('carro-placa');
  const erroBox = document.getElementById('carro-erro');

  btnCadastrar.addEventListener('click', async () => {
    erroBox.innerHTML = '';
    const nome = carroNome.value.trim();
    const placa = carroPlaca.value.trim();

    try {
      await fleetService.cadastrarCarro(nome, placa);
      carroNome.value = '';
      carroPlaca.value = '';
      toast('Carro cadastrado com sucesso.', 'sucesso');
      onAtualizar();
    } catch (err) {
      erroBox.innerHTML = `<div class="erro-msg">${err.message}</div>`;
    }
  });
}
