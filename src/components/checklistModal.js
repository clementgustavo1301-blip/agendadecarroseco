import { escapeHtml } from '../utils/dom.js';
import { toast } from './toast.js';

function campoToggle(id, label, positivo, negativo) {
  return `
    <div class="campo">
      <label>${label}</label>
      <div class="check-toggle">
        <label><input type="radio" name="${id}" value="ok" checked><span>${positivo}</span></label>
        <label class="negativo"><input type="radio" name="${id}" value="problema"><span>${negativo}</span></label>
      </div>
    </div>
  `;
}

export function abrirModalChecklist({ tipo, agendamento, carro, aoSalvar }) {
  const ehSaida = tipo === 'saida';
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';

  fundo.innerHTML = `
    <div class="modal" style="max-width:480px;max-height:88vh;overflow-y:auto;">
      <button class="modal-fechar" id="modal-fechar" aria-label="Fechar" title="Fechar">✕</button>
      <h3>Checklist de ${ehSaida ? 'saída' : 'devolução'}</h3>
      <p style="color:var(--texto-suave);font-size:.88rem;margin-bottom:16px;">
        ${carro ? escapeHtml(carro.nome) + ' — ' + escapeHtml(carro.placa) : 'Veículo'}
      </p>

      <div class="linha">
        <div class="campo">
          <label>Quilometragem ${ehSaida ? 'atual' : 'final'}</label>
          <input type="number" id="chk-km" min="0" placeholder="Ex.: 45210">
        </div>
        <div class="campo">
          <label>Nível de combustível</label>
          <select id="chk-combustivel">
            <option value="">Selecione</option>
            <option value="Reserva">Reserva</option>
            <option value="1/4">1/4</option>
            <option value="1/2">1/2</option>
            <option value="3/4">3/4</option>
            <option value="Cheio">Cheio</option>
          </select>
        </div>
      </div>

      ${ehSaida ? `
        ${campoToggle('chk-avarias', 'Avarias visíveis na lataria/pintura?', 'Não', 'Sim')}
        <div class="campo" id="chk-avarias-obs-campo" style="display:none;">
          <label>Descreva a avaria</label>
          <textarea id="chk-avarias-obs" rows="2"></textarea>
        </div>
        ${campoToggle('chk-pneus', 'Pneus em bom estado (sem furos/bolhas)?', 'OK', 'Não OK')}
        ${campoToggle('chk-documento', 'Documento do veículo (CRLV) está no carro?', 'Sim', 'Não')}
        ${campoToggle('chk-seguranca', 'Triângulo, macaco e estepe presentes?', 'Sim', 'Não')}
        ${campoToggle('chk-luzes', 'Faróis, setas e lanternas funcionando?', 'OK', 'Não OK')}
      ` : `
        ${campoToggle('chk-avaria-nova', 'Alguma avaria nova aconteceu durante o uso?', 'Não', 'Sim')}
        <div class="campo" id="chk-avaria-nova-obs-campo" style="display:none;">
          <label>Descreva a avaria</label>
          <textarea id="chk-avaria-nova-obs" rows="2"></textarea>
        </div>
      `}

      <div id="chk-erro"></div>
      <div class="acoes">
        <button class="btn btn-fantasma" id="modal-cancelar">Cancelar</button>
        <button class="btn btn-primario" id="modal-confirmar">Salvar checklist</button>
      </div>
    </div>
  `;

  document.body.appendChild(fundo);

  const fechar = () => fundo.remove();
  fundo.querySelector('#modal-fechar').onclick = fechar;
  fundo.querySelector('#modal-cancelar').onclick = fechar;
  fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });

  const nomeRadioAvaria = ehSaida ? 'chk-avarias' : 'chk-avaria-nova';
  const campoObsId = ehSaida ? 'chk-avarias-obs-campo' : 'chk-avaria-nova-obs-campo';

  fundo.querySelectorAll(`input[name="${nomeRadioAvaria}"]`).forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById(campoObsId).style.display = (r.value === 'problema' && r.checked) ? 'block' : 'none';
    });
  });

  fundo.querySelector('#modal-confirmar').onclick = async () => {
    const erroBox = fundo.querySelector('#chk-erro');
    erroBox.innerHTML = '';
    const km = document.getElementById('chk-km').value;
    const combustivel = document.getElementById('chk-combustivel').value;
    if (!km || !combustivel) {
      erroBox.innerHTML = '<div class="erro-msg">Preencha a quilometragem e o nível de combustível.</div>';
      return;
    }

    let dadosChecklist = {};
    if (ehSaida) {
      const avarias = fundo.querySelector('input[name="chk-avarias"]:checked').value === 'problema';
      const avariasObs = document.getElementById('chk-avarias-obs').value.trim();
      if (avarias && !avariasObs) {
        erroBox.innerHTML = '<div class="erro-msg">Descreva a avaria encontrada.</div>';
        return;
      }
      dadosChecklist = {
        km: Number(km),
        combustivel,
        avarias,
        avariasObs: avarias ? avariasObs : '',
        pneusOk: fundo.querySelector('input[name="chk-pneus"]:checked').value === 'ok',
        documentoOk: fundo.querySelector('input[name="chk-documento"]:checked').value === 'ok',
        segurancaOk: fundo.querySelector('input[name="chk-seguranca"]:checked').value === 'ok',
        luzesOk: fundo.querySelector('input[name="chk-luzes"]:checked').value === 'ok'
      };
    } else {
      const avariaNova = fundo.querySelector('input[name="chk-avaria-nova"]:checked').value === 'problema';
      const avariaNovaObs = document.getElementById('chk-avaria-nova-obs').value.trim();
      if (avariaNova && !avariaNovaObs) {
        erroBox.innerHTML = '<div class="erro-msg">Descreva a avaria encontrada.</div>';
        return;
      }
      dadosChecklist = {
        km: Number(km),
        combustivel,
        avariaNova,
        avariaNovaObs: avariaNova ? avariaNovaObs : ''
      };
    }

    try {
      await aoSalvar(dadosChecklist);
      toast('Checklist salvo com sucesso.', 'sucesso');
      fechar();
    } catch (err) {
      erroBox.innerHTML = `<div class="erro-msg">${err.message}</div>`;
    }
  };
}
