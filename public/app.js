(function () {
  'use strict';

  /* ======================= tiny helpers ======================= */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var nf = new Intl.NumberFormat('en-US');
  function ago(ts) {
    var s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
    var units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (var i = 0; i < units.length; i++) if (s >= units[i][1]) {
      var n = Math.floor(s / units[i][1]);
      return n + ' ' + units[i][0] + (n > 1 ? 's' : '') + ' ago';
    }
    return 'just now';
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3600);
  }
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers['content-type'] = 'application/json'; }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
    }).catch(function () {
      return { ok: false, status: 0, data: { error: 'No connection. Check your internet and try again.' } };
    });
  }

  /* ======================= intro animation ======================= */
  var title = $('#title');
  function buildTitle() {
    title.innerHTML = '';
    var i = 0;
    ['Retired', 'Heart'].forEach(function (word) {
      var row = h('span', { class: 'row', 'aria-hidden': 'true' });
      word.split('').forEach(function (c) {
        var s = h('span', { class: 'ch', text: c });
        s.style.setProperty('--i', i++);
        row.appendChild(s);
      });
      title.appendChild(row);
    });
  }
  buildTitle();

  var tears = $('#tears');
  var glyphs = ['😢', '😭', '💧', '💔', '😞', '💧'];
  for (var k = 0; k < 16; k++) {
    var e = h('span', { text: glyphs[k % glyphs.length] });
    e.style.left = (Math.random() * 96) + '%';
    e.style.setProperty('--s', (16 + Math.random() * 16) + 'px');
    e.style.setProperty('--d', (8 + Math.random() * 8) + 's');
    e.style.setProperty('--w', (-Math.random() * 12) + 's');
    e.style.setProperty('--x', ((Math.random() - .5) * 80) + 'px');
    tears.appendChild(e);
  }

  var cv = $('#rain'), ctx = cv.getContext('2d');
  var W = 0, H = 0, drops = [], dpr = Math.min(window.devicePixelRatio || 1, 2);
  function sizeRain() {
    var r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.round(W / 9);
    drops = [];
    for (var i = 0; i < n; i++) drops.push({ x: Math.random() * W, y: Math.random() * H, l: 10 + Math.random() * 18, v: 6 + Math.random() * 7, a: .12 + Math.random() * .3 });
  }
  function rainFrame() {
    if (!W) { requestAnimationFrame(rainFrame); return; }
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      ctx.strokeStyle = 'rgba(127,155,209,' + d.a + ')';
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2, d.y + d.l); ctx.stroke();
      d.y += d.v; d.x -= .3;
      if (d.y > H) { d.y = -d.l; d.x = Math.random() * W; }
    }
    if (!reduce && document.body.dataset.view !== 'story') requestAnimationFrame(rainFrame);
    else if (!reduce) setTimeout(function () { requestAnimationFrame(rainFrame); }, 500);
  }
  sizeRain();
  window.addEventListener('resize', sizeRain);
  requestAnimationFrame(rainFrame);

  function replay() {
    var hero = $('.hero');
    var clone = hero.cloneNode(true);
    hero.parentNode.replaceChild(clone, hero);
    title = $('#title');
    buildTitle();
    $('#replay').addEventListener('click', replay);
  }
  $('#replay').addEventListener('click', replay);

  /* ======================= app state ======================= */
  var state = { me: null, post: null, config: { langs: {}, limits: {} }, sort: 'top', lang: '', offset: 0, more: false, loading: false, gsi: false, adsLoaded: false, openStory: null };
  var PAGE = 20;

  function loadMe() {
    return api('/api/me').then(function (r) {
      if (r.ok) { state.me = r.data.user; state.post = r.data.post; state.config = r.data.config; }
    });
  }

  /* ======================= auth ======================= */
  function initGoogle() {
    var cid = state.config.googleClientId;
    if (!cid) return;
    var s = h('script', { src: 'https://accounts.google.com/gsi/client', async: '', defer: '' });
    s.onload = function () {
      window.google.accounts.id.initialize({ client_id: cid, callback: onCredential });
      state.gsi = true;
      renderAuth();
    };
    document.head.appendChild(s);
  }
  function onCredential(resp) {
    api('/api/auth/google', { method: 'POST', body: { credential: resp.credential } }).then(function (r) {
      if (r.ok) afterLogin(); else toast(r.data.error || 'Sign-in failed.');
    });
  }
  function afterLogin() {
    return loadMe().then(function () {
      renderAuth();
      var d = $('#dlg-signin'); if (d.open) d.close();
      if (state.me && !state.me.username) $('#dlg-profile').showModal();
      else toast('Signed in as ' + state.me.username);
      refreshView();
    });
  }
  function googleButton(into) {
    if (!state.gsi) return;
    into.innerHTML = '';
    window.google.accounts.id.renderButton(into, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with' });
  }
  function renderAuth() {
    var box = $('#auth');
    box.innerHTML = '';
    var tabMine = $('#tab-mine');
    tabMine.hidden = !(state.me && state.me.username);
    if (!state.me) {
      var slot = h('div');
      box.appendChild(slot);
      if (state.gsi) googleButton(slot);
      else box.appendChild(h('button', { class: 'btn small primary', type: 'button', text: 'Sign in', onclick: openSignin }));
      return;
    }
    if (!state.me.username) {
      box.appendChild(h('button', { class: 'btn small primary', type: 'button', text: 'Finish setup', onclick: function () { $('#dlg-profile').showModal(); } }));
    } else {
      box.appendChild(h('span', { class: 'who-chip' }, [state.me.username, h('small', { text: 'Age ' + state.me.age })]));
    }
    box.appendChild(h('button', { class: 'btn small', type: 'button', text: 'Log out', onclick: logout }));
  }
  function logout() {
    api('/api/auth/logout', { method: 'POST' }).then(function () {
      state.me = null; state.post = null;
      if (state.sort === 'mine') setSort('top', true);
      renderAuth(); refreshView();
      toast('Logged out');
    });
  }
  function openSignin() {
    var d = $('#dlg-signin');
    $('#signin-msg').textContent = '';
    googleButton($('#signin-google'));
    if (!state.config.googleClientId) {
      if (state.config.devAuth) $('#dev-signin').hidden = false;
      else $('#signin-msg').textContent = 'Google sign-in is not set up on this site yet.';
    }
    d.showModal();
  }
  $('#dev-go').addEventListener('click', function () {
    var name = $('#dev-name').value.trim() || 'tester';
    api('/api/auth/google', { method: 'POST', body: { credential: 'dev:' + name } }).then(function (r) {
      if (r.ok) afterLogin(); else $('#signin-msg').textContent = r.data.error || 'Failed';
    });
  });
  // Returns true when the visitor may act; otherwise opens the right dialog.
  function needMember() {
    if (!state.me) { openSignin(); return false; }
    if (!state.me.username) { $('#dlg-profile').showModal(); return false; }
    return true;
  }

  /* ======================= profile ======================= */
  $('#profile-cancel').addEventListener('click', function () { $('#dlg-profile').close(); });
  $('#profile-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var msg = $('#profile-msg'); msg.textContent = '';
    api('/api/profile', { method: 'POST', body: { username: $('#p-username').value.trim(), age: Number($('#p-age').value) } }).then(function (r) {
      if (!r.ok) { msg.textContent = r.data.error || 'Could not save.'; return; }
      $('#dlg-profile').close();
      loadMe().then(function () { renderAuth(); toast('Welcome, ' + state.me.username); refreshView(); });
    });
  });

  /* ======================= compose ======================= */
  function fillLangs() {
    var langs = state.config.langs || {};
    var f = $('#lang-filter'), c = $('#c-lang');
    Object.keys(langs).forEach(function (code) {
      f.appendChild(h('option', { value: code, text: langs[code] }));
      c.appendChild(h('option', { value: code, text: langs[code] }));
    });
    c.insertBefore(h('option', { value: '', text: 'Choose a language', disabled: '', selected: '' }), c.firstChild);
  }
  $('#btn-write').addEventListener('click', function () {
    if (!needMember()) return;
    loadMe().then(function () {
      var p = state.post, note = $('#rule-note'), send = $('#compose-send');
      $('#compose-msg').textContent = '';
      if (p && !p.allowed) {
        note.textContent = 'To post story number ' + p.nth + ', your latest story needs more than ' + nf.format(p.need) + ' broken hearts. It has ' + nf.format(p.latestBreaks) + '. You can also delete an earlier story under My stories and post again.';
        send.disabled = true;
      } else {
        note.textContent = p && p.active ? 'This will be story number ' + p.nth + '.' : 'Your first story. Take your time.';
        send.disabled = false;
      }
      $('#dlg-compose').showModal();
    });
  });
  $('#compose-cancel').addEventListener('click', function () { $('#dlg-compose').close(); });
  $('#c-body').addEventListener('input', function () { $('#c-count').textContent = this.value.length + ' / 5000'; });
  $('#compose-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var msg = $('#compose-msg'); msg.textContent = '';
    api('/api/stories', { method: 'POST', body: { lang: $('#c-lang').value, body: $('#c-body').value } }).then(function (r) {
      if (!r.ok) { msg.textContent = r.data.error || 'Could not post.'; return; }
      $('#c-body').value = ''; $('#c-count').textContent = '0 / 5000';
      $('#dlg-compose').close();
      toast('Your story is live.');
      loadMe().then(function () { setSort('new', true); location.hash = '#/'; document.getElementById('feed').scrollIntoView(); });
    });
  });

  /* ======================= cards ======================= */
  var BREAK_SVG = '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21 C4 15 1 11 1 7 C1 3.5 3.5 1 6.8 1 C9 1 11 2.2 12 4 L10 8 L14 11 L11 15 L13 18 Z M13.5 18 L15.5 14 L12.5 11 L15 7.5 L13 4 C14 2.2 16 1 17.2 1 C20.5 1 23 3.5 23 7 C23 11 20 15 13.5 21 Z" fill="#e5304f"/></svg>';

  function armed(btn, labelNow, labelArmed, action) {
    var t;
    btn.addEventListener('click', function () {
      if (btn.classList.contains('armed')) { clearTimeout(t); btn.classList.remove('armed'); btn.textContent = labelNow; action(btn); return; }
      btn.classList.add('armed'); btn.textContent = labelArmed;
      t = setTimeout(function () { btn.classList.remove('armed'); btn.textContent = labelNow; }, 4000);
    });
  }

  // kind: 'story' | 'reply'
  function buildCard(item, kind, opts) {
    opts = opts || {};
    var langs = state.config.langs || {};
    var meta = h('div', { class: 'meta' }, [
      h('span', { class: 'who', text: item.username }),
      h('span', { class: 'pill', text: 'Age ' + item.age })
    ]);
    if (kind === 'story') meta.appendChild(h('span', { class: 'pill', text: langs[item.lang] || item.lang }));
    if (opts.rank) meta.appendChild(h('span', { class: 'rank', text: opts.rank }));
    meta.appendChild(h('span', { class: 'time', text: ago(item.created_at) }));

    var body = h('p', { class: 'body' + (opts.clamp ? ' clamp' : ''), text: item.body, dir: 'auto' });

    var count = h('span', { class: 'count', text: nf.format(item.breaks), 'aria-live': 'polite' });
    var btn = h('button', { class: 'break-btn' + (item.own ? ' own' : ''), type: 'button', 'aria-pressed': item.mine ? 'true' : 'false', title: item.own ? 'You cannot break a heart on your own post' : 'Break a heart' });
    btn.innerHTML = BREAK_SVG;
    var label = h('span', { text: item.mine ? 'Heart broken' : 'Break a heart' });
    btn.appendChild(label);
    btn.addEventListener('click', function () {
      if (item.own) { toast('You cannot break a heart on your own post.'); return; }
      if (!needMember()) return;
      api('/api/' + (kind === 'story' ? 'stories' : 'replies') + '/' + item.id + '/break', { method: 'POST' }).then(function (r) {
        if (!r.ok) { toast(r.data.error || 'Could not save.'); return; }
        item.breaks = r.data.breaks; item.mine = r.data.mine;
        count.textContent = nf.format(item.breaks);
        btn.setAttribute('aria-pressed', item.mine ? 'true' : 'false');
        label.textContent = item.mine ? 'Heart broken' : 'Break a heart';
      });
    });

    var foot = h('div', { class: 'foot' }, [btn, count]);
    if (kind === 'story') {
      foot.appendChild(h('a', { class: 'link', href: '#/story/' + item.id, text: nf.format(item.replies) + (item.replies === 1 ? ' reply' : ' replies') }));
    }
    var end = h('div', { class: 'end' });
    if (item.own) {
      var del = h('button', { class: 'link danger', type: 'button', text: 'Delete' });
      armed(del, 'Delete', 'Tap again to delete', function () {
        api('/api/' + (kind === 'story' ? 'stories' : 'replies') + '/' + item.id, { method: 'DELETE' }).then(function (r) {
          if (!r.ok) { toast(r.data.error || 'Could not delete.'); return; }
          toast('Deleted');
          loadMe().then(function () {
            if (kind === 'story' && state.openStory === item.id) location.hash = '#/';
            refreshView();
          });
        });
      });
      end.appendChild(del);
    } else {
      var rep = h('button', { class: 'link', type: 'button', text: 'Report' });
      armed(rep, 'Report', 'Tap again to report', function (b) {
        if (!needMember()) return;
        api('/api/report', { method: 'POST', body: { kind: kind, id: item.id, reason: 'reported' } }).then(function (r) {
          if (r.ok) { b.textContent = 'Reported'; b.disabled = true; toast('Thank you. We will review it.'); }
          else toast(r.data.error || 'Could not report.');
        });
      });
      end.appendChild(rep);
    }
    foot.appendChild(end);

    var kids = [meta, body];
    if (opts.clamp) kids.push(h('a', { class: 'open', href: '#/story/' + item.id, text: 'Read the full story and replies' }));
    kids.push(foot);
    return h('article', { class: 'card' + (kind === 'reply' ? ' reply-card' : '') }, kids);
  }

  /* ======================= ads ======================= */
  function adsAllowed() {
    var c = null; try { c = localStorage.getItem('rh_consent'); } catch (e) {}
    return c === 'yes' && !!state.config.adsenseClient && !!state.config.adsenseSlot;
  }
  function loadAdScript() {
    if (state.adsLoaded) return;
    state.adsLoaded = true;
    var s = h('script', { async: '', crossorigin: 'anonymous', src: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(state.config.adsenseClient) });
    document.head.appendChild(s);
  }
  function adSlot() {
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', state.config.adsenseClient);
    ins.setAttribute('data-ad-slot', state.config.adsenseSlot);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    return h('div', { class: 'ad', 'aria-label': 'Advertisement' }, [h('small', { text: 'Advertisement' }), ins]);
  }
  function pushAds(root) {
    if (!adsAllowed()) return;
    loadAdScript();
    root.querySelectorAll('ins.adsbygoogle:not([data-done])').forEach(function (ins) {
      ins.setAttribute('data-done', '1');
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    });
  }
  function initConsent() {
    if (!state.config.adsenseClient) return;
    var c = null; try { c = localStorage.getItem('rh_consent'); } catch (e) {}
    var bar = $('#consent');
    if (c === null) bar.hidden = false;
    function set(v) { try { localStorage.setItem('rh_consent', v); } catch (e) {} bar.hidden = true; if (v === 'yes') { refreshView(); } }
    $('#consent-yes').addEventListener('click', function () { set('yes'); });
    $('#consent-no').addEventListener('click', function () { set('no'); });
  }

  /* ======================= feed ======================= */
  function setSort(s, silent) {
    state.sort = s;
    document.querySelectorAll('.tab').forEach(function (t) { t.setAttribute('aria-selected', t.dataset.sort === s ? 'true' : 'false'); });
    $('#feed-title').textContent = s === 'new' ? 'Newest stories' : s === 'mine' ? 'My stories' : 'Most heartbreaking';
    if (!silent) loadFeed(true);
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { setSort(t.dataset.sort); });
  });
  $('#lang-filter').addEventListener('change', function () { state.lang = this.value; loadFeed(true); });
  $('#btn-more').addEventListener('click', function () { loadFeed(false); });

  function loadFeed(reset) {
    if (state.loading) return;
    state.loading = true;
    if (reset) { state.offset = 0; }
    var list = $('#list');
    var qs = 'sort=' + (state.sort === 'top' ? 'top' : 'new') + '&lang=' + encodeURIComponent(state.lang) + '&offset=' + state.offset + '&limit=' + PAGE + (state.sort === 'mine' ? '&mine=1' : '');
    return api('/api/stories?' + qs).then(function (r) {
      state.loading = false;
      if (!r.ok) { toast(r.data.error || 'Could not load stories.'); return; }
      if (reset) list.innerHTML = '';
      var base = state.offset;
      r.data.items.forEach(function (it, i) {
        var rank = state.sort === 'top' && base + i === 0 ? 'Most broken' : '';
        list.appendChild(buildCard(it, 'story', { clamp: true, rank: rank }));
        if ((base + i + 1) % 5 === 0 && adsAllowed()) list.appendChild(adSlot());
      });
      state.offset += r.data.items.length;
      state.more = r.data.more;
      $('#btn-more').hidden = !state.more;
      $('#empty').hidden = list.children.length > 0;
      pushAds(list);
    });
  }

  /* ======================= story view ======================= */
  function showStory(id) {
    state.openStory = id;
    document.body.dataset.view = 'story';
    var card = $('#story-card'); card.innerHTML = '';
    $('#replies').innerHTML = '';
    $('#no-replies').hidden = true;
    $('#reply-msg').textContent = '';
    window.scrollTo(0, 0);
    api('/api/stories/' + id).then(function (r) {
      if (!r.ok) { card.appendChild(h('p', { class: 'empty', text: r.data.error || 'This story is not available.' })); return; }
      card.appendChild(buildCard(r.data.story, 'story'));
      document.title = r.data.story.username + ' · Retired Heart';
      loadReplies(id);
    });
  }
  function loadReplies(id) {
    api('/api/stories/' + id + '/replies').then(function (r) {
      var box = $('#replies'); box.innerHTML = '';
      if (!r.ok) return;
      $('#replies-title').textContent = r.data.items.length === 1 ? '1 reply' : r.data.items.length + ' replies';
      $('#no-replies').hidden = r.data.items.length > 0;
      r.data.items.forEach(function (it, i) {
        box.appendChild(buildCard(it, 'reply', { rank: i === 0 && it.breaks > 0 ? 'Most broken reply' : '' }));
        if (i === 2 && adsAllowed()) box.appendChild(adSlot());
      });
      pushAds(box);
    });
  }
  $('#reply-text').addEventListener('input', function () { $('#reply-count').textContent = this.value.length + ' / 1500'; });
  $('#reply-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!needMember()) return;
    var msg = $('#reply-msg'); msg.textContent = '';
    api('/api/stories/' + state.openStory + '/replies', { method: 'POST', body: { body: $('#reply-text').value } }).then(function (r) {
      if (!r.ok) { msg.textContent = r.data.error || 'Could not reply.'; return; }
      $('#reply-text').value = ''; $('#reply-count').textContent = '0 / 1500';
      toast('Reply posted');
      loadReplies(state.openStory);
    });
  });

  /* ======================= routing ======================= */
  function refreshView() {
    if (document.body.dataset.view === 'story' && state.openStory) showStoryKeepScroll(state.openStory);
    else loadFeed(true);
  }
  function showStoryKeepScroll(id) {
    var y = window.scrollY;
    showStory(id);
    setTimeout(function () { window.scrollTo(0, y); }, 300);
  }
  function route() {
    var m = /^#\/story\/(\d+)$/.exec(location.hash);
    if (m) { showStory(Number(m[1])); return; }
    document.title = 'Retired Heart';
    var wasStory = document.body.dataset.view === 'story';
    document.body.dataset.view = 'feed';
    state.openStory = null;
    if (wasStory) loadFeed(true);
    if (location.hash === '#how') setTimeout(function () { document.getElementById('how').scrollIntoView(); }, 0);
  }
  window.addEventListener('hashchange', route);

  /* ======================= start ======================= */
  loadMe().then(function () {
    fillLangs();
    renderAuth();
    initGoogle();
    initConsent();
    route();
    if (document.body.dataset.view === 'feed') loadFeed(true);
  });
})();
