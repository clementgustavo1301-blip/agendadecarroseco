export function formatCPF(v) {
  v = (v || '').replace(/\D/g, '').slice(0, 11);
  if (v.length > 9) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
  if (v.length > 6) return v.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
  if (v.length > 3) return v.replace(/(\d{3})(\d{0,3})/, '$1.$2');
  return v;
}

export function limparCPF(v) {
  return (v || '').replace(/\D/g, '');
}

export function formatPlaca(v) {
  return (v || '').toUpperCase().trim();
}
