import { fleetService } from '../services/fleetService.js';
import { bookingService } from '../services/bookingService.js';
import { userService } from '../services/userService.js';
import { DIAS_SEMANA, MESES } from '../core/constants.js';
import { mesmoDia, fmtHora } from '../utils/dateUtils.js';
import { escapeHtml } from '../utils/dom.js';

let diasSemanaVisualizacao = 7;

export async function renderPainel({ onQuickBooking, onEditBooking }) {
  const hoje = new Date();
  const cars = await fleetService.listarCarros();
  const schedules = await bookingService.listarAgendamentos();
  const users = await userService.listarUsuarios();

  const schedulesAtivos = schedules.filter(s => !s.excluido);
  const carrosAtivos = cars.filter(c => c.ativo);

  // Stats
  const stats = document.getElementById('painel-stats');
  const ativos = carrosAtivos.length;
  const agendHoje = schedulesAtivos.filter(s =>
    mesmoDia(new Date(s.inicio), hoje) ||
    (new Date(s.inicio) < hoje && new Date(s.fim) > hoje)
  ).length;
  const carrosOcupadosAgora = new Set(
    schedulesAtivos
      .filter(s => new Date(s.inicio) <= hoje && new Date(s.fim) >= hoje)
      .map(s => s.carroId)
  ).size;

  stats.innerHTML = `
    <div class="stat"><div class="stat-num">${ativos}</div><div class="stat-label">Veículos ativos</div></div>
    <div class="stat"><div class="stat-num">${agendHoje}</div><div class="stat-label">Agendamentos hoje</div></div>
    <div class="stat"><div class="stat-num">${carrosOcupadosAgora}</div><div class="stat-label">Veículos em uso agora</div></div>
    <div class="stat"><div class="stat-num">${schedulesAtivos.length}</div><div class="stat-label">Total de reservas</div></div>
  `;

  // Hoje por veículo
  const wrap = document.getElementById('painel-hoje');
  const inicioHoje = new Date(hoje); inicioHoje.setHours(0, 0, 0, 0);
  const fimHoje = new Date(hoje); fimHoje.setHours(23, 59, 59, 999);

  if (carrosAtivos.length === 0) {
    wrap.innerHTML = '<div class="vazio">Nenhum carro ativo cadastrado ainda.</div>';
  } else {
    wrap.innerHTML = carrosAtivos.map(carro => {
      const viagensHoje = schedulesAtivos
        .filter(s => s.carroId === carro.id && new Date(s.inicio) <= fimHoje && new Date(s.fim) >= inicioHoje)
        .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
      const ocupado = viagensHoje.length > 0;

      let itens = '';
      if (ocupado) {
        let cursor = inicioHoje;
        const blocos = [];
        viagensHoje.forEach(v => {
          const iniClip = new Date(Math.max(new Date(v.inicio).getTime(), inicioHoje.getTime()));
          const fimClip = new Date(Math.min(new Date(v.fim).getTime(), fimHoje.getTime()));
          if (iniClip > cursor) {
            blocos.push({ tipo: 'livre', inicio: cursor, fim: iniClip });
          }
          blocos.push({ tipo: 'reservado', inicio: iniClip, fim: fimClip, dados: v });
          if (fimClip > cursor) cursor = fimClip;
        });
        if (cursor < fimHoje) {
          blocos.push({ tipo: 'livre', inicio: cursor, fim: fimHoje });
        }

        itens = blocos.map(b => {
          if (b.tipo === 'reservado') {
            const u = users.find(user => user.id === b.dados.usuarioId);
            return `
              <div class="viagem-item">
                <div class="viagem-hora">${fmtHora(b.inicio)}–${fmtHora(b.fim)}</div>
                <div class="viagem-info"><b>${u ? escapeHtml(u.nome) : '—'}</b> · <span class="rota">${escapeHtml(b.dados.itinerario || 'sem itinerário')}</span></div>
              </div>
            `;
          }
          return `
            <div class="viagem-item viagem-livre">
              <div class="viagem-hora">${fmtHora(b.inicio)}–${fmtHora(b.fim)}</div>
              <div class="viagem-info">Livre</div>
            </div>
          `;
        }).join('');
      }

      return `
        <div class="bloco-carro-hoje ${ocupado ? 'ocupado' : 'livre'}">
          <div class="carro-hoje-topo">
            <div><span class="carro-nome">${escapeHtml(carro.nome)}</span><span class="placa-chip">${escapeHtml(carro.placa)}</span></div>
            ${ocupado ? '' : '<span class="status-livre">Disponível o dia todo</span>'}
          </div>
          ${itens}
        </div>
      `;
    }).join('');
  }

  // Semana / Período
  renderSemana({ onQuickBooking, onEditBooking, carrosAtivos, schedules, users });
}

