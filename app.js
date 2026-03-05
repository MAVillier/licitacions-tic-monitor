async function loadSnapshot(){
  const st = document.getElementById('status');
  st.textContent = 'Carregant dades (snapshot)…';
  try{
    const res = await fetch('data/today.json', {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const payload = await res.json();
    window._snapshot = payload; // { generatedAt, items }
    st.textContent = `Darrere execució: ${new Date(payload.generatedAt).toLocaleString('ca-ES')} · Total registres: ${payload.items.length}`;
    render(payload.items);
  }catch(e){
    console.error(e);
    st.textContent = 'No s\'ha pogut carregar el snapshot. Torna-ho a provar més tard.';
  }
}

function fmtMoney(n){ if(n==null||n==='') return '—'; const num=Number(n); if(Number.isNaN(num)) return '—'; return num.toLocaleString('ca-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}); }
function fmtDate(s){ if(!s) return '—'; const d=new Date(s); if(Number.isNaN(d.getTime())) return s; return d.toLocaleString('ca-ES'); }

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

function applyFilters(items){
  const q = document.getElementById('q').value.trim().toLowerCase();
  const cttiOnly = document.getElementById('cttiOnly').checked;
  const daysBack = parseInt(document.getElementById('daysBack').value||'7',10);
  const min = new Date(); min.setHours(0,0,0,0); min.setDate(min.getDate()-daysBack);
  return items.filter(it=>{
    const pub = new Date(it.data_publicacio_anunci||0);
    if(pub && pub < min) return false;
    if(cttiOnly && it.codi_organ !== '11110') return false;
    if(q && !( (it.objecte_contracte||'').toLowerCase().includes(q) || (it.nom_organ||'').toLowerCase().includes(q) )) return false;
    return true;
  });
}

function render(items){
  const host = document.getElementById('cards');
  const filtered = applyFilters(items);
  host.innerHTML='';
  if(filtered.length===0){ host.innerHTML='<div class="empty">Sense resultats amb els filtres actuals.</div>'; return; }
  filtered.forEach(it=>{
    const link = (it.enllac_publicacio && it.enllac_publicacio.url) ? it.enllac_publicacio.url : (it.enllac_publicacio||'#');
    const tags = detectServices(it.objecte_contracte);
    const el = document.createElement('article'); el.className='card';
    el.innerHTML = `
      <h3>${(it.objecte_contracte||'Sense títol').replace(/</g,'&lt;')}</h3>
      <div class="badges">
        <span class="badge">${it.nom_organ||'—'}</span>
        <span class="badge">${it.tipus_contracte||'—'}</span>
        <span class="badge ${it.fase_publicacio?.toLowerCase().includes('adjud')?'ok':(it.fase_publicacio?.toLowerCase().includes('licit')?'warn':'')}">${it.fase_publicacio||'—'}</span>
        ${tags.map(t=>`<span class="badge">${t}</span>`).join('')}
      </div>
      <div class="kv"><div>Publicació</div><span>${fmtDate(it.data_publicacio_anunci)}</span></div>
      <div class="kv"><div>Termini ofertes</div><span>${fmtDate(it.termini_presentacio_ofertes)}</span></div>
      <div class="kv"><div>Import estimat</div><span>${fmtMoney(it.valor_estimat_contracte)}</span></div>
      ${it.import_adjudicacio_sense?`<div class="kv"><div>Import adjudicació</div><span>${fmtMoney(it.import_adjudicacio_sense)}</span></div>`:''}
      ${it.denominacio_adjudicatari?`<div class="kv"><div>Adjudicatari</div><span>${it.denominacio_adjudicatari}</span></div>`:''}
      <div class="actions">
        <a class="primary" href="${link}" target="_blank">Obrir publicació oficial</a>
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
``
