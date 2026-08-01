/* ---------- Elegant placeholder for missing images ---------- */
function placeholderSVG(label) {
  const safeLabel = (label || 'imagem').replace(/[<&>]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1D1D20"/>
        <stop offset="1" stop-color="#0A0A0B"/>
      </linearGradient>
    </defs>
    <rect width="800" height="600" fill="url(#g)"/>
    <rect x="1" y="1" width="798" height="598" fill="none" stroke="#C41230" stroke-opacity="0.4"/>
    <text x="50%" y="47%" font-family="Georgia, serif" font-size="26" fill="#E8455E" text-anchor="middle">Agência WeCare</text>
    <text x="50%" y="56%" font-family="Arial, sans-serif" font-size="12" letter-spacing="3" fill="#A8A6AA" text-anchor="middle">${safeLabel.toUpperCase()}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Replace broken images with placeholder ---------- */
  document.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', function handler() {
      img.removeEventListener('error', handler);
      const name = (img.getAttribute('src') || '').split('/').pop();
      img.src = placeholderSVG(name);
    });
  });

  /* ---------- Header scroll state ---------- */
  const header = document.getElementById('site-header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Mobile menu ---------- */
  const menuToggle = document.getElementById('menu-toggle');
  const mainNav = document.getElementById('main-nav');
  menuToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('is-open');
    menuToggle.classList.toggle('is-open', isOpen);
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
  mainNav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('is-open');
      menuToggle.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- Active nav link on scroll ---------- */
  const navLinks = document.querySelectorAll('.nav-link');
  const navSections = Array.from(navLinks)
    .map(link => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = '#' + entry.target.id;
        navLinks.forEach(link => link.classList.toggle('is-active', link.getAttribute('href') === id));
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  navSections.forEach(sec => navObserver.observe(sec));

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => revealObserver.observe(el));

  /* ---------- Counter animation (supports decimals) ---------- */
  const counters = document.querySelectorAll('.stat-number');
  const animateCounter = (el) => {
    const target = parseFloat(el.dataset.value);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const duration = 1600;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (target * eased).toFixed(decimals).replace('.', ',');
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = target.toFixed(decimals).replace('.', ',');
    };
    requestAnimationFrame(step);
  };
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.6 });
  counters.forEach(el => counterObserver.observe(el));

  /* ---------- Decorative background video: play only while in view ---------- */
  document.querySelectorAll('.section-bg-video, .servicos-destaque-video').forEach(video => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      });
    }, { threshold: 0.2 });
    io.observe(video);
  });

  /* ---------- Subtle hero parallax ---------- */
  const heroImg = document.querySelector('.hero-img');
  if (heroImg && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.addEventListener('scroll', () => {
      const offset = window.scrollY;
      if (offset < window.innerHeight) {
        heroImg.style.transform = `translateY(${offset * 0.12}px) scale(1.05)`;
      }
    }, { passive: true });
  }

  /* ---------- Contact form validation ---------- */
  const form = document.getElementById('contact-form');
  const formStatus = document.getElementById('form-status');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let valid = true;

      form.querySelectorAll('.form-row').forEach(row => row.classList.remove('has-error'));

      const nome = form.querySelector('#cf-nome');
      const contato = form.querySelector('#cf-contato');
      const mensagem = form.querySelector('#cf-mensagem');

      if (!nome.value.trim()) {
        nome.closest('.form-row').classList.add('has-error');
        valid = false;
      }

      const contatoValue = contato.value.trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contatoValue);
      const isPhone = /^[\d\s()+-]{8,}$/.test(contatoValue);
      if (!contatoValue || (!isEmail && !isPhone)) {
        contato.closest('.form-row').classList.add('has-error');
        valid = false;
      }

      if (!mensagem.value.trim()) {
        mensagem.closest('.form-row').classList.add('has-error');
        valid = false;
      }

      formStatus.classList.remove('is-success', 'is-error');

      if (!valid) {
        formStatus.textContent = 'Verifique os campos destacados antes de enviar.';
        formStatus.classList.add('is-error');
        return;
      }

      const submitBtn = form.querySelector('.form-submit');
      submitBtn.disabled = true;
      formStatus.textContent = 'Enviando...';

      try {
        const response = await fetch('https://formsubmit.co/ajax/leudair.vinter@gmail.com', {
          method: 'POST',
          headers: { 'Accept': 'application/json' },
          body: new FormData(form)
        });
        if (!response.ok) throw new Error('request failed');

        formStatus.textContent = 'Mensagem enviada com sucesso! Nossa equipe entrará em contato em breve.';
        formStatus.classList.add('is-success');
        form.reset();
      } catch (err) {
        formStatus.textContent = 'Não foi possível enviar agora. Tente novamente ou fale conosco pelo WhatsApp.';
        formStatus.classList.add('is-error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  /* ---------- Footer year ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

});
