// app.js — Greek Islands Anchorage Forecast
// Pulls forecast from Open-Meteo (no API key), embeds Windy iframe,
// scores shelter per bay using wind+gusts+wave+direction.
// AIS Stream WebSocket (optional) gives live vessel counts per bay.

const STATE = {
  islandKey: localStorage.getItem('island') || 'mykonos',
  forecast: null,      // daily forecast for the island
  marine: null,        // daily marine forecast
  tides: null,         // hourly sea-level series
  favorites: JSON.parse(localStorage.getItem('favorites') || '[]'), // [{island, name}]
  vessels: new Map(),  // MMSI → {lat, lon, name, type, lastSeen, course, speed}
  aisSocket: null,     // current WebSocket
  aisStatus: 'idle',   // idle | connecting | streaming | error | disabled
};

// ─── AIS Stream (live vessel counts) ──────────────────────────────────────

// Compute a bounding box (south, west, north, east) covering an island
// out to ~15 km from its centre — enough to include all anchorages.
function islandBbox([lat, lon]) {
  const dLat = 0.15;            // ~16 km
  const dLon = 0.18 / Math.cos(lat * Math.PI / 180);  // ~16 km at given lat
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
}

// Haversine in metres for the AIS distance check.
function distanceMetres(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Map AIS ship-type integer codes to a coarse human label.
// https://api.vtexplorer.com/docs/ref-aistypes.html
function shipTypeLabel(code) {
  if (code == null) return 'кораб';
  const c = +code;
  if (c >= 60 && c <= 69) return 'пътнически/ферибот';
  if (c >= 70 && c <= 79) return 'товарен';
  if (c >= 80 && c <= 89) return 'танкер';
  if (c === 30) return 'риболовен';
  if (c === 36 || c === 37) return 'яхта';
  if (c >= 40 && c <= 49) return 'високоскоростен';
  if (c === 50) return 'пилотен';
  if (c === 51) return 'спасителен';
  if (c === 52) return 'влекач';
  if (c === 55) return 'полицейски';
  return 'кораб';
}

function disconnectAis() {
  if (STATE.aisSocket) {
    try { STATE.aisSocket.close(); } catch (_) {}
    STATE.aisSocket = null;
  }
}

function connectAisForIsland(islandKey) {
  disconnectAis();
  STATE.vessels.clear();

  if (!AIS_API_KEY) {
    STATE.aisStatus = 'disabled';
    renderBays();  // re-render to show "AIS off" state
    return;
  }

  const isl = ISLANDS[islandKey];
  const bbox = islandBbox(isl.center);  // [s, w, n, e]
  STATE.aisStatus = 'connecting';

  let ws;
  try {
    ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
  } catch (e) {
    STATE.aisStatus = 'error';
    return;
  }
  STATE.aisSocket = ws;

  ws.onopen = () => {
    // Subscribe to all position-related messages in our bbox.
    // AISStream expects bbox as [[[lat_min, lon_min], [lat_max, lon_max]]].
    const sub = {
      APIKey: AIS_API_KEY,
      BoundingBoxes: [[[bbox[0], bbox[1]], [bbox[2], bbox[3]]]],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData']
    };
    ws.send(JSON.stringify(sub));
    STATE.aisStatus = 'streaming';
    renderBays();
  };

  ws.onmessage = ev => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (_) { return; }
    const meta = msg.MetaData || {};
    const mmsi = meta.MMSI;
    if (!mmsi) return;

    const existing = STATE.vessels.get(mmsi) || {};
    const updated = { ...existing, lastSeen: Date.now() };

    if (msg.MessageType === 'PositionReport' && msg.Message?.PositionReport) {
      const p = msg.Message.PositionReport;
      updated.lat = p.Latitude;
      updated.lon = p.Longitude;
      updated.speed = p.Sog;
      updated.course = p.Cog;
      updated.name = updated.name || (meta.ShipName || '').trim();
    } else if (msg.MessageType === 'ShipStaticData' && msg.Message?.ShipStaticData) {
      const s = msg.Message.ShipStaticData;
      updated.type = s.Type;
      updated.name = (s.Name || meta.ShipName || updated.name || '').trim();
    } else {
      return;
    }
    STATE.vessels.set(mmsi, updated);
  };

  ws.onerror = () => { STATE.aisStatus = 'error'; renderBays(); };
  ws.onclose = () => {
    if (STATE.aisStatus === 'streaming') STATE.aisStatus = 'idle';
  };

  // Re-render bays every 15 seconds to refresh counts and "last seen" labels.
  if (window._aisTimer) clearInterval(window._aisTimer);
  window._aisTimer = setInterval(() => {
    if (STATE.aisStatus === 'streaming' || STATE.aisStatus === 'connecting') {
      renderBays();
    }
  }, 15000);
}

