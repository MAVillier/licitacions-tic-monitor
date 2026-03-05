// app.js — Monitor TIC (CTTI robust + auto-ampliació de dies si cal)

// ───────────────────────────────────────────────────────────────────────────────
// CÀRREGA DEL SNAPSHOT
// ───────────────────────────────────────────────────────────────────────────────
async function loadSnapshot(){
  const st = document.getElementById('status');
  st.textContent = 'Carregant dades (snapshot)…';
  try{
    const url = new URL('data/today.json', window.location.href).toString();
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status} carregant ${url}`);
    const payload = await res.json();

    // Deriva codis CTTI reals presents al snapshot (si el NOM fa pinta de CTTI)
    window._cttiCodes = deriveCttiCodes(payload.items);
    console.log('[CTTI] Codis derivats al snapshot:', Array.from(window._cttiCodes));

    window._snapshot = payload; // { generatedAt, items }
    st.textContent = `Darrere execució: ${new Date(payload.generatedAt).toLocaleString('ca-ES')} · Total registres: ${payload.items.length}`;

    // Aplica filtres actuals i pinta
    applyAndRender();
  }catch(e){
    console.error('[ERROR loadSnapshot]', e);
    st.textContent = 'No s\'ha pogut carregar el snapshot. Torna-ho a provar més tard.';
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// FORMATEIG
// ───────────────────────────────────────────────────────────────────────────────
function fmtMoney(n){
  if(n==null || n==='') return '—';
  const num = Number(n);
  if(Number.isNaN(num)) return '—';
  return num.toLocaleString('ca-ES', {style:'currency', currency:'EUR', maximumFractionDigits:0});
}
function fmtDate(s){
  if(!s) return '—';
  const t = Date.parse(s);
  if(Number.isNaN(t)) return s;
  return new Date(t).toLocaleString('ca-ES');
}

// ───────────────────────────────────────────────────────────────────────────────
// NORMALITZACIÓ I DETECCIÓ CTTI
// ───────────────────────────────────────────────────────────────────────────────
function norm(s){
  return (s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
}
function nameLooksCTTI(organNorm){
  if(!organNorm) return false;
  if(/\bctti\b/.test(organNorm)) return true;
  // variants: “centre de telecomunicacions … tecnologies de la informacio”
  return organNorm.includes('centre de telecomunicacions') && organNorm.includes('tecnologies de la informacio');
}
function deriveCttiCodes(items){
  const set = new Set();
  for(const it of (items||[])){
    const organ = norm(it.nom_organ);
    if(nameLooksCTTI(organ)){
      const code = String(it.codi_organ ?? '').trim();
      if(code) set.add(code);
    }
  }
  // Variants conegudes de l’organisme CTTI (perfil PSCP 11110)
  ['11110','11110.0','011110'].forEach(c=>set.add(c));
  return set;
}
function isCTTI(it){
  const code  = String(it.codi_organ ?? '').trim();
  const organ = norm(it.nom_organ);
  if(window._cttiCodes && window._cttiCodes.size && code && window._cttiCodes.has(code)) return true;
  return nameLooksCTTI(organ);
}
function countCTTIAll(items){
  return (items||[]).filter(isCTTI).length;
}

// ───────────────────────────────────────────────────────────────────────────────
// FILTRES I RENDERITZAT
// ───────────────────────────────────────────────────────────────────────────────
function applyFilters(items){
  const q = norm(document.getElementById('q').value.trim());
  const cttiOnly = document.getElementById('cttiOnly').checked;
  const daysBack = parseInt(document.getElementById('daysBack').value||'21',10);

  const min = new Date(); min.setHours(0,0,0,0); min.setDate(min.getDate()-daysBack);
  const minTime = min.getTime();

  return items.filter(it=>{
    // Data (si no en porta, no el descartem per no perdre licitacions)
    const t = Date.parse(it.data_publicacio_anunci || '');
    if(Number.isFinite(minTime) && Number.isFinite(t) && t < minTime) return false;

    // Només CTTI
    if(cttiOnly && !isCTTI(it)) return false;

    // Cerca
    if(q){
      const title = norm(it.objecte_contracte);
      const org   = norm(it.nom_organ);
      if(!(title.includes(q) || org.includes(q))) return false;
    }
    return true;
  });
}

function detectServices(text){
  const t=(text||'').toLowerCase();
  const buckets=[
    ['Cloud & Infra',['cloud','núvol','nuvol','azure','aws','datacenter','servidor','servidors','xarxa','network']],
    ['Data & IA',['dades','data','bi','ia','ai','intel·ligència','machine','analytics']],
    ['Ciberseguretat',['ciber','seguretat','security','soc','siem','ens']],
    ['Aplicacions',['aplicaci','software','programari','devops','api','microserveis','plataforma']],
    ['Telecom',['telecom','xarxes','wan','lan','telefonia']]
  ];
  const tags=[]; buckets.forEach(([n,keys])=>{ if(keys.some(k=>t.includes(k))) tags.push(n); }); 
  return [...new Set(tags)];
}

function applyAndRender(){
  const items = window._snapshot?.items || [];
  if(!items.length) return;

  const st = document.getElementById('status');
  const cttiAll = countCTTIAll(items);     // CTTI totals dins del snapshot
  let list = applyFilters(items);           // el que veu la UI ara mateix

  // Si «Només CTTI» està ON, i surt 0, però sabem que n’hi ha al snapshot,
  // prova automàticament amb 365 dies i informa a l’usuari.
  if(document.getElementById('cttiOnly').checked && list.length === 0 && cttiAll > 0){
    const input = document.getElementById('daysBack');
    const original = input.value;
    input.value = 365;
    list = applyFilters(items);

    if(list.length > 0){
      st.textContent += ` · No hi havia CTTI amb ${original} dies; ampliat automàticament a 365 dies → ${list.length} resultats CTTI.`;
    }else{
      // Si ni així hi ha resultats (molt improbable si cttiAll>0), torna al valor original
      input.value = original;
    }
  }

  // Render
  const host = document.getElementById('cards');
  host.innerHTML='';
  if(list.length===0){
    host.innerHTML='<div class="empty">Sense resultats amb els filtres actuals.</div>';
    return;
  }

  list.forEach(it=>{
    // enllac_publicacio pot ser string o {url:...}
    const link = (it.enllac_publicacio && it.enllac_publicacio.url)
      ? it.enllac_publicacio.url
      : (typeof it.enllac_publicacio === 'string' ? it.enllac_publicacio : '#');

    const tags = detectServices(it.objecte_contracte);
    const el = document.createElement('article'); el.className='card';
    el.innerHTML = `
      <h3>${(it.objecte_contracte||'Sense títol').replace(/</g,'&lt;')}</h3>
      <div class="badges">
        <span class="badge">${it.nom_organ||'—'}</span>
        <span class="badge">${it.tipus_contracte||'—'}</span>
        <span class="badge ${String(it.fase_publicacio||'').toLowerCase().includes('adjud')?'ok':(String(it.fase_publicacio||'').toLowerCase().includes('licit')?'warn':'')}">${it.fase_publicacio||'—'}</span>
        ${tags.map(t=>`<span class="badge">${t}</span>`).join('')}
      </div>
      <div class="kv"><div>Publicació</div><span>${fmtDate(it.data_publicacio_anunci)}</span></div>
      <div class="kv"><div>Termini ofertes</div><span>${fmtDate(it.termini_presentacio_ofertes)}</span></div>
      <div class="kv"><div>Import estimat</div><span>${fmtMoney(it.valor_estimat_contracte)}</span></div>
      ${it.import_adjudicacio_sense?`<div class="kv"><div>Import adjudicació</div><span>${fmtMoney(it.import_adjudicacio_sense)}</span></div>`:''}
      ${it.denominacio_adjudicatari?`<div class="kv"><div>Adjudicatari</div><span>${it.denominacio_adjudicatari}</span></div>`:''}
      <div class="actions">
        ${link}Obrir publicació oficial</a>
      </div>`;
    host.appendChild(el);
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// INICIALITZACIÓ
// ───────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('btnFilter').addEventListener('click', applyAndRender);
  loadSnapshot();
});
