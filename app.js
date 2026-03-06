/*
 * Licitacions TIC – ZERO-CONFIG
 * ─────────────────────────────────────────────────────────────────
 * ✅ Domini i dataset ja preconfigurats (Generalitat de Catalunya – PSCP):
 *    https://analisi.transparenciacatalunya.cat  +  dataset ybgg-dgi6
 * ✅ Detecta automàticament els camps de CPV / Data / Import al dataset.
 * ✅ Filtra a l'API per CPV TIC (48*, 72*, 302*, 324*, 50312*).
 */

const App = (() => {
  /**** CONFIG ****/
  const SOCRATA_DOMAIN = 'https://analisi.transparenciacatalunya.cat';
  const DATASET_ID     = 'ybgg-dgi6';

  // Prefixos TIC (CPV 2008): 48*, 72*, 302*, 324*, 50312*
  const TIC_CPV_PREFIXES = ['48', '72', '302', '324', '50312'];

  // Possibles noms de camps (heurística multi-portal)
  const CPV_CANDIDATES   = ['codi_cpv','cpv','cpv_principal','cpv_principal_codi','codi_cpv_principal'];
  const DATE_CANDIDATES  = ['data_publicacio_anunci','data_publicacio','data','data_anunci','fecha_publicacion','fecha','publication_date'];
  const AMOUNT_CANDIDATES= ['valor_estimat_contracte','pressupost_base_licitacio','import','pressupost','presupuesto_base_licitacion','importe','amount','valor_estimado_contrato'];

  let RESOLVED = { cpv: [], date: null, amount: null };

  /**** HELPERS ****/
  async function resolveColumns() {
    // Llegeix metadades de columnes: /api/views/<id>
    const metaURL = `${SOCRATA_DOMAIN}/api/views/${DATASET_ID}`;
    const res = await fetch(metaURL, { cache:'no-store' });
    if (!res.ok) throw new Error(`Meta HTTP ${res.status}`);
    const meta = await res.json();
    const cols = (meta.columns || []).map(c => c.fieldName);

    // Troba CPV(s), Data i Import
    RESOLVED.cpv = CPV_CANDIDATES.filter(n => cols.includes(n));
    RESOLVED.date = DATE_CANDIDATES.find(n => cols.includes(n)) || null;
    RESOLVED.amount = AMOUNT_CANDIDATES.find(n => cols.includes(n)) || null;

    if (RESOLVED.cpv.length === 0) {
      console.warn('[CPV] No s\'han detectat camps CPV. Es provarà sense filtre (cap camp trobat).');
    }
  }

  function buildCpvWhereSoql() {
    if (!RESOLVED.cpv || RESOLVED.cpv.length === 0) return null;
    const ors = [];
    for (const f of RESOLVED.cpv) {
      for (const p of TIC_CPV_PREFIXES) {
        ors.push(`${f} like '${p}%'`);
      }
    }
    return '(' + ors.join(' OR ') + ')';
  }

  function getOrderParam() {
    const sel = document.getElementById('sortBy');
    const v = sel ? sel.value : 'date_desc';
    if (v.startsWith('date')) {
      if (!RESOLVED.date) return undefined;
      return v.endsWith('asc') ? `${RESOLVED.date} ASC` : `${RESOLVED.date} DESC`;
    }
    if (v.startsWith('amount')) {
      if (!RESOLVED.amount) return undefined;
      return v.endsWith('asc') ? `${RESOLVED.amount} ASC` : `${RESOLVED.amount} DESC`;
    }
    return undefined;
  }

  function formatEUR(n) {
    if (n == null || n === '') return '';
    const num = typeof n === 'number' ? n : Number(String(n).replace(/,/g, '.'));
    if (!isFinite(num)) return String(n);
    return new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(num);
  }

  function parseDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('ca-ES');
  }

  /**** DATA ****/
  async function forceSync() {
    try {
      if (!RESOLVED.date && !RESOLVED.amount && RESOLVED.cpv.length === 0) {
        await resolveColumns();
      }

      const url = new URL(`${SOCRATA_DOMAIN}/resource/${DATASET_ID}.json`);
      const clauses = [];

      // Per defecte: últims 120 dies si tenim camp de data
      if (RESOLVED.date) {
        const fromISO = new Date(Date.now() - 1000*60*60*24*120).toISOString().slice(0,10);
        clauses.push(`${RESOLVED.date} >= '${fromISO}'`);
      }

      // Filtre TIC sempre que tinguem almenys un camp CPV
      const cpvWhere = buildCpvWhereSoql();
      if (cpvWhere) clauses.push(cpvWhere);

      if (clauses.length) url.searchParams.set('$where', clauses.join(' AND '));

      const order = getOrderParam();
      if (order) url.searchParams.set('$order', order);

      url.searchParams.set('$limit', '5000');

      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderList(data);
      return data;
    } catch (e) {
      console.error('[API]', e);
      const el = document.getElementById('results');
      if (el) el.innerHTML = `<div class="alert error">Error carregant dades: ${e.message}</div>`;
      return [];
    }
  }

  /**** UI ****/
  function renderList(rows) {
    const el = document.getElementById('results');
    if (!el) return;
    if (!rows || rows.length === 0) {
      el.innerHTML = '<div class="empty">No s\'han trobat licitacions TIC amb els filtres actuals.</div>';
      return;
    }

    // Títol / comprador / CPV / data / import – resolució tolerant
    const cards = rows.map((r) => {
      const title = r.titol || r.titulo || r.nom_licitacio || r.objecte || r.objecte_contracte || r.descripcio || '—';
      const buyer = r.organ_contractor || r.nom_organ || r.entitat || r.administracio || r.ens || '';
      const cpv   = RESOLVED.cpv.map(k=>r[k]).find(Boolean) || '';
      const dt    = RESOLVED.date && r[RESOLVED.date] ? parseDate(r[RESOLVED.date]) : '';
      const amt   = RESOLVED.amount && r[RESOLVED.amount] ? formatEUR(r[RESOLVED.amount]) : '';

      return `
        <article class="card">
          <header>
            <h3 class="card-title">${escapeHtml(title)}</h3>
            ${buyer ? `<div class="buyer">${escapeHtml(buyer)}</div>` : ''}
          </header>
          <div class="meta">
            ${dt  ? `<span class="tag">📅 ${dt}</span>` : ''}
            ${amt ? `<span class="tag">💶 ${amt}</span>` : ''}
            ${cpv ? `<span class="tag">CPV: ${escapeHtml(cpv)}</span>` : ''}
          </div>
        </article>
      `;
    }).join('');

    el.innerHTML = cards;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return { forceSync };
})();