// Count vessels currently within a bay's radius and last seen recently.
function vesselsAtBay(bay) {
  if (STATE.aisStatus === 'disabled') return null;
  const radius = bay.radius_m || AIS_DEFAULT_RADIUS_M;
  const cutoff = Date.now() - AIS_FRESHNESS_MINUTES * 60 * 1000;
  let count = 0;
  let mostRecent = 0;
  const types = {};
  for (const v of STATE.vessels.values()) {
    if (v.lat == null || v.lon == null) continue;
    if (v.lastSeen < cutoff) continue;
    const d = distanceMetres(bay.lat, bay.lng, v.lat, v.lon);
    if (d > radius) continue;
    count++;
    if (v.lastSeen > mostRecent) mostRecent = v.lastSeen;
    const t = shipTypeLabel(v.type);
    types[t] = (types[t] || 0) + 1;
  }
  return { count, mostRecent, types };
}

// Format "last seen 2 min ago" / "just now" / etc.
function formatAgo(ts) {
  if (!ts) return null;
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 30) return 'току-що';
  if (sec < 90) return 'преди 1 мин';
  if (sec < 3600) return `преди ${Math.round(sec/60)} мин`;
  return `преди ${Math.round(sec/3600)} ч`;
}

// Build the small inline string shown next to a bay row.
function vesselBadgeHtml(bay) {
  const v = vesselsAtBay(bay);
  if (v == null) return ''; // AIS disabled — show nothing

  if (STATE.aisStatus === 'connecting') {
    return `<div class="ais-badge ais-pending">🛥 сканиране…</div>`;
  }
  if (STATE.aisStatus === 'error') {
    return `<div class="ais-badge ais-err">🛥 AIS недостъпен</div>`;
  }
  if (v.count === 0) {
    return `<div class="ais-badge ais-empty">🛥 0 кораба</div>`;
  }
  const ago = formatAgo(v.mostRecent);
  const breakdown = Object.entries(v.types)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t, n]) => `${n} ${t}`)
    .join(', ');
  return `<div class="ais-badge ais-on" title="${breakdown}">🛥 ${v.count} · ${ago}</div>`;
}

// ─── Compass helpers ──────────────────────────────────────────────────────
function degToCompass(deg) {
  if (deg == null || isNaN(deg)) return null;
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return COMPASS[idx];
}
function compassDistance(a, b) {
  if (!a || !b || a === '-' || b === '-') return null;
  const ia = COMPASS.indexOf(a), ib = COMPASS.indexOf(b);
  if (ia < 0 || ib < 0) return null;
  let d = Math.abs(ia - ib);
  return d > 4 ? 8 - d : d;
}

// Bulgarian compass labels
const COMPASS_BG = { N: 'С', NE: 'СИ', E: 'И', SE: 'ЮИ', S: 'Ю', SW: 'ЮЗ', W: 'З', NW: 'СЗ' };
function compassBG(c) { return COMPASS_BG[c] || c || ''; }

