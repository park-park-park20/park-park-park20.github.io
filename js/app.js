/* おおさか公園さがし — 一覧・地図・絞り込み・詳細表示 */
(function () {
  'use strict';

  // 区の並び（政令市のみ）。tools/build_pages.py の WARD_SLUGS と同じ順
  var WARD_ORDER = {
    osaka: ['北区', '都島区', '福島区', '此花区', '中央区', '西区', '港区', '大正区', '天王寺区', '浪速区',
      '西淀川区', '淀川区', '東淀川区', '東成区', '生野区', '旭区', '城東区', '鶴見区', '阿倍野区', '住之江区',
      '住吉区', '東住吉区', '平野区', '西成区'],
    sakai: ['堺区', '中区', '東区', '西区', '南区', '北区', '美原区']
  };
  // 市町村の並び（全国地方公共団体コード順）。tools/build_pages.py の CITY_ORDER と同じ
  var CITY_ORDER = ['osaka', 'sakai', 'kishiwada', 'toyonaka', 'ikeda', 'suita', 'izumiotsu', 'takatsuki', 'kaizuka',
    'moriguchi', 'hirakata', 'ibaraki', 'yao', 'izumisano', 'tondabayashi', 'neyagawa', 'kawachinagano', 'matsubara',
    'daito', 'izumi', 'minoh', 'mino', 'kashiwara', 'habikino', 'kadoma', 'settsu', 'takaishi', 'fujiidera',
    'higashiosaka', 'sennan', 'shijonawate', 'katano', 'osakasayama', 'hannan', 'shimamoto', 'toyono', 'nose',
    'tadaoka', 'kumatori', 'tajiri', 'misaki', 'taishi', 'kanan', 'chihayaakasaka'];
  var FACILITY_ORDER = ['playground', 'toilet', 'parking', 'pet', 'nursing_room', 'barrier_free'];
  var AD_AFTER = 6; // 一覧のこの件数の後に広告枠を入れる
  var SHOW_ADS = true; // false にすると広告をすべて隠す

  /* ---------- 広告（もしもアフィリエイト経由の楽天市場） ---------- */
  var MOSHIMO = 'a_id=5916582&p_id=54&pc_id=54&pl_id=616';
  // 商品ページは売り切れで消えることがあるので、楽天市場の検索結果にリンクする
  var SEASON_ITEMS = {
    spring: { title: '春のおでかけグッズ', items: [['お花見用レジャーシート', 'お花見 レジャーシート'], ['ピクニックバスケット', 'ピクニック バスケット'], ['子ども用の日焼け止め', '日焼け止め 子供']] },
    summer: { title: '夏の公園あそびグッズ', items: [['子ども用の虫よけ', '虫除け 子供'], ['ネッククーラー', 'ネッククーラー'], ['ワンタッチテント', 'ワンタッチテント']] },
    autumn: { title: '秋のピクニックグッズ', items: [['厚手のレジャーシート', 'レジャーシート 厚手'], ['保冷ランチバッグ', '保冷バッグ ピクニック'], ['外あそびのおもちゃ', '外遊び おもちゃ']] },
    winter: { title: '冬の公園おでかけグッズ', items: [['貼るカイロ', 'カイロ 貼る'], ['ひざ掛けブランケット', 'ブランケット 防寒 アウトドア'], ['保温できる水筒', '水筒 保温']] }
  };

  function currentSeason() {
    var m = new Date().getMonth() + 1;
    return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
  }

  function affUrl(keyword) {
    var target = 'https://search.rakuten.co.jp/search/mall/' + encodeURIComponent(keyword) + '/';
    return 'https://af.moshimo.com/af/c/click?' + MOSHIMO + '&url=' + encodeURIComponent(target);
  }

  function adLinksHtml(items) {
    return '<ul class="ad-links">' + items.map(function (it) {
      return '<li><a href="' + esc(affUrl(it[1])) + '" target="_blank" rel="nofollow sponsored noopener" referrerpolicy="no-referrer-when-downgrade">' +
        esc(it[0]) + '</a></li>';
    }).join('') + '</ul>' +
      '<img class="ad-pixel" src="https://i.moshimo.com/af/i/impression?' + esc(MOSHIMO) + '" alt="" width="1" height="1" loading="lazy">';
  }

  // 公園の設備に合わせて、詳細画面に出すグッズを選ぶ
  function detailAdItems(p) {
    var f = p.facilities || {}, items = [['レジャーシート', 'レジャーシート 厚手']];
    if (f.playground === true) items.push(['外あそびのおもちゃ', '外遊び おもちゃ']);
    if (f.pet === true) items.push(['犬の散歩バッグ', '犬 散歩バッグ']);
    items.push(['日よけテント', 'サンシェード テント']);
    var season = SEASON_ITEMS[currentSeason()].items;
    for (var i = 0; items.length < 3 && i < season.length; i++) {
      if (!items.some(function (x) { return x[1] === season[i][1]; })) items.push(season[i]);
    }
    return items.slice(0, 3);
  }

  var state = { parks: [], labels: {}, q: '', city: '', ward: '', sort: 'area', facilities: [], includeUnknown: true };
  var map, markers = {}, activeId = null, lastFocus = null, baseTitle = document.title;
  var here = null, hereMarker = null; // 現在地（この端末の中だけで使い、送信・保存しない）

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtArea(m2) {
    if (!m2) return '未確認';
    var n = m2.toLocaleString('ja-JP');
    return m2 >= 10000 ? '約' + (m2 / 10000).toFixed(1) + 'ha（' + n + '㎡）' : n + '㎡';
  }

  function status(v, key) {
    if (v === true) return { cls: 'yes', text: key === 'pet' ? '可' : 'あり', icon: '○' };
    if (v === false) return { cls: 'no', text: key === 'pet' ? '不可' : 'なし', icon: '×' };
    return { cls: 'unknown', text: '未確認', icon: '？' };
  }

  function badge(label, v, key) {
    var s = status(v, key);
    return '<span class="badge badge-' + s.cls + '" title="' + esc(label + '：' + s.text) + '">' +
      s.icon + ' ' + esc(label) + '</span>';
  }

  function hasKnown(p) {
    return FACILITY_ORDER.some(function (k) { return p.facilities[k] != null; });
  }

  // 一覧カード用：確認済みの項目を並べ、未確認はひとまとめにする
  function cardFacilitiesHtml(p) {
    var known = [], unknown = [];
    FACILITY_ORDER.forEach(function (k) {
      var label = state.labels[k] || k;
      if (p.facilities[k] == null) unknown.push(label);
      else known.push('<li>' + badge(label, p.facilities[k], k) + '</li>');
    });
    if (!known.length) {
      return '<li><span class="badge badge-unknown" title="設備：すべて未確認">？ 設備は未確認</span></li>';
    }
    if (unknown.length) {
      known.push('<li><span class="badge badge-unknown" title="' + esc('未確認：' + unknown.join('・')) + '">？ 未確認：' +
        esc(unknown.join('・')) + '</span></li>');
    }
    return known.join('');
  }

  function cityIndex(slug) { var i = CITY_ORDER.indexOf(slug); return i < 0 ? 999 : i; }
  function wardIndex(city, w) { var i = (WARD_ORDER[city] || []).indexOf(w); return i < 0 ? 99 : i; }
  function compareCity(a, b) { return cityIndex(a) - cityIndex(b) || (a < b ? -1 : a > b ? 1 : 0); }

  // 公園ページへの相対パス（トップから）
  function parkUrl(p) { return 'parks/' + p.city_slug + '/' + p.id + '/'; }
  function placeLabel(p) { return (p.city || '') + (p.ward || ''); }

  /* ---------- 検索用の正規化 ---------- */
  // 全角半角をそろえ（NFKC：半角カナ→全角、全角英数→半角）、カタカナ→ひらがな、小文字化、空白除去
  function norm(s) {
    s = String(s == null ? '' : s);
    if (s.normalize) s = s.normalize('NFKC');
    return s.replace(/[ァ-ヶ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    }).toLowerCase().replace(/[\s　]+/g, '');
  }

  function searchText(p) {
    if (p._search == null) p._search = norm(p.name) + '\n' + norm(p.kana) + '\n' + norm(p.address);
    return p._search;
  }

  /* ---------- 絞り込み ---------- */
  function matches(p) {
    if (state.city && p.city_slug !== state.city) return false;
    if (state.ward && p.ward !== state.ward) return false;
    if (state.q) {
      var q = norm(state.q);
      if (q && searchText(p).indexOf(q) < 0) return false;
    }
    for (var i = 0; i < state.facilities.length; i++) {
      var v = p.facilities[state.facilities[i]];
      if (v === false) return false;
      if (v == null && !state.includeUnknown) return false;
    }
    return true;
  }

  // 条件に「確認済みであり」が多い公園を上に
  function confirmedScore(p) {
    var n = 0;
    state.facilities.forEach(function (k) { if (p.facilities[k] === true) n++; });
    return n;
  }

  /* ---------- 現在地 ---------- */
  function distM(p) {
    if (!here || p.lat == null || p.lng == null) return Infinity;
    var r = Math.PI / 180, la1 = here.lat * r, la2 = p.lat * r;
    var dla = la2 - la1, dlo = (p.lng - here.lng) * r;
    var h = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) * Math.sin(dlo / 2);
    return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function fmtDist(m) {
    if (!isFinite(m)) return '';
    if (m < 1000) return '約' + Math.max(100, Math.round(m / 100) * 100) + 'm';
    return '約' + (m < 10000 ? (Math.round(m / 100) / 10).toFixed(1) : Math.round(m / 1000)) + 'km';
  }

  function nearStatus(msg) { $('near-status').textContent = msg; }

  function onHere(pos) {
    var btn = $('near-btn');
    btn.removeAttribute('aria-busy');
    here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    // 市区の絞り込みを外して、近い順に並べる
    state.city = ''; $('city').value = '';
    $('city').dispatchEvent(new Event('change'));
    $('sort-near').disabled = false;
    state.sort = 'near'; $('sort').value = 'near';
    render();

    var list = filtered();
    var nearest = list.length ? distM(list[0]) : Infinity;
    nearStatus(nearest > 30000 ?
      '現在地から近い順に並べました（いちばん近い公園まで' + fmtDist(nearest) + '。大阪府の外にいるようです）' :
      '現在地から近い順に並べました。');

    if (map && window.L) {
      if (hereMarker) map.removeLayer(hereMarker);
      hereMarker = L.circleMarker([here.lat, here.lng], {
        radius: 8, color: '#ffffff', weight: 3, fillColor: '#2b6cd4', fillOpacity: 1
      }).addTo(map).bindTooltip('現在地');
      var pts = [[here.lat, here.lng]];
      list.slice(0, 5).forEach(function (p) { if (isFinite(distM(p))) pts.push([p.lat, p.lng]); });
      if (nearest <= 30000) map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
    }
    var first = document.querySelector('.park-card');
    if (first && window.innerWidth < 1000 && first.scrollIntoView) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onHereError(err) {
    $('near-btn').removeAttribute('aria-busy');
    nearStatus(err && err.code === 1 ?
      '位置情報の利用が許可されていません。ブラウザの設定でこのサイトの位置情報を「許可」にしてください。' :
      '現在地を取得できませんでした。電波のよい場所でもう一度お試しください。');
  }

  function findHere() {
    var btn = $('near-btn');
    if (btn.getAttribute('aria-busy') === 'true') return;
    btn.setAttribute('aria-busy', 'true');
    nearStatus('現在地を確認しています…');
    navigator.geolocation.getCurrentPosition(onHere, onHereError,
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  }

  function filtered() {
    var list = state.parks.filter(matches);
    list.sort(function (a, b) {
      if (state.sort === 'near' && here) return distM(a) - distM(b);
      var d = confirmedScore(b) - confirmedScore(a);
      if (d) return d;
      if (state.sort === 'ward') {
        d = compareCity(a.city_slug, b.city_slug) || wardIndex(a.city_slug, a.ward) - wardIndex(b.city_slug, b.ward);
        if (d) return d;
      }
      return (b.area_m2 || 0) - (a.area_m2 || 0);
    });
    return list;
  }

  /* ---------- 描画 ---------- */
  function adSlotHtml() {
    if (!SHOW_ADS) return '';
    var s = SEASON_ITEMS[currentSeason()];
    return '<li class="ad-slot" aria-label="広告">' +
      '<span class="ad-label">PR</span>' +
      '<p class="ad-title">' + esc(s.title) + '（楽天市場）</p>' +
      adLinksHtml(s.items) +
      '</li>';
  }

  function cardHtml(p) {
    var checked = hasKnown(p) && p.checked_at ?
      '<span class="checked-mini">設備確認 ' + esc(p.checked_at) + '</span>' : '';
    return '<li class="park-card' + (p.id === activeId ? ' is-active' : '') + '" data-id="' + esc(p.id) + '">' +
      '<h3><a href="' + esc(parkUrl(p)) + '" data-open="' + esc(p.id) + '">' + esc(p.name) + '</a></h3>' +
      '<p class="meta">' + (here && isFinite(distM(p)) ? '<span class="dist">' + esc(fmtDist(distM(p))) + '</span>' : '') +
      '<span class="tag">' + esc(placeLabel(p) || '所在地不明') + '</span>' +
      esc(p.area_m2 ? fmtArea(p.area_m2) : '面積 未確認') + checked + '</p>' +
      '<ul class="fac-mini" aria-label="設備">' + cardFacilitiesHtml(p) + '</ul>' +
      '<div class="card-actions">' +
      '<button type="button" class="btn" data-open="' + esc(p.id) + '">詳しく見る</button>' +
      '<button type="button" class="btn btn-ghost" data-locate="' + esc(p.id) + '">地図で見る</button>' +
      '</div></li>';
  }

  function render() {
    var list = filtered();
    var html = '';
    list.forEach(function (p, i) {
      html += cardHtml(p);
      if (i + 1 === AD_AFTER && list.length > AD_AFTER) html += adSlotHtml();
    });
    if (list.length && list.length <= AD_AFTER) html += adSlotHtml();
    $('park-list').innerHTML = html;
    $('empty').hidden = list.length > 0;
    $('result-count').textContent = list.length + '件の公園（全' + state.parks.length + '件中）';

    var knownCount = state.parks.filter(hasKnown).length;
    var noticeText = $('unknown-notice-text');
    if (noticeText) noticeText.textContent = knownCount ?
      '設備情報は、確認できた公園から順に載せています（' + knownCount + '／' + state.parks.length +
      '件）。「未確認」は、設備が無いという意味ではありません。' :
      '設備情報は現在確認中のため、すべて「未確認」と表示しています。';

    // 地図のマーカー
    var visible = {};
    list.forEach(function (p) { visible[p.id] = true; });
    Object.keys(markers).forEach(function (id) {
      var m = markers[id];
      if (visible[id]) { if (!map.hasLayer(m)) m.addTo(map); }
      else if (map.hasLayer(m)) map.removeLayer(m);
    });
  }

  /* ---------- 地図 ---------- */
  function initMap() {
    map = L.map('map', { scrollWheelZoom: false, tap: true }).setView([34.67, 135.50], 11);
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
      minZoom: 5, maxZoom: 18
    }).addTo(map);
    map.on('focus', function () { map.scrollWheelZoom.enable(); });
    map.on('blur', function () { map.scrollWheelZoom.disable(); });

    var bounds = [];
    state.parks.forEach(function (p) {
      if (p.lat == null || p.lng == null) return;
      var m = L.circleMarker([p.lat, p.lng], {
        radius: p.area_m2 && p.area_m2 >= 100000 ? 10 : 8,
        color: '#ffffff', weight: 2, fillColor: '#3f8f52', fillOpacity: .9
      });
      m.bindPopup(
        '<span class="popup-name">' + esc(p.name) + '</span>' +
        '<span class="popup-ward">' + esc(placeLabel(p)) + '</span>' +
        '<button type="button" class="popup-btn" data-open="' + esc(p.id) + '">詳しく見る</button>'
      );
      m.baseRadius = m.getRadius();
      m.on('click', function () { setActive(p.id, false); });
      markers[p.id] = m;
      bounds.push([p.lat, p.lng]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
  }

  function setActive(id, scrollCard) {
    activeId = id;
    Object.keys(markers).forEach(function (k) {
      var m = markers[k];
      m.setStyle({ fillColor: k === id ? '#e0803a' : '#3f8f52' });
      m.setRadius(k === id ? 12 : m.baseRadius);
    });
    var cards = document.querySelectorAll('.park-card');
    for (var i = 0; i < cards.length; i++) {
      var on = cards[i].getAttribute('data-id') === id;
      cards[i].classList.toggle('is-active', on);
      if (on && scrollCard && cards[i].scrollIntoView) cards[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function locate(id) {
    var p = byId(id), m = markers[id];
    if (!p || !m) return;
    setActive(id, false);
    if (!map.hasLayer(m)) m.addTo(map);
    map.setView([p.lat, p.lng], 15);
    m.openPopup();
    var el = $('map');
    if (el.getBoundingClientRect().top < 0 || window.innerWidth < 1000) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function byId(id) {
    for (var i = 0; i < state.parks.length; i++) if (state.parks[i].id === id) return state.parks[i];
    return null;
  }

  /* ---------- 詳細モーダル ---------- */
  function detailHtml(p) {
    var facRows = FACILITY_ORDER.map(function (k) {
      var v = p.facilities[k], s = status(v, k);
      var note = (p.facility_notes && p.facility_notes[k]) || (v == null ? 'まだ確認できていません' : '');
      return '<tr><th scope="row">' + esc(state.labels[k] || k) + '</th>' +
        '<td><span class="badge badge-' + s.cls + '">' + s.icon + ' ' + s.text + '</span></td>' +
        '<td>' + esc(note) + '</td></tr>';
    }).join('');
    var src = (p.source && p.source.datasets || []).map(function (d) {
      return '<li><a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.name) + '</a>（' + esc(d.license) + '）</li>';
    }).join('');
    var gsi = 'https://maps.gsi.go.jp/#16/' + p.lat + '/' + p.lng + '/';
    return '<div class="detail">' +
      '<h2 id="modal-title">' + esc(p.name) + '</h2>' +
      (p.kana ? '<p class="kana">' + esc(p.kana) + '</p>' : '') +
      '<h3>基本情報</h3>' +
      '<table class="info-table"><tbody>' +
      '<tr><th scope="row">所在地</th><td>' + esc(placeLabel(p) || '未確認') + '</td></tr>' +
      '<tr><th scope="row">住所</th><td>' + esc(p.address || '未確認') + '</td></tr>' +
      '<tr><th scope="row">面積</th><td>' + esc(fmtArea(p.area_m2)) +
      (p.area_note ? '<br><small>' + esc(p.area_note) + '</small>' : '') + '</td></tr>' +
      '<tr><th scope="row">種別</th><td>' + esc(p.park_type || '未確認') + '</td></tr>' +
      '</tbody></table>' +
      '<h3>設備</h3>' +
      '<table class="info-table fac-table"><tbody>' + facRows + '</tbody></table>' +
      '<p class="checked">設備の確認日：<strong>' + esc(p.checked_at || '未確認') + '</strong>' +
      (p.check_method ? '（確認方法：' + esc(p.check_method) + '）' : '') +
      '<br><small>「未確認」は、設備が無いという意味ではありません。お出かけ前に公式情報をご確認ください。</small></p>' +
      (SHOW_ADS ? '<div class="ad-slot" style="margin-top:16px" aria-label="広告"><span class="ad-label">広告</span>' +
      '<p class="ad-title">この公園へのおでかけにあると便利（楽天市場）</p>' +
      adLinksHtml(detailAdItems(p)) + '</div>' : '') +
      '<h3>この情報の出典</h3>' +
      '<div class="source-box">基本情報（名称・住所・位置・面積・種別）は、次のオープンデータを加工して作成しました（' +
      esc(p.source && p.source.retrieved_at) + ' 取得）。<ul>' + src + '</ul>' +
      '加工内容：' + esc(p.source && p.source.processing) +
      '<br>設備情報は、運営者が独自に確認したものです（' +
      (hasKnown(p) ? '確認日・確認方法は「設備」欄に記載' : 'この公園は未確認') + '）。</div>' +
      '<div class="detail-actions">' +
      '<a class="btn" href="' + esc(parkUrl(p)) + '">この公園のページを開く</a>' +
      '<button type="button" class="btn btn-ghost" data-locate="' + esc(p.id) + '" data-close>地図で見る</button>' +
      '<a class="btn btn-ghost" href="' + esc(gsi) + '" target="_blank" rel="noopener">地理院地図で開く</a>' +
      '</div></div>';
  }

  function openModal(id, push) {
    var p = byId(id);
    if (!p) return;
    lastFocus = document.activeElement;
    $('modal-body').innerHTML = detailHtml(p);
    $('modal').hidden = false;
    document.body.style.overflow = 'hidden';
    document.title = p.name + '｜おおさか公園さがし';
    setActive(id, false);
    $('modal').querySelector('.modal-panel').focus();
    if (push !== false && location.hash !== '#park=' + id) history.pushState(null, '', '#park=' + id);
  }

  function closeModal(push) {
    if ($('modal').hidden) return;
    $('modal').hidden = true;
    document.body.style.overflow = '';
    document.title = baseTitle;
    if (push !== false && location.hash) history.pushState(null, '', location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function fromHash() {
    var m = location.hash.match(/^#park=([\w-]+)$/);
    if (m) openModal(m[1], false); else closeModal(false);
  }

  /* ---------- イベント ---------- */
  function bind() {
    var chips = $('facility-chips');
    chips.innerHTML = FACILITY_ORDER.map(function (k) {
      return '<button type="button" class="chip" aria-pressed="false" data-fac="' + k + '">' + esc(state.labels[k] || k) + '</button>';
    }).join('');
    chips.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fac]');
      if (!b) return;
      var k = b.getAttribute('data-fac'), on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      state.facilities = on ? state.facilities.concat(k) : state.facilities.filter(function (x) { return x !== k; });
      render();
    });

    // 市町村 → 区 の絞り込み
    var cities = {};
    state.parks.forEach(function (p) {
      var c = cities[p.city_slug] || (cities[p.city_slug] = { name: p.city, n: 0, wards: {} });
      c.n++;
      if (p.ward) c.wards[p.ward] = (c.wards[p.ward] || 0) + 1;
    });
    Object.keys(cities).sort(compareCity).forEach(function (slug) {
      var o = document.createElement('option');
      o.value = slug; o.textContent = cities[slug].name + '（' + cities[slug].n + '）';
      $('city').appendChild(o);
    });
    function fillWards() {
      var sel = $('ward'), c = cities[state.city];
      sel.innerHTML = '<option value="">すべての区</option>';
      var names = c ? Object.keys(c.wards) : [];
      names.sort(function (a, b) { return wardIndex(state.city, a) - wardIndex(state.city, b); }).forEach(function (w) {
        var o = document.createElement('option');
        o.value = w; o.textContent = w + '（' + c.wards[w] + '）';
        sel.appendChild(o);
      });
      sel.disabled = names.length === 0;
      state.ward = '';
    }
    fillWards();

    $('q').addEventListener('input', function (e) { state.q = e.target.value.trim(); render(); });
    $('city').addEventListener('change', function (e) { state.city = e.target.value; fillWards(); render(); });
    $('ward').addEventListener('change', function (e) { state.ward = e.target.value; render(); });
    $('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
    $('include-unknown').addEventListener('change', function (e) { state.includeUnknown = e.target.checked; render(); });
    // 現在地から探す（位置情報が使える環境＝HTTPS 等のときだけ表示）
    if (navigator.geolocation && window.isSecureContext !== false) {
      $('near-row').hidden = false;
      $('near-btn').addEventListener('click', findHere);
    }

    document.addEventListener('click', function (e) {
      var loc = e.target.closest('[data-locate]');
      if (loc) {
        if (loc.hasAttribute('data-close')) closeModal();
        locate(loc.getAttribute('data-locate'));
        return;
      }
      var op = e.target.closest('[data-open]');
      if (op) {
        // 公園名のリンク：新しいタブで開く操作（Ctrl/⌘/Shift/中クリック）はそのまま公園ページへ
        if (op.tagName === 'A' && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0)) return;
        e.preventDefault();
        openModal(op.getAttribute('data-open'));
        return;
      }
      if (e.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
    window.addEventListener('popstate', fromHash);
  }

  function showError(msg) {
    $('result-count').textContent = '';
    $('empty').hidden = false;
    $('empty').textContent = msg;
  }

  function start() {
    fetch('data/parks.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        state.parks = data.parks || [];
        state.labels = data.facility_labels || {};
        bind();
        if (window.L) initMap(); else $('map').textContent = '地図を読み込めませんでした。';
        render();
        fromHash();
        document.documentElement.setAttribute('data-ready', 'true');
      })
      .catch(function (err) {
        showError('公園データを読み込めませんでした（' + err.message + '）。ローカルで見る場合は README の手順でサーバーを起動してください。');
        document.documentElement.setAttribute('data-ready', 'error');
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
