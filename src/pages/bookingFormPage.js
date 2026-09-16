import { fleetService } from '../services/fleetService.js';
import { userService } from '../services/userService.js';
import { bookingService } from '../services/bookingService.js';
import { authService } from '../services/authService.js';
import { combinarDataHora } from '../utils/dateUtils.js';
import { escapeHtml } from '../utils/dom.js';
import { toast } from '../components/toast.js';

let editandoAgendamentoId = null;

export async function popularSelects(currentUser) {
  const users = await userService.listarUsuarios();
  const carrosAtivos = await fleetService.listarCarrosAtivos();

  const selUsuario = document.getElementById('ag-usuario');
  selUsuario.innerHTML = users.map(u => `<option value="${u.id}">${escapeHtml(u.nome)}</option>`).join('');
  if (currentUser && !editandoAgendamentoId) {
    selUsuario.value = currentUser.id;
  }

  const selCarro = document.getElementById('ag-carro');
  selCarro.innerHTML = carrosAtivos.length
    ? carrosAtivos.map(c => `<option value="${c.id}">${escapeHtml(c.nome)} — ${escapeHtml(c.placa)}</option>`).join('')
    : '<option value="">Nenhum carro ativo</option>';
}

function marcarRadio(nome, valor) {
  const el = document.querySelector(`input[name="${nome}"][value="${valor}"]`);
  if (el) el.checked = true;
}

function resetarChecklistFormulario() {
  document.getElementById('ag-chk-km').value = '';
  document.getElementById('ag-chk-combustivel').value = '';
  marcarRadio('ag-chk-avarias', 'ok');
  document.getElementById('ag-chk-avarias-obs').value = '';
  document.getElementById('ag-chk-avarias-obs-campo').style.display = 'none';
  marcarRadio('ag-chk-pneus', 'ok');
  marcarRadio('ag-chk-documento', 'ok');
  marcarRadio('ag-chk-seguranca', 'ok');
  marcarRadio('ag-chk-luzes', 'ok');
}

function preencherChecklistFormulario(c) {
  document.getElementById('ag-chk-km').value = c.km;
  document.getElementById('ag-chk-combustivel').value = c.combustivel;
  marcarRadio('ag-chk-avarias', c.avarias ? 'problema' : 'ok');
  document.getElementById('ag-chk-avarias-obs').value = c.avariasObs || '';
  document.getElementById('ag-chk-avarias-obs-campo').style.display = c.avarias ? 'block' : 'none';
  marcarRadio('ag-chk-pneus', c.pneusOk ? 'ok' : 'problema');
  marcarRadio('ag-chk-documento', c.documentoOk ? 'ok' : 'problema');
  marcarRadio('ag-chk-seguranca', c.segurancaOk ? 'ok' : 'problema');
  marcarRadio('ag-chk-luzes', c.luzesOk ? 'ok' : 'problema');
}

export async function prepararFormularioAgendamento(currentUser) {
  editandoAgendamentoId = null;
  document.getElementById('novo-erro').innerHTML = '';
  document.getElementById('novo-disponibilidade').innerHTML = '';
  const hoje = new Date().toISOString().slice(0, 10);
  document.getElementById('ag-data-ini').value = hoje;
  document.getElementById('ag-data-fim').value = hoje;
  document.getElementById('ag-hora-ini').value = '';
  document.getElementById('ag-hora-fim').value = '';
  document.getElementById('ag-rota').value = '';
  document.getElementById('ag-objetivo').value = '';
  document.getElementById('ag-obs').value = '';
  document.getElementById('ag-responsavel-display').value = currentUser ? currentUser.nome : '';
  resetarChecklistFormulario();
  await popularSelects(currentUser);
  atualizarModoFormularioAgendamento();
}

export function atualizarModoFormularioAgendamento() {
  const titulo = document.getElementById('novo-titulo');
  const sub = document.getElementById('novo-sub');
  const btnSalvar = document.getElementById('btn-salvar-agendamento');
  const btnCancelar = document.getElementById('btn-cancelar-edicao');

  if (editandoAgendamentoId) {
    titulo.textContent = 'Editar agendamento';
    sub.textContent = 'Altere os dados da reserva. O sistema continua bloqueando qualquer conflito de data e horário para o mesmo carro.';
    btnSalvar.textContent = 'Salvar alterações';
    btnCancelar.style.display = 'inline-flex';
  } else {
    titulo.textContent = 'Novo agendamento';
    sub.textContent = 'Reserve um veículo. O sistema bloqueia automaticamente qualquer conflito de data e horário para o mesmo carro.';
    btnSalvar.textContent = 'Salvar agendamento';
    btnCancelar.style.display = 'none';
  }
}

export async function iniciarEdicaoAgendamento(id, currentUser, onGoToPage) {
  const s = await bookingService.obterAgendamentoPorId(id);
  if (!s) return;
  if (s.excluido) {
    toast('Este agendamento foi excluído e não pode mais ser editado.', 'erro');
    return;
  }
  if (!bookingService.podeEditarOuExcluir(s, currentUser)) {
    toast('Só você (quem agendou) ou o administrador mestre pode editar este agendamento.', 'erro');
    return;
  }

  editandoAgendamentoId = id;
  onGoToPage('novo');
  await popularSelects(currentUser);

  document.getElementById('ag-usuario').value = s.usuarioId;
  document.getElementById('ag-carro').value = s.carroId;

  const criador = await userService.obterUsuarioPorId(s.criadoPorId);
  document.getElementById('ag-responsavel-display').value = criador ? criador.nome : '—';

  const ini = new Date(s.inicio);
  const fim = new Date(s.fim);
  document.getElementById('ag-data-ini').value = ini.toISOString().slice(0, 10);
  document.getElementById('ag-hora-ini').value = ini.toTimeString().slice(0, 5);
  document.getElementById('ag-data-fim').value = fim.toISOString().slice(0, 10);
  document.getElementById('ag-hora-fim').value = fim.toTimeString().slice(0, 5);
  document.getElementById('ag-rota').value = s.itinerario || '';
  document.getElementById('ag-objetivo').value = s.objetivo || '';
  document.getElementById('ag-obs').value = s.observacao || '';

  if (s.checklistSaida) {
    preencherChecklistFormulario(s.checklistSaida);
  } else {
    resetarChecklistFormulario();
  }

  document.getElementById('novo-erro').innerHTML = '';
  document.getElementById('novo-disponibilidade').innerHTML = '';
  atualizarModoFormularioAgendamento();
}

