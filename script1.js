const SAMPLE = {
  "Delhi":    {country:"India",     base:31, hum:48, wind:12, code:1,  pres:1008},
  "Mumbai":   {country:"India",     base:32, hum:74, wind:18, code:61, pres:1006},
  "London":   {country:"UK",        base:12, hum:80, wind:20, code:3,  pres:1012},
  "New York": {country:"USA",       base:16, hum:58, wind:15, code:2,  pres:1015},
  "Tokyo":    {country:"Japan",     base:19, hum:62, wind:10, code:0,  pres:1018},
  "Sydney":   {country:"Australia", base:23, hum:66, wind:22, code:80, pres:1010},
  "Dubai":    {country:"UAE",       base:38, hum:40, wind:14, code:0,  pres:1003},
  "Paris":    {country:"France",    base:14, hum:70, wind:13, code:45, pres:1014},
  "Seattle":  {country:"USA",       base:11, hum:82, wind:9,  code:61, pres:1011},
  "Moscow":   {country:"Russia",    base:-2, hum:85, wind:11, code:71, pres:1020}
};
const OTHERS = ["Mumbai","London","Tokyo","Dubai"];

/* ---------- Weather code → label / icon / theme ---------- */
function describe(c){
  if(c===0) return ["Clear sky","☀️","clear"];
  if(c<=2)  return ["Partly cloudy","⛅","clear"];
  if(c===3) return ["Overcast","☁️","cloud"];
  if(c<=48) return ["Foggy","🌫️","cloud"];
  if(c<=57) return ["Drizzle","🌦️","rain"];
  if(c<=67) return ["Rain","🌧️","rain"];
  if(c<=77) return ["Snow","❄️","snow"];
  if(c<=82) return ["Rain showers","🌦️","rain"];
  if(c<=86) return ["Snow showers","🌨️","snow"];
  return ["Thunderstorm","⛈️","storm"];
}

/* ---------- State & helpers ---------- */
let unit = "C", data = null;
const $ = id => document.getElementById(id);
const conv = c => unit==="C" ? Math.round(c) : Math.round(c*9/5+32);
const windU = k => unit==="C" ? Math.round(k)+" km/h" : Math.round(k*0.621371)+" mph";
const hm = iso => new Date(iso).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
const parseDate = d => d.length === 10 ? new Date(d + "T00:00:00") : new Date(d);

/* seeded pseudo-random so sample data is stable per city */
function rng(seed){ return () => (seed = (seed*9301+49297)%233280)/233280; }

function sampleFor(name){
  const s = SAMPLE[name], r = rng([...name].reduce((a,c)=>a+c.charCodeAt(0),0));
  const now = new Date();
  const riseDate = new Date(now);
  riseDate.setHours(6, 10, 0, 0);
  const setDate = new Date(now);
  setDate.setHours(18, 20, 0, 0);

  const codes = [s.code,1,3,61,0,2,80];
  const daily = [...Array(7)].map((_,i)=>({
    date:new Date(now.getTime()+i*864e5).toISOString(),
    code:i===0?s.code:codes[Math.floor(r()*codes.length)],
    hi:s.base+Math.round(r()*5), lo:s.base-4-Math.round(r()*4)
  }));
  const rain = [...Array(12)].map(()=>Math.round(r()*(s.code>=51?90:35)));
  return {
    name, country:s.country, time:now.toISOString(),
    temp:s.base, feels:s.base-1, hum:s.hum,
    wind:s.wind, pres:s.pres, code:s.code, rain, daily,
    rise:riseDate.toISOString(), set:setDate.toISOString(), sample:true
  };
}

