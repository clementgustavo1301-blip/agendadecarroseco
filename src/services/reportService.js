import { bookingService } from './bookingService.js';
import { fleetService } from './fleetService.js';
import { userService } from './userService.js';
import { fmtDataHora } from '../utils/dateUtils.js';

class ReportService {
  resumoChecklistSaida(s) {
    if (!s.checklistSaida) return 'Pendente';
    const c = s.checklistSaida;
    return `KM ${c.km} · ${c.combustivel}${c.avarias ? ' · ⚠ Avaria: ' + (c.avariasObs || 'não descrita') : ''}`;
  }

  resumoChecklistChegada(s) {
    if (!s.checklistChegada) return s.checklistSaida ? 'Pendente' : '—';
    const c = s.checklistChegada;
    return `KM ${c.km} · ${c.combustivel}${c.avariaNova ? ' · ⚠ Avaria: ' + (c.avariaNovaObs || 'não descrita') : ''}`;
  }

  async filtrarRelatorios({ carroId, usuarioId, dataDe, dataAte }, currentUser) {
    const schedules = await bookingService.listarAgendamentos({
      incluirExcluidos: Boolean(currentUser?.isAdminMestre)
    });

    let lista = currentUser?.isAdminMestre
      ? [...schedules]
      : schedules.filter(s => !s.excluido);

    if (!currentUser?.isAdmin) {
      lista = lista.filter(s => s.usuarioId === currentUser.id || s.criadoPorId === currentUser.id);
    }
    if (carroId) {
      lista = lista.filter(s => s.carroId === carroId);
    }
    if (usuarioId) {
      lista = lista.filter(s => s.usuarioId === usuarioId);
    }
    if (dataDe) {
      lista = lista.filter(s => new Date(s.inicio) >= new Date(dataDe + 'T00:00:00'));
    }
    if (dataAte) {
      lista = lista.filter(s => new Date(s.inicio) <= new Date(dataAte + 'T23:59:59'));
    }

    lista.sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
    return lista;
  }

  async exportarCSV(filtros, currentUser) {
    const lista = await this.filtrarRelatorios(filtros, currentUser);
    const cars = await fleetService.listarCarros();
    const users = await userService.listarUsuarios();

    const cabecalho = ['Veiculo', 'Placa', 'Motorista', 'Inicio', 'Fim', 'Itinerario', 'Objetivo', 'Observacao', 'CriadoPor', 'ChecklistSaida', 'ChecklistDevolucao'];
    if (currentUser?.isAdminMestre) cabecalho.push('Status');

    const linhas = [cabecalho];

    lista.forEach(s => {
      const carro = cars.find(c => c.id === s.carroId);
      const usuario = users.find(u => u.id === s.usuarioId);
      const criador = users.find(u => u.id === s.criadoPorId);

      const linha = [
        carro ? carro.nome : '',
        carro ? carro.placa : '',
        usuario ? usuario.nome : '',
        fmtDataHora(s.inicio),
        fmtDataHora(s.fim),
        (s.itinerario || '').replace(/\n/g, ' '),
        s.objetivo || '',
        (s.observacao || '').replace(/\n/g, ' '),
        criador ? criador.nome : '',
        this.resumoChecklistSaida(s),
        this.resumoChecklistChegada(s)
      ];

      if (currentUser?.isAdminMestre) {
        if (s.excluido) {
          const quemExcluiu = s.excluidoPorNome || users.find(u => u.id === s.excluidoPorId)?.nome;
          linha.push('Excluído em ' + fmtDataHora(s.excluidoEm) + (quemExcluiu ? ' por ' + quemExcluiu : ''));
        } else {
          linha.push('Ativo');
        }
      }
      linhas.push(linha);
    });

    const csv = linhas.map(l => l.map(campo => `"${String(campo).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio-agendamentos.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

export const reportService = new ReportService();
