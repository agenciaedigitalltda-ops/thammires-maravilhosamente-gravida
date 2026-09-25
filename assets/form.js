/* Motor do formulário estilo "uma pergunta por tela".
   Qual formulário carregar vem de <body data-form="...">.
   Perguntas e textos ficam em assets/config.js. */
(function () {
  'use strict';
  var LP = window.LP, C = LP.config, el = LP.el;
  var formId = document.body.getAttribute('data-form');
  var F = (C.formularios || {})[formId];
  var stage = document.getElementById('stage');
  if (!F) { stage.textContent = 'Formulário "' + formId + '" não encontrado em config.js.'; return; }

  LP.boot();
  document.title = F.boasVindas.titulo + (C.negocio.nome ? ' · ' + C.negocio.nome : '');

  /* ---------- passos ---------- */
  var steps = [{ tipo: 'welcome' },
    { id: 'nome', tipo: 'nome', titulo: F.perguntaNome, obrigatorio: true },
    { id: 'whatsapp', tipo: 'whatsapp', titulo: F.perguntaWhatsapp, ajuda: F.ajudaWhatsapp, obrigatorio: true }]
    .concat(F.perguntas.filter(function (q) { return q.tipo !== 'galeria' || fotosDe(q).length; }))
    .concat([{ tipo: 'final' }]);
  var perguntas = F.perguntas.filter(function (q) { return q.tipo !== 'galeria'; }); // o que vai para a planilha
  var totalPerguntas = steps.filter(function (s) { return s.id && s.tipo !== 'galeria'; }).length;

  // Número da pergunta na tela (a vitrine de fotos não conta)
  function numero(i) {
    return steps.slice(0, i + 1).filter(function (s) { return s.id && s.tipo !== 'galeria'; }).length;
  }

  function fotosDe(q) {
    var lista = (q.fotos && q.fotos.length ? q.fotos : (C.apresentacao || {}).fotos) || [];
    return lista.filter(Boolean).map(function (f) { return typeof f === 'string' ? { src: f, alt: '' } : f; });
  }

  /* ---------- estado (sobrevive a um recarregar da página) ---------- */
  var KEY = 'lp_form_' + formId;
  var state = LP.storage(function (s) { return JSON.parse(s.getItem(KEY) || 'null'); });
  if (!state || state.status === 'Completo') {
    state = { leadId: newId(), answers: {}, index: 0, status: '' };
  }
  function save() { LP.storage(function (s) { s.setItem(KEY, JSON.stringify(state)); }); }
  function newId() {
    var r = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).slice(2, 10);
    return 'L' + Date.now().toString(36).toUpperCase() + '-' + r.toUpperCase();
  }

  var origem = LP.captureOrigin();
  function vars() { return { nome: LP.firstName(state.answers.nome) }; }

  /* ---------- envio para o Apps Script ---------- */
  var fila = Promise.resolve();

  function payload(status) {
    return {
      lead_id: state.leadId,
      form_id: formId,
      form_nome: F.nome,
      status: status,
      nome: (state.answers.nome || '').trim(),
      whatsapp: state.answers.whatsapp || '',
      respostas: perguntas.map(function (q) {
        var v = state.answers[q.id];
        return { id: q.id, pergunta: q.coluna || LP.fill(q.titulo, { nome: '' }).replace(/,\s*\?/, '?'), resposta: Array.isArray(v) ? v.join(', ') : (v || '') };
      }),
      origem: origem,
      pagina: location.href.split('?')[0],
      enviado_em: new Date().toISOString()
    };
  }

  function send(status) {
    var url = String(C.integracoes.appsScriptUrl || '').trim();
    var body = payload(status);
    if (!url) { console.warn('[Apps Script] appsScriptUrl vazio em config.js — nada foi enviado.', body); return; }
    // Fila: garante que "Parcial" nunca chegue depois de "Completo"
    fila = fila.then(function () {
      return fetch(url, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
    }).catch(function (err) { console.error('[Apps Script] falha no envio', err); });
  }

  /* ---------- validações ---------- */
  function maskPhone(v) {
    var d = LP.digits(v).slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }

  function maskDate(v) {
    var d = LP.digits(v).slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return d.slice(0, 2) + '/' + d.slice(2);
    return d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
  }

  function validate(q, v) {
    var s = Array.isArray(v) ? v : String(v || '').trim();
    var vazio = Array.isArray(s) ? !s.length : !s;
    if (vazio) return q.obrigatorio ? (q.tipo === 'multipla' ? 'Escolha pelo menos uma opção.' : 'Esse campo é obrigatório.') : '';
    if (q.tipo === 'nome') {
      if (!/[A-Za-zÀ-ÿ]{2,}/.test(s)) return 'Digite um nome válido.';
    }
    if (q.tipo === 'whatsapp') {
      var d = LP.digits(s);
      if (d.length < 10 || d.length > 11) return 'Digite o número com DDD. Ex.: (11) 9XXXX-XXXX';
      if (+d.slice(0, 2) < 11) return 'DDD inválido.';
      if (d.length === 11 && d.charAt(2) !== '9') return 'Celular com 11 dígitos precisa começar com 9 após o DDD.';
    }
    if (q.tipo === 'data') {
      var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
      if (!m) return 'Digite a data completa: dd/mm/aaaa.';
      var dt = new Date(+m[3], m[2] - 1, +m[1]);
      if (dt.getDate() !== +m[1] || dt.getMonth() !== m[2] - 1) return 'Essa data não existe, confira o dia e o mês.';
      var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      var dias = Math.round((dt - hoje) / 864e5);
      if (q.limite === 'futura' && (dias < -7 || dias > 300)) return 'Confira a data — ela precisa ser nos próximos meses.';
      if (q.limite === 'passada' && (dias > 0 || dias < -3650)) return 'Confira a data — ela precisa ser de hoje para trás.';
    }
    if (q.tipo === 'instagram' && !/^@?[A-Za-z0-9._]{1,30}$/.test(s)) return 'Use só letras, números, ponto e _.';
    if (q.min && s.length < q.min) return 'Escreva um pouco mais.';
    return '';
  }

  function normalize(q, v) {
    if (typeof v !== 'string') return v;
    v = v.trim();
    if (q.tipo === 'instagram' && v) return '@' + v.replace(/^@+/, '');
    if (q.tipo === 'nome') {
      v = v.replace(/\s+/g, ' ');
      // "maria silva" → "Maria Silva" (só quando a pessoa digitou tudo minúsculo)
      if (v === v.toLowerCase()) v = v.replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
      return v;
    }
    return v;
  }

  /* ---------- navegação ---------- */
  var progressBar = document.getElementById('progress-bar');
  var progressText = document.getElementById('progress-text');
  var backBtn = document.getElementById('back');
  var busy = false;

  backBtn.addEventListener('click', function () { if (state.index > 1) go(state.index - 1, -1); });

  function go(i, dir) {
    if (busy) return;
    busy = true;
    state.index = i; save();
    var old = stage.querySelector('.step');
    var node = render(steps[i]);
    node.classList.add(dir < 0 ? 'enter-back' : 'enter');
    var finish = function () {
      if (old) old.remove();
      node.classList.remove('enter', 'enter-back');
      busy = false;
      var f = node.querySelector('[data-autofocus]');
      if (f && window.matchMedia('(hover: hover)').matches) f.focus({ preventScroll: true });
      else if (f && f.tagName !== 'BUTTON') f.focus({ preventScroll: true });
    };
    var mount = function () {
      stage.appendChild(node);
      void node.offsetWidth; // força o navegador a aplicar o estado inicial antes da transição
      LP.fitText(node.querySelectorAll('[data-fit]'));
      finish();
    };
    if (old) {
      old.classList.add(dir < 0 ? 'leave-back' : 'leave');
      setTimeout(mount, 220);
    } else {
      mount();
    }
    updateChrome();
  }

  function updateChrome() {
    var s = steps[state.index];
    var inQuestions = s.tipo !== 'welcome' && s.tipo !== 'final';
    var atual = numero(state.index);
    var n = s.tipo === 'final' ? totalPerguntas : (s.tipo === 'galeria' ? atual : Math.max(0, atual - 1));
    progressBar.style.width = (s.tipo === 'welcome' ? 0 : Math.round((n / totalPerguntas) * 100)) + '%';
    progressText.textContent = inQuestions && s.tipo !== 'galeria' ? atual + ' de ' + totalPerguntas : '';
    document.getElementById('topbar').classList.toggle('is-hidden', !inQuestions);
    backBtn.hidden = !(inQuestions && state.index > 1);
  }

  function next(q, valor) {
    if (q) {
      state.answers[q.id] = normalize(q, valor);
      save();
      afterAnswer(q);
    }
    go(state.index + 1, 1);
  }

  function afterAnswer(q) {
    if (q.tipo === 'whatsapp') {
      if (!state.status) {
        state.status = 'Parcial'; save();
        LP.track(C.pixel.eventoCadastro, { content_name: F.nome }, state.leadId + '-cad');
      }
      send('Parcial');
      return;
    }
    if (!state.status || q.tipo === 'galeria') return;
    var ultima = perguntas[perguntas.length - 1] === q;
    if (ultima) {
      state.status = 'Completo'; save();
      send('Completo');
      LP.track('Lead', { content_name: F.nome }, state.leadId);
    } else {
      send('Parcial'); // atualiza a mesma linha com as respostas até aqui
    }
  }

  /* ---------- renderização de cada tela ---------- */
  function render(q) {
    if (q.tipo === 'welcome') return renderWelcome();
    if (q.tipo === 'final') return renderFinal();
    if (q.tipo === 'galeria') return renderGaleria(q);

    var num = state.index;
    var err = el('p', { class: 'error', role: 'alert', 'aria-live': 'polite' });
    var body = el('div', { class: 'q-body' });
    var titleId = 'q-' + (q.id || num);
    var wrap = el('section', { class: 'step', 'aria-labelledby': titleId }, [
      el('p', { class: 'q-num', text: 'Pergunta ' + numero(num) + (q.obrigatorio ? '' : ' · opcional') }),
      el('h1', { class: 'q-title', id: titleId, text: LP.fill(q.titulo, vars()) }),
      q.ajuda ? el('p', { class: 'q-help', text: LP.fill(q.ajuda, vars()) }) : null,
      body, err
    ]);
    function showError(msg) {
      err.textContent = msg;
      wrap.classList.remove('shake'); void wrap.offsetWidth; if (msg) wrap.classList.add('shake');
    }

    if (q.tipo === 'escolha' || q.tipo === 'multipla') {
      var multi = q.tipo === 'multipla';
      var sel = multi ? [].concat(state.answers[q.id] || []) : state.answers[q.id];
      var list = el('div', { class: 'options', role: multi ? 'group' : 'radiogroup', 'aria-labelledby': titleId });
      q.opcoes.forEach(function (op, i) {
        var on = multi ? sel.indexOf(op) > -1 : sel === op;
        var b = el('button', {
          type: 'button', class: 'option' + (on ? ' is-on' : ''),
          role: multi ? 'checkbox' : 'radio', 'aria-checked': on ? 'true' : 'false',
          'data-autofocus': i === 0 ? true : null,
          onclick: function () {
            showError('');
            if (multi) {
              var k = sel.indexOf(op);
              if (k > -1) sel.splice(k, 1); else sel.push(op);
              b.classList.toggle('is-on', k === -1);
              b.setAttribute('aria-checked', k === -1 ? 'true' : 'false');
            } else {
              if (busy || list._locked) return;
              list._locked = true; // evita pular pergunta com toque duplo
              list.querySelectorAll('.option').forEach(function (o) { o.classList.remove('is-on'); o.setAttribute('aria-checked', 'false'); });
              b.classList.add('is-on', 'pulse'); b.setAttribute('aria-checked', 'true');
              setTimeout(function () { next(q, op); }, 340);
            }
          }
        }, [el('span', { class: 'key', 'aria-hidden': 'true', text: String.fromCharCode(65 + i) }), el('span', { class: 'label', text: op }),
            el('span', { class: 'check', 'aria-hidden': 'true' })]);
        list.appendChild(b);
      });
      body.appendChild(list);
      wrap._keys = function (e) {
        var i = e.key.toUpperCase().charCodeAt(0) - 65;
        if (e.key.length === 1 && i >= 0 && i < q.opcoes.length) list.children[i].click();
      };
      if (multi) {
        body.appendChild(actions(function () {
          var m = validate(q, sel); if (m) return showError(m);
          next(q, sel.slice());
        }, q));
      }
      return wrap;
    }

    // Campos de texto
    var area = q.tipo === 'textarea';
    var input = el(area ? 'textarea' : 'input', {
      class: 'field', id: 'f-' + q.id, 'aria-labelledby': titleId, 'data-autofocus': true,
      rows: area ? 3 : null,
      type: area ? null : (q.tipo === 'whatsapp' ? 'tel' : 'text'),
      inputmode: q.tipo === 'whatsapp' || q.tipo === 'data' ? 'numeric' : null,
      autocomplete: q.tipo === 'nome' ? 'name' : q.tipo === 'whatsapp' ? 'tel-national' : 'off',
      autocapitalize: q.tipo === 'nome' ? 'words' : (q.tipo === 'instagram' ? 'none' : 'sentences'),
      enterkeyhint: area ? 'enter' : 'next',
      maxlength: area ? 1000 : 120,
      placeholder: q.placeholder || (q.tipo === 'nome' ? 'Seu nome' : q.tipo === 'whatsapp' ? '(DDD) 9XXXX-XXXX' : q.tipo === 'data' ? 'dd/mm/aaaa' : 'Digite aqui…')
    });
    input.value = state.answers[q.id] || '';
    if (q.tipo === 'whatsapp') input.addEventListener('input', function () { input.value = maskPhone(input.value); });
    if (q.tipo === 'data') input.addEventListener('input', function () { input.value = maskDate(input.value); });
    input.addEventListener('input', function () { if (err.textContent) showError(''); });

    function submit() {
      var m = validate(q, input.value);
      if (m) { showError(m); input.focus(); return; }
      input.blur();
      next(q, input.value);
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (!area || e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
    });
    body.appendChild(input);
    body.appendChild(actions(submit, q, area));
    return wrap;
  }

  function actions(onOk, q, area) {
    var row = el('div', { class: 'actions' }, [
      el('button', { type: 'button', class: 'btn btn-primary', onclick: onOk }, [
        state.index === steps.length - 2 ? 'Enviar' : 'Continuar', el('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' })
      ])
    ]);
    if (!q.obrigatorio) {
      row.appendChild(el('button', { type: 'button', class: 'btn btn-ghost', text: 'Pular', onclick: function () { next(q, ''); } }));
    }
    if (window.matchMedia('(hover: hover)').matches) {
      row.appendChild(el('span', { class: 'hint', text: area ? 'Ctrl + Enter ↵' : 'ou pressione Enter ↵' }));
    }
    return row;
  }

  /* Vitrine: carrossel em "vitrine 3D" — uma foto no centro e uma de cada lado ao fundo,
     passando sozinho. Dá para arrastar ou tocar nas fotos laterais. */
  function renderGaleria(q) {
    var lista = fotosDe(q);
    var n = lista.length, i = 0, pausa = 0;
    var stage = el('div', { class: 'coverflow', role: 'region', 'aria-label': 'Fotos do trabalho' });
    var dots = el('div', { class: 'car-dots', 'aria-hidden': 'true' });
    var slides = lista.map(function (f, k) {
      var sl = el('div', { class: 'cf-slide', onclick: function () { if (k !== i) { pausa = Date.now(); ir(k); } } }, [
        el('img', { src: f.src, alt: f.alt || 'Foto ' + (k + 1), loading: k < 3 || k === n - 1 ? 'eager' : 'lazy', decoding: 'async', draggable: 'false' })
      ]);
      stage.appendChild(sl);
      dots.appendChild(el('button', { type: 'button', tabindex: '-1', onclick: function () { pausa = Date.now(); ir(k); } }));
      return sl;
    });
    function ir(k) {
      i = ((k % n) + n) % n;
      slides.forEach(function (sl, k2) {
        var d = k2 - i;
        if (d > n / 2) d -= n;           // caminho mais curto (carrossel infinito)
        if (d < -n / 2) d += n;
        sl.className = 'cf-slide ' + (d === 0 ? 'is-center' : d === -1 ? 'is-left' : d === 1 ? 'is-right' : d < 0 ? 'is-hidden-left' : 'is-hidden-right');
        sl.setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
      });
      [].forEach.call(dots.children, function (dt, k2) { dt.classList.toggle('on', k2 === i); });
    }
    // arrastar para os lados
    var x0 = null;
    stage.addEventListener('pointerdown', function (e) { x0 = e.clientX; pausa = Date.now(); });
    stage.addEventListener('pointerup', function (e) {
      if (x0 == null) return;
      var dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 35) { pausa = Date.now(); ir(i + (dx < 0 ? 1 : -1)); }
    });
    stage.addEventListener('pointercancel', function () { x0 = null; });
    ir(0);

    var node = el('section', { class: 'step step-galeria' }, [
      el('h1', { class: 'q-title', text: LP.fill(q.titulo, vars()) }),
      q.ajuda ? el('p', { class: 'q-help', text: LP.fill(q.ajuda, vars()) }) : null,
      stage,
      n > 1 ? dots : null,
      el('div', { class: 'actions' }, [
        el('button', { type: 'button', class: 'btn btn-primary btn-lg', 'data-autofocus': true, onclick: function () { next(q, ''); } },
          [q.botao || 'Continuar', el('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' })])
      ])
    ]);
    var timer = setInterval(function () {
      if (!node.isConnected) { clearInterval(timer); return; }
      if (n < 2 || Date.now() - pausa < 5000) return; // espera 5s depois que a pessoa mexe
      ir(i + 1);
    }, (q.segundos || 3) * 1000);
    return node;
  }

  function renderWelcome() {
    var bv = F.boasVindas;
    // Fotos nas laterais (como uma capa). Vazio = usa home.fotosHero; sem fotos = abertura simples.
    var laterais = ((bv.fotosLaterais && bv.fotosLaterais.length ? bv.fotosLaterais : (C.home || {}).fotosHero) || []).filter(Boolean).slice(0, 2);
    var conteudo = [
      el('div', { class: 'brand', 'data-brand': true }),
      !laterais.length && (C.apresentacao || {}).fotosNoFormulario ? LP.gallery(3, 'gallery-strip') : null,
      el('h1', { class: 'w-title', 'data-fit': true, text: bv.titulo }),
      el('p', { class: 'w-text', text: bv.texto }),
      el('div', { class: 'actions' }, [
        el('button', { type: 'button', class: 'btn btn-primary btn-lg', 'data-autofocus': true, onclick: function () {
          LP.track('ViewContent', { content_name: F.nome });
          go(1, 1);
        } }, [bv.botao, el('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' })])
      ]),
      bv.tempo ? el('p', { class: 'w-time', text: bv.tempo }) : null
    ];
    var node;
    // Foto única centralizada no topo, dissolvendo para baixo (tem prioridade sobre as laterais)
    var central = bv.fotoCentral;
    if (central) {
      if (typeof central === 'string') central = { src: central };
      node = el('section', { class: 'step step-welcome welcome-cover welcome-center' }, [
        el('img', { class: 'wc-photo wc-center', src: central.src, alt: '', fetchpriority: 'high', style: central.foco ? 'object-position:' + central.foco : null }),
        el('div', { class: 'wc-content' }, conteudo)
      ]);
    } else if (laterais.length) {
      var espelho = laterais.length === 1; // 1 foto só: repete do outro lado, espelhada
      if (espelho) laterais.push(laterais[0]);
      // cada foto pode ser "caminho.jpg" ou { src: "caminho.jpg", foco: "60% 20%" } (ponto da foto que fica sempre visível)
      laterais = laterais.map(function (f) { return typeof f === 'string' ? { src: f } : f; });
      node = el('section', { class: 'step step-welcome welcome-cover' }, [
        el('img', { class: 'wc-photo wc-left', src: laterais[0].src, alt: '', fetchpriority: 'high', style: laterais[0].foco ? 'object-position:' + laterais[0].foco : null }),
        el('img', { class: 'wc-photo wc-right' + (espelho ? ' wc-mirror' : ''), src: laterais[1].src, alt: '', style: laterais[1].foco ? 'object-position:' + laterais[1].foco : null }),
        el('div', { class: 'wc-content' }, conteudo)
      ]);
    } else {
      node = el('section', { class: 'step step-welcome' }, conteudo);
    }
    LP.renderBrand(node);
    return node;
  }

  function renderFinal() {
    var fi = F.final;
    var link = LP.waLink(C.negocio.whatsapp, LP.fill(fi.mensagemWhatsapp, { nome: (state.answers.nome || '').trim() }));
    var node = el('section', { class: 'step step-final' }, [
      el('div', { class: 'done-mark', 'aria-hidden': 'true' }),
      el('h1', { class: 'w-title', 'data-fit': true, text: LP.fill(fi.titulo, vars()) }),
      el('p', { class: 'w-text', text: fi.texto }),
      link ? el('a', { class: 'btn btn-primary btn-lg btn-wa', href: link, target: '_blank', rel: 'noopener', 'data-wa': 'final-' + formId, 'data-autofocus': true }, [fi.botao]) : null,
      (C.home || {}).ativa === false ? null : el('a', { class: 'btn btn-ghost', href: 'index.html', text: 'Voltar ao início' })
    ]);
    return node;
  }

  document.addEventListener('keydown', function (e) {
    var cur = stage.querySelector('.step');
    if (cur && cur._keys && !e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') cur._keys(e);
  });

  // Retoma de onde parou (sem pular a tela final)
  var start = steps[state.index] && steps[state.index].tipo !== 'final' ? state.index : 0;
  if (start > 2 && !state.answers.whatsapp) start = 0;
  go(start, 1);
})();
