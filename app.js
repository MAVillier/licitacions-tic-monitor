// app.js — Monitor TIC (tema clar + estat + sincronitza + CTTI + enriquiment beta)
console.log('[APP] app.js carregat');

// Endpoints Dades Obertes
const DS_PUB = 'https://analisi.transparenciacatalunya.cat';
const YBGG = {
  soql: DS_PUB + '/resource/ybgg-dgi6.json',
  exportJson: DS_PUB + '/api/views/ybgg-dgi6/rows.json?accessType=DOWNLOAD'
};
const HB6V = { soql: DS_PUB + '/resource/hb6v-jcbf.json' };

// Utilitats
function fmtMoney(n){ if(n==null||n==='') return '—'; const num=Number(n); if(Number.isNaN(num)) return '—'; return num.toLocaleString('ca-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}); }
function fmtDate(s){ if(!s) return '—'; const t=Date.parse(s); if(Number.isNaN(t)) return s; return new Date(t).toLocaleString('ca-ES'); }
// Eliminem diacrítics sense usar \p{Diacritic}
function norm(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }

// Càrrega snapshot
async function loadSnapshot(){
  const st = document.getElementById('status');
  st.textContent = 'Carregant dades (snapshot)…';
  try{
    const url = new URL('data/today.json', window.location.href).toString();
    const res = await fetch(url, { cache:'no-store' });
    console.log('[APP] GET', url, res.status);
    if(!res.ok) throw new Error(`HTTP ${res.status} carregant ${url}`);
    const payload = await res.json();
    console.log('[APP] snapshot items:', payload.items?.length ?? '—');

    window._cttiCodes = deriveCttiCodes(payload.items);
    console.log('[CTTI] Codis derivats al snapshot:', Array.from(window._cttiCodes));

    window._snapshot = payload;
    st.textContent = `Darrere execució: ${new Date(payload.generatedAt).toLocaleString('ca-ES')} · Total registres: ${payload.items.length}`;
    applyAndRender();
  }catch(e){
    console.error('[ERROR loadSnapshot]', e);
    st.textContent = 'No s\'ha pogut carregar el snapshot. Revisa que existeixi data/today.json a l’arrel.';
  }
}

// Sincronització live
async function forceSync(){
  const st = document.getElementById('status');
  st.textContent = 'Sincronitzant amb el portal…';
  const daysBack = parseInt(document.getElementById('daysBack').value||'21',10);
  const from = new Date(); from.setHours(0,0,0,0); from.setDate(from.getDate()-daysBack);
  const fromISO = from.toISOString();
  const select = [
    'codi_expedient','objecte_contracte','nom_organ','tipus_contracte','fase_publicacio',
    'valor_estimat_contracte','import_adjudicacio_sense','data_publicacio_anunci',
    'termini_presentacio_ofertes','enllac_publicacio','denominacio_adjudicatari','codi_organ'
  ].join(',');

  const soql = new URL(YBGG.soql);
  soql.searchParams.set('$select', select);
  soql.searchParams.set('$where', `data_publicacio_anunci >= '${fromISO}'`);
  soql.searchParams.set('$order', 'data_publicacio_anunci DESC');
  soql.searchParams.set('$limit', '5000');

  try{
    const r = await fetch(soql.toString(), { cache:'no-store' });
    console.log('[SYNC] SODA', r.status);
    if(!r.ok) throw new Error('SODA '+r.status);
    const arr = await r.json();
    const payload = { generatedAt:new Date().toISOString(), items: arr };
    window._cttiCodes = deriveCttiCodes(payload.items);
    window._snapshot = payload;
    st.textContent = `Sincronitzat (live) ${new Date().toLocaleString('ca-ES')} · Total registres: ${payload.items.length}`;
    applyAndRender();
  }catch(err){
    console.warn('[SYNC] SODA KO, provem export', err);
    try{
      const exp = await fetch(YBGG.exportJson, { cache:'no-store' });
      console.log('[SYNC] EXPORT', exp.status);
      if(!exp.ok) throw new Error('EXPORT '+exp.status);
      const data = await exp.json();
      const cols = data.meta.view.columns.map(c=>c.fieldName);
      const rows = data.data.map(r=>{ const o={}; cols.forEach((n,i)=>o[n]=r[i]); return o; });
      const items = rows.map(normalizeYBGG)
                        .filter(it => !it.data_publicacio_anunci || new Date(it.data_publicacio_anunci) >= from);
      const payload = { generatedAt:new Date().toISOString(), items };
      window._cttiCodes = deriveCttiCodes(payload.items);
      window._snapshot = payload;
      st.textContent = `Sincronitzat (export) ${new Date().toLocaleString('ca-ES')} · Total registres: ${payload.items.length}`;
      applyAndRender();
    }catch(e2){
      console.error('[SYNC] export KO; es mostra snapshot', e2);
      st.textContent = 'No s’ha pogut sincronitzar (xarxa/CORS). Es mostra el snapshot local.';
    }
  }
}
function normalizeYBGG(it){
  return {
    codi_expedient: it.codi_expedient,
    objecte_contracte: it.objecte_contracte || it.denominacio,
    nom_organ: it.nom_organ,
    tipus_contracte: it.tipus_contracte,
    fase_publicacio: it.fase_publicacio || it.resultat,
    valor_estimat_contracte: it.valor_estimat_contracte,
    import_adjudicacio_sense: it.import_adjudicacio_sense,
    data_publicacio_anunci: it.data_publicacio_anunci || it.data_publicacio,
    termini_presentacio_ofertes: it.termini_presentacio_ofertes,
    enllac_publicacio: it.enllac_publicacio,
    denominacio_adjudicatari: it.denominacio_adjudicatari,
    codi_organ: it.codi_organ
  };
}

// CTTI
function nameLooksCTTI(organNorm){
  if(!organNorm) return false;
  if(/\bctti\b/.test(organNorm)) return true;
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
  ['11110','11110.0','011110'].forEach(c=>set.add(c));
  return set;
}
function isCTTI(it){
  const code  = String(it.codi_organ ?? '').trim();
  const organ = norm(it.nom_organ);
  if(window._cttiCodes && window._cttiCodes.size && code && window._cttiCodes.has(code)) return true;
  return nameLooksCTTI(organ);
}
function countCTTIAll(items){ return (items||[]).filter(isCTTI).length; }

// Filtre per estat + CTTI + dies + cerca
function phaseMatches(sel, fase){
  if(!sel || sel==='tots') return true;
  const f = norm(fase||'');
  switch(sel){
    case 'licitacio':    return f.includes('licit');
    case 'adjudicacio':  return f.includes('adjud');
    case 'formalitzacio':return f.includes('formal');
    case 'execucio':     return f.includes('execu');
    case 'anul_desert':  return f.includes('anul') || f.includes('desert');
    default: return true;
  }
}
function applyFilters(items){
  const q = norm(document.getElementById('q').value.trim());
  const cttiOnly = document.getElementById('cttiOnly').checked;
  const daysBack = parseInt(document.getElementById('daysBack').value||'21',10);
  const phaseSel = document.getElementById('phaseFilter').value;

  const min = new Date(); min.setHours(0,0,0,0); min.setDate(min.getDate()-daysBack);
  const minTime = min.getTime();

  return items.filter(it=>{
    const t = Date.parse(it.data_publicacio_anunci || '');
    if(Number.isFinite(minTime) && Number.isFinite(t) && t < minTime) return false;
    if(cttiOnly && !isCTTI(it)) return false;
    if(!phaseMatches(phaseSel, it.fase_publicacio)) return false;

    if(q){
      const title = norm(it.objecte_contracte);
      const org   = norm(it.nom_organ);
      if(!(title.includes(q) || org.includes(q))) return false;
    }
    return true;
  });
}

// Enriquiment (hb6v-jcbf)
const _enrichCache = new Map();
async function enrichFromHB6(code, organ, title){
  const key = String(code||'') + '|' + String(organ||'');
  if(_enrichCache.has(key)) return _enrichCache.get(key);

  const sel = [
    'codi_expedient','organisme_contractant','descripcio_expedient',
    'import_adjudicacio','data_adjudicacio',
    'durada_mesos','durada_anys','numero_prorroga','data_inici_prorroga','data_fi_prorroga','adjudicatari'
  ].join(',');

  const wh = [];
  if(code) wh.push(`codi_expedient = '${String(code).replace(/'/g,"''")}'`);
  if(organ) wh.push(`lower(organisme_contractant) like '%${norm(organ).replace(/'/g,"''")}%'`);

  const q = new URL(HB6V.soql);
  q.searchParams.set('$select', sel);
  q.searchParams.set('$where', wh.length? wh.join(' AND ') : '1=1');
  q.searchParams.set('$limit', '10');

  try{
    const r = await fetch(q.toString(), { cache:'no-store' });
    console.log('[ENR] hb6v by code/organ', r.status);
    const arr = r.ok ? await r.json() : [];
    const best = Array.isArray(arr)&&arr.length? arr[0] : null;

    let prevGuess = null;
    if(!best && organ && title){
      const tokens = norm(title).split(/\W+/).filter(t=>t.length>=6).slice(0,3);
      if(tokens.length){
        const q2 = new URL(HB6V.soql);
        q2.searchParams.set('$select', sel);
        q2.searchParams.set('$where',
          `lower(organisme_contractant) like '%${norm(organ).replace(/'/g,"''")}%' AND (${
            tokens.map(t=>`lower(descripcio_expedient) like '%${t.replace(/'/g,"''")}%'`).join(' OR ')
          })`);
        q2.searchParams.set('$order', 'data_adjudicacio DESC');
        q2.searchParams.set('$limit', '5');
        const r2 = await fetch(q2.toString(), { cache:'no-store' });
        console.log('[ENR] hb6v by tokens', r2.status);
        const a2 = r2.ok ? await r2.json() : [];
        prevGuess = Array.isArray(a2)&&a2.length? a2[0] : null;
      }
    }

    const info = {
      durada: best ? composeDurada(best) : null,
      valor:  best ? { import_adjudicacio: best.import_adjudicacio } : null,
      anterior: prevGuess ? composeAnterior(prevGuess) : null
    };
    _enrichCache.set(key, info);
    return info;
  }catch(e){
    console.warn('Enriquiment hb6v-jcbf fallit', e);
    const info = { durada:null, valor:null, anterior:null };
    _enrichCache.set(key, info);
    return info;
  }
}
function composeDurada(row){
  const anys = Number(row.durada_anys||0), mesos = Number(row.durada_mesos||0);
  const pr = Number(row.numero_prorroga||0);
  const parts = [];
  if(anys)  parts.push(`${anys} any${anys>1?'s':''}`);
  if(mesos) parts.push(`${mesos} mes${mesos>1?'os':''}`);
  let s = parts.length? parts.join(' + ') : '—';
  if(pr) s += ` · pròrrogues: ${pr}`;
  if(row.data_inici_prorroga || row.data_fi_prorroga){
    s += ` (últ. pròrroga: ${fmtDate(row.data_inici_prorroga)} → ${fmtDate(row.data_fi_prorroga)})`;
  }
  return s;
}
function composeAnterior(row){
  return {
    descripcio: row.descripcio_expedient,
    adjudicatari: row.adjudicatari,
    import: row.import_adjudicacio,
    data: row.data_adjudicacio
  };
}

// Render + autoampliació si cal
function applyAndRender(){
  const items = window._snapshot?.items || [];
  if(!items.length) return;

  const st = document.getElementById('status');
  st.textContent = `Darrere execució: ${new Date(window._snapshot.generatedAt).toLocaleString('ca-ES')} · Total registres: ${items.length}`;

  const cttiAll = countCTTIAll(items);
  let list = applyFilters(items);

  if(document.getElementById('cttiOnly').checked && list.length === 0 && cttiAll > 0){
    const input = document.getElementById('daysBack');
    const original = input.value;
    input.value = 365;
    list = applyFilters(items);
    if(list.length > 0){
      st.textContent += ` · No hi havia CTTI amb ${original} dies; ampliat automàticament a 365 → ${list.length} CTTI.`;
    }else{
      input.value = original;
      st.textContent += ` · No hi ha CTTI amb els filtres actuals.`;
    }
  }

  const host = document.getElementById('cards');
  host.innerHTML='';
  if(list.length===0){
    host.innerHTML='<div class="empty">Sense resultats amb els filtres actuals.</div>';
    return;
  }
  list.forEach(it=>renderCard(it, host));
}
function renderCard(it, host){
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

    <div class="metrics">
      <div class="row"><div class="label">Durada</div><div class="val" data-k="durada">—</div></div>
      <div class="row"><div class="label">Valor</div><div class="val" data-k="valor">
        ${fmtMoney(it.valor_estimat_contracte)}${it.import_adjudicacio_sense?` · adjudicació: ${fmtMoney(it.import_adjudicacio_sense)}`:''}
      </div></div>
      <div class="row"><div class="label">Contracte anterior (beta)</div><div class="val" data-k="anterior">—</div></div>
    </div>

    <div class="actions">
      <a href="${link}" target="_cial</a>
      <a href="https://contractaciopublica.cat/ca/inici" target="_blank" rel="noopener">PSCP</a>
    </div>
  `;
  host.appendChild(el);

  enrichFromHB6(it.codi_expedient, it.nom_organ, it.objecte_contracte).then(info=>{
    if(!el.isConnected) return;
    if(info?.durada) el.querySelector('[data-k="durada"]').textContent = info.durada;
    if(info?.valor?.import_adjudicacio){
      const base = `${fmtMoney(it.valor_estimat_contracte)} · adjudicació: ${fmtMoney(info.valor.import_adjudicacio)}`;
      el.querySelector('[data-k="valor"]').textContent = base;
    }
    if(info?.anterior){
      const { descripcio, adjudicatari, import:imp, data } = info.anterior;
      el.querySelector('[data-k="anterior"]').innerHTML =
        `${(descripcio||'').replace(/</g,'&lt;')} · ${adjudicatari||'—'} · ${fmtMoney(imp)} · ${fmtDate(data)} `+
        ` <a href="https://contractaciopublica.cat/ca/inici" target="_blank" rel="noopener">(verificar a PSCP)</a>`;
    }
  }).catch(()=>{});
}

// Tags serveis
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

// Inici
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('phaseFilter').value = 'licitacio';
  document.getElementById('btnFilter').addEventListener('click', applyAndRender);
  document.getElementById('btnSync').addEventListener('click', forceSync);
  loadSnapshot();
});