function renderSemana({ onQuickBooking, onEditBooking, carrosAtivos, schedules, users }) {
  const tabela = document.getElementById('painel-semana');
  const inicioSemana = new Date(); inicioSemana.setHours(0, 0, 0, 0);
  const dias = [];
  for (let i = 0; i < diasSemanaVisualizacao; i++) {
    const d = new Date(inicioSemana);
    d.setDate(d.getDate() + i);
    dias.push(d);
  }

  const labelPeriodo = document.getElementById('painel-semana-periodo-label');
  if (labelPeriodo) labelPeriodo.textContent = diasSemanaVisualizacao + ' dias';
  const subPeriodo = document.getElementById('painel-semana-sub');
  if (subPeriodo) subPeriodo.textContent = `Agenda de cada veículo nos próximos ${diasSemanaVisualizacao} dias. Toque no nome do carro para agendar.`;

  const thead = '<tr><th>Veículo</th>' + dias.map(d => `<th>${DIAS_SEMANA[d.getDay()]} ${d.getDate()}/${MESES[d.getMonth()]}</th>`).join('') + '</tr>';

  let corpo = '';
  if (carrosAtivos.length === 0) {
    corpo = `<tr><td colspan="${dias.length + 1}"><div class="vazio">Nenhum carro ativo cadastrado.</div></td></tr>`;
  } else {
    const hojeISO = new Date().toISOString().slice(0, 10);
    corpo = carrosAtivos.map(carro => {
      const cels = dias.map(d => {
        const dataISO = d.toISOString().slice(0, 10);
        const doDia = schedules.filter(s => {
          if (s.excluido) return false;
          if (s.carroId !== carro.id) return false;
          const si = new Date(s.inicio), sf = new Date(s.fim);
          const diaFim = new Date(d); diaFim.setHours(23, 59, 59, 999);
          return si <= diaFim && sf >= d;
        }).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

        const hojeCol = mesmoDia(d, new Date()) ? ' hoje-col' : '';

        if (doDia.length === 0) {
          return `
            <td class="${hojeCol.trim()} celula-clicavel" data-carro="${carro.id}" data-data="${dataISO}" title="Clique para agendar ${escapeHtml(carro.nome)} neste dia">
              <span class="chip-livre">livre — toque para agendar</span>
            </td>
          `;
        }

        const chips = doDia.map(v => {
          const u = users.find(user => user.id === v.usuarioId);
          return `
            <div class="chip-agenda" data-id="${v.id}" title="${escapeHtml(v.itinerario || '')} — clique para ver/editar">
              ${fmtHora(v.inicio)}–${fmtHora(v.fim)} · ${u ? escapeHtml(u.nome) : ''}
            </div>
          `;
        }).join('');

        return `
          <td class="${hojeCol.trim()} celula-clicavel" data-carro="${carro.id}" data-data="${dataISO}" title="Clique na área vazia para agendar ${escapeHtml(carro.nome)} neste dia">
            ${chips}
          </td>
        `;
      }).join('');

      return `
        <tr>
          <td class="celula-clicavel" data-carro="${carro.id}" data-data="${hojeISO}" title="Toque para agendar ${escapeHtml(carro.nome)}">
            <b>${escapeHtml(carro.nome)}</b><br><span class="placa-chip">${escapeHtml(carro.placa)}</span>
          </td>
          ${cels}
        </tr>
      `;
    }).join('');
  }

  tabela.innerHTML = thead + corpo;

  // Event delegation para cliques na tabela da semana
  tabela.querySelectorAll('.celula-clicavel').forEach(td => {
    td.onclick = (e) => {
      // Se clicou no chip de agendamento existente
      const chip = e.target.closest('.chip-agenda');
      if (chip) {
        e.stopPropagation();
        onEditBooking(chip.dataset.id);
        return;
      }
      // Se clicou na célula livre ou cabeçalho do carro
      const carroId = td.dataset.carro;
      const dataISO = td.dataset.data;
      if (carroId && dataISO) {
        onQuickBooking(carroId, dataISO);
      }
    };
  });
}

export function abrirSeletorPeriodo({ onPeriodChange }) {
  const opcoes = [7, 15, 30];
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `
    <div class="modal" style="max-width:320px;">
      <button class="modal-fechar" id="modal-fechar" aria-label="Fechar" title="Fechar">✕</button>
      <h3>Período de visualização</h3>
      <p style="color:var(--texto-suave);font-size:.88rem;margin-bottom:16px;">Escolha quantos dias mostrar na agenda da semana.</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${opcoes.map(n => `
          <button class="btn ${diasSemanaVisualizacao === n ? 'btn-primario' : 'btn-fantasma'} btn-bloco" data-dias="${n}">
            Próximos ${n} dias
          </button>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(fundo);

  const fechar = () => fundo.remove();
  fundo.querySelector('#modal-fechar').onclick = fechar;
  fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });

  fundo.querySelectorAll('button[data-dias]').forEach(btn => {
    btn.addEventListener('click', () => {
      diasSemanaVisualizacao = Number(btn.dataset.dias);
      fechar();
      onPeriodChange();
    });
  });
}
