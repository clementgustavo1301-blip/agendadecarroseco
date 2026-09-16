import { authService } from '../services/authService.js';
import { toast } from '../components/toast.js';

export function setupProfilePage() {
  const btnSalvar = document.getElementById('btn-salvar-senha-perfil');
  const atualInput = document.getElementById('conta-senha-atual');
  const novaInput = document.getElementById('conta-senha-nova');
  const confInput = document.getElementById('conta-senha-conf');
  const erroBox = document.getElementById('conta-erro');

  btnSalvar.addEventListener('click', async () => {
    erroBox.innerHTML = '';
    const atual = atualInput.value;
    const nova = novaInput.value;
    const conf = confInput.value;

    try {
      await authService.alterarMinhaSenha(atual, nova, conf);
      atualInput.value = '';
      novaInput.value = '';
      confInput.value = '';
      toast('Senha atualizada com sucesso.', 'sucesso');
    } catch (err) {
      erroBox.innerHTML = `<div class="erro-msg">${err.message}</div>`;
    }
  });
}
