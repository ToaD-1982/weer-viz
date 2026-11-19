// Weer Viz — visuele weer-app op basis van open databronnen (geen API-keys nodig)
// Bronnen: Open-Meteo (forecast, air quality, geocoding), RainViewer (radar), BigDataCloud (reverse geocode)

const DEFAULT = { name: "Antwerpen", country: "België", lat: 51.2194, lon: 4.4025 };
const $ = (id) => document.getElementById(id);

// ---------- Weercodes (WMO) ----------
const WMO = {
  0: ["Helder", "☀️", "clear"], 1: ["Overwegend helder", "🌤️", "clear"], 2: ["Half bewolkt", "⛅", "cloudy"],
  3: ["Bewolkt", "☁️", "overcast"], 45: ["Mist", "🌫️", "fog"], 48: ["Rijpmist", "🌫️", "fog"],
  51: ["Lichte motregen", "🌦️", "rain"], 53: ["Motregen", "🌦️", "rain"], 55: ["Dichte motregen", "🌧️", "rain"],
  56: ["Ijzel (licht)", "🌧️", "rain"], 57: ["Ijzel", "🌧️", "rain"],
  61: ["Lichte regen", "🌦️", "rain"], 63: ["Regen", "🌧️", "rain"], 65: ["Zware regen", "🌧️", "storm"],
  66: ["Ijskoude regen", "🌧️", "rain"], 67: ["Zware ijskoude regen", "🌧️", "storm"],
  71: ["Lichte sneeuw", "🌨️", "snow"], 73: ["Sneeuw", "🌨️", "snow"], 75: ["Zware sneeuw", "❄️", "snow"],
  77: ["Korrelsneeuw", "🌨️", "snow"], 80: ["Lichte buien", "🌦️", "rain"], 81: ["Buien", "🌧️", "rain"],
  82: ["Hevige buien", "⛈️", "storm"], 85: ["Sneeuwbuien", "🌨️", "snow"], 86: ["Zware sneeuwbuien", "❄️", "snow"],
  95: ["Onweer", "⛈️", "storm"], 96: ["Onweer met hagel", "⛈️", "storm"], 99: ["Zwaar onweer met hagel", "⛈️", "storm"],
};
const wmo = (c) => WMO[c] || ["Onbekend", "❔", "cloudy"];

const SKIES = {
  clear:    { day: ["#2b83d6", "#7cc4f5"], night: ["#0b1026", "#1c2a5a"] },
  cloudy:   { day: ["#4a6f99", "#9bb6d3"], night: ["#141b2e", "#2c3a55"] },
  overcast: { day: ["#5d6b7c", "#a1abb8"], night: ["#15191f", "#2d343e"] },
  fog:      { day: ["#8a94a0", "#c9ced4"], night: ["#1f2328", "#3a4047"] },
  rain:     { day: ["#36485e", "#6c829b"], night: ["#0e141d", "#25313f"] },
  storm:    { day: ["#232a3a", "#4b5367"], night: ["#07090f", "#1b1f2b"] },
  snow:     { day: ["#7d97b5", "#d8e4f0"], night: ["#1a2336", "#3c4a64"] },
};