// ─── Shelter scoring ──────────────────────────────────────────────────────
// 0 = exposed, 1 = marginal, 2 = sheltered, 3 = excellent, null = N/A
function shelterScore(bay, windDir, windKn, gustKn, waveM) {
  if (bay.status === 'restricted' || bay.opens === '-' || bay.opens === 'various') return null;
  if (windDir == null) return null;

  const dirDist = compassDistance(bay.opens, windDir);  // 0–4
  if (dirDist == null) return null;

  // Base directional score (0 = wind blows in, 4 = wind from opposite)
  let score;
  if (dirDist === 0) score = 0;
  else if (dirDist === 1) score = 1;
  else if (dirDist <= 3) score = 2;
  else score = 3;

  // Penalty for very strong gusts (apply even with good direction)
  if (gustKn > 35) score -= 1;
  else if (gustKn > 28) score -= 0.5;

  // Penalty for big waves (open-sea forecast — actual swell in protected bays
  // is usually less, but worth flagging)
  if (waveM > 2.0) score -= 1.5;
  else if (waveM > 1.5) score -= 1;
  else if (waveM > 1.0) score -= 0.5;

  // Light winds always OK regardless of direction
  if (windKn < 8 && gustKn < 12) score = Math.max(score, 2);

  return Math.max(0, Math.min(3, Math.round(score)));
}
function shelterLabel(s) {
  if (s == null) return { txt: '—', cls: 's-na' };
  return [
    { txt: 'Незащитен', cls: 's-0' },
    { txt: 'Гранична',  cls: 's-1' },
    { txt: 'Защитен',   cls: 's-2' },
    { txt: 'Отлична',   cls: 's-3' }
  ][s];
}

