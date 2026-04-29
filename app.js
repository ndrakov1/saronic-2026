// app.js — Greek Islands Anchorage Forecast
// Pulls forecast from Open-Meteo (no API key), embeds Windy iframe,
// scores shelter per bay using wind+gusts+wave+direction.

const STATE = {
  islandKey: localStorage.getItem('island') || 'mykonos',
  forecast: null,      // daily forecast for the island
  marine: null,        // daily marine forecast
  tides: null,         // hourly sea-level series
  favorites: JSON.parse(localStorage.getItem('favorites') || '[]'), // [{island, name}]
};

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
    { txt: 'Exposed',   cls: 's-0' },
    { txt: 'Marginal',  cls: 's-1' },
    { txt: 'Sheltered', cls: 's-2' },
    { txt: 'Excellent', cls: 's-3' }
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
  if (!r.ok) throw new Error('Forecast unavailable');
  return await r.json();
}
async function fetchMarine(lat, lon) {
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&daily=wave_height_max,wave_direction_dominant` +
    `&hourly=wave_height,sea_level_height_msl` +
    `&forecast_days=4&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Marine forecast unavailable');
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
    if (isHigh || isLow) out.push({ time: times[i], level: levels[i], type: isHigh ? 'High' : 'Low' });
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
  if (!fc) { el.innerHTML = '<div class="error-banner">Forecast unavailable. Check connection and reload.</div>'; return; }

  const cards = [];
  // Now card
  const cur = fc.current || {};
  cards.push({
    label: 'Now',
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
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
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
        <strong>${c.wind != null ? Math.round(c.wind) : '—'} kn</strong> ${c.dir || ''}<br>
        Gust ${c.gust != null ? Math.round(c.gust) : '—'} kn<br>
        ${c.wave != null ? 'Sea ' + c.wave.toFixed(1) + ' m' : ''}
        ${c.precip != null ? ' · ' + c.precip + '% rain' : ''}
      </div>
    </div>
  `).join('');
}

function renderWindyMap() {
  const isl = ISLANDS[STATE.islandKey];
  const [lat, lon] = isl.center;
  const url = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}` +
    `&width=650&height=450&zoom=11&level=surface&overlay=wind&product=ecmwf` +
    `&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates` +
    `&detail=true&metricWind=knot&metricTemp=%C2%B0C&radarRange=-1`;
  document.getElementById('windy-frame').src = url;
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
    overnight: { txt: 'Overnight OK', cls: 'pill-overnight' },
    day:       { txt: 'Day only',     cls: 'pill-day' },
    restricted:{ txt: 'Restricted',   cls: 'pill-restricted' },
    paid:      { txt: 'Paid berth',   cls: 'pill-paid' }
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
  const dayLabels = fc ? [0, 1, 2].map(i => new Date(fc.daily.time[i]).toLocaleDateString(undefined, { weekday: 'short' })) : ['', '', ''];
  const cells = [0, 1, 2].map(i => {
    const s = dayShelterFor(bay, i);
    const lbl = shelterLabel(s);
    return `<div class="shelter-cell ${lbl.cls}"><span class="d">${dayLabels[i]}</span>${lbl.txt}</div>`;
  }).join('');
  const fav = isFavorite(islandKey, bay.name);
  const windyUrl = `https://www.windy.com/?wind,${bay.lat},${bay.lng},12`;
  const gMapsUrl = `https://www.google.com/maps?q=${bay.lat},${bay.lng}`;
  return `
    <div class="bay-row">
      <div>
        <div class="bay-name">
          <button class="fav-btn ${fav ? 'on' : ''}" data-island="${islandKey}" data-bay="${bay.name.replace(/"/g, '&quot;')}" aria-label="Toggle favourite" title="Favourite">${fav ? '★' : '☆'}</button>
          ${bay.name}
          ${statusPillHtml(bay.status)}
        </div>
        <div class="bay-note">${bay.note}</div>
      </div>
      <div class="bay-actions">
        <div class="shelter-row">${cells}</div>
        <div class="btn-row">
          <a class="btn-mini" href="${windyUrl}" target="_blank" rel="noopener">Windy ↗</a>
          <a class="btn-mini" href="${gMapsUrl}" target="_blank" rel="noopener">Maps ↗</a>
        </div>
      </div>
    </div>`;
}

function renderBays() {
  const isl = ISLANDS[STATE.islandKey];
  const html = isl.anchorages.map(b => renderBayRow(b, STATE.islandKey)).join('');
  document.getElementById('bay-list').innerHTML = html;
  document.querySelectorAll('#bay-list .fav-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.island, btn.dataset.bay);
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
      const dayLabel = STATE.forecast ? new Date(STATE.forecast.daily.time[i]).toLocaleDateString(undefined, { weekday: 'short' }) : '';
      return `<div class="shelter-cell ${lbl.cls}"><span class="d">${dayLabel}</span>${lbl.txt}</div>`;
    }).join('');
    const windyUrl = `https://www.windy.com/?wind,${bay.lat},${bay.lng},12`;
    return `
      <div class="bay-row">
        <div>
          <div class="bay-name">
            <button class="fav-btn on" data-island="${island}" data-bay="${name.replace(/"/g, '&quot;')}" title="Remove from favourites">★</button>
            ${name} <span class="pill pill-paid">${isl.name}</span>
            ${statusPillHtml(bay.status)}
          </div>
          <div class="bay-note">${bay.note}</div>
        </div>
        <div class="bay-actions">
          <div class="shelter-row">${cells}</div>
          <div class="btn-row">
            <a class="btn-mini" href="${windyUrl}" target="_blank" rel="noopener">Windy ↗</a>
            <button class="btn-mini" data-go="${island}">Switch to ${isl.name} ↗</button>
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
  sFrom.innerHTML = '<option value="">— from —</option>' + opts;
  sTo.innerHTML = '<option value="">— to —</option>' + opts;

  const update = () => {
    const i1 = sFrom.value, i2 = sTo.value;
    const out = document.getElementById('dist-out');
    if (i1 === '' || i2 === '' || i1 === i2) {
      out.innerHTML = 'Pick two different bays to see the rhumb line.';
      return;
    }
    const a = isl.anchorages[+i1], b = isl.anchorages[+i2];
    const nm = haversineNM(a.lat, a.lng, b.lat, b.lng);
    const brg = bearingDeg(a.lat, a.lng, b.lat, b.lng);
    const compass = degToCompass(brg);
    const km = nm * 1.852;
    const t5 = (nm / 5).toFixed(1);   // hours at 5 kn
    out.innerHTML = `
      <strong>${nm.toFixed(2)} nm</strong> (${km.toFixed(2)} km)<br>
      Bearing <strong>${Math.round(brg)}°</strong> (${compass})<br>
      ETA at 5 kn: ${t5} h · at 7 kn: ${(nm/7).toFixed(1)} h
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
    out.innerHTML = '<em>Tide data unavailable for this location.</em>';
    return;
  }
  const tides = extractTides(m.hourly.time, m.hourly.sea_level_height_msl);
  if (tides.length === 0) {
    out.innerHTML = '<em>Tide range below noise threshold (typical for the Aegean).</em>';
    return;
  }
  // Take next 6 events (≈ 3 days worth of high/low)
  const now = new Date();
  const upcoming = tides.filter(t => new Date(t.time) >= now).slice(0, 6);
  if (upcoming.length === 0) {
    out.innerHTML = '<em>No upcoming tide extrema in forecast window.</em>';
    return;
  }
  out.innerHTML = upcoming.map(t => {
    const dt = new Date(t.time);
    const when = dt.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    const lvl = t.level >= 0 ? '+' + (t.level * 100).toFixed(0) : (t.level * 100).toFixed(0);
    return `<div class="tide-row"><span class="when">${when}</span><span class="what"><strong>${t.type}</strong> ${lvl} cm</span></div>`;
  }).join('');
}

// ─── Load island and refresh everything ────────────────────────────────────
async function loadIsland() {
  renderIslandHeader();
  renderWindyMap();
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
      `<div class="error-banner">Forecast couldn't load (${err.message}). Anchorage data still available.</div>`;
    STATE.forecast = null; STATE.marine = null;
  }

  renderForecastStrip();
  renderBays();
  renderFavorites();
  renderDistanceTool();
  renderTides();
}

// ─── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderIslandSelect();
  loadIsland();
});
