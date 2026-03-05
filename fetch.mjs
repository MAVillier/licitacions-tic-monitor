// fetch.mjs — genera data/today.json sense filtre TIC (prova)
// Font: Portal de Dades Obertes (dataset ybgg-dgi6 - publicacions PSCP).
// La PSCP recomana usar aquest portal per a consultes massives/automatitzades.
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join('data','today.json');
const DAYS_BACK = parseInt(process.env.DAYS_BACK||'21',10);

const BASE_SOQL   = 'https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json';
const BASE_EXPORT = 'https://analisi.transparenciacatalunya.cat/api/views/ybgg-dgi6/rows.json?accessType=DOWNLOAD&$limit=2000';

function daysAgoISO(days){
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-days); return d.toISOString();
}

async function fetchJSON(url){
  const r = await fetch(url);
  if(!r.ok){ throw new Error('HTTP '+r.status+' '+await r.text()); }
  return r.json();
}

function normalize(it){
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

function filterByDate(items){
  const min = new Date(daysAgoISO(DAYS_BACK)).getTime();
  return items
    .map(normalize)
    .filter(it => {
      const d = new Date(it.data_publicacio_anunci||0).getTime();
      return !(min && d && d < min);
    })
    .sort((a,b)=> new Date(b.data_publicacio_anunci) - new Date(a.data_publicacio_anunci));
}

async function run(){
  const select = [
    'codi_expedient','objecte_contracte','nom_organ','tipus_contracte','fase_publicacio',
    'valor_estimat_contracte','import_adjudicacio_sense','data_publicacio_anunci',
    'termini_presentacio_ofertes','enllac_publicacio','denominacio_adjudicatari','codi_organ'
  ].join(',');
  const where = `data_publicacio_anunci >= '${daysAgoISO(DAYS_BACK)}'`;
  const soql = new URL(BASE_SOQL);
  soql.searchParams.set('$select', select);
  soql.searchParams.set('$where', where);
  soql.searchParams.set('$order','data_publicacio_anunci DESC');
  soql.searchParams.set('$limit','2000');

  let items = [];
  try{
    const data = await fetchJSON(soql.toString());
    items = data.map(normalize);
  }catch(e){
    // Fallback: exportació + filtre al client per data
    const payload = await fetchJSON(BASE_EXPORT);
    const cols = payload.meta.view.columns.map(c=>c.fieldName);
    const rows = payload.data.map(r=>{ const obj={}; cols.forEach((n,i)=>obj[n]=r[i]); return obj; });
    items = filterByDate(rows);
  }

  const out = { generatedAt: new Date().toISOString(), items };
  await fs.writeFile(OUT, JSON.stringify(out, null, 2), 'utf-8');
  console.log('OK →', OUT, 'items:', items.length);
}

run().catch(err=>{ console.error(err); process.exit(1); });