// ─── Distance / bearing ───────────────────────────────────────────────────
function haversineNM(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // nautical miles
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function bearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ─── Open-Meteo fetch ─────────────────────────────────────────────────────
async function fetchForecast(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,` +
    `wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant` +
    `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
    `&forecast_days=4&wind_speed_unit=kn&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Прогнозата е недостъпна');
  return await r.json();
}
async function fetchMarine(lat, lon) {
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&daily=wave_height_max,wave_direction_dominant` +
    `&hourly=wave_height,sea_level_height_msl` +
    `&forecast_days=4&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Морската прогноза е недостъпна');
  return await r.json();
}

// ─── Tide extrema from sea-level series ───────────────────────────────────
function extractTides(times, levels) {
  if (!times || !levels || levels.length < 3) return [];
  const out = [];
  for (let i = 1; i < levels.length - 1; i++) {
    if (levels[i] == null || levels[i-1] == null || levels[i+1] == null) continue;
    const isHigh = levels[i] > levels[i-1] && levels[i] > levels[i+1];
    const isLow  = levels[i] < levels[i-1] && levels[i] < levels[i+1];
    if (isHigh || isLow) out.push({ time: times[i], level: levels[i], type: isHigh ? 'Прилив' : 'Отлив' });
  }
  return out;
}

// ─── Rendering ─────────────────────────────────────────────────────────────
function renderIslandSelect() {
  const sel = document.getElementById('island-select');
  const groups = {};
  Object.entries(ISLANDS).forEach(([key, isl]) => {
    (groups[isl.group] = groups[isl.group] || []).push({ key, name: isl.name });
  });
  sel.innerHTML = '';
  Object.entries(groups).forEach(([groupName, items]) => {
    const og = document.createElement('optgroup');
    og.label = groupName;
    items.forEach(({ key, name }) => {
      const opt = document.createElement('option');
      opt.value = key; opt.textContent = name;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });
  sel.value = STATE.islandKey;
  sel.addEventListener('change', () => {
    STATE.islandKey = sel.value;
    localStorage.setItem('island', sel.value);
    loadIsland();
  });
}

function renderIslandHeader() {
  const isl = ISLANDS[STATE.islandKey];
  document.getElementById('island-name').textContent = isl.name;
  document.getElementById('island-note').textContent = isl.note;
}

function renderForecastStrip() {
  const el = document.getElementById('fc-strip');
  const fc = STATE.forecast, mar = STATE.marine;
  if (!fc) { el.innerHTML = '<div class="error-banner">Прогнозата е недостъпна. Проверете връзката и презаредете.</div>'; return; }

  const cards = [];
  // Now card
  const cur = fc.current || {};
  cards.push({
    label: 'Сега',
    temp: cur.temperature_2m,
    wind: cur.wind_speed_10m,
    gust: cur.wind_gusts_10m,
    dir: degToCompass(cur.wind_direction_10m),
    wave: mar?.hourly?.wave_height?.[0],
    isNow: true
  });
  for (let i = 0; i < 3; i++) {
    const d = new Date(fc.daily.time[i]);
    cards.push({
      label: d.toLocaleDateString('bg-BG', { weekday: 'short' }),
      temp: fc.daily.temperature_2m_max[i],
      wind: fc.daily.wind_speed_10m_max[i],
      gust: fc.daily.wind_gusts_10m_max[i],
      dir: degToCompass(fc.daily.wind_direction_10m_dominant[i]),
      wave: mar?.daily?.wave_height_max?.[i],
      precip: fc.daily.precipitation_probability_max[i]
    });
  }
  el.innerHTML = cards.map(c => `
    <div class="fc-card ${c.isNow ? 'now' : ''}">
      <div class="day">${c.label}</div>
      <div class="temp">${c.temp != null ? Math.round(c.temp) + '°' : '—'}</div>
      <div class="row2">
        <strong>${c.wind != null ? Math.round(c.wind) : '—'} възли</strong> ${compassBG(c.dir)}<br>
        Пориви ${c.gust != null ? Math.round(c.gust) : '—'} възли<br>
        ${c.wave != null ? 'Вълни ' + c.wave.toFixed(1) + ' м' : ''}
        ${c.precip != null ? ' · ' + c.precip + '% дъжд' : ''}
      </div>
    </div>
  `).join('');
}

function renderWindyMap(overrideLat, overrideLon, zoom) {
  const isl = ISLANDS[STATE.islandKey];
  const [lat, lon] = (overrideLat != null && overrideLon != null)
    ? [overrideLat, overrideLon]
    : isl.center;
  const z = zoom || (overrideLat != null ? 13 : 11);
  const url = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}` +
    `&width=650&height=450&zoom=${z}&level=surface&overlay=wind&product=ecmwf` +
    `&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates` +
    `&detail=true&metricWind=knot&metricTemp=%C2%B0C&radarRange=-1`;
  document.getElementById('windy-frame').src = url;
}

// Set the title shown above the map.
function setMapTitle(text, bayName) {
  const el = document.getElementById('map-title');
  if (!el) return;
  if (bayName) {
    el.classList.add('has-bay');
    el.innerHTML = `<span><span class="pin">📍</span> ${bayName}</span>
      <button class="reset-btn" id="map-reset-btn">Цял остров</button>`;
    const rb = document.getElementById('map-reset-btn');
    if (rb) rb.addEventListener('click', resetMapToIsland);
  } else {
    el.classList.remove('has-bay');
    el.textContent = text || 'Целият остров';
  }
}

function resetMapToIsland() {
  renderWindyMap();  // no override args → island center, default zoom
  const isl = ISLANDS[STATE.islandKey];
  setMapTitle(`Целият остров — ${isl.name}`, null);
}

// Focus the embedded Windy map on a specific bay and scroll to it.
function focusBayOnMap(bay) {
  renderWindyMap(bay.lat, bay.lng, 13);
  setMapTitle(null, bay.name);
  const wrap = document.querySelector('.windy-wrap');
  if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function dayShelterFor(bay, dayIdx) {
  const fc = STATE.forecast, mar = STATE.marine;
  if (!fc) return null;
  if (dayIdx === -1) {
    const cur = fc.current || {};
    return shelterScore(bay,
      degToCompass(cur.wind_direction_10m),
      cur.wind_speed_10m, cur.wind_gusts_10m,
      mar?.hourly?.wave_height?.[0] || 0);
  }
  return shelterScore(bay,
    degToCompass(fc.daily.wind_direction_10m_dominant[dayIdx]),
    fc.daily.wind_speed_10m_max[dayIdx],
    fc.daily.wind_gusts_10m_max[dayIdx],
    mar?.daily?.wave_height_max?.[dayIdx] || 0);
}

function statusPillHtml(status) {
  const map = {
    overnight: { txt: 'Нощуване ОК',    cls: 'pill-overnight' },
    day:       { txt: 'Само ден',       cls: 'pill-day' },
    restricted:{ txt: 'Забранено',      cls: 'pill-restricted' },
    paid:      { txt: 'Платен пристан', cls: 'pill-paid' }
  };
  const m = map[status] || map.day;
  return `<span class="pill ${m.cls}">${m.txt}</span>`;
}

function isFavorite(islandKey, bayName) {
  return STATE.favorites.some(f => f.island === islandKey && f.name === bayName);
}
function toggleFavorite(islandKey, bayName) {
  const i = STATE.favorites.findIndex(f => f.island === islandKey && f.name === bayName);
  if (i >= 0) STATE.favorites.splice(i, 1);
  else STATE.favorites.push({ island: islandKey, name: bayName });
  localStorage.setItem('favorites', JSON.stringify(STATE.favorites));
  renderBays();
  renderFavorites();
}

function renderBayRow(bay, islandKey) {
  const fc = STATE.forecast;
  const dayLabels = fc ? [0, 1, 2].map(i => new Date(fc.daily.time[i]).toLocaleDateString('bg-BG', { weekday: 'short' })) : ['', '', ''];
  const cells = [0, 1, 2].map(i => {
    const s = dayShelterFor(bay, i);
    const lbl = shelterLabel(s);
    return `<div class="shelter-cell ${lbl.cls}"><span class="d">${dayLabels[i]}</span>${lbl.txt}</div>`;
  }).join('');
  const fav = isFavorite(islandKey, bay.name);
  const bayKey = `${islandKey}::${bay.name}`.replace(/[^a-zA-Z0-9_:]/g, '_');
  const gMapsUrl = `https://www.google.com/maps?q=${bay.lat},${bay.lng}`;
  return `
    <div class="bay-row" data-bay-key="${bayKey}">
      <div>
        <div class="bay-name">
          <button class="fav-btn ${fav ? 'on' : ''}" data-island="${islandKey}" data-bay="${bay.name.replace(/"/g, '&quot;')}" aria-label="Превключване на любим" title="Любим">${fav ? '★' : '☆'}</button>
          ${bay.name}
          ${statusPillHtml(bay.status)}
        </div>
        <div class="bay-note">${bay.note}</div>
      </div>
      <div class="bay-actions">
        <div class="shelter-row">${cells}</div>
        ${vesselBadgeHtml(bay)}
        <div class="btn-row">
          <button class="btn-mini btn-windy" data-lat="${bay.lat}" data-lng="${bay.lng}" data-name="${bay.name.replace(/"/g, '&quot;')}" data-island="${islandKey}">Покажи на картата ↑</button>
          <a class="btn-mini" href="${gMapsUrl}" target="_blank" rel="noopener">Карта ↗</a>
        </div>
      </div>
    </div>`;
}

function renderAisInfoBanner() {
  const el = document.getElementById('ais-info-banner');
  if (!el) return;
  if (STATE.aisStatus === 'disabled') {
    el.innerHTML = `<div class="ais-info">🛥 Броячът на кораби на живо е изключен. Добавете безплатен <a href="https://aisstream.io/authenticate" target="_blank" rel="noopener">AISStream.io</a> API ключ в <code>data.js</code> за да го активирате.</div>`;
  } else if (STATE.aisStatus === 'streaming' || STATE.aisStatus === 'connecting') {
    el.innerHTML = `<div class="ais-info">🛥 <strong>Броячът на кораби на живо</strong> показва само плавателни съдове с AIS — обикновено ферибот, мегаяхти, товарни и повечето чартърни катамарани. По-малки яхти и тендери не се виждат на AIS.</div>`;
  } else {
    el.innerHTML = '';
  }
}

function renderBays() {
  const isl = ISLANDS[STATE.islandKey];
  renderAisInfoBanner();
  const html = isl.anchorages.map(b => renderBayRow(b, STATE.islandKey)).join('');
  document.getElementById('bay-list').innerHTML = html;
  document.querySelectorAll('#bay-list .fav-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.island, btn.dataset.bay);
    });
  });
  document.querySelectorAll('#bay-list .btn-windy').forEach(btn => {
    btn.addEventListener('click', () => {
      focusBayOnMap({ lat: +btn.dataset.lat, lng: +btn.dataset.lng });
    });
  });
}

