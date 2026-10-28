/* Abre o video da Metodologia WeCare numa janela sobre a pagina.
   Para trocar o video, mude so a linha abaixo para o codigo do YouTube,
   a parte depois de "v=" no endereco. Enquanto estiver vazia, os botoes
   do video ficam escondidos e a pagina segue normal. */
var VIDEO_METODOLOGIA = '8Kf9VPr3VYw';

(function () {
  var ID = (VIDEO_METODOLOGIA || '').trim();
  /* Botoes que existem so para o video: sem video eles saem da pagina. */
  var botoes = document.querySelectorAll('[data-video-metodologia]');
  /* Elementos que ja tinham outro destino, como o botao do alto da pagina:
     sem video continuam intactos, levando para a secao da metodologia. */
  var extras = document.querySelectorAll('[data-video-extra]');
  var i;

  if (!/^[A-Za-z0-9_-]{11}$/.test(ID)) {
    for (i = 0; i < botoes.length; i++) botoes[i].remove();
    return;
  }

  var estilo = document.createElement('style');
  estilo.textContent =
    '.janela-video{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;' +
    'justify-content:center;padding:20px;background:rgba(4,4,5,.9);' +
    'padding-top:calc(20px + env(safe-area-inset-top,0px));' +
    'padding-bottom:calc(20px + env(safe-area-inset-bottom,0px))}' +
    '.janela-video-quadro{position:relative;width:100%;max-width:1000px;aspect-ratio:16/9;' +
    'background:#000;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}' +
    '.janela-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}' +
    '.janela-video-fechar{position:fixed;top:calc(14px + env(safe-area-inset-top,0px));right:14px;' +
    'width:42px;height:42px;cursor:pointer;z-index:2;' +
    'display:flex;align-items:center;justify-content:center;border-radius:50%;' +
    'background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3);color:#fff;' +
    'font-size:20px;line-height:1;padding:0}' +
    '.janela-video-fechar:hover{background:#C41230;border-color:#C41230}' +
    '@media (max-width:620px){.janela-video{padding-left:12px;padding-right:12px}}' +
    '.tocar-video{position:absolute;inset:0;z-index:3;display:flex;align-items:center;' +
    'justify-content:center;cursor:pointer;background:none;border:0;padding:0}' +
    '.tocar-video span{display:flex;align-items:center;justify-content:center;width:72px;height:72px;' +
    'border-radius:50%;background:rgba(196,18,48,.92);box-shadow:0 10px 30px rgba(0,0,0,.45);' +
    'transition:transform .2s,background .2s}' +
    '.tocar-video span::before{content:"";display:block;width:0;height:0;margin-left:6px;' +
    'border-top:14px solid transparent;border-bottom:14px solid transparent;border-left:22px solid #fff}' +
    '.tocar-video:hover span{transform:scale(1.08);background:#E8455E}' +
    '.metodologia-acoes{display:flex;flex-wrap:wrap;gap:12px;align-items:center}';
  document.head.appendChild(estilo);

  var aberta = null;
  var veioDe = null;

  function fechar() {
    if (!aberta) return;
    aberta.remove();
    aberta = null;
    document.body.style.overflow = '';
    if (veioDe && veioDe.focus) veioDe.focus();
  }

  function abrir(origem) {
    if (aberta) return;
    veioDe = origem;
    var caixa = document.createElement('div');
    caixa.className = 'janela-video';
    caixa.setAttribute('role', 'dialog');
    caixa.setAttribute('aria-modal', 'true');
    caixa.setAttribute('aria-label', 'Vídeo da Metodologia WeCare');

    var quadro = document.createElement('div');
    quadro.className = 'janela-video-quadro';

    var fechaBotao = document.createElement('button');
    fechaBotao.type = 'button';
    fechaBotao.className = 'janela-video-fechar';
    fechaBotao.setAttribute('aria-label', 'Fechar o vídeo');
    fechaBotao.innerHTML = '&times;';

    var quadroVideo = document.createElement('iframe');
    quadroVideo.src = 'https://www.youtube-nocookie.com/embed/' + ID +
      '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
    quadroVideo.title = 'Metodologia WeCare';
    quadroVideo.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    quadroVideo.setAttribute('allowfullscreen', '');
    quadroVideo.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

    quadro.appendChild(quadroVideo);
    caixa.appendChild(quadro);
    caixa.appendChild(fechaBotao);
    document.body.appendChild(caixa);
    document.body.style.overflow = 'hidden';
    aberta = caixa;
    fechaBotao.focus();

    fechaBotao.addEventListener('click', fechar);
    caixa.addEventListener('click', function (e) {
      if (e.target === caixa) fechar();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') fechar();
  });

  function aoClicar(e) {
    e.preventDefault();
    abrir(e.currentTarget);
    if (window.fbq) {
      window.fbq('track', 'ViewContent', { content_name: 'video-metodologia' });
    }
  }

  for (i = 0; i < botoes.length; i++) {
    botoes[i].style.display = '';
    botoes[i].addEventListener('click', aoClicar);
  }

  for (i = 0; i < extras.length; i++) {
    extras[i].addEventListener('click', aoClicar);
  }
})();