/* ---------- Optional live API (Open-Meteo, no key needed) ---------- */
async function fetchLive(query){
  const gRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`);
  if(!gRes.ok) throw new Error("network");
  const g = await gRes.json();
  if(!g.results || !g.results.length) throw new Error("notfound");
  const p = g.results[0];
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}`+
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure`+
    `&hourly=precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset`+
    `&timezone=auto&forecast_days=7`;
  const wRes = await fetch(u);
  if(!wRes.ok) throw new Error("network");
  const w = await wRes.json();
  const cur = w.current, h = w.hourly;
  let i = h.time.findIndex(t => t >= cur.time.slice(0,13));
  if(i<0) i=0;
  return {
    name:p.name, country:p.country||"", time:cur.time,
    temp:cur.temperature_2m, feels:cur.apparent_temperature,
    hum:cur.relative_humidity_2m, wind:cur.wind_speed_10m,
    pres:cur.surface_pressure, code:cur.weather_code,
    rain:h.precipitation_probability.slice(i,i+12),
    daily:w.daily.time.map((d,k)=>({
      date:d, code:w.daily.weather_code[k],
      hi:w.daily.temperature_2m_max[k], lo:w.daily.temperature_2m_min[k]
    })),
    rise:w.daily.sunrise[0], set:w.daily.sunset[0], sample:false
  };
}

async function load(query){
  const trimmed = query.trim();
  if(!trimmed) return;
  const key = Object.keys(SAMPLE).find(k => k.toLowerCase()===trimmed.toLowerCase());
  $("msg").textContent = "";
  try{
    data = await fetchLive(trimmed);
  }catch(e){
    if(key){
      data = sampleFor(key);
      $("msg").textContent = "Live data unavailable, showing sample data.";
    } else {
      $("msg").textContent = e.message==="notfound"
        ? `No city found for “${trimmed}”. Check the spelling and try again.`
        : `Can’t reach the weather service. Try one of: ${Object.keys(SAMPLE).join(", ")}.`;
      return;
    }
  }
  render();
}

/* ---------- Render ---------- */
function render(){
  const d = data, [label,icon,theme] = describe(d.code);
  document.body.dataset.theme = theme;
  $("city").textContent = `${d.name}${d.country?", "+d.country:""}`;
  $("date").textContent = parseDate(d.time).toLocaleDateString([], {weekday:"long",day:"numeric",month:"long"});
  $("temp").textContent = conv(d.temp);
  $("unit").textContent = "°"+unit;
  $("cond").textContent = label;
  $("bigIcon").textContent = icon;
  $("feels").textContent = conv(d.feels)+"°";
  $("hum").textContent = Math.round(d.hum)+"%";
  $("wind").textContent = windU(d.wind);
  $("pres").textContent = Math.round(d.pres)+" hPa";
  $("rise").textContent = hm(d.rise);
  $("set").textContent = hm(d.set);

  const startH = parseDate(d.time).getHours();
  $("bars").innerHTML = d.rain.map((p,i)=>{
    const val = p ?? 0;
    const h = (startH+i)%24, lbl = (h%12||12)+(h<12?"a":"p");
    return `<div class="bar"><em>${val}%</em><i style="height:${Math.max(val,3)*0.95}px"></i><span>${lbl}</span></div>`;
  }).join("");

  $("days").innerHTML = d.daily.map((x,i)=>`
    <div class="day ${i===0?"today":""}">
      <small>${i===0?"Today":parseDate(x.date).toLocaleDateString([], {weekday:"short"})}</small>
      <div class="ic">${describe(x.code)[1]}</div>
      <div class="hi">${conv(x.hi)}°</div><div class="lo">${conv(x.lo)}°</div>
    </div>`).join("");

  const othersList = OTHERS.filter(n=>n.toLowerCase()!==d.name.toLowerCase());
  if(!othersList.includes("Delhi") && d.name.toLowerCase()!=="delhi" && othersList.length < 4){
    othersList.push("Delhi");
  }
  $("cities").innerHTML = othersList.slice(0,4).map(n=>{
    const s = SAMPLE[n];
    return `<button type="button" data-city="${n}"><span><small>${s.country}</small>${n}<small>${describe(s.code)[0]}</small></span>
      <span class="t">${describe(s.code)[1]} ${conv(s.base)}°</span></button>`;
  }).join("");
  document.querySelectorAll("[data-city]").forEach(b=>b.onclick=()=>load(b.dataset.city));

  $("src").textContent = d.sample ? "Showing built-in sample data." : "Live data from Open-Meteo.";
}

/* ---------- Events ---------- */
function closeSuggest(){
  $("suggest").style.display = "none";
  $("q").setAttribute("aria-expanded", "false");
}

$("searchForm").addEventListener("submit", e=>{
  e.preventDefault();
  const v = $("q").value.trim();
  if(v){
    closeSuggest();
    load(v);
  }
});

$("q").addEventListener("input", ()=>{
  const v = $("q").value.trim().toLowerCase(), box = $("suggest");
  const m = v ? Object.keys(SAMPLE).filter(k=>k.toLowerCase().startsWith(v)) : [];
  box.innerHTML = m.map(k=>`<button type="button" role="option">${k}, ${SAMPLE[k].country}</button>`).join("");
  box.style.display = m.length ? "block" : "none";
  $("q").setAttribute("aria-expanded", m.length ? "true" : "false");
  [...box.children].forEach((b,i)=>b.onclick=()=>{
    $("q").value = m[i];
    closeSuggest();
    load(m[i]);
  });
});

document.addEventListener("click", e=>{
  if(!e.target.closest(".search")) closeSuggest();
});

document.addEventListener("keydown", e=>{
  if(e.key === "Escape") closeSuggest();
});

function setUnit(u){
  unit = u;
  $("uC").setAttribute("aria-pressed", String(u==="C"));
  $("uF").setAttribute("aria-pressed", String(u==="F"));
  if(data) render();
}
$("uC").onclick = ()=>setUnit("C");
$("uF").onclick = ()=>setUnit("F");

load("Delhi");
