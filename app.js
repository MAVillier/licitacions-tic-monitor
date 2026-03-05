// app.js — detecció CTTI robusta (per codi i per nom) + filtres

async function loadSnapshot(){
  const st = document.getElementById('status');
  st.textContent = 'Carregant dades (snapshot)…';
  try{
    const url = new URL('data/today.json', window.location.href).toString();
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status} carregant ${url}`);
    const payload = await res.json();
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

// ▶︎ Detecció CTTI (codi o nom)
function isCTTI(it){
  const code  = String(it.codi_organ ?? '').trim();
  const organ = (it.nom_organ || '').toLowerCase();
  // codi 11110 al perfil de contractant del CTTI a la PSCP
  // (i variacions típiques del nom oficial)
  const byCode = code === '11110' || code === '11110.0' || code === '011110';
  const byName = /\bctti\b/i.test(organ)
              || /centre de telecomunicacions.*tecnologies de la informaci[oó]/i.test(organ);
  return byCode || byName;
}

function applyFilters(items){
  const q = document.getElementById('q').value.trim().toLowerCase();
  const cttiOnly = document.getElementById('cttiOnly').checked;
  const daysBack = parseInt(document.getElementById('daysBack').value||'21',10);

  const min = new Date(); min.setHours(0,0,0,0); min.setDate(min.getDate()-daysBack);
  const minTime = min.getTime();

  return items.filter(it=>{
    // Data (si el registre no té data, no el descartem)
    const t = Date.parse(it.data_publicacio_anunci || '');
    if(Number.isFinite(minTime) && Number.isFinite(t) && t < minTime) return false;

    // Només CTTI → accepta per codi o per nom
    if(cttiOnly && !isCTTI(it)) return false;

    // Cerca
    if(q){
      const title = (it.objecte_contracte||'').toLowerCase();
      const org   = (it.nom_organ||'').toLowerCase();
      if(!(title.includes(q) || org.includes(q))) return false;
    }
    return true;
  });
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
