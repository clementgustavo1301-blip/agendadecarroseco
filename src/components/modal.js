import { escapeHtml } from '../utils/dom.js';

export function abrirModal(titulo, texto, aoConfirmar) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `
    <div class="modal">
      <button class="modal-fechar" id="modal-fechar" aria-label="Fechar" title="Fechar">✕</button>
      <h3>${escapeHtml(titulo)}</h3>
      <p style="color:var(--texto-suave);font-size:.9rem;">${escapeHtml(texto)}</p>
      <div class="acoes">
        <button class="btn btn-fantasma" id="modal-cancelar">Cancelar</button>
        <button class="btn btn-perigo" id="modal-confirmar">Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(fundo);

  const fechar = () => fundo.remove();
  fundo.querySelector('#modal-fechar').onclick = fechar;
  fundo.querySelector('#modal-cancelar').onclick = fechar;
  fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });

  fundo.querySelector('#modal-confirmar').onclick = async () => {
    await aoConfirmar();
    fechar();
  };
}

export function abrirModalInput(titulo, texto, aoConfirmar) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `
    <div class="modal">
      <button class="modal-fechar" id="modal-fechar" aria-label="Fechar" title="Fechar">✕</button>
      <h3>${escapeHtml(titulo)}</h3>
      <p style="color:var(--texto-suave);font-size:.9rem;">${escapeHtml(texto)}</p>
      <div class="campo">
        <input id="modal-input-valor" type="text" placeholder="Nova senha">
      </div>
      <div class="acoes">
        <button class="btn btn-fantasma" id="modal-cancelar">Cancelar</button>
        <button class="btn btn-primario" id="modal-confirmar">Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(fundo);

  const fechar = () => fundo.remove();
  fundo.querySelector('#modal-fechar').onclick = fechar;
  fundo.querySelector('#modal-cancelar').onclick = fechar;
  fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });

  fundo.querySelector('#modal-confirmar').onclick = async () => {
    const valor = fundo.querySelector('#modal-input-valor').value;
    await aoConfirmar(valor);
    fechar();
  };
}
