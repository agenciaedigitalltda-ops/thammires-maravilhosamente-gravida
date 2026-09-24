/* Funções compartilhadas: tema, marca, Meta Pixel, origem (UTMs) e WhatsApp.
   Não precisa editar — os dados vêm de assets/config.js. */
window.LP = (function () {
  'use strict';
  var C = window.APP_CONFIG || {};
  var negocio = C.negocio || {};

  /* ---------- utilidades ---------- */
  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  // Normaliza para o formato internacional do wa.me (Brasil: acrescenta 55)
  function waNumber(s) {
    var d = digits(s);
    if (!d) return '';
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return d;
  }

  function waLink(numero, mensagem) {
    var n = waNumber(numero);
    if (!n) return '';
    return 'https://wa.me/' + n + (mensagem ? '?text=' + encodeURIComponent(mensagem) : '');
  }

  function firstName(nome) {
    var p = String(nome || '').trim().split(/\s+/)[0] || '';
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
  }

  function fill(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, function (_, k) {
      return vars && vars[k] != null ? vars[k] : '';
    }).replace(/\s+([,!?.])/g, '$1').replace(/^[,\s]+/, '').replace(/\s{2,}/g, ' ');
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    [].concat(children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* ---------- tema e marca ---------- */
  var TEMA_VARS = {
    fundoCentro: '--bg-1', fundoBordas: '--bg-2', texto: '--ink', destaque: '--accent',
    botao1: '--btn-1', botao2: '--btn-2', textoBotao: '--btn-ink', erro: '--error'
  };

  function applyTheme() {
    var t = C.tema || {};
    var root = document.documentElement;
    Object.keys(TEMA_VARS).forEach(function (k) { if (t[k]) root.style.setProperty(TEMA_VARS[k], t[k]); });
    if (t.botao1 && !t.botao2) root.style.setProperty('--btn-2', t.botao1);
    if (t.titulosMaiusculos !== false) root.classList.add('caps');
    if (t.brilhoBotao !== false) root.classList.add('shine');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && t.fundoBordas) meta.setAttribute('content', t.fundoBordas);
    loadFont(t.fonteTitulos || 'Playfair Display', '--display', 'Georgia, serif');
    loadFont(t.fonteTexto || 'Manrope', '--sans', 'system-ui, -apple-system, "Segoe UI", sans-serif');
  }

  // Carrega qualquer fonte do Google Fonts pelo nome (ex.: "Playfair Display")
  function loadFont(nome, cssVar, fallback) {
    nome = String(nome).trim();
    document.documentElement.style.setProperty(cssVar, '"' + nome + '", ' + fallback);
    if (document.querySelector('link[data-font="' + nome + '"]')) return;
    var fam = encodeURIComponent(nome).replace(/%20/g, '+');
    var link = el('link', { rel: 'stylesheet', 'data-font': nome, href: 'https://fonts.googleapis.com/css2?family=' + fam + ':wght@400;500;600;700&display=swap' });
    // se a fonte não tiver esses pesos, carrega a versão simples
    link.addEventListener('error', function () { link.href = 'https://fonts.googleapis.com/css2?family=' + fam + '&display=swap'; }, { once: true });
    document.head.appendChild(link);
  }

  function initials(nome) {
    return String(nome || '').trim().split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0); }).join('').toUpperCase();
  }

  // Preenche qualquer elemento [data-brand] com logo/monograma + nome
  function renderBrand(root) {
    (root || document).querySelectorAll('[data-brand]').forEach(function (box) {
      box.innerHTML = '';
      if (!negocio.nome && !negocio.logoUrl) { box.hidden = true; return; }
      var mark = negocio.logoUrl
        ? el('img', { class: 'brand-logo', src: negocio.logoUrl, alt: negocio.nome || 'Logo' })
        : el('span', { class: 'brand-mono', 'aria-hidden': 'true', text: initials(negocio.nome) });
      box.appendChild(mark);
      var nomeNaLogo = negocio.logoUrl && negocio.nomeNaLogo;
      if (negocio.nome && !nomeNaLogo) box.appendChild(el('span', { class: 'brand-name', text: negocio.nome }));
    });
  }

  /* ---------- Títulos que se ajustam à largura da tela ----------
     Diminui a fonte até a palavra mais longa caber (ex.: "MARAVILHOSAMENTE"). */
  function fitText(nodes) {
    [].forEach.call(nodes || document.querySelectorAll('[data-fit]'), function (n) {
      n.style.fontSize = '';
      var size = parseFloat(getComputedStyle(n).fontSize);
      var guard = 60;
      while (n.scrollWidth > n.clientWidth + 1 && size > 14 && guard--) {
        size -= 1; n.style.fontSize = size + 'px';
      }
    });
  }
  var fitTimer;
  window.addEventListener('resize', function () { clearTimeout(fitTimer); fitTimer = setTimeout(function () { fitText(); }, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitText(); });

  /* ---------- Quadro de fotos + ampliação ---------- */
  function fotos() {
    return ((C.apresentacao || {}).fotos || []).filter(Boolean).map(function (f, i) {
      return typeof f === 'string' ? { src: f, alt: 'Foto ' + (i + 1) + (negocio.nome ? ' — ' + negocio.nome : '') } : f;
    });
  }

  function gallery(max, extraClass) {
    var list = fotos().slice(0, max || 12);
    if (!list.length) return null;
    var grid = el('div', { class: 'gallery ' + (extraClass || '') + ' n' + Math.min(list.length, 6) });
    list.forEach(function (f, i) {
      var img = el('img', { src: f.src, alt: f.alt || '', loading: i < 3 ? 'eager' : 'lazy', decoding: 'async' });
      img.addEventListener('error', function () { btn.remove(); });
      var btn = el('button', { type: 'button', class: 'g-item', 'aria-label': 'Ampliar foto ' + (i + 1),
        onclick: function () { openLightbox(list, i); } }, [img]);
      grid.appendChild(btn);
    });
    return grid;
  }

  function openLightbox(list, i) {
    var img = el('img', { alt: '' });
    var box = el('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Foto ampliada' }, [
      img,
      el('button', { type: 'button', class: 'lb-close', 'aria-label': 'Fechar', text: '×', onclick: close }),
      list.length > 1 ? el('button', { type: 'button', class: 'lb-nav lb-prev', 'aria-label': 'Anterior', text: '‹', onclick: function (e) { e.stopPropagation(); show(i - 1); } }) : null,
      list.length > 1 ? el('button', { type: 'button', class: 'lb-nav lb-next', 'aria-label': 'Próxima', text: '›', onclick: function (e) { e.stopPropagation(); show(i + 1); } }) : null
    ]);
    function show(n) { i = (n + list.length) % list.length; img.src = list[i].src; img.alt = list[i].alt || ''; }
    function close() { box.remove(); document.removeEventListener('keydown', key); document.body.style.overflow = ''; }
    function key(e) { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') show(i + 1); if (e.key === 'ArrowLeft') show(i - 1); }
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    var x0 = null;
    box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40 && list.length > 1) show(i + (dx < 0 ? 1 : -1));
    });
    document.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    document.body.appendChild(box);
    show(i);
    box.querySelector('.lb-close').focus();
  }

  /* ---------- Meta Pixel ---------- */
  var pixelOn = false;
  var STANDARD = ['PageView', 'ViewContent', 'Lead', 'Contact', 'CompleteRegistration', 'Schedule', 'SubmitApplication'];

  function initPixel() {
    var id = String((C.integracoes || {}).metaPixelId || '').trim();
    if (!id) { console.info('[Pixel] metaPixelId vazio em config.js — Pixel desligado.'); return; }
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', id);
    window.fbq('track', 'PageView');
    pixelOn = true;
  }

  function track(evento, params, eventId) {
    if (!pixelOn || !window.fbq) { console.info('[Pixel] (desligado)', evento, params || {}); return; }
    var opts = eventId ? { eventID: eventId } : {};
    var metodo = STANDARD.indexOf(evento) > -1 ? 'track' : 'trackCustom';
    window.fbq(metodo, evento, params || {}, opts);
  }

  /* ---------- Origem do visitante (UTMs) ---------- */
  var ORIGEM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'origem'];

  function storage(fn) { try { return fn(window.sessionStorage); } catch (e) { return null; } }

  function captureOrigin() {
    var params = new URLSearchParams(location.search);
    var o = storage(function (s) { return JSON.parse(s.getItem('lp_origem') || '{}'); }) || {};
    ORIGEM_KEYS.forEach(function (k) { var v = params.get(k); if (v) o[k] = v.slice(0, 300); });
    if (!o.referrer && document.referrer && document.referrer.indexOf(location.origin) !== 0) o.referrer = document.referrer.slice(0, 300);
    if (!o.entrada) o.entrada = location.pathname.split('/').pop() || 'index.html';
    storage(function (s) { s.setItem('lp_origem', JSON.stringify(o)); });
    return o;
  }

  // Botões/links com [data-wa] disparam Contact no Pixel
  function bindContact() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-wa]');
      if (a) track('Contact', { content_name: a.getAttribute('data-wa') || 'whatsapp' });
    });
  }

  function boot() {
    applyTheme();
    renderBrand();
    initPixel();
    captureOrigin();
    bindContact();
  }

  return {
    config: C, digits: digits, waNumber: waNumber, waLink: waLink, firstName: firstName,
    fill: fill, el: el, renderBrand: renderBrand, gallery: gallery, fitText: fitText, track: track, captureOrigin: captureOrigin, storage: storage, boot: boot
  };
})();
