/* Anel 3D de artes da WeCare. Gira sozinho, devagar, e obedece ao dedo.
   Para trocar as artes, mexa so na lista ARTES. */
(function () {
  var ARTES = [
    { src: '/images/prova-social.jpg',          alt: 'Arte da Agência WeCare sobre crescimento nas redes sociais' },
    { src: '/images/resultado-perfil-grid.jpg', alt: 'Perfil @agencia.wecare no Instagram' },
    { src: '/images/metodologia-pilares.jpg',   alt: 'Arte da WeCare sobre confiança e posicionamento' },
    { src: '/images/resultado-seguidores.jpg',  alt: 'Total de seguidores e atividade do perfil' },
    { src: '/images/hero-celular-arte.jpg',     alt: 'Arte dos 10 anos da Agência WeCare' },
    { src: '/images/resultado-insights.jpg',    alt: 'Visualizações, interações e contas alcançadas' },
    { src: '/images/ceo-retrato.jpg',           alt: 'Leudair Vinter de Farias, CEO da Agência WeCare' },
    { src: '/images/resultado-cta.jpg',         alt: 'Chamada para transformar sua presença digital' }
  ];

  var GIRO = 9;          /* graus por segundo, no computador */
  var INCLINACAO = -6;   /* graus de tombo do anel */
  var PROPORCAO = 0.62;  /* largura dividida pela altura de cada arte */
  var FOLGA = 1.42;      /* espaco entre uma arte e a seguinte, no computador */

  /* No celular o anel nao gira sem parar: ele para com uma arte de frente,
     espera, e vira para a proxima. O dedo arrasta e ele encaixa na mais perto. */
  var ESTREITO = 560;    /* daqui para baixo vale o jeito do celular */
  var FOLGA_CEL = 1.25;
  var PAUSA = 2300;      /* milissegundos parado em cada arte */

  var palco = document.querySelector('[data-anel]');
  if (!palco) return;

  var estilo = document.createElement('style');
  estilo.textContent =
    '.anel-palco{position:relative;width:100%;overflow:hidden;touch-action:pan-y;' +
    'cursor:grab;-webkit-user-select:none;user-select:none}' +
    '.anel-palco:active{cursor:grabbing}' +
    '.anel-palco::before,.anel-palco::after{content:"";position:absolute;top:0;bottom:0;width:12%;z-index:4;' +
    'pointer-events:none}' +
    '.anel-palco::before{left:0;background:linear-gradient(90deg,var(--black,#0A0A0B),transparent)}' +
    '.anel-palco::after{right:0;background:linear-gradient(270deg,var(--black,#0A0A0B),transparent)}' +
    '.anel-cena{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}' +
    '.anel-tombo{transform-style:preserve-3d}' +
    '.anel{position:relative;transform-style:preserve-3d;will-change:transform}' +
    '.anel-arte{position:absolute;inset:0;transform-style:preserve-3d}' +
    '.anel-face{position:absolute;inset:0;border-radius:14px;overflow:hidden;backface-visibility:hidden;' +
    'background:#141416;box-shadow:0 14px 34px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.08)}' +
    '.anel-face img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.anel-face-dentro{transform:rotateY(180deg);filter:brightness(.34) saturate(.7)}' +
    '.anel-dica{margin-top:14px;text-align:center;font-size:.82rem;letter-spacing:.06em;' +
    'color:var(--muted,#A8A6AA)}' +
    '@media (max-width:620px){.anel-palco::before,.anel-palco::after{width:7%}' +
    '.anel-face{border-radius:12px}}';
  document.head.appendChild(estilo);

  palco.className += ' anel-palco';
  var cena = document.createElement('div');
  cena.className = 'anel-cena';
  var tombo = document.createElement('div');
  tombo.className = 'anel-tombo';
  var anel = document.createElement('div');
  anel.className = 'anel';
  tombo.appendChild(anel);
  cena.appendChild(tombo);
  palco.appendChild(cena);

  var total = ARTES.length;
  var passo = 360 / total;
  var artes = [];

  for (var i = 0; i < total; i++) {
    var arte = document.createElement('div');
    arte.className = 'anel-arte';

    var frente = document.createElement('div');
    frente.className = 'anel-face';
    var img = document.createElement('img');
    img.src = ARTES[i].src;
    img.alt = ARTES[i].alt;
    img.loading = 'lazy';
    img.draggable = false;
    frente.appendChild(img);

    var dentro = document.createElement('div');
    dentro.className = 'anel-face anel-face-dentro';
    var img2 = document.createElement('img');
    img2.src = ARTES[i].src;
    img2.alt = '';
    img2.loading = 'lazy';
    img2.draggable = false;
    img2.setAttribute('aria-hidden', 'true');
    dentro.appendChild(img2);

    arte.appendChild(frente);
    arte.appendChild(dentro);
    anel.appendChild(arte);
    artes.push(arte);
  }

  var larguraArte = 0, raio = 0, celular = false;

  function medir() {
    var espaco = palco.clientWidth || 320;
    var eraCelular = celular;
    celular = espaco < ESTREITO;

    if (celular) {
      larguraArte = Math.max(150, Math.min(240, espaco * 0.60));
    } else {
      larguraArte = Math.max(130, Math.min(250, espaco * 0.46));
    }
    var altura = Math.round(larguraArte / PROPORCAO);
    var folga = celular ? FOLGA_CEL : FOLGA;
    raio = Math.round((larguraArte * folga) / (2 * Math.tan(Math.PI / total)));

    if (celular && !eraCelular) {
      alvo = Math.round(giro / passo) * passo;
      esperaAte = agora() + PAUSA;
      if (dica) dica.textContent = 'Arraste para ver, toque para ampliar';
    } else if (!celular && eraCelular) {
      if (dica) dica.textContent = 'Arraste para girar';
    }

    palco.style.height = (altura + (celular ? 50 : 60)) + 'px';
    palco.style.perspective = Math.round(raio * (celular ? 3 : 3.6)) + 'px';
    tombo.style.transform = 'rotateX(' + INCLINACAO + 'deg)';
    anel.style.width = larguraArte + 'px';
    anel.style.height = altura + 'px';
    for (var j = 0; j < total; j++) {
      artes[j].style.transform = 'rotateY(' + (j * passo) + 'deg) translateZ(' + raio + 'px)';
    }
    desenhar();
  }

  var giro = 0, velocidade = 0, ultimo = 0, quadro = 0;
  var arrasto = { ativo: false, x: 0, andou: 0 };
  var parado = false;
  var alvo = 0, esperaAte = 0;
  var calmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dica = palco.parentNode && palco.parentNode.querySelector('.anel-dica');
  var caixaLuz = document.getElementById('print-lightbox');

  function agora() {
    return window.performance && performance.now ? performance.now() : Date.now();
  }

  function daFrente() {
    var i = Math.round(-giro / passo) % total;
    return (i + total) % total;
  }

  function ampliar(i) {
    if (!caixaLuz) return;
    var grande = caixaLuz.querySelector('img');
    if (!grande) return;
    grande.src = ARTES[i].src;
    grande.alt = ARTES[i].alt;
    caixaLuz.classList.add('is-open');
  }

  function desenhar() {
    anel.style.transform = 'translateZ(' + (-raio) + 'px) rotateY(' + giro + 'deg)';
  }

  function passoDoTempo(tempo) {
    var dt = ultimo ? Math.min((tempo - ultimo) / 1000, 0.1) : 0;
    ultimo = tempo;
    if (!arrasto.ativo) {
      if (celular) {
        var falta = alvo - giro;
        if (Math.abs(falta) > 0.05) {
          giro += falta * (1 - Math.exp(-7 * dt));
          esperaAte = tempo + PAUSA;
        } else {
          giro = alvo;
          if (!calmo && tempo >= esperaAte) alvo += passo;
        }
      } else if (Math.abs(velocidade) > 0.02) {
        giro += velocidade * dt;
        velocidade *= 0.94;
      } else if (!calmo) {
        giro += GIRO * dt;
      }
    }
    desenhar();
    quadro = requestAnimationFrame(passoDoTempo);
  }

  function ligar() {
    if (quadro || parado) return;
    ultimo = 0;
    quadro = requestAnimationFrame(passoDoTempo);
  }
  function desligar() {
    if (!quadro) return;
    cancelAnimationFrame(quadro);
    quadro = 0;
  }

  palco.addEventListener('pointerdown', function (e) {
    palco.setPointerCapture && palco.setPointerCapture(e.pointerId);
    arrasto.ativo = true;
    arrasto.x = e.clientX;
    arrasto.andou = 0;
    velocidade = 0;
  });
  palco.addEventListener('pointermove', function (e) {
    if (!arrasto.ativo) return;
    var dx = e.clientX - arrasto.x;
    arrasto.x = e.clientX;
    arrasto.andou += Math.abs(dx);
    var k = 0.18;
    giro += dx * k;
    velocidade = dx * k * 60;
    desenhar();
  });
  function soltar(e) {
    if (!arrasto.ativo) return;
    arrasto.ativo = false;
    palco.releasePointerCapture && e.pointerId != null &&
      palco.releasePointerCapture(e.pointerId);
    if (!celular) return;
    if (arrasto.andou < 8 && e.type === 'pointerup') {
      alvo = Math.round(giro / passo) * passo;
      esperaAte = agora() + PAUSA;
      ampliar(daFrente());
      return;
    }
    var voltas = giro / passo;
    if (velocidade > 40) alvo = Math.ceil(voltas) * passo;
    else if (velocidade < -40) alvo = Math.floor(voltas) * passo;
    else alvo = Math.round(voltas) * passo;
    velocidade = 0;
    esperaAte = agora() + PAUSA;
  }
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);
  palco.addEventListener('pointerleave', soltar);

  window.addEventListener('resize', medir);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { desligar(); } else { ligar(); }
  });

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entradas) {
      parado = !entradas[0].isIntersecting;
      if (parado) { desligar(); } else { ligar(); }
    }, { threshold: 0.05 }).observe(palco);
  }

  medir();
  ligar();
})();
