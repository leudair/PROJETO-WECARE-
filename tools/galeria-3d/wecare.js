// Galeria 3D dos servicos da WeCare, encaixada como uma secao da pagina.
// Baseada no controlador original (app.js), sem prender a rolagem da pagina:
// anda pelos botoes, pelas setas do teclado (so com o foco na secao) e
// arrastando para o lado no celular.
import { collection, montaServicos } from './collection.js';
import { mountTextMotion } from './text-motion.js';
import { exhibitionView, initialNavigation, nextStation } from './navigation.js';

const UI = {
  pt: { saiba: 'Saiba mais', girar: 'Arraste para girar', fim: 'Vamos conversar?', fimTxt: 'Conte qual serviço você procura. A equipe responde pelo WhatsApp.',
    zap: 'Falar no WhatsApp', denovo: 'Ver de novo', inclui: 'O que inclui', pergunta: 'Falar sobre este serviço', abrindo: 'Preparando os serviços…',
    contato: 'Contato', ant: 'Serviço anterior', prox: 'Próximo serviço', fechar: 'Fechar', girarPalco: 'arraste para girar', menos: 'Afastar', mais: 'Aproximar',
    semGl: 'Este aparelho não abre a galeria em 3D. Veja os serviços abaixo:', deslize: 'Arraste para o lado' },
  en: { saiba: 'Learn more', girar: 'Drag to rotate', fim: "Let's talk.", fimTxt: 'Tell us which service you need. The team answers on WhatsApp.',
    zap: 'Chat on WhatsApp', denovo: 'Start again', inclui: "What's included", pergunta: 'Ask about this service', abrindo: 'Loading services…',
    contato: 'Contact', ant: 'Previous service', prox: 'Next service', fechar: 'Close', girarPalco: 'drag to rotate', menos: 'Zoom out', mais: 'Zoom in',
    semGl: 'This device cannot open the 3D gallery. Here are our services:', deslize: 'Swipe sideways' },
  es: { saiba: 'Ver más', girar: 'Arrastra para girar', fim: '¿Hablamos?', fimTxt: 'Cuéntanos qué servicio buscas. El equipo responde por WhatsApp.',
    zap: 'Hablar por WhatsApp', denovo: 'Ver de nuevo', inclui: 'Qué incluye', pergunta: 'Preguntar por este servicio', abrindo: 'Preparando los servicios…',
    contato: 'Contacto', ant: 'Servicio anterior', prox: 'Servicio siguiente', fechar: 'Cerrar', girarPalco: 'arrastra para girar', menos: 'Alejar', mais: 'Acercar',
    semGl: 'Este dispositivo no abre la galería en 3D. Estos son nuestros servicios:', deslize: 'Desliza hacia el lado' },
};
const ZAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>';