function renderFavorites() {
  const wrap = document.getElementById('fav-section');
  const list = document.getElementById('fav-list');
  if (STATE.favorites.length === 0) {
    wrap.classList.remove('has-favs');
    list.innerHTML = '';
    return;
  }
  wrap.classList.add('has-favs');
  // For favourites we render rows but only show shelter for the currently
  // loaded island's data — bays from other islands show '—' for shelter.
  const html = STATE.favorites.map(({ island, name }) => {
    const isl = ISLANDS[island];
    if (!isl) return '';
    const bay = isl.anchorages.find(b => b.name === name);
    if (!bay) return '';
    const sameIsland = (island === STATE.islandKey);
    const cells = [0, 1, 2].map(i => {
      if (!sameIsland) return `<div class="shelter-cell s-na">—</div>`;
      const s = dayShelterFor(bay, i);
      const lbl = shelterLabel(s);
      const dayLabel = STATE.forecast ? new Date(STATE.forecast.daily.time[i]).toLocaleDateString('bg-BG', { weekday: 'short' }) : '';
      return `<div class="shelter-cell ${lbl.cls}"><span class="d">${dayLabel}</span>${lbl.txt}</div>`;
    }).join('');
    const bayKey = `${island}::${name}`.replace(/[^a-zA-Z0-9_:]/g, '_');
    const showOnMapBtn = sameIsland
      ? `<button class="btn-mini btn-windy" data-lat="${bay.lat}" data-lng="${bay.lng}" data-name="${name.replace(/"/g, '&quot;')}" data-island="${island}">Покажи на картата ↑</button>`
      : `<button class="btn-mini" data-go="${island}">Към ${isl.name} ↗</button>`;
    return `
      <div class="bay-row" data-bay-key="${bayKey}">
        <div>
          <div class="bay-name">
            <button class="fav-btn on" data-island="${island}" data-bay="${name.replace(/"/g, '&quot;')}" title="Премахване от любими">★</button>
            ${name} <span class="pill pill-paid">${isl.name}</span>
            ${statusPillHtml(bay.status)}
          </div>
          <div class="bay-note">${bay.note}</div>
        </div>
        <div class="bay-actions">
          <div class="shelter-row">${cells}</div>
          ${sameIsland ? vesselBadgeHtml(bay) : ''}
          <div class="btn-row">
            ${showOnMapBtn}
          </div>
        </div>
      </div>`;
  }).join('');
  list.innerHTML = html;
  list.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.island, btn.dataset.bay);
    });
  });
  list.querySelectorAll('.btn-windy').forEach(btn => {
    btn.addEventListener('click', () => {
      focusBayOnMap({ lat: +btn.dataset.lat, lng: +btn.dataset.lng });
    });
  });
  list.querySelectorAll('[data-go]').forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.islandKey = btn.dataset.go;
      localStorage.setItem('island', STATE.islandKey);
      document.getElementById('island-select').value = STATE.islandKey;
      loadIsland();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function renderDistanceTool() {
  const isl = ISLANDS[STATE.islandKey];
  const opts = isl.anchorages.map((b, i) => `<option value="${i}">${b.name}</option>`).join('');
  const sFrom = document.getElementById('dist-from');
  const sTo = document.getElementById('dist-to');
  sFrom.innerHTML = '<option value="">— от —</option>' + opts;
  sTo.innerHTML = '<option value="">— до —</option>' + opts;

  const update = () => {
    const i1 = sFrom.value, i2 = sTo.value;
    const out = document.getElementById('dist-out');
    if (i1 === '' || i2 === '' || i1 === i2) {
      out.innerHTML = 'Изберете два различни залива, за да видите разстоянието и курса.';
      return;
    }
    const a = isl.anchorages[+i1], b = isl.anchorages[+i2];
    const nm = haversineNM(a.lat, a.lng, b.lat, b.lng);
    const brg = bearingDeg(a.lat, a.lng, b.lat, b.lng);
    const compass = degToCompass(brg);
    const km = nm * 1.852;
    const t5 = (nm / 5).toFixed(1);   // hours at 5 kn
    out.innerHTML = `
      <strong>${nm.toFixed(2)} мили</strong> (${km.toFixed(2)} км)<br>
      Пеленг <strong>${Math.round(brg)}°</strong> (${compassBG(compass)})<br>
      Време при 5 възела: ${t5} ч · при 7 възела: ${(nm/7).toFixed(1)} ч
    `;
  };
  sFrom.onchange = sTo.onchange = update;
  update();
}