// ---------- Hulpjes ----------
const fmtH = (d) => d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
const dayName = (d, i) => (i === 0 ? "Vandaag" : d.toLocaleDateString("nl-BE", { weekday: "short" }));
const compassDir = (deg) => ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"][Math.round(deg / 45) % 8];
function tempColor(t) {
  // -10 → paars, 0 → blauw, 10 → groen, 20 → geel, 30+ → rood
  const stops = [[-10, [120, 90, 220]], [0, [70, 150, 255]], [10, [80, 210, 170]], [18, [250, 220, 90]], [25, [255, 150, 60]], [35, [230, 50, 60]]];
  if (t <= stops[0][0]) return `rgb(${stops[0][1]})`;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i], f = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * f)).join(",")})`;
    }
  }
  return `rgb(${stops.at(-1)[1]})`;
}
function setupCanvas(cv, h) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

// ---------- Data ophalen ----------
async function getWeather(lat, lon) {
  const p = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: "auto", forecast_days: 7,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover",
    hourly: "temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,uv_index",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,uv_index_max",
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`);
  if (!r.ok) throw new Error("forecast " + r.status);
  return r.json();
}
async function getAir(lat, lon) {
  try {
    const r = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5,pm10`);
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ---------- Hemel-animatie ----------
const sky = { theme: "clear", night: false, parts: [] };
const skyCv = $("sky"), skyCtx = skyCv.getContext("2d");
function resizeSky() { skyCv.width = innerWidth; skyCv.height = innerHeight; seedSky(); }
function seedSky() {
  const W = skyCv.width, H = skyCv.height, t = sky.theme;
  const n = t === "storm" ? 380 : t === "rain" ? 220 : t === "snow" ? 160 : t === "clear" && sky.night ? 160 : 9;
  sky.parts = Array.from({ length: n }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    s: Math.random(), v: 0.4 + Math.random(), r: 60 + Math.random() * 140,
  }));
}
let flash = 0;
function drawSky(ts) {
  const W = skyCv.width, H = skyCv.height, c = skyCtx, t = sky.theme;
  c.clearRect(0, 0, W, H);
  if (t === "clear" && !sky.night) {
    const g = c.createRadialGradient(W * 0.82, H * 0.12, 10, W * 0.82, H * 0.12, 320);
    const pulse = 0.35 + Math.sin(ts / 2000) * 0.05;
    g.addColorStop(0, `rgba(255,240,180,${pulse + 0.4})`); g.addColorStop(0.2, `rgba(255,220,120,${pulse})`); g.addColorStop(1, "rgba(255,220,120,0)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  for (const p of sky.parts) {
    if (t === "rain" || t === "storm") {
      c.strokeStyle = `rgba(180,210,255,${0.25 + p.s * 0.35})`; c.lineWidth = 1 + p.s;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - 3, p.y + 12 + p.s * 10); c.stroke();
      p.y += 9 + p.v * 9; p.x -= 1.5;
      if (p.y > H) { p.y = -20; p.x = Math.random() * W; }
    } else if (t === "snow") {
      c.fillStyle = `rgba(255,255,255,${0.5 + p.s * 0.5})`;
      c.beginPath(); c.arc(p.x, p.y, 1 + p.s * 3, 0, 7); c.fill();
      p.y += 0.6 + p.v; p.x += Math.sin(ts / 1000 + p.r) * 0.6;
      if (p.y > H) { p.y = -5; p.x = Math.random() * W; }
    } else if (t === "clear" && sky.night) {
      c.fillStyle = `rgba(255,255,255,${0.3 + Math.abs(Math.sin(ts / 900 + p.r)) * 0.7 * p.s})`;
      c.fillRect(p.x, p.y * 0.7, 1.5, 1.5);
    } else {
      const g = c.createRadialGradient(p.x, p.y * 0.5, 0, p.x, p.y * 0.5, p.r * 2);
      const a = t === "fog" ? 0.12 : 0.08;
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g; c.fillRect(p.x - p.r * 2, p.y * 0.5 - p.r * 2, p.r * 4, p.r * 4);
      p.x += 0.15 * p.v; if (p.x - p.r * 2 > W) p.x = -p.r * 2;
    }
  }
  if (t === "storm") {
    if (flash <= 0 && Math.random() < 0.004) flash = 1;
    if (flash > 0) { c.fillStyle = `rgba(230,235,255,${flash * 0.35})`; c.fillRect(0, 0, W, H); flash -= 0.06; }
  }
  requestAnimationFrame(drawSky);
}
addEventListener("resize", resizeSky);
resizeSky(); requestAnimationFrame(drawSky);

function applySky(code, isDay) {
  const theme = wmo(code)[2];
  sky.theme = theme; sky.night = !isDay; seedSky();
  const [a, b] = SKIES[theme][isDay ? "day" : "night"];
  document.documentElement.style.setProperty("--sky-a", a);
  document.documentElement.style.setProperty("--sky-b", b);
}

// ---------- SVG-widgets ----------
function ring(svg, frac, color, label) {
  const R = 46, C = 2 * Math.PI * R, f = Math.max(0, Math.min(1, frac));
  svg.innerHTML = `
    <circle cx="60" cy="60" r="${R}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="10"/>
    <circle cx="60" cy="60" r="${R}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 60 60)" style="transition:stroke-dashoffset 1.2s ease">
    </circle>
    <text x="60" y="67" text-anchor="middle" fill="#fff" font-size="22" font-family="Space Grotesk">${label}</text>`;
  requestAnimationFrame(() => requestAnimationFrame(() => { svg.children[1].style.strokeDashoffset = C * (1 - f); }));
}
function compass(svg, deg, speed) {
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (i * 10 * Math.PI) / 180, r1 = i % 9 === 0 ? 40 : 45;
    return `<line x1="${60 + Math.sin(a) * r1}" y1="${60 - Math.cos(a) * r1}" x2="${60 + Math.sin(a) * 50}" y2="${60 - Math.cos(a) * 50}" stroke="rgba(255,255,255,${i % 9 === 0 ? 0.8 : 0.25})" stroke-width="1.5"/>`;
  }).join("");
  const labels = ["N", "O", "Z", "W"].map((l, i) => {
    const a = (i * 90 * Math.PI) / 180;
    return `<text x="${60 + Math.sin(a) * 31}" y="${64 - Math.cos(a) * 31}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,.6)">${l}</text>`;
  }).join("");
  // pijl wijst waar de wind naartoe waait (deg = vandaan)
  svg.innerHTML = `${ticks}${labels}
    <g style="transform-origin:60px 60px;transform:rotate(${deg + 180}deg);transition:transform 1.2s ease">
      <path d="M60 18 L67 60 L60 54 L53 60 Z" fill="#ffb547"/>
      <path d="M60 102 L64 60 L56 60 Z" fill="rgba(255,255,255,.35)"/>
    </g>
    <circle cx="60" cy="60" r="12" fill="rgba(10,20,40,.7)"/>
    <text x="60" y="64" text-anchor="middle" font-size="11" fill="#fff">${Math.round(speed)}</text>`;
}
function sunArc(svg, rise, set, now) {
  const f = Math.max(0, Math.min(1, (now - rise) / (set - rise)));
  const a = Math.PI * (1 - f), cx = 100 + Math.cos(a) * 80, cy = 100 - Math.sin(a) * 80;
  const up = now > rise && now < set;
  svg.innerHTML = `
    <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,.2)" stroke-dasharray="4 5" stroke-width="2"/>
    <path d="M20 100 A80 80 0 0 1 ${cx} ${cy}" fill="none" stroke="#ffb547" stroke-width="3" opacity="${up ? 1 : 0.3}"/>
    <line x1="10" y1="100" x2="190" y2="100" stroke="rgba(255,255,255,.25)"/>
    <circle cx="${cx}" cy="${cy}" r="9" fill="${up ? "#ffd36b" : "#8892a6"}">
      ${up ? '<animate attributeName="r" values="8;10;8" dur="3s" repeatCount="indefinite"/>' : ""}
    </circle>`;
}

// ---------- Uurgrafiek ----------
let hourlyData = null;
function drawHourly(hover = -1) {
  if (!hourlyData) return;
  const cv = $("hourly");
  const { ctx, w, h } = setupCanvas(cv, 260);
  const { times, temp, feel, rain, prob, codes } = hourlyData;
  const pad = { l: 34, r: 10, t: 30, b: 34 };
  const n = temp.length, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const all = [...temp, ...feel], lo = Math.floor(Math.min(...all) - 1), hi = Math.ceil(Math.max(...all) + 1);
  const X = (i) => pad.l + (i / (n - 1)) * iw, Y = (v) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const maxRain = Math.max(2, ...rain);

  // nacht-banden
  ctx.fillStyle = "rgba(0,0,10,.18)";
  times.forEach((t, i) => { const hr = t.getHours(); if (hr < 7 || hr >= 21) ctx.fillRect(X(i) - iw / n / 2, pad.t, iw / n + 0.5, ih); });

  // grid
  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "11px Space Grotesk";
  for (let v = lo; v <= hi; v += Math.max(1, Math.round((hi - lo) / 5))) {
    ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke();
    ctx.fillText(v + "°", 4, Y(v) + 4);
  }
  // neerslag-staafjes
  rain.forEach((r, i) => {
    const bh = (r / maxRain) * ih * 0.6, bw = Math.max(2, iw / n - 3);
    ctx.fillStyle = `rgba(79,195,255,${0.25 + (prob[i] || 0) / 160})`;
    ctx.fillRect(X(i) - bw / 2, pad.t + ih - bh, bw, bh);
  });
  // lijnen
  const line = (arr, color, width, fill) => {
    ctx.beginPath();
    arr.forEach((v, i) => {
      if (!i) return ctx.moveTo(X(0), Y(v));
      const xc = (X(i - 1) + X(i)) / 2;
      ctx.bezierCurveTo(xc, Y(arr[i - 1]), xc, Y(v), X(i), Y(v));
    });
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    if (fill) {
      ctx.lineTo(X(n - 1), pad.t + ih); ctx.lineTo(X(0), pad.t + ih); ctx.closePath();
      const g = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
      g.addColorStop(0, "rgba(255,181,71,.35)"); g.addColorStop(1, "rgba(255,181,71,0)");
      ctx.fillStyle = g; ctx.fill();
    }
  };
  ctx.setLineDash([4, 4]); line(feel, "#ff6b8b", 1.5); ctx.setLineDash([]);
  line(temp, "#ffb547", 3, true);

  // x-labels + icoontjes
  ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.6)";
  times.forEach((t, i) => {
    if (i % 3) return;
    ctx.fillText(t.getHours() === 0 ? t.toLocaleDateString("nl-BE", { weekday: "short" }) : t.getHours() + "u", X(i), h - 12);
    ctx.font = "15px sans-serif"; ctx.fillText(wmo(codes[i])[1], X(i), 18); ctx.font = "11px Space Grotesk";
  });
  ctx.textAlign = "left";

  if (hover >= 0) {
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.moveTo(X(hover), pad.t); ctx.lineTo(X(hover), pad.t + ih); ctx.stroke();
    ctx.fillStyle = "#ffb547"; ctx.beginPath(); ctx.arc(X(hover), Y(temp[hover]), 5, 0, 7); ctx.fill();
    const tip = $("tip");
    tip.innerHTML = `<b>${times[hover].toLocaleDateString("nl-BE", { weekday: "short" })} ${fmtH(times[hover])}</b><br>
      ${wmo(codes[hover])[1]} ${temp[hover].toFixed(1)}° · gevoel ${feel[hover].toFixed(1)}°<br>💧 ${rain[hover]} mm (${prob[hover] ?? 0}%)`;
    tip.style.left = Math.min(X(hover) + 10, w - 190) + "px"; tip.style.top = "30px"; tip.style.opacity = 1;
  } else $("tip").style.opacity = 0;

  cv.onmousemove = (e) => {
    const x = e.offsetX, i = Math.round(((x - pad.l) / iw) * (n - 1));
    drawHourly(i >= 0 && i < n ? i : -1);
  };
  cv.onmouseleave = () => drawHourly(-1);
}

// ---------- Heatmap ----------
let heatData = null;
function drawHeat() {
  if (!heatData) return;
  const cv = $("heat");
  const { ctx, w, h } = setupCanvas(cv, 230);
  const { temps, days } = heatData;
  const l = 60, t = 20, cw = (w - l - 6) / 24, ch = (h - t - 6) / days.length;
  ctx.font = "11px Space Grotesk"; ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.textAlign = "center";
  for (let hr = 0; hr < 24; hr += 3) ctx.fillText(hr + "u", l + hr * cw + cw / 2, 12);
  days.forEach((d, di) => {
    ctx.textAlign = "left"; ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.fillText(dayName(d, di), 4, t + di * ch + ch / 2 + 4);
    for (let hr = 0; hr < 24; hr++) {
      const v = temps[di * 24 + hr];
      if (v == null) continue;
      ctx.fillStyle = tempColor(v);
      ctx.beginPath(); ctx.roundRect(l + hr * cw + 1, t + di * ch + 1, cw - 2, ch - 2, 4); ctx.fill();
      if (cw > 26) { ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.textAlign = "center"; ctx.fillText(Math.round(v), l + hr * cw + cw / 2, t + di * ch + ch / 2 + 4); }
    }
  });
}

// ---------- Dagen ----------
function renderDays(d) {
  const lo = Math.min(...d.temperature_2m_min), hi = Math.max(...d.temperature_2m_max);
  const maxP = Math.max(1, ...d.precipitation_sum);
  $("days").innerHTML = d.time.map((t, i) => {
    const mn = d.temperature_2m_min[i], mx = d.temperature_2m_max[i];
    const left = ((mn - lo) / (hi - lo)) * 100, width = ((mx - mn) / (hi - lo)) * 100;
    return `<div class="day">
      <div class="dn">${dayName(new Date(t), i)}</div>
      <div class="ic" title="${wmo(d.weather_code[i])[0]}">${wmo(d.weather_code[i])[1]}</div>
      <div class="lo">${Math.round(mn)}°</div>
      <div class="bar"><i style="left:${left}%;width:${Math.max(width, 3)}%;background:linear-gradient(90deg,${tempColor(mn)},${tempColor(mx)})"></i></div>
      <div class="hi">${Math.round(mx)}°</div>
      <div class="rainp"><b style="width:${(d.precipitation_sum[i] / maxP) * 60}px"></b>${d.precipitation_sum[i].toFixed(1)} mm · ${d.precipitation_probability_max[i] ?? 0}%</div>
    </div>`;
  }).join("");
}

// ---------- Radar ----------
let map, marker, radarLayers = [], radarIdx = 0, radarTimer = null, playing = true;
async function initRadar(lat, lon) {
  if (!map) {
    map = L.map("map", { zoomControl: true, attributionControl: false }).setView([lat, lon], 7);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 12 }).addTo(map);
    marker = L.circleMarker([lat, lon], { radius: 7, color: "#ffb547", fillOpacity: 1 }).addTo(map);
    $("play").onclick = () => { playing = !playing; $("play").textContent = playing ? "❚❚" : "▶"; };
  } else { map.setView([lat, lon], 7); marker.setLatLng([lat, lon]); }

  try {
    const r = await fetch("https://api.rainviewer.com/public/weather-maps.json");
    const j = await r.json();
    radarLayers.forEach((l) => map.removeLayer(l.layer));
    const frames = [...(j.radar?.past || []), ...(j.radar?.nowcast || [])];
    radarLayers = frames.map((f) => ({
      time: new Date(f.time * 1000),
      layer: L.tileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0, maxNativeZoom: 7, maxZoom: 12, zIndex: 10 }).addTo(map),
    }));
    radarIdx = radarLayers.length - 1;
    clearInterval(radarTimer);
    const show = () => {
      radarLayers.forEach((l, i) => l.layer.setOpacity(i === radarIdx ? 0.75 : 0));
      $("radarTime").textContent = radarLayers[radarIdx] ? fmtH(radarLayers[radarIdx].time) : "";
    };
    show();
    radarTimer = setInterval(() => { if (!playing || !radarLayers.length) return; radarIdx = (radarIdx + 1) % radarLayers.length; show(); }, 600);
  } catch (e) { $("radarTime").textContent = "radar niet beschikbaar"; }
}

// ---------- Laden ----------
async function load(loc) {
  $("place").textContent = `${loc.name}${loc.country ? " · " + loc.country : ""}`;
  $("cond").textContent = "Laden…";
  try {
    const [w, air] = await Promise.all([getWeather(loc.lat, loc.lon), getAir(loc.lat, loc.lon)]);
    const c = w.current, d = w.daily;
    const [txt, icon] = wmo(c.weather_code);
    applySky(c.weather_code, c.is_day);

    $("temp").textContent = Math.round(c.temperature_2m) + "°";
    $("cond").textContent = `${icon} ${txt}`;
    $("feels").textContent = `Voelt als ${Math.round(c.apparent_temperature)}° · bewolking ${c.cloud_cover}%`;
    $("minmax").textContent = `↓ ${Math.round(d.temperature_2m_min[0])}°  ↑ ${Math.round(d.temperature_2m_max[0])}°`;

    compass($("compass"), c.wind_direction_10m, c.wind_speed_10m);
    $("wind").textContent = `${compassDir(c.wind_direction_10m)} · stoten ${Math.round(c.wind_gusts_10m)} km/u`;
    ring($("humRing"), c.relative_humidity_2m / 100, "#4fc3ff", c.relative_humidity_2m + "%");
    $("hum").textContent = c.relative_humidity_2m > 80 ? "Vochtig" : c.relative_humidity_2m < 35 ? "Droog" : "Comfortabel";

    const nowIdx = Math.max(0, w.hourly.time.findIndex((t) => new Date(t) >= new Date(c.time)));
    const uvNow = w.hourly.uv_index?.[nowIdx] ?? 0, uvMax = d.uv_index_max[0] ?? 0;
    const uvCol = uvMax < 3 ? "#6bd66b" : uvMax < 6 ? "#ffd84f" : uvMax < 8 ? "#ff9a3c" : uvMax < 11 ? "#ff4f4f" : "#b45cff";
    ring($("uvRing"), uvMax / 11, uvCol, uvMax.toFixed(1));
    $("uv").textContent = `nu ${uvNow.toFixed(1)} · max vandaag`;

    const aqi = air?.current?.european_aqi;
    if (aqi != null) {
      const [lbl, col] = aqi <= 20 ? ["Goed", "#50f0e6"] : aqi <= 40 ? ["Redelijk", "#50ccaa"] : aqi <= 60 ? ["Matig", "#f0e641"] : aqi <= 80 ? ["Slecht", "#ff5050"] : ["Zeer slecht", "#960032"];
      ring($("aqiRing"), aqi / 100, col, aqi);
      $("aqi").textContent = `${lbl} · PM2.5 ${air.current.pm2_5?.toFixed(0) ?? "?"}`;
    } else { ring($("aqiRing"), 0, "#888", "–"); $("aqi").textContent = "geen data"; }

    $("pres").textContent = Math.round(c.pressure_msl);
    const rise = new Date(d.sunrise[0]), set = new Date(d.sunset[0]);
    sunArc($("sunArc"), rise, set, new Date(c.time));
    $("sunTimes").textContent = `🌅 ${fmtH(rise)}   🌇 ${fmtH(set)}`;

    const sl = (a) => a.slice(nowIdx, nowIdx + 48);
    hourlyData = {
      times: sl(w.hourly.time).map((t) => new Date(t)),
      temp: sl(w.hourly.temperature_2m), feel: sl(w.hourly.apparent_temperature),
      rain: sl(w.hourly.precipitation), prob: sl(w.hourly.precipitation_probability), codes: sl(w.hourly.weather_code),
    };
    drawHourly();

    heatData = { temps: w.hourly.temperature_2m, days: d.time.map((t) => new Date(t)) };
    drawHeat();
    renderDays(d);
    initRadar(loc.lat, loc.lon);
    try { localStorage.setItem("weerviz-loc", JSON.stringify(loc)); } catch {}
  } catch (e) {
    console.error(e);
    $("cond").textContent = "⚠️ Kon weerdata niet laden";
  }
}
addEventListener("resize", () => { drawHourly(); drawHeat(); });

// ---------- Zoeken ----------
let debounce;
$("q").addEventListener("input", (e) => {
  clearTimeout(debounce);
  const q = e.target.value.trim();
  if (q.length < 2) return ($("suggest").innerHTML = "");
  debounce = setTimeout(async () => {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=nl`);
    const j = await r.json();
    $("suggest").innerHTML = (j.results || []).map((p, i) =>
      `<li data-i="${i}">${p.name}<small>${[p.admin1, p.country].filter(Boolean).join(", ")}</small></li>`).join("");
    $("suggest").querySelectorAll("li").forEach((li) => li.onclick = () => {
      const p = j.results[li.dataset.i];
      $("suggest").innerHTML = ""; $("q").value = "";
      load({ name: p.name, country: p.country, lat: p.latitude, lon: p.longitude });
    });
  }, 250);
});
$("search").addEventListener("submit", (e) => { e.preventDefault(); $("suggest").querySelector("li")?.click(); });

$("locate").onclick = () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    let name = "Mijn locatie", country = "";
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=nl`);
      const j = await r.json(); name = j.city || j.locality || name; country = j.countryName || "";
    } catch {}
    load({ name, country, lat: coords.latitude, lon: coords.longitude });
  });
};

// ---------- Start ----------
let start = DEFAULT;
try { start = JSON.parse(localStorage.getItem("weerviz-loc")) || DEFAULT; } catch {}
const qs = new URLSearchParams(location.search);
if (qs.get("lat") && qs.get("lon")) start = { name: qs.get("name") || "Locatie", country: "", lat: +qs.get("lat"), lon: +qs.get("lon") };
load(start);