export async function start(root) {
  const lang = (document.documentElement.lang || 'pt').slice(0, 2);
  const t = UI[lang] ?? UI.pt;
  collection.length = 0;
  collection.push(...montaServicos(lang));
  const wa = root.dataset.wa || '#';

  const q = (selector, el = root) => el.querySelector(selector);
  const all = (selector, el = root) => [...el.querySelectorAll(selector)];
  const number = (i) => String(i + 1).padStart(2, '0');
  const last = collection.length - 1;
  const horizon = collection.length;
  const galleryEl = q('.expo-galeria');
  const intro = q('.expo-intro');
  const caption = q('.expo-legenda');
  const inspector = q('.expo-janela');
  const stage = q('.expo-palco');
  let state = initialNavigation();
  let gallery, inspection, returnFocus, touchStart;
  let modalItem = 0;

  const esc = (value) => String(value).replace(/[&<>"']/g, (x) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);

  q('.expo-rota').innerHTML = collection.map((item, i) =>
    `<button type="button" data-station="${i}" aria-label="${esc(item.name)}"><span>${number(i)}</span><span class="station-name"> ${esc(item.category)}</span></button>`
  ).join('') + `<button type="button" class="horizon-button" data-station="${horizon}" aria-label="${esc(t.contato)}"><span aria-hidden="true">↗</span><span class="station-name"> ${esc(t.contato)}</span></button>`;
  q('.expo-passos').innerHTML = `<button type="button" data-action="previous" aria-label="${esc(t.ant)}">←</button>
    <span class="step-count"></span><button type="button" data-action="next" aria-label="${esc(t.prox)}">→</button>`;

  function markRoute() {
    const item = collection[state.selected];
    const atHorizon = state.route === horizon + 1;
    intro.hidden = !state.intro;
    caption.hidden = state.intro;
    caption.classList.toggle('horizon-label', atHorizon);
    caption.classList.toggle('exhibit-label', !state.intro && !atHorizon);
    caption.innerHTML = state.intro ? ''
      : atHorizon
      ? `<h3>${esc(t.fim)}</h3><p class="expo-fim-txt">${esc(t.fimTxt)}</p><div class="caption-actions">
          <a class="expo-zap" href="${esc(wa)}" target="_blank" rel="noopener">${ZAP}<span>${esc(t.zap)}</span></a>
          <button class="detail-button" type="button" data-action="restart"><span>${esc(t.denovo)}</span><span class="action-icon" aria-hidden="true">↖</span></button></div>`
      : `<p class="micro">${esc(item.id)} / ${esc(item.category)}${item.destaque ? ` <b>${esc(item.destaque)}</b>` : ''}</p>
        <h3>${esc(item.name)}</h3>
        <p class="expo-sub">${esc(item.material)}</p>
        <div class="caption-actions">
          <button class="detail-button" type="button" data-action="inspect"><span>${esc(t.saiba)}</span><span class="action-icon" aria-hidden="true">↗</span></button>
          <span class="rotate-hint">${esc(t.girar)}</span>
        </div>`;
    caption.classList.remove('is-arrived');
    all('[data-station]').forEach((button, i) => button.setAttribute('aria-current', state.route === i + 1 ? 'step' : 'false'));
    q('.step-count').textContent = `${String(state.route).padStart(2, '0')} / ${number(horizon)}`;
    q('[data-action="previous"]').disabled = state.intro;
    q('[data-action="next"]').disabled = atHorizon;
    root.classList.toggle('na-entrada', state.intro);
  }

  function goTo(i) {
    state = exhibitionView(state, i, last);
    if (state.webgl !== true) return;
    markRoute();
    gallery.move(state.route);
  }
  function step(direction) {
    const next = nextStation(state, direction, last);
    if (next !== null) goTo(next);
  }

  function openObject(i, trigger) {
    if (inspector.open) return;
    modalItem = i;
    const item = collection[i];
    stage.innerHTML = `<div class="stage-world"></div>
      <div class="stage-controls"><span>${esc(t.girarPalco)}</span><div>
        <button type="button" data-action="zoom-out" aria-label="${esc(t.menos)}">−</button>
        <button type="button" data-action="zoom-in" aria-label="${esc(t.mais)}">+</button>
      </div></div>`;
    q('.expo-info').innerHTML = `<p class="micro">${esc(item.id)} / ${esc(item.category)}</p>
      <h3 class="expo-janela-titulo">${esc(item.name)}</h3>
      <p class="description">${esc(item.description)}</p>
      <p class="micro expo-inclui">${esc(t.inclui)}</p>
      <ul>${item.inclui.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <a class="expo-zap" href="${esc(wa)}" target="_blank" rel="noopener">${ZAP}<span>${esc(t.pergunta)}</span></a>`;
    returnFocus = trigger ?? document.activeElement;
    inspector.showModal();
    gallery?.setObscured(true);
    q('[data-close]', inspector)?.focus({ preventScroll: true });
    if (!gallery || state.webgl !== true) { q('.stage-controls', stage).hidden = true; return; }
    try {
      inspection = gallery.stage(q('.stage-world', stage), item, {
        finish: 0,
        error() { q('.stage-world', stage).hidden = true; q('.stage-controls', stage).hidden = true; },
      });
    } catch { q('.stage-controls', stage).hidden = true; }
  }

  function fallback() {
    state.webgl = false;
    gallery?.setVisible(false);
    root.classList.add('sem-3d');
    q('.expo-status').textContent = '';
    q('.expo-lista').innerHTML = `<p>${esc(t.semGl)}</p><ul>${collection.map((item) =>
      `<li><b>${esc(item.name)}</b><span>${esc(item.description)}</span></li>`).join('')}</ul>
      <a class="expo-zap" href="${esc(wa)}" target="_blank" rel="noopener">${ZAP}<span>${esc(t.zap)}</span></a>`;
  }

  const actions = {
    restart: () => goTo(-1),
    enter: () => goTo(0),
    next: () => step(1),
    previous: () => step(-1),
    inspect: () => openObject(state.selected, q('[data-action="inspect"]', caption)),
    'zoom-in': () => inspection?.zoom(-0.13),
    'zoom-out': () => inspection?.zoom(0.13),
  };

  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.hasAttribute('data-close')) button.closest('dialog').close();
    else if (button.dataset.station !== undefined) goTo(Number(button.dataset.station));
    else if (button.dataset.action) actions[button.dataset.action]?.();
  });
  inspector.addEventListener('click', (event) => { if (event.target === inspector) inspector.close(); });
  inspector.addEventListener('close', () => {
    inspection?.dispose();
    inspection = undefined;
    stage.replaceChildren();
    gallery?.setObscured(false);
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  });
  const canTravel = () => state.webgl === true && !inspector.open;
  root.addEventListener('keydown', (event) => {
    if (!canTravel() || event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.target.closest('a, input')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
  });
  galleryEl.addEventListener('touchstart', (event) => {
    touchStart = event.touches.length === 1 && !event.target.closest('button, a') ? event.touches[0] : undefined;
  }, { passive: true });
  galleryEl.addEventListener('touchend', (event) => {
    const begin = touchStart;
    touchStart = undefined;
    if (!begin || !canTravel()) return;
    const end = Array.from(event.changedTouches).find((touch) => touch.identifier === begin.identifier);
    if (!end) return;
    const dx = begin.clientX - end.clientX;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(begin.clientY - end.clientY) * 1.2) {
      if (state.intro && dx > 0) goTo(0); else step(Math.sign(dx));
    }
  }, { passive: true });
  galleryEl.addEventListener('touchcancel', () => { touchStart = undefined; });

  markRoute();
  q('[data-action="enter"]').disabled = true;
  all('[data-station]').forEach((button) => { button.disabled = true; });
  q('.expo-status').textContent = t.abrindo;
  const revealText = mountTextMotion(root);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    const { makeGallery } = await import('./gallery.js');
    gallery = makeGallery(q('.expo-mundo'), {
      open(i) { if (i === state.selected) openObject(i, q('[data-action="inspect"]', caption)); else goTo(i); },
      didRotate() { touchStart = undefined; },
      arrival(arrived) {
        if (state.route === horizon + 1 && caption.classList.contains('is-arrived') !== arrived) {
          caption.classList.toggle('is-arrived', arrived);
          revealText();
        }
      },
      preview() {}, fallback,
      assetError(item, error) { console.warn(`${item.name}:`, error.message); },
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => es.forEach((e) => gallery.setVisible(e.isIntersecting)), { rootMargin: '100px 0px' }).observe(root);
    }
    await gallery.ready;
    state.webgl = true;
    q('[data-action="enter"]').disabled = false;
    all('[data-station]').forEach((button) => { button.disabled = false; });
    q('.expo-status').textContent = '';
    root.classList.add('pronto');
  } catch (error) {
    if (error.message !== 'WebGL 2 is unavailable') console.warn('Galeria 3D indisponível:', error.message);
    fallback();
  }
}