function renderTides() {
  const out = document.getElementById('tide-list');
  out.innerHTML = '';
  const m = STATE.marine;
  if (!m || !m.hourly || !m.hourly.sea_level_height_msl) {
    out.innerHTML = '<em>Няма данни за приливи на това място.</em>';
    return;
  }
  const tides = extractTides(m.hourly.time, m.hourly.sea_level_height_msl);
  if (tides.length === 0) {
    out.innerHTML = '<em>Амплитудата на приливите е под прага (типично за Егейско море).</em>';
    return;
  }
  const now = new Date();
  const upcoming = tides.filter(t => new Date(t.time) >= now).slice(0, 6);
  if (upcoming.length === 0) {
    out.innerHTML = '<em>Няма предстоящи приливни екстремуми в прогнозния прозорец.</em>';
    return;
  }
  out.innerHTML = upcoming.map(t => {
    const dt = new Date(t.time);
    const when = dt.toLocaleString('bg-BG', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    const lvl = t.level >= 0 ? '+' + (t.level * 100).toFixed(0) : (t.level * 100).toFixed(0);
    return `<div class="tide-row"><span class="when">${when}</span><span class="what"><strong>${t.type}</strong> ${lvl} см</span></div>`;
  }).join('');
}

// ─── Load island and refresh everything ────────────────────────────────────
async function loadIsland() {
  renderIslandHeader();
  renderWindyMap();
  setMapTitle(`Целият остров — ${ISLANDS[STATE.islandKey].name}`, null);
  // Show skeletons
  document.getElementById('fc-strip').innerHTML =
    '<div class="fc-card"><div class="skel"></div></div>'.repeat(4);

  const isl = ISLANDS[STATE.islandKey];
  const [lat, lon] = isl.center;

  try {
    const [fc, mar] = await Promise.all([
      fetchForecast(lat, lon),
      fetchMarine(lat, lon).catch(() => null) // marine optional
    ]);
    STATE.forecast = fc;
    STATE.marine = mar;
  } catch (err) {
    document.getElementById('fc-error').innerHTML =
      `<div class="error-banner">Прогнозата не можа да се зареди (${err.message}). Данните за заливите все още са налични.</div>`;
    STATE.forecast = null; STATE.marine = null;
  }

  renderForecastStrip();
  renderBays();
  renderFavorites();
  renderDistanceTool();
  renderTides();

  // Open AIS WebSocket for live vessel counts (if API key configured).
  connectAisForIsland(STATE.islandKey);
}

// ─── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderIslandSelect();
  loadIsland();
});
