export const characterMotion = { duration: 0.7, delay: 0.1, stagger: 0.03, distance: 0.45, fade: 0.2 };
const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export const splitGraphemes = (text) => segmenter
  ? Array.from(segmenter.segment(text), ({ segment }) => segment)
  : Array.from(text);

export function characterProgress(elapsed, index) {
  const t = Math.max(0, Math.min(1, (elapsed - characterMotion.delay - index * characterMotion.stagger) / characterMotion.duration));
  return 1 - (1 - t) ** 4;
}

const exempt = '.motion-copy,.text-motion,.sr-only,[aria-hidden="true"],script,style,textarea,select,svg,canvas';
const concealed = '[hidden],[inert],dialog:not([open])';

function wrapText(text) {
  const wrapper = document.createElement('span');
  wrapper.className = 'text-motion';
  const accessible = document.createElement('span');
  accessible.className = 'motion-copy sr-only';
  accessible.textContent = text.data;
  const visual = document.createElement('span');
  visual.className = 'motion-visual';
  visual.setAttribute('aria-hidden', 'true');
  for (const token of text.data.match(/\s+|\S+/gu)) {
    if (!token.trim()) {
      visual.append(token);
      continue;
    }
    const word = document.createElement('span');
    word.className = 'motion-word';
    for (const grapheme of splitGraphemes(token)) {
      const character = document.createElement('span');
      character.className = 'motion-char';
      character.textContent = grapheme;
      word.append(character);
    }
    visual.append(word);
  }
  wrapper.append(accessible, visual);
  text.replaceWith(wrapper);
  return wrapper;
}

function numberCharacters(wrapper, first) {
  const words = [...wrapper.querySelectorAll('.motion-word')];
  const rowBalance = wrapper.querySelectorAll('.motion-char').length > 46;
  let baseline = NaN, row = -1, index = first;
  let total = 0;
  for (const word of words) {
    if (rowBalance) {
      const top = word.getBoundingClientRect().top;
      if (!Number.isFinite(baseline) || Math.abs(top - baseline) > 2) {
        baseline = top;
        row++;
        index = Math.min(row * 2, 8);
      }
    }
    for (const character of word.children) {
      character.style.setProperty('--char-delay', `${Math.round((characterMotion.delay + index * characterMotion.stagger) * 1000)}ms`);
      index++;
      total++;
    }
  }
  return total;
}

function visible(wrapper) {
  if (wrapper.closest(concealed) || getComputedStyle(wrapper).visibility === 'hidden') return false;
  const viewport = wrapper.getBoundingClientRect();
  if (!viewport.width || !viewport.height || viewport.bottom < 0 || viewport.top > innerHeight) return false;
  const clip = wrapper.closest('dialog');
  if (!clip) return true;
  const frame = clip.getBoundingClientRect();
  return viewport.bottom >= frame.top && viewport.top <= frame.bottom;
}

export function mountTextMotion(root) {
  const pending = new Set();
  const abort = new AbortController();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let observer, frame = 0, fontsReady = false;

  function split(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.data.trim() && node.parentElement && !node.parentElement.closest(exempt)) pending.add(wrapText(node));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.closest(exempt)) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const text = [];
    while (walker.nextNode()) text.push(walker.currentNode);
    text.forEach(split);
  }

  function show() {
    frame = 0;
    if (!fontsReady) return;
    root.dataset.textMotion = reducedMotion.matches ? 'fade' : 'stagger';
    const counts = new Map();
    for (const wrapper of pending) {
      if (!wrapper.isConnected) {
        pending.delete(wrapper);
        continue;
      }
      if (!visible(wrapper)) continue;
      const group = wrapper.parentElement.closest('h1, h2, h3, button, summary') ?? wrapper;
      const first = counts.get(group) ?? 0;
      counts.set(group, first + numberCharacters(wrapper, first));
      wrapper.dataset.played = '';
      pending.delete(wrapper);
    }
  }

  function reveal() {
    if (!frame && !abort.signal.aborted) frame = requestAnimationFrame(show);
  }

  split(root);
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(split);
      if (record.type === 'characterData') split(record.target);
    }
    observer.takeRecords();
    reveal();
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['hidden', 'inert', 'open'] });
  window.addEventListener('resize', reveal, { signal: abort.signal, passive: true });
  document.addEventListener('scroll', reveal, { signal: abort.signal, capture: true, passive: true });
  document.addEventListener('toggle', reveal, { signal: abort.signal, capture: true });
  reducedMotion.addEventListener('change', reveal, { signal: abort.signal });
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    abort.abort();
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    pending.clear();
  }, { signal: abort.signal });

  Promise.resolve(document.fonts?.ready).then(() => {
    if (abort.signal.aborted) return;
    fontsReady = true;
    document.documentElement.classList.remove('motion-boot');
    show();
  });
  return reveal;
}
