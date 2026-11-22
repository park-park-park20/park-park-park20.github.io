/* おおさか公園さがし — 公園ページの地図（tools/build_pages.py が生成するページで使う） */
(function () {
  'use strict';
  var el = document.getElementById('park-map');
  if (!el) return;
  if (!window.L) { el.textContent = '地図を読み込めませんでした。'; return; }
  var lat = parseFloat(el.getAttribute('data-lat')), lng = parseFloat(el.getAttribute('data-lng'));
  if (isNaN(lat) || isNaN(lng)) { el.textContent = '位置情報がありません。'; return; }
  var map = L.map(el, { scrollWheelZoom: false, tap: true }).setView([lat, lng], 15);
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
    minZoom: 5, maxZoom: 18
  }).addTo(map);
  map.on('focus', function () { map.scrollWheelZoom.enable(); });
  map.on('blur', function () { map.scrollWheelZoom.disable(); });
  var name = el.getAttribute('data-name') || '';
  var m = L.circleMarker([lat, lng], { radius: 11, color: '#ffffff', weight: 2, fillColor: '#e0803a', fillOpacity: .95 }).addTo(map);
  var span = document.createElement('span');
  span.className = 'popup-name';
  span.textContent = name;
  m.bindPopup(span);
})();
