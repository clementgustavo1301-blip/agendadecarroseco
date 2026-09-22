import { userService } from '../services/userService.js';
import { formatCPF } from '../utils/formatters.js';
import { escapeHtml } from '../utils/dom.js';
import { abrirModal, abrirModalInput } from '../components/modal.js';
import { toast } from '../components/toast.js';

export async function renderUsuarios(currentUser, { onAtualizar }) {
  const tabela = document.getElementById('usuarios-tabela');
  const users = await userService.listarUsuarios();

  if (users.length === 0) {
    tabela.innerHTML = '';
    return;
  }

  const linhas = users.map(u => {
    const tagCargo = u.isAdminMestre
      ? ' <span class="badge badge-admin">Admin mestre</span>'
      : (u.isAdmin ? ' <span class="badge badge-admin">Admin</span>' : '');

    let acoesRestritas = '';
    if (currentUser.isAdminMestre) {
      acoesRestritas += `<button class="icon-btn btn-editar-usr" data-id="${u.id}">Editar dados</button>`;
    }
    if (currentUser.isAdminMestre && !u.isAdminMestre) {
      acoesRestritas += u.isAdmin
        ? `<button class="icon-btn btn-revogar-admin" data-id="${u.id}">Remover admin</button>`
        : `<button class="icon-btn btn-tornar-admin" data-id="${u.id}">Tornar admin</button>`;
      acoesRestritas += `<button class="icon-btn perigo btn-excluir-usr" data-id="${u.id}">Excluir</button>`;
    }

    return `
      <tr>
        <td><b>${escapeHtml(u.nome)}</b>${tagCargo}</td>
        <td>${formatCPF(u.cpf)}</td>
        <td>${u.senhaProvisoria ? '<span class="badge badge-inativo">Aguardando troca</span>' : '<span class="badge badge-ativo">Ativa</span>'}</td>
        <td class="acoes-tbl">
          <button class="icon-btn btn-redefinir-senha" data-id="${u.id}">Nova senha mestre</button>
          ${acoesRestritas}
        </td>
      </tr>
    `;
  }).join('');

  tabela.innerHTML = `
    <tr>
      <th>Nome</th>
      <th>CPF</th>
      <th>Senha</th>
      <th>Ações</th>
    </tr>
    ${linhas}
  `;

  tabela.querySelectorAll('.btn-redefinir-senha').forEach(btn => {
    btn.onclick = async () => {
      const user = await userService.obterUsuarioPorId(btn.dataset.id);
      if (!user) return;
      abrirModalInput(
        'Nova senha mestre',
        `Defina uma nova senha provisória para ${user.nome}. Ele(a) precisará trocá-la no próximo acesso.`,
        async (valor) => {
          try {
            await userService.redefinirSenhaMestre(user.id, valor);
            toast('Senha mestre definida com sucesso.', 'sucesso');
            onAtualizar();
          } catch (err) {
            toast(err.message, 'erro');
          }
        }
      );
    };
  });

  tabela.querySelectorAll('.btn-editar-usr').forEach(btn => {
    btn.onclick = async () => {
      const user = await userService.obterUsuarioPorId(btn.dataset.id);
      if (!user) return;

      const fundo = document.createElement('div');
      fundo.className = 'modal-fundo';
      fundo.innerHTML = `
        <div class="modal">
          <button class="modal-fechar" aria-label="Fechar" title="Fechar">×</button>
          <h3>Editar usuário</h3>
          <div class="campo"><label for="editar-usr-nome">Nome</label><input id="editar-usr-nome" value="${escapeHtml(user.nome)}"></div>
          <div class="campo"><label for="editar-usr-cpf">CPF</label><input id="editar-usr-cpf" maxlength="14" value="${formatCPF(user.cpf)}"></div>
          <div class="acoes">
            <button class="btn btn-fantasma btn-cancelar">Cancelar</button>
            <button class="btn btn-primario btn-confirmar">Salvar</button>
          </div>
        </div>`;
      document.body.appendChild(fundo);

      const fechar = () => fundo.remove();
      fundo.querySelector('.modal-fechar').onclick = fechar;
      fundo.querySelector('.btn-cancelar').onclick = fechar;
      fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });
      const cpfInput = fundo.querySelector('#editar-usr-cpf');
      cpfInput.addEventListener('input', (e) => { e.target.value = formatCPF(e.target.value); });
      fundo.querySelector('.btn-confirmar').onclick = async () => {
        try {
          await userService.editarUsuario(user.id, {
            nome: fundo.querySelector('#editar-usr-nome').value,
            cpf: cpfInput.value
          });
          fechar();
          toast('Dados do usuário atualizados.', 'sucesso');
          onAtualizar();
        } catch (err) {
          toast(err.message, 'erro');
        }
      };
    };
  });

  tabela.querySelectorAll('.btn-tornar-admin').forEach(btn => {
    btn.onclick = async () => {
      try {
        const user = await userService.alterarStatusAdmin(btn.dataset.id, true);
        toast(`${user.nome} agora é administrador.`, 'sucesso');
        onAtualizar();
      } catch (err) {
        toast(err.message, 'erro');
      }
    };
  });

  tabela.querySelectorAll('.btn-revogar-admin').forEach(btn => {
    btn.onclick = async () => {
      try {
        const user = await userService.alterarStatusAdmin(btn.dataset.id, false);
        toast(`Acesso de administrador removido de ${user.nome}.`, 'sucesso');
        onAtualizar();
      } catch (err) {
        toast(err.message, 'erro');
      }
    };
  });

  tabela.querySelectorAll('.btn-excluir-usr').forEach(btn => {
    btn.onclick = async () => {
      const user = await userService.obterUsuarioPorId(btn.dataset.id);
      if (!user) return;
      abrirModal(
        'Excluir usuário',
        `Tem certeza que deseja excluir "${user.nome}"? Os agendamentos já feitos por ele permanecerão no relatório.`,
        async () => {
          try {
            await userService.excluirUsuario(user.id, currentUser);
            toast('Usuário excluído.', 'sucesso');
            onAtualizar();
          } catch (err) {
            toast(err.message, 'erro');
          }
        }
      );
    };
  });
}

export function setupUsersPage({ onAtualizar }) {
  const usrCpf = document.getElementById('usr-cpf');
  const usrNome = document.getElementById('usr-nome');
  const usrSenha = document.getElementById('usr-senha');
  const usrAdmin = document.getElementById('usr-admin');
  const btnCadastrar = document.getElementById('btn-cadastrar-usuario');
  const erroBox = document.getElementById('usr-erro');

  usrCpf.addEventListener('input', (e) => {
    e.target.value = formatCPF(e.target.value);
  });

  btnCadastrar.addEventListener('click', async () => {
    erroBox.innerHTML = '';
    const nome = usrNome.value.trim();
    const cpf = usrCpf.value;
    const senha = usrSenha.value;
    const isAdmin = usrAdmin.checked;

    try {
      await userService.cadastrarUsuario({ nome, cpf, senha, isAdmin });
      usrNome.value = '';
      usrCpf.value = '';
      usrSenha.value = '';
      usrAdmin.checked = false;
      toast('Usuário cadastrado com sucesso.', 'sucesso');
      onAtualizar();
    } catch (err) {
      erroBox.innerHTML = `<div class="erro-msg">${err.message}</div>`;
    }
  });
}
