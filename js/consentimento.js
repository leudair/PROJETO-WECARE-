/* Aviso de cookies e carregamento do pixel da Meta somente apos o aceite. */
(function () {
  var CHAVE = 'wecare-cookies';
  var PIXEL = '618583611176694';

  function lido() {
    try { return localStorage.getItem(CHAVE); } catch (e) { return null; }
  }
  function guardar(valor) {
    try { localStorage.setItem(CHAVE, valor); } catch (e) {}
  }

  /* Fila do pixel. Chamadas feitas antes do aceite ficam guardadas e so sao
     enviadas se a pessoa aceitar. */
  if (!window.fbq) {
    var n = window.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = false; n.version = '2.0'; n.queue = [];
  }

  var carregado = false;
  function carregarPixel() {
    if (carregado) return;
    carregado = true;
    var t = document.createElement('script');
    t.async = true;
    t.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(t);
    window.fbq('init', PIXEL);
    window.fbq('track', 'PageView');
  }

  function limparFila() {
    if (window.fbq && window.fbq.queue) window.fbq.queue.length = 0;
  }

  function montarAviso() {
    var caixa = document.createElement('div');
    caixa.className = 'aviso-cookies';
    caixa.setAttribute('role', 'dialog');
    caixa.setAttribute('aria-label', 'Aviso de cookies');
    caixa.innerHTML =
      '<p>Usamos cookies para medir o desempenho dos nossos anúncios. ' +
      'Você escolhe se aceita. Detalhes na nossa ' +
      '<a href="/cookies.html">política de cookies</a>.</p>' +
      '<div class="aviso-cookies-botoes">' +
      '<button type="button" data-cookies="nao">Recusar</button>' +
      '<button type="button" data-cookies="sim" class="aviso-cookies-sim">Aceitar</button>' +
      '</div>';
    caixa.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-cookies]');
      if (!b) return;
      var sim = b.getAttribute('data-cookies') === 'sim';
      guardar(sim ? 'aceito' : 'recusado');
      if (sim) { carregarPixel(); } else { limparFila(); }
      caixa.remove();
    });
    document.body.appendChild(caixa);
  }

  function estilo() {
    var s = document.createElement('style');
    s.textContent =
      '.aviso-cookies{position:fixed;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));' +
      'z-index:9999;max-width:760px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:14px;' +
      'justify-content:space-between;padding:16px 18px;border-radius:12px;background:#0E0E10;color:#E4E4E6;' +
      'border:1px solid rgba(255,255,255,.16);box-shadow:0 14px 40px rgba(0,0,0,.45);' +
      "font-family:'Inter','Manrope',system-ui,sans-serif;font-size:.9rem;line-height:1.5}" +
      '.aviso-cookies p{margin:0;flex:1 1 280px}' +
      '.aviso-cookies a{color:#F0768A}' +
      '.aviso-cookies-botoes{display:flex;gap:10px;flex:0 0 auto}' +
      '.aviso-cookies button{font:inherit;font-weight:600;cursor:pointer;padding:10px 18px;border-radius:8px;' +
      'border:1px solid rgba(255,255,255,.3);background:transparent;color:#E4E4E6}' +
      '.aviso-cookies button:hover{border-color:#fff;color:#fff}' +
      '.aviso-cookies-sim{background:#C41230;border-color:#C41230;color:#fff}' +
      '.aviso-cookies-sim:hover{background:#E8455E;border-color:#E8455E}' +
      '@media (max-width:520px){.aviso-cookies{flex-direction:column;align-items:stretch}' +
      '.aviso-cookies p{flex:0 0 auto}.aviso-cookies-botoes button{flex:1}}';
    document.head.appendChild(s);
  }

  function comecar() {
    var escolha = lido();
    if (escolha === 'aceito') { carregarPixel(); return; }
    if (escolha === 'recusado') { limparFila(); return; }
    estilo();
    montarAviso();
  }

  /* Deixa a pessoa rever a escolha a partir de um link com data-rever-cookies. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-rever-cookies]');
    if (!a) return;
    e.preventDefault();
    guardar('');
    estilo();
    montarAviso();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', comecar);
  } else {
    comecar();
  }
})();