export async function checarDisponibilidadeLive() {
  const box = document.getElementById('novo-disponibilidade');
  if (!box) return;
  const carroId = document.getElementById('ag-carro').value;
  const dataIni = document.getElementById('ag-data-ini').value;
  const horaIni = document.getElementById('ag-hora-ini').value;
  const dataFim = document.getElementById('ag-data-fim').value;
  const horaFim = document.getElementById('ag-hora-fim').value;

  if (!carroId || !dataIni || !horaIni || !dataFim || !horaFim) {
    box.innerHTML = '';
    return;
  }

  const inicio = combinarDataHora(dataIni, horaIni);
  const fim = combinarDataHora(dataFim, horaFim);

  if (fim <= inicio) {
    box.innerHTML = '';
    return;
  }

  const temConflito = await bookingService.existeConflito(carroId, inicio, fim, editandoAgendamentoId);
  if (temConflito) {
    box.innerHTML = '<div class="erro-msg">Conflito: veículo já reservado nesse período.</div>';
  } else {
    box.innerHTML = '<div class="aviso-msg" style="background:var(--verde-bg);color:var(--verde);margin-top:0;margin-bottom:14px;">Disponível nesse período.</div>';
  }
}

export function setupBookingFormPage({ onSaved }) {
  const btnSalvar = document.getElementById('btn-salvar-agendamento');
  const btnCancelar = document.getElementById('btn-cancelar-edicao');
  const erroBox = document.getElementById('novo-erro');

  ['ag-carro', 'ag-data-ini', 'ag-hora-ini', 'ag-data-fim', 'ag-hora-fim'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', checarDisponibilidadeLive);
      el.addEventListener('change', checarDisponibilidadeLive);
    }
  });

  document.querySelectorAll('input[name="ag-chk-avarias"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('ag-chk-avarias-obs-campo').style.display =
        (r.value === 'problema' && r.checked) ? 'block' : 'none';
    });
  });

  btnCancelar.addEventListener('click', () => {
    const currentUser = authService.getCurrentUser();
    prepararFormularioAgendamento(currentUser);
    toast('Edição cancelada.', 'sucesso');
  });

  btnSalvar.addEventListener('click', async () => {
    erroBox.innerHTML = '';
    const currentUser = authService.getCurrentUser();

    const usuarioId = document.getElementById('ag-usuario').value;
    const carroId = document.getElementById('ag-carro').value;
    const dataIni = document.getElementById('ag-data-ini').value;
    const horaIni = document.getElementById('ag-hora-ini').value;
    const dataFim = document.getElementById('ag-data-fim').value;
    const horaFim = document.getElementById('ag-hora-fim').value;
    const rota = document.getElementById('ag-rota').value.trim();
    const objetivo = document.getElementById('ag-objetivo').value.trim();
    const obs = document.getElementById('ag-obs').value.trim();

    const chkKm = document.getElementById('ag-chk-km').value;
    const chkCombustivel = document.getElementById('ag-chk-combustivel').value;
    const chkAvarias = document.querySelector('input[name="ag-chk-avarias"]:checked').value === 'problema';
    const chkAvariasObs = document.getElementById('ag-chk-avarias-obs').value.trim();

    const checklistSaida = {
      km: Number(chkKm),
      combustivel: chkCombustivel,
      avarias: chkAvarias,
      avariasObs: chkAvarias ? chkAvariasObs : '',
      pneusOk: document.querySelector('input[name="ag-chk-pneus"]:checked').value === 'ok',
      documentoOk: document.querySelector('input[name="ag-chk-documento"]:checked').value === 'ok',
      segurancaOk: document.querySelector('input[name="ag-chk-seguranca"]:checked').value === 'ok',
      luzesOk: document.querySelector('input[name="ag-chk-luzes"]:checked').value === 'ok',
      preenchidoPorId: currentUser.id,
      preenchidoEm: new Date().toISOString()
    };

    const inicio = dataIni && horaIni ? combinarDataHora(dataIni, horaIni) : null;
    const fim = dataFim && horaFim ? combinarDataHora(dataFim, horaFim) : null;

    try {
      await bookingService.salvarAgendamento({
        usuarioId,
        carroId,
        inicio,
        fim,
        rota,
        objetivo,
        obs,
        checklistSaida
      }, editandoAgendamentoId, currentUser);

      const msg = editandoAgendamentoId
        ? 'Agendamento atualizado com sucesso.'
        : 'Agendamento salvo com sucesso.';
      toast(msg, 'sucesso');
      await prepararFormularioAgendamento(currentUser);
      onSaved();
    } catch (err) {
      erroBox.innerHTML = `<div class="erro-msg">${err.message}</div>`;
      erroBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}
