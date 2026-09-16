export function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast' + (tipo ? ' ' + tipo : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px)';
    t.style.transition = 'opacity 0.2s, transform 0.2s';
    setTimeout(() => t.remove(), 200);
  }, 3200);
}
