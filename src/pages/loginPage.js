import { authService } from '../services/authService.js';
import { formatCPF, limparCPF } from '../utils/formatters.js';

export function setupLoginPage({ onLoginSuccess, onRequirePasswordChange }) {
  const loginCpf = document.getElementById('login-cpf');
  const loginSenha = document.getElementById('login-senha');
  const btnLogin = document.getElementById('btn-fazer-login');
  const loginErro = document.getElementById('login-erro');

  loginCpf.addEventListener('input', (e) => {
    e.target.value = formatCPF(e.target.value);
  });

  const executarLogin = async () => {
    loginErro.innerHTML = '';
    const cpf = loginCpf.value;
    const senha = loginSenha.value;

    try {
      const res = await authService.login(cpf, senha);
      if (res.requiresPasswordChange) {
        onRequirePasswordChange(res.user);
      } else {
        onLoginSuccess(res.user);
      }
    } catch (err) {
      loginErro.innerHTML = `<div class="erro-msg">${err.message}</div>`;
    }
  };

  btnLogin.addEventListener('click', executarLogin);
  loginSenha.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executarLogin();
  });
}

export function setupPasswordChangePage({ onSuccess }) {
  const novaInput = document.getElementById('troca-obrig-nova');
  const confInput = document.getElementById('troca-obrig-conf');
  const btnConfirmar = document.getElementById('btn-confirmar-troca');
  const erroBox = document.getElementById('troca-obrig-erro');

  const executarTroca = async () => {
    erroBox.innerHTML = '';
    const nova = novaInput.value;
    const conf = confInput.value;

    try {
      const user = await authService.confirmarTrocaObrigatoria(nova, conf);
      novaInput.value = '';
      confInput.value = '';
      onSuccess(user);
    } catch (err) {
      erroBox.innerHTML = `<div class="erro-msg">${err.message}</div>`;
    }
  };

  btnConfirmar.addEventListener('click', executarTroca);
  confInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executarTroca();
  });
}
