// app.js — FILTRE CTTI ROBUST: per codi i per nom (amb normalització) + aprenentatge de codis

async function loadSnapshot(){
  const st = document.getElementById('status');
  st.textContent = 'Carregant dades (snapshot)…';
  try{
    const url = new URL('data/today.json', window.location.href).toString();
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status} carregant ${url}`);
    const payload = await res.json();
    // Deriva codis CTTI existents a l'snapshot (si n'hi ha)
    window._cttiCodes = deriveCttiCodes(payload.items);
    console.log('[CTTI] Codis derivats al snapshot:', Array.from(window._cttiCodes));
    window._snapshot = payload; // { generatedAt, items }
    st.textContent = `Darrere execució: ${new Date(payload.generatedAt).toLocaleString('ca-ES')} · Total registres: ${payload.items.length}`;
    render(payload.items);
  }catch(e){
    console.error('[ERROR loadSnapshot]', e);
    st.textContent = 'No s\'ha pogut carregar el snapshot. Torna-ho a provar més tard.';
  }
}

function fmtMoney(n){ if(n==null||n==='') return '—'; const num=Number(n); if(Number.isNaN(num)) return '—'; return num.toLocaleString('ca-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}); }
function fmtDate(s){ if(!s) return '—'; const t=Date.parse(s); if(Number.isNaN(t)) return s; return new Date(t).toLocaleString('ca-ES'); }

// Normalitza (treu diacrítics) per comparar noms amb i sense accents
function norm(s){ return (s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase(); }

// ── DETECCIÓ CTTI ───────────────────────────────────────────────────────────────

// Patró de nom per CTTI (tolerant)
function nameLooksCTTI(organNorm){
  if(!organNorm) return false;
  if(/\bctti\b/.test(organNorm)) return true;
  // variants: "centre de telecomunicacions ... tecnologies de la informacio"
  return organNorm.includes('centre de telecomunicacions') && organNorm.includes('tecnologies de la informacio');
}

// Extreu codis CTTI presents al snapshot (si l'òrgan coincideix per nom)
function deriveCttiCodes(items){
  const set = new Set();
  for(const it of (items||[])){
    const organ = norm(it.nom_organ);
    if(nameLooksCTTI(organ)){
      const code = String(it.codi_organ ?? '').trim();
      if(code) set.add(code);
    }
  }
  return set;
}

function isCTTI(it){
  const code = String(it.codi_organ ?? '').trim();
  const organ = norm(it.nom_organ);
  // 1) Si hem après codis CTTI del snapshot, prioritzem-los
  if(window._cttiCodes && window._cttiCodes.size){
    if(code && window._cttiCodes.has(code)) return true;
  }
  // 2) Codi oficial del perfil CTTI a la PSCP (11110) i variants estilitzades
  if(code === '11110' || code === '11110.0' || code === '011110') return true;
  // 3) Coincidència pel nom (normalitzat)
  return nameLooksCTTI(organ);
}

// ── FILTRE I RENDER ────────────────────────────────────────────────────────────

function applyFilters(items){
  const q = norm(document.getElementById('q').value.trim());
  const cttiOnly = document.getElementById('cttiOnly').checked;
  const daysBack = parseInt(document.getElementById('daysBack').value||'21',10);

  const min = new Date(); min.setHours(0,0,0,0); min.setDate(min.getDate()-daysBack);
  const minTime = min.getTime();

  return items.filter(it=>{
    // Data (si no n'hi ha, no descartar; molts registres antics o segons la font poden ometre-la)
    const t = Date.parse(it.data_publicacio_anunci || '');
    if(Number.isFinite(minTime) && Number.isFinite(t) && t < minTime) return false;

    // Només CTTI → codi après, codi oficial o nom
    if(cttiOnly && !isCTTI(it)) return false;

    // Cerca lliure
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
  const tags=[]; buckets.forEach(([n,keys])=>{ if(keys.some(k=>t.includes(k))) tags.push(n); }); return [...new Set(tags)];
}

function render(items){
  const host = document.getElementById('cards');
  const filtered = applyFilters(items);
  host.innerHTML='';
  if(filtered.length===0){
    host.innerHTML='<div class="empty">Sense resultats amb els filtres actuals.</div>';
    return;
  }
  filtered.forEach(it=>{
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

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('btnFilter').addEventListener('click', ()=>{
    if(window._snapshot) render(window._snapshot.items);
  });
  loadSnapshot();
});
