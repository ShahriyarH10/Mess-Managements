/* ============================================================
   DATABASE — Supabase
   ============================================================ */
const SUPABASE_URL = 'https://lrzotklutnyzcadutgwf.supabase.co';
const SUPABASE_KEY = 'sb_publishable__22c2PXW3UFp8RGF_C1rpQ_uvcyFXnb';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── Compatibility shims so all existing code works unchanged ── */

// txGetAll('members') → all rows ordered by created_at
// txGetAll('meals')   → all rows ordered by date
// txGetAll('bazar')   → all rows ordered by date
// txGetAll('rent')    → all rows ordered by month_key (stored as .key on each row)
async function txGetAll(store) {
  const orderCol = (store === 'meals' || store === 'bazar') ? 'date'
                 : store === 'rent' ? 'month_key'
                 : 'created_at';
  const { data, error } = await sb.from(store).select('*').order(orderCol);
  if (error) throw error;
  // rent rows: expose .key and .monthName aliases so existing code keeps working
  if (store === 'rent') data.forEach(r => { r.key = r.month_key; r.monthName = r.month_name; });
  return sanitizeRenderedData(data || []);
}

// txGet('rent', key)  → single rent row by month_key
// txGet('members', id) — not used in existing code, but included for safety
async function txGet(store, key) {
  if (store === 'rent') {
    const { data, error } = await sb.from('rent').select('*').eq('month_key', key).maybeSingle();
    if (error) throw error;
    if (data) { data.key = data.month_key; data.monthName = data.month_name; }
    return sanitizeRenderedData(data);
  }
  const { data, error } = await sb.from(store).select('*').eq('id', key).maybeSingle();
  if (error) throw error;
  return sanitizeRenderedData(data);
}

// txPut — upsert.  Handles members, meals, bazar, rent.
async function txPut(store, row) {
  if (store === 'members') {
    // members: if row has no id it's a new insert; otherwise update
    if (!row.id) {
      const ins = { name: row.name, room: row.room||'', rent: row.rent||0,
                    phone: row.phone||'', joined: row.joined||null };
      const { data, error } = await sb.from('members').insert(ins).select().single();
      if (error) throw error;
      return data.id;
    } else {
      const { error } = await sb.from('members').update({
        name: row.name, room: row.room||'', rent: row.rent||0,
        phone: row.phone||'', joined: row.joined||null
      }).eq('id', row.id);
      if (error) throw error;
      return row.id;
    }
  }

  if (store === 'meals') {
    const { data, error } = await sb.from('meals').upsert(
      { date: row.date, meals: row.meals },
      { onConflict: 'date' }
    ).select().single();
    if (error) throw error;
    return data.id;
  }

  if (store === 'bazar') {
    const { data, error } = await sb.from('bazar').upsert(
      { date: row.date, bazar: row.bazar, utility: row.utility||{} },
      { onConflict: 'date' }
    ).select().single();
    if (error) throw error;
    return data.id;
  }

  if (store === 'rent') {
    const { data, error } = await sb.from('rent').upsert(
      { month_key: row.key, month: row.month, year: row.year,
        month_name: row.monthName, entries: row.entries },
      { onConflict: 'month_key' }
    ).select().single();
    if (error) throw error;
    return data.month_key;
  }
}

// txDelete — delete by id (meals, bazar, members) or month_key (rent)
async function txDelete(store, key) {
  if (store === 'rent') {
    const { error } = await sb.from('rent').delete().eq('month_key', key);
    if (error) throw error;
  } else {
    const { error } = await sb.from(store).delete().eq('id', key);
    if (error) throw error;
  }
}

// txClear — not needed but kept to avoid reference errors
async function txClear(store) {
  const { error } = await sb.from(store).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw error;
}

/* ============================================================
   STATE
   ============================================================ */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const AVATAR_PALETTE = [
  {bg:'#1a2a3a',fg:'#5b9bd5'},{bg:'#1a2e25',fg:'#4caf82'},{bg:'#2e1a1a',fg:'#e05252'},
  {bg:'#2a2218',fg:'#d4a853'},{bg:'#251a2e',fg:'#9b7fd4'},{bg:'#1e2a2a',fg:'#4cb8b8'},
  {bg:'#2e1f1a',fg:'#d47a4c'},{bg:'#1a1a2e',fg:'#7a7dd4'}
];

let currentPage = 'dashboard';
let members = [];
let selectedProfileId = null;

function today() { return new Date().toISOString().slice(0, 10); }
function thisMonth() {
  const n = new Date();
  return { month: n.getMonth(), year: n.getFullYear() };
}
function pad2(n) { return String(n+1).padStart(2,'0'); }
function monthKey(y, m) { return `${y}-${pad2(m)}`; }
function fmt(n) { return Number(n||0).toLocaleString('en-IN'); }
function fmtTk(n) { return '৳' + fmt(n); }
function round2(n) { return Math.round((n||0)*100)/100; }
function initials(name) { return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
function avatarColor(i) { return AVATAR_PALETTE[i % AVATAR_PALETTE.length]; }

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeRenderedData(value) {
  if (Array.isArray(value)) return value.map(sanitizeRenderedData);
  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      out[k] = sanitizeRenderedData(v);
    });
    return out;
  }
  if (typeof value === 'string') return escapeHtml(value);
  return value;
}

function cleanInputText(value) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
}


/* ============================================================
   NAVIGATION
   ============================================================ */
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  pageEl.style.display = 'block';
  // Force reflow so CSS animations replay on every navigation
  pageEl.style.animation = 'none';
  pageEl.offsetHeight; // trigger reflow
  pageEl.style.animation = '';
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes("'"+page+"'")) n.classList.add('active');
  });
  // sync mobile bottom nav
  document.querySelectorAll('.mob-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  renderPage(page);
}

async function renderPage(page) {
  members = await txGetAll('members');
  switch(page) {
    case 'dashboard': await renderDashboard(); break;
    case 'profiles': await renderProfiles(); break;
    case 'meals': renderMeals(); break;
    case 'bazar': renderBazar(); break;
    case 'utility': await renderUtility(); break;
    case 'rent': renderRent(); break;
    case 'log': renderLog(); break;
    case 'members': renderMembers(); break;
  }
}

/* ============================================================
   DASHBOARD
   ============================================================ */
async function renderDashboard() {
  const {month, year} = thisMonth();
  const key = monthKey(year, month);
  const todayStr = today();
  const allMeals = await txGetAll('meals');
  const allBazar = await txGetAll('bazar');
  const rentRec = await txGet('rent', key);
  const { data: utilRec } = await sb.from('utility_payments').select('*').eq('month_key', key).maybeSingle();

  const monthMeals = allMeals.filter(r => r.date.startsWith(key));
  const monthBazar = allBazar.filter(r => r.date.startsWith(key));

  // Helper: sum only day+night keys (avoid triple-counting the legacy total key)
  function sumMeals(mealsObj) {
    let d=0, n=0;
    Object.entries(mealsObj||{}).forEach(([k,v]) => {
      if (k.endsWith('_day'))   d += Number(v);
      else if (k.endsWith('_night')) n += Number(v);
      // if no _day/_night keys exist (legacy), fall back to plain name keys
    });
    if (d===0 && n===0) {
      // legacy format: sum all values that aren't _day/_night
      Object.entries(mealsObj||{}).forEach(([k,v]) => { d += Number(v); });
    }
    return { day: d, night: n };
  }

  let totalDay = 0, totalNight = 0, totalBazar = 0;
  monthMeals.forEach(r => { const s=sumMeals(r.meals); totalDay+=s.day; totalNight+=s.night; });
  monthBazar.forEach(r => Object.values(r.bazar||{}).forEach(v => totalBazar += Number(v)));
  const totalMeals = round2(totalDay + totalNight);
  const mealRate = totalMeals > 0 ? round2(totalBazar / totalMeals) : 0;

  const totalRentDue  = rentRec ? rentRec.entries.reduce((s,e)=>s+Number(e.rent||0),0) : 0;
  const totalRentPaid = rentRec ? rentRec.entries.reduce((s,e)=>s+Number(e.paid||0),0) : 0;
  const bills = utilRec?.bills || {};
  const totalUtilDue  = ['elec','wifi','gas','khala','other'].reduce((s,k)=>s+(Number(bills[k])||0),0);
  const payments = utilRec?.payments || {};
  const totalUtilCollected = Object.values(payments).reduce((s,p)=>s+Number(p.paid||0),0);

  // Today's meal record
  const todayRec = allMeals.find(r => r.date === todayStr);
  const todayDay   = todayRec ? members.reduce((s,m)=>s+Number(todayRec.meals[m.name+'_day']  ??todayRec.meals[m.name]??0),0) : null;
  const todayNight = todayRec ? members.reduce((s,m)=>s+Number(todayRec.meals[m.name+'_night']??0),0) : null;

  // Recent activity — only use the legacy total key or sum day+night correctly
  const recentMeals = [...allMeals].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);

  // Per-member bazar totals this month
  let memBazar = {};
  monthBazar.forEach(r => { Object.entries(r.bazar||{}).forEach(([k,v]) => { memBazar[k] = (memBazar[k]||0) + Number(v); }); });
  const topBazar = Object.entries(memBazar).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxBazar = topBazar.length ? topBazar[0][1] : 1;

  const html = `
    <div class="topbar">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-sub">${MONTHS[month]} ${year} — ${members.length} members</div>
      </div>
      <div class="topbar-actions">
        <button class="btn btn-ghost btn-sm" onclick="navigate('meals')">+ Meal</button>
        <button class="btn btn-primary btn-sm" onclick="navigate('bazar')">+ Bazar</button>
      </div>
    </div>
    <div class="content">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Total meals</div>
          <div class="stat-value">${totalMeals}</div>
          <div class="stat-sub">${MONTHS[month]}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Meal rate</div>
          <div class="stat-value">${fmtTk(mealRate)}</div>
          <div class="stat-sub">per meal</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total bazar</div>
          <div class="stat-value">${fmtTk(totalBazar)}</div>
          <div class="stat-sub">groceries</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Utility collected</div>
          <div class="stat-value">${fmtTk(round2(totalUtilCollected))}</div>
          <div class="stat-sub">of ${fmtTk(round2(totalUtilDue))} due</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Rent collected</div>
          <div class="stat-value">${fmtTk(totalRentPaid)}</div>
          <div class="stat-sub">of ${fmtTk(totalRentDue)} due</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Days logged</div>
          <div class="stat-value">${monthMeals.length}</div>
          <div class="stat-sub">meal entries</div>
        </div>
      </div>

      ${todayRec ? `
      <div class="card" style="margin-bottom:14px">
        <div class="card-title">Today's meals — ${todayStr}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:12px">
          <div class="stat-card">
            <div class="stat-label">Day meals</div>
            <div class="stat-value">${todayDay}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Night meals</div>
            <div class="stat-value">${todayNight}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total today</div>
            <div class="stat-value">${round2(todayDay+todayNight)}</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${members.map(m => {
            const d = Number(todayRec.meals[m.name+'_day']  ?? todayRec.meals[m.name] ?? 0);
            const n = Number(todayRec.meals[m.name+'_night'] ?? 0);
            const hasMeal = d>0 || n>0;
            return `<div style="display:flex;align-items:center;gap:8px;background:var(--bg3);padding:7px 12px;border-radius:var(--radius-sm);border:1px solid var(--border)">
              <span style="font-size:13px;font-weight:500;color:${hasMeal?'var(--text)':'var(--text3)'}">${m.name}</span>
              ${d>0?`<span class="badge badge-blue">Day ${d}</span>`:''}
              ${n>0?`<span class="badge badge-amber">Night ${n}</span>`:''}
              ${!hasMeal?`<span class="badge badge-red">Absent</span>`:''}
            </div>`;
          }).join('')}
        </div>
      </div>` : `
      <div class="card" style="margin-bottom:14px;text-align:center;padding:20px">
        <div class="card-title">Today's meals — ${todayStr}</div>
        <div style="color:var(--text3);font-size:13px;margin-top:8px">No meal entry for today yet</div>
        <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="navigate('meals')">+ Add today's meals</button>
      </div>`}

      <div class="grid-2" style="gap:14px">
        <div class="card">
          <div class="card-title">Bazar leaders — ${MONTHS[month]}</div>
          ${topBazar.length ? topBazar.map(([name,amt]) => `
            <div class="mini-bar">
              <div class="mini-bar-label" style="overflow:hidden;text-overflow:ellipsis">${name}</div>
              <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.round((amt/maxBazar)*100)}%"></div></div>
              <div class="mini-bar-val">${fmtTk(amt)}</div>
            </div>`).join('') : '<div class="empty"><div class="empty-text">No bazar data yet</div></div>'}
        </div>
        <div class="card">
          <div class="card-title">Recent meal entries</div>
          ${recentMeals.length ? `<div class="tbl-wrap"><table>
            <thead><tr><th>Date</th><th>Day</th><th>Night</th><th>Total</th><th>Members</th></tr></thead>
            <tbody>${recentMeals.map(r => {
              const s = sumMeals(r.meals);
              const activeMembers = members.filter(m => {
                const d = Number(r.meals[m.name+'_day']  ?? r.meals[m.name] ?? 0);
                const n = Number(r.meals[m.name+'_night'] ?? 0);
                return d>0 || n>0;
              }).length;
              return `<tr><td>${r.date}</td><td>${s.day}</td><td>${s.night}</td><td>${round2(s.day+s.night)}</td><td>${activeMembers}</td></tr>`;
            }).join('')}</tbody>
          </table></div>` : '<div class="empty"><div class="empty-text">No meal data yet</div></div>'}
        </div>
      </div>

      ${rentRec && rentRec.entries.length ? `
      <div class="card" style="margin-top:14px">
        <div class="card-title">Rent status — ${MONTHS[month]} ${year}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${rentRec.entries.map(e => {
            const cls = e.status==='paid'?'badge-green':e.status==='partial'?'badge-amber':'badge-red';
            const label = e.status==='paid'?'Paid':e.status==='partial'?'Partial':'Due';
            return `<div style="display:flex;align-items:center;gap:8px;background:var(--bg3);padding:8px 12px;border-radius:var(--radius-sm);border:1px solid var(--border)">
              <span style="font-size:13px;font-weight:500">${e.name}</span>
              <span class="badge ${cls}">${label}</span>
              <span style="font-size:12px;color:var(--text2)">${fmtTk(e.paid)}/${fmtTk(e.rent)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      ${utilRec && Object.keys(utilRec.payments||{}).length ? `
      <div class="card" style="margin-top:14px">
        <div class="card-title">Utility status — ${MONTHS[month]} ${year}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${members.map(m => {
            const p = (utilRec.payments||{})[m.name] || {};
            const share = members.length > 0 ? round2(totalUtilDue / members.length) : 0;
            const cls = p.status==='paid'?'badge-green':p.status==='partial'?'badge-amber':'badge-red';
            const label = p.status==='paid'?'Paid':p.status==='partial'?'Partial':'Due';
            return `<div style="display:flex;align-items:center;gap:8px;background:var(--bg3);padding:8px 12px;border-radius:var(--radius-sm);border:1px solid var(--border)">
              <span style="font-size:13px;font-weight:500">${m.name}</span>
              <span class="badge ${cls}">${label}</span>
              <span style="font-size:12px;color:var(--text2)">${fmtTk(p.paid||0)}/${fmtTk(share)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
    </div>`;
  document.getElementById('page-dashboard').innerHTML = html;
}

/* ============================================================
   MEAL ENTRY
   ============================================================ */
function renderMeals() {
  const el = document.getElementById('page-meals');
  el.innerHTML = `
    <div class="topbar">
      <div><div class="page-title">Meal Entry</div><div class="page-sub">Log day & night meals per member</div></div>
    </div>
    <div class="content">
      <div class="card" style="margin-bottom:14px">
        <div class="date-row">
          <label>Date</label>
          <input type="date" class="input" id="meal-date" value="${today()}" style="width:180px" onchange="loadMealForDate()"/>
          <button class="btn btn-ghost btn-sm" onclick="loadMealForDate()">Load existing</button>
        </div>
        <div class="stat-grid" style="margin-bottom:16px">
          <div class="stat-card"><div class="stat-label">Total meals</div><div class="stat-value" id="m-total">0</div></div>
          <div class="stat-card"><div class="stat-label">Day meals</div><div class="stat-value" id="m-day">0</div></div>
          <div class="stat-card"><div class="stat-label">Night meals</div><div class="stat-value" id="m-night">0</div></div>
          <div class="stat-card"><div class="stat-label">Members eating</div><div class="stat-value" id="m-eating">0</div></div>
        </div>
        <div class="card-title" style="margin-bottom:10px">Meal per member</div>
        <div class="meal-grid" id="meal-input-grid"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="saveMeals()">Save meals</button>
          <button class="btn btn-ghost" onclick="setAllMeals(1)">All → 1</button>
          <button class="btn btn-ghost" onclick="setAllMeals(0)">Clear</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Recent entries</div>
        <div class="tbl-wrap" id="meals-recent-table"><div class="loading"><div class="spinner"></div>Loading...</div></div>
      </div>
    </div>`;
  buildMealInputs();
  loadMealForDate();
  loadMealsRecent();
}

const mealDayVals = {}, mealNightVals = {};

function buildMealInputs() {
  const grid = document.getElementById('meal-input-grid');
  if (!grid) return;
  members.forEach(m => {
    if (mealDayVals[m.id] == null) mealDayVals[m.id] = 1;
    if (mealNightVals[m.id] == null) mealNightVals[m.id] = 1;
  });
  grid.innerHTML = members.map(m => `
    <div class="meal-cell">
      <div class="meal-cell-name">${m.name}</div>
      <div class="meal-cell-row" style="margin-bottom:8px">
        <span class="meal-cell-label">Day</span>
        <input type="number" class="meal-num-input" id="mi-day-${m.id}" min="0" max="4" step="0.5"
          value="${mealDayVals[m.id] ?? 1}" oninput="updMealSummary()"/>
      </div>
      <div class="meal-cell-row">
        <span class="meal-cell-label">Night</span>
        <input type="number" class="meal-num-input" id="mi-night-${m.id}" min="0" max="4" step="0.5"
          value="${mealNightVals[m.id] ?? 1}" oninput="updMealSummary()"/>
      </div>
    </div>`).join('');
  updMealSummary();
}

function updMealSummary() {
  let dayTotal = 0, nightTotal = 0, eating = 0;
  members.forEach(m => {
    const d = parseFloat(document.getElementById('mi-day-'+m.id)?.value || 0);
    const n = parseFloat(document.getElementById('mi-night-'+m.id)?.value || 0);
    mealDayVals[m.id] = d;
    mealNightVals[m.id] = n;
    dayTotal += d;
    nightTotal += n;
    if (d > 0 || n > 0) eating++;
  });
  const te=document.getElementById('m-total'), td=document.getElementById('m-day'),
        tn=document.getElementById('m-night'), ce=document.getElementById('m-eating');
  if (te) te.textContent = round2(dayTotal + nightTotal);
  if (td) td.textContent = round2(dayTotal);
  if (tn) tn.textContent = round2(nightTotal);
  if (ce) ce.textContent = eating;
}

function setAllMeals(v) {
  members.forEach(m => {
    const dayEl = document.getElementById('mi-day-'+m.id);
    const nightEl = document.getElementById('mi-night-'+m.id);
    if (dayEl) dayEl.value = v;
    if (nightEl) nightEl.value = v;
    mealDayVals[m.id] = v;
    mealNightVals[m.id] = v;
  });
  updMealSummary();
}

async function loadMealForDate() {
  const date = document.getElementById('meal-date')?.value;
  if (!date) return;
  const { data: rec, error } = await sb.from('meals').select('*').eq('date', date).maybeSingle();
  if (error) { toast('Error loading: '+error.message); return; }
  if (rec) {
    members.forEach(m => {
      // meals stored as {name: total} or {name_day, name_night}
      const dayKey = m.name+'_day', nightKey = m.name+'_night';
      if (rec.meals[dayKey] != null || rec.meals[nightKey] != null) {
        mealDayVals[m.id]   = Number(rec.meals[dayKey]  ?? 0);
        mealNightVals[m.id] = Number(rec.meals[nightKey]?? 0);
      } else {
        // legacy: single value split evenly
        const total = Number(rec.meals[m.name]||0);
        mealDayVals[m.id]   = total;
        mealNightVals[m.id] = 0;
      }
    });
    buildMealInputs();
    toast('Loaded entry for '+date);
  } else {
    members.forEach(m => { mealDayVals[m.id]=1; mealNightVals[m.id]=1; });
    buildMealInputs();
    toast('No entry for '+date+' — starting fresh');
  }
}

async function saveMeals() {
  const date = document.getElementById('meal-date')?.value;
  if (!date) { toast('Select a date first'); return; }
  const meals = {};
  members.forEach(m => {
    meals[m.name+'_day']   = mealDayVals[m.id]   || 0;
    meals[m.name+'_night'] = mealNightVals[m.id] || 0;
    // keep legacy total key for backward compat with stats
    meals[m.name] = round2((mealDayVals[m.id]||0) + (mealNightVals[m.id]||0));
  });
  try {
    await txPut('meals', { date, meals });
    toast('Meals saved for '+date);
    loadMealsRecent();
  } catch(e) { toast('Save failed: '+e.message, 'error'); console.error(e); }
}

async function loadMealsRecent() {
  const wrap = document.getElementById('meals-recent-table');
  if (!wrap) return;
  const all = await txGetAll('meals');
  const recent = all.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  if (!recent.length) { wrap.innerHTML='<div class="empty"><div class="empty-text">No meal entries yet</div></div>'; return; }
  wrap.innerHTML=`<table><thead><tr><th>Date</th>${members.map(m=>`<th>${m.name}</th>`).join('')}<th>Total</th><th></th></tr></thead>
    <tbody>${recent.map(r=>{
      let t=0;
      const cells = members.map(m=>{
        const d = Number(r.meals[m.name+'_day'] ?? 0);
        const n = Number(r.meals[m.name+'_night'] ?? 0);
        const total = (r.meals[m.name+'_day'] != null || r.meals[m.name+'_night'] != null)
          ? d + n
          : Number(r.meals[m.name] ?? 0);
        t += total;
        return `<td>${round2(total)}</td>`;
      }).join('');
      return `<tr><td>${r.date}</td>${cells}<td><b>${round2(t)}</b></td>
        <td><button class="btn btn-ghost btn-sm btn-icon" onclick="deleteMeal('${r.id}')" title="Delete">✕</button></td></tr>`;
    }).join('')}</tbody></table>`;
}

async function deleteMeal(id) {
  if (!confirm('Delete this entry?')) return;
  try {
    await txDelete('meals', id);
    toast('Entry deleted');
    loadMealsRecent();
    if (currentPage === 'dashboard') renderDashboard();
  } catch(e) { toast('Delete failed: '+e.message, 'error'); console.error(e); }
}

/* ============================================================
   BAZAR ENTRY
   ============================================================ */
function renderBazar() {
  const el = document.getElementById('page-bazar');
  el.innerHTML = `
    <div class="topbar">
      <div><div class="page-title">Bazar Entry</div><div class="page-sub">Log daily grocery spending per member</div></div>
    </div>
    <div class="content">
      <div class="card" style="margin-bottom:14px">
        <div class="date-row">
          <label>Date</label>
          <input type="date" class="input" id="bazar-date" value="${today()}" style="width:180px" onchange="loadBazarForDate()"/>
          <button class="btn btn-ghost btn-sm" onclick="loadBazarForDate()">Load existing</button>
        </div>
        <div class="card-title">Bazar per member (৳)</div>
        <div class="meal-grid" id="bazar-input-grid" style="margin-bottom:16px"></div>
        <div class="stat-grid" style="margin-bottom:16px">
          <div class="stat-card"><div class="stat-label">Bazar total</div><div class="stat-value" id="bazar-tot">৳0</div></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="saveBazar()">Save bazar</button>
          <button class="btn btn-ghost" onclick="clearBazar()">Clear</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Recent entries</div>
        <div class="tbl-wrap" id="bazar-recent-table"><div class="loading"><div class="spinner"></div>Loading...</div></div>
      </div>
    </div>`;
  buildBazarInputs();
  loadBazarRecent();
}

function buildBazarInputs() {
  const g = document.getElementById('bazar-input-grid');
  if (!g) return;
  g.innerHTML = members.map(m => `
    <div class="meal-cell">
      <div class="meal-cell-name">${m.name}</div>
      <div class="meal-cell-row">
        <span class="meal-cell-label">৳</span>
        <input type="number" class="meal-num-input" id="bz-${m.id}" min="0" placeholder="0" oninput="updBazarSummary()"/>
      </div>
    </div>`).join('');
}

function updBazarSummary() {
  let b=0;
  members.forEach(m => { b+=parseFloat(document.getElementById('bz-'+m.id)?.value||0); });
  const bt=document.getElementById('bazar-tot');
  if(bt)bt.textContent=fmtTk(b);
}

async function loadBazarForDate() {
  const date = document.getElementById('bazar-date')?.value;
  if (!date) return;
  const { data: rec, error } = await sb.from('bazar').select('*').eq('date', date).maybeSingle();
  if (error) { toast('Error loading: '+error.message); return; }
  if (rec) {
    members.forEach(m => { const el=document.getElementById('bz-'+m.id); if(el)el.value=rec.bazar[m.name]??0; });
    updBazarSummary();
    toast('Loaded entry for '+date);
  } else {
    toast('No entry for '+date+' — starting fresh');
  }
}

function clearBazar() {
  members.forEach(m => { const el=document.getElementById('bz-'+m.id); if(el)el.value=''; });
  updBazarSummary();
}

async function saveBazar() {
  const date = document.getElementById('bazar-date')?.value;
  if (!date) { toast('Select a date first'); return; }
  const bazar = {};
  members.forEach(m => { bazar[m.name] = parseFloat(document.getElementById('bz-'+m.id)?.value||0); });
  try {
    // Preserve any existing utility data for this date
    const { data: existing } = await sb.from('bazar').select('utility').eq('date', date).maybeSingle();
    const utility = existing?.utility || {};
    await txPut('bazar', { date, bazar, utility });
    toast('Bazar saved for '+date);
    loadBazarRecent();
  } catch(e) { toast('Save failed: '+e.message, 'error'); console.error(e); }
}

async function loadBazarRecent() {
  const wrap = document.getElementById('bazar-recent-table');
  if (!wrap) return;
  const all = await txGetAll('bazar');
  const recent = all.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  if (!recent.length) { wrap.innerHTML='<div class="empty"><div class="empty-text">No bazar entries yet</div></div>'; return; }
  wrap.innerHTML=`<table><thead><tr><th>Date</th>${members.map(m=>`<th>${m.name}</th>`).join('')}<th>Total</th><th></th></tr></thead>
    <tbody>${recent.map(r=>{
      const bt=Object.values(r.bazar||{}).reduce((s,v)=>s+Number(v),0);
      return `<tr><td>${r.date}</td>${members.map(m=>`<td>${r.bazar[m.name]!=null?fmtTk(r.bazar[m.name]):'—'}</td>`).join('')}
        <td><b>${fmtTk(bt)}</b></td>
        <td><button class="btn btn-ghost btn-sm btn-icon" onclick="deleteBazar('${r.id}')" title="Delete">✕</button></td></tr>`;
    }).join('')}</tbody></table>`;
}

async function deleteBazar(id) {
  if (!confirm('Delete this entry?')) return;
  try {
    await txDelete('bazar', id);
    toast('Entry deleted');
    loadBazarRecent();
  } catch(e) { toast('Delete failed: '+e.message, 'error'); console.error(e); }
}

/* ============================================================
   ROOM RENT
   ============================================================ */
async function renderRent() {
  const el = document.getElementById('page-rent');
  const n = new Date();
  el.innerHTML = `
    <div class="topbar">
      <div><div class="page-title">Room Rent</div><div class="page-sub">Track monthly rent collection</div></div>
    </div>
    <div class="content">
      <div class="month-sel" style="margin-bottom:16px">
        <label>Month</label>
        <select class="input" id="rent-month" style="width:240px">${MONTHS.map((m,i)=>`<option value="${i}"${i===n.getMonth()?' selected':''}>${m}</option>`).join('')}</select>
        <label>Year</label>
        <select class="input" id="rent-year" style="width:100px">${Array.from({length:5},(_,i)=>2023+i).map(y=>`<option${y===n.getFullYear()?' selected':''}>${y}</option>`).join('')}</select>
        <button class="btn btn-ghost" onclick="loadRentMonth()">Load</button>
      </div>
      <div class="stat-grid" id="rent-stats"></div>
      <div class="card">
        <div class="card-title">Rent entries</div>
        <div class="tbl-wrap">
          <table class="utility-pay-table"><thead><tr><th>Member</th><th>Default rent</th><th>Paid (৳)</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody id="rent-tbody"></tbody></table>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
          <button class="btn btn-primary" onclick="saveRent()">Save rent</button>
          <button class="btn btn-ghost" onclick="markAllPaid()">Mark all paid</button>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <div class="card-title">All months history</div>
        <div class="tbl-wrap" id="rent-history"></div>
      </div>
    </div>`;
  loadRentMonth();
  loadRentHistory();
}

async function loadRentMonth() {
  const month = parseInt(document.getElementById('rent-month')?.value||0);
  const year = parseInt(document.getElementById('rent-year')?.value||2025);
  const key = monthKey(year, month);
  const rec = await txGet('rent', key);
  const tb = document.getElementById('rent-tbody');
  if (!tb) return;
  tb.innerHTML = members.map(m => {
    const e = rec?.entries?.find(x=>x.name===m.name)||{};
    const due = e.rent ?? m.rent ?? 0;
    const paid = e.paid ?? 0;
    const status = e.status ?? 'unpaid';
    const notes = e.notes ?? '';
    const cls = status==='paid'?'badge-green':status==='partial'?'badge-amber':'badge-red';
    return `<tr>
      <td><b>${m.name}</b></td>
      <td style="color:var(--text3)">${fmtTk(m.rent||0)}</td>
      <td><input type="number" class="input input-sm" id="rp-${m.id}" value="${paid}" data-due="${due}" style="width:100px" oninput="updRentSummary()"/></td>
      <td><select class="input input-sm" id="rs-${m.id}" style="width:110px">
        <option value="paid"${status==='paid'?' selected':''}>Paid</option>
        <option value="unpaid"${status==='unpaid'?' selected':''}>Not paid</option>
        <option value="partial"${status==='partial'?' selected':''}>Partial</option>
      </select></td>
      <td><input type="text" class="input input-sm notes-input" id="rn-${m.id}" placeholder="—" value="${notes}"/></td>
    </tr>`;
  }).join('');
  updRentSummary();
}

function updRentSummary() {
  let due=0,paid=0;
  members.forEach(m => {
    const paidInput = document.getElementById('rp-'+m.id);
    due += parseFloat(paidInput?.dataset.due||0);
    paid += parseFloat(paidInput?.value||0);
  });
  const el = document.getElementById('rent-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total due</div><div class="stat-value">${fmtTk(due)}</div></div>
    <div class="stat-card"><div class="stat-label">Collected</div><div class="stat-value" style="color:var(--green)">${fmtTk(paid)}</div></div>
    <div class="stat-card"><div class="stat-label">Outstanding</div><div class="stat-value" style="color:${due-paid>0?'var(--red)':'var(--green)'}">${fmtTk(due-paid)}</div></div>
    <div class="stat-card"><div class="stat-label">Collection rate</div><div class="stat-value">${due>0?Math.round((paid/due)*100):0}%</div></div>`;
}

function markAllPaid() {
  members.forEach(m => {
    const rp=document.getElementById('rp-'+m.id), rs=document.getElementById('rs-'+m.id);
    if(rp&&rs){ rp.value=rp.dataset.due||0; rs.value='paid'; }
  });
  updRentSummary();
}

async function saveRent() {
  const month = parseInt(document.getElementById('rent-month')?.value||0);
  const year = parseInt(document.getElementById('rent-year')?.value||2025);
  const key = monthKey(year, month);
  const entries = members.map(m => ({
    name: m.name,
    rent: parseFloat(document.getElementById('rp-'+m.id)?.dataset.due||0),
    paid: parseFloat(document.getElementById('rp-'+m.id)?.value||0),
    status: document.getElementById('rs-'+m.id)?.value||'unpaid',
    notes: cleanInputText(document.getElementById('rn-'+m.id)?.value||'')
  }));
  try {
    await txPut('rent', { key, month, year, monthName: MONTHS[month], entries });
    toast('Rent saved for '+MONTHS[month]+' '+year);
    loadRentHistory();
  } catch(e) { toast('Save failed: '+e.message, 'error'); console.error(e); }
}

async function loadRentHistory() {
  const wrap = document.getElementById('rent-history');
  if (!wrap) return;
  const all = await txGetAll('rent');
  if (!all.length) { wrap.innerHTML='<div class="empty"><div class="empty-text">No rent records yet</div></div>'; return; }
  all.sort((a,b)=>b.key.localeCompare(a.key));
  wrap.innerHTML=`<table><thead><tr><th>Month</th><th>Total due</th><th>Collected</th><th>Outstanding</th><th>Status</th></tr></thead>
    <tbody>${all.map(r=>{
      const due=r.entries.reduce((s,e)=>s+Number(e.rent||0),0);
      const paid=r.entries.reduce((s,e)=>s+Number(e.paid||0),0);
      const allPaid=r.entries.every(e=>e.status==='paid');
      const anyUnpaid=r.entries.some(e=>e.status==='unpaid');
      const cls=allPaid?'badge-green':anyUnpaid?'badge-red':'badge-amber';
      const label=allPaid?'Complete':anyUnpaid?'Pending':'Partial';
      return `<tr><td><b>${r.monthName} ${r.year}</b></td><td>${fmtTk(due)}</td><td style="color:var(--green)">${fmtTk(paid)}</td><td style="color:${due-paid>0?'var(--red)':'var(--green)'}">${fmtTk(due-paid)}</td><td><span class="badge ${cls}">${label}</span></td></tr>`;
    }).join('')}</tbody></table>`;
}

/* ============================================================
   PROFILES
   ============================================================ */
async function renderProfiles() {
  const el = document.getElementById('page-profiles');

  // Only build the shell once — preserve the select value on period changes
  if (!document.getElementById('prof-period')) {
    el.innerHTML = `
      <div class="topbar">
        <div><div class="page-title">Member Profiles</div><div class="page-sub">Individual summaries & history</div></div>
        <div class="topbar-actions">
          <select class="input" id="prof-period" onchange="refreshProfiles()" style="width:160px">
            <option value="all">All time</option>
            <option value="1" selected>This month</option>
            <option value="3">Last 3 months</option>
            <option value="6">Last 6 months</option>
          </select>
        </div>
      </div>
      <div class="content">
        <div class="grid-auto" id="profile-card-grid" style="margin-bottom:20px"></div>
        <div class="card profile-mobile-list" id="profile-mobile-list" style="margin-bottom:14px;padding:4px 16px"></div>
        <div id="profile-detail-section"></div>
      </div>`;
  }

  const allMeals = await txGetAll('meals');
  const allBazar = await txGetAll('bazar');
  const allRent  = await txGetAll('rent');
  const { data: allUtility } = await sb.from('utility_payments').select('*');

  buildProfileCards(allMeals, allBazar, allRent, allUtility||[]);
  if (selectedProfileId) showProfileDetail(selectedProfileId, allMeals, allBazar, allRent, allUtility||[]);
}

async function refreshProfiles() {
  const allMeals = await txGetAll('meals');
  const allBazar = await txGetAll('bazar');
  const allRent  = await txGetAll('rent');
  const { data: allUtility } = await sb.from('utility_payments').select('*');

  buildProfileCards(allMeals, allBazar, allRent, allUtility||[]);
  if (selectedProfileId) showProfileDetail(selectedProfileId, allMeals, allBazar, allRent, allUtility||[]);
  else document.getElementById('profile-detail-section').innerHTML = '';
}

function getFilteredData(allMeals, allBazar, allRent, period, allUtility=[]) {
  if (period === 'all') return { meals: allMeals, bazar: allBazar, rent: allRent, utility: allUtility };
  const months = parseInt(period);
  const now = new Date();
  let cutMonth = now.getMonth() - months + 1;
  let cutYear  = now.getFullYear();
  while (cutMonth < 0)  { cutMonth += 12; cutYear--; }
  while (cutMonth > 11) { cutMonth -= 12; cutYear++; }
  const cutStr = cutYear + '-' + String(cutMonth + 1).padStart(2, '0');
  return {
    meals:   allMeals.filter(r => r.date.slice(0,7) >= cutStr),
    bazar:   allBazar.filter(r => r.date.slice(0,7) >= cutStr),
    rent:    allRent.filter(r => r.key >= cutStr),
    utility: allUtility.filter(r => r.month_key >= cutStr)
  };
}

function getMemberStats(member, meals, bazar, rent, utility=[]) {
  let totalMeals=0, totalBazar=0, rentDue=0, rentPaid=0, utilityDue=0, utilityPaid=0, activeDays=0;
  const byMonth = {};
  const ensureMonth = k => { byMonth[k] = byMonth[k]||{meals:0,bazar:0,rentPaid:0,utilityPaid:0}; };
  meals.forEach(r => {
    const v = Number(r.meals[member.name]||0);
    totalMeals += v; if(v>0) activeDays++;
    const k = r.date.slice(0,7); ensureMonth(k);
    byMonth[k].meals += v;
  });
  bazar.forEach(r => {
    const v = Number(r.bazar[member.name]||0);
    totalBazar += v;
    const k = r.date.slice(0,7); ensureMonth(k);
    byMonth[k].bazar += v;
  });
  rent.forEach(r => {
    const e = r.entries?.find(x=>x.name===member.name);
    if (e) {
      rentDue  += Number(e.rent||0);
      rentPaid += Number(e.paid||0);
      ensureMonth(r.key);
      byMonth[r.key].rentPaid += Number(e.paid||0);
    }
  });
  utility.forEach(r => {
    const bills = r.bills || {};
    const total = ['elec','wifi','gas','khala','other'].reduce((s,k)=>s+(Number(bills[k])||0),0);
    const perHead = members.length > 0 ? round2(total / members.length) : 0;
    const p = (r.payments || {})[member.name] || {};
    utilityDue  += perHead;
    utilityPaid += Number(p.paid||0);
    ensureMonth(r.month_key);
    byMonth[r.month_key].utilityPaid += Number(p.paid||0);
  });

  const filteredTotalMeals = meals.reduce((s,r)=>s+Object.values(r.meals||{}).reduce((a,v)=>a+Number(v),0),0);
  const filteredTotalBazar = bazar.reduce((s,r)=>s+Object.values(r.bazar||{}).reduce((a,v)=>a+Number(v),0),0);
  const mealRate = filteredTotalMeals > 0 ? (filteredTotalBazar / filteredTotalMeals) : 0;
  const mealCost = round2(totalMeals * mealRate);
  const mealBalance = round2(totalBazar - mealCost);

  const totalDays = meals.length;
  const avgMeals = totalDays>0 ? round2(totalMeals/totalDays) : 0;
  const latestRent = [...rent].sort((a,b)=>b.key.localeCompare(a.key))[0];
  const latestStatus = latestRent?.entries?.find(x=>x.name===member.name)?.status||'unpaid';
  const latestUtil = [...utility].sort((a,b)=>b.month_key.localeCompare(a.month_key))[0];
  const latestUtilStatus = (latestUtil?.payments||{})[member.name]?.status||'unpaid';
  return { totalMeals, totalBazar, mealRate, mealCost, mealBalance, rentDue, rentPaid, utilityDue, utilityPaid, activeDays, avgMeals, latestStatus, latestUtilStatus, byMonth };
}

function buildProfileCards(allMeals, allBazar, allRent, allUtility=[]) {
  const period = document.getElementById('prof-period')?.value || '1';
  const { meals, bazar, rent, utility } = getFilteredData(allMeals, allBazar, allRent, period, allUtility);
  const grid = document.getElementById('profile-card-grid');
  if (!grid) return;
  if (!members.length) {
    grid.innerHTML='<div class="empty"><div class="empty-text">No members yet. Add members first.</div></div>';
    const mob = document.getElementById('profile-mobile-list'); if(mob) mob.innerHTML='';
    return;
  }

  // Desktop grid cards (hidden on mobile via CSS)
  grid.innerHTML = members.map((m, i) => {
    const stats = getMemberStats(m, meals, bazar, rent, utility);
    const col = avatarColor(i);
    const cls = stats.latestStatus==='paid'?'badge-green':stats.latestStatus==='partial'?'badge-amber':'badge-red';
    const rentLabel = stats.latestStatus==='paid'?'Rent paid':stats.latestStatus==='partial'?'Partial':'Rent due';
    const utCls = stats.latestUtilStatus==='paid'?'badge-green':stats.latestUtilStatus==='partial'?'badge-amber':'badge-red';
    const utLabel = stats.latestUtilStatus==='paid'?'Utility paid':stats.latestUtilStatus==='partial'?'Util partial':'Utility due';
    return `<div class="profile-card${selectedProfileId===m.id?' active':''}" onclick="selectProfile('${m.id}')">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div class="avatar" style="background:${col.bg};color:${col.fg}">${initials(m.name)}</div>
        <div>
          <div style="font-weight:600;font-size:15px">${m.name}</div>
          <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
            <span class="badge ${cls}">${rentLabel}</span>
            <span class="badge ${utCls}">${utLabel}</span>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div class="stat-card" style="padding:10px"><div class="stat-label">Meals</div><div style="font-size:18px;font-weight:600">${stats.totalMeals}</div></div>
        <div class="stat-card" style="padding:10px"><div class="stat-label">Avg/day</div><div style="font-size:18px;font-weight:600">${stats.avgMeals}</div></div>
        <div class="stat-card" style="padding:10px"><div class="stat-label">Bazar</div><div style="font-size:15px;font-weight:600">${fmtTk(stats.totalBazar)}</div></div>
        <div class="stat-card" style="padding:10px"><div class="stat-label">Utility paid</div><div style="font-size:15px;font-weight:600;color:var(--green)">${fmtTk(stats.utilityPaid)}</div></div>
        <div class="stat-card" style="padding:10px;grid-column:span 2"><div class="stat-label">Rent paid</div><div style="font-size:15px;font-weight:600;color:var(--green)">${fmtTk(stats.rentPaid)}</div></div>
      </div>
    </div>`;
  }).join('');

  // Mobile list (name + rent due only, tap for full detail)
  const mob = document.getElementById('profile-mobile-list');
  if (mob) {
    mob.innerHTML = members.map((m, i) => {
      const stats = getMemberStats(m, meals, bazar, rent, utility);
      const col = avatarColor(i);
      const cls = stats.latestStatus==='paid'?'badge-green':stats.latestStatus==='partial'?'badge-amber':'badge-red';
      const rentLabel = stats.latestStatus==='paid'?'Paid':stats.latestStatus==='partial'?'Partial':'Due';
      const utClsM = stats.latestUtilStatus==='paid'?'badge-green':stats.latestUtilStatus==='partial'?'badge-amber':'badge-red';
      const netDue = stats.rentDue - stats.rentPaid;
      return `<div class="profile-mobile-item${selectedProfileId===m.id?' active':''}" onclick="selectProfile('${m.id}')">
        <div class="pmi-left">
          <div class="avatar" style="width:34px;height:34px;font-size:11px;flex-shrink:0;background:${col.bg};color:${col.fg}">${initials(m.name)}</div>
          <div class="pmi-name">${m.name}</div>
        </div>
        <div class="pmi-right">
          <span style="font-size:13px;font-weight:500;color:${netDue>0?'var(--red)':netDue<0?'var(--green)':'var(--text2)'}">${netDue>0?fmtTk(netDue)+' due':netDue<0?fmtTk(-netDue)+' overpaid':'Settled'}</span>
          <span class="badge ${cls}">${rentLabel}</span>
          <span class="badge ${utClsM}">${stats.latestUtilStatus==='paid'?'Util':'Util?'}</span>
          <span style="color:var(--text3);font-size:14px">${selectedProfileId===m.id?'▲':'▼'}</span>
        </div>
      </div>`;
    }).join('');
  }
}

async function selectProfile(id) {
  selectedProfileId = selectedProfileId === id ? null : id;
  const allMeals = await txGetAll('meals');
  const allBazar = await txGetAll('bazar');
  const allRent  = await txGetAll('rent');
  const { data: allUtility } = await sb.from('utility_payments').select('*');
  buildProfileCards(allMeals, allBazar, allRent, allUtility||[]);
  if (selectedProfileId) showProfileDetail(selectedProfileId, allMeals, allBazar, allRent, allUtility||[]);
  else document.getElementById('profile-detail-section').innerHTML='';
}

function showProfileDetail(id, allMeals, allBazar, allRent, allUtility=[]) {
  const member = members.find(m=>m.id===id);
  if (!member) return;
  const period = document.getElementById('prof-period')?.value || '1';
  const { meals, bazar, rent, utility } = getFilteredData(allMeals, allBazar, allRent, period, allUtility);
  const stats = getMemberStats(member, meals, bazar, rent, utility);
  const col = avatarColor(members.indexOf(member));
  const net = stats.rentPaid - stats.rentDue;
  const netCls = net >= 0 ? 'net-pos' : 'net-neg';
  const utilNet = round2(stats.utilityPaid - stats.utilityDue);
  const mealNet = round2(stats.mealBalance);
  const mealNetText = mealNet > 0 ? 'Get ' + fmtTk(mealNet) : mealNet < 0 ? 'Pay ' + fmtTk(Math.abs(mealNet)) : 'Settled';

  // All months sorted
  const allMonthKeys = Object.keys(stats.byMonth).sort();
  const recent8 = allMonthKeys.slice(-8);
  const maxMeals = Math.max(...recent8.map(k=>stats.byMonth[k]?.meals||0), 1);

  // All meals total share
  const totalAllMeals = allMeals.reduce((s,r)=>s+Object.values(r.meals||{}).reduce((a,v)=>a+Number(v),0),0);
  const totalAllBazar = allBazar.reduce((s,r)=>s+Object.values(r.bazar||{}).reduce((a,v)=>a+Number(v),0),0);
  const mealShare = totalAllMeals > 0 ? Math.round((stats.totalMeals/totalAllMeals)*100) : 0;
  const bazarShare = totalAllBazar > 0 ? Math.round((stats.totalBazar/totalAllBazar)*100) : 0;

  const detail = document.getElementById('profile-detail-section');
  detail.innerHTML = `
    <div class="card">
      <div class="profile-head">
        <div class="avatar" style="width:52px;height:52px;font-size:17px;background:${col.bg};color:${col.fg}">${initials(member.name)}</div>
        <div class="profile-meta">
          <div style="font-family:var(--font-serif);font-size:22px">${member.name}</div>
          <div style="font-size:13px;color:var(--text2);margin-top:3px">Default rent: ${fmtTk(member.rent||0)} / month · ${member.room||'—'}</div>
        </div>
        <div class="profile-balances">
          <div class="profile-balance-item">
            <div style="font-size:11px;color:var(--text3);margin-bottom:3px">Meal pay / get</div>
            <div style="font-size:18px;font-weight:600" class="${mealNet>=0?'net-pos':'net-neg'}">${mealNetText}</div>
          </div>
          <div class="profile-balance-item sep">
            <div style="font-size:11px;color:var(--text3);margin-bottom:3px">Rent balance</div>
            <div style="font-size:18px;font-weight:600" class="${netCls}">${net>=0?'+':''}${fmtTk(Math.abs(net))}</div>
          </div>
          <div class="profile-balance-item sep">
            <div style="font-size:11px;color:var(--text3);margin-bottom:3px">Utility balance</div>
            <div style="font-size:18px;font-weight:600" class="${utilNet>=0?'net-pos':'net-neg'}">${utilNet>=0?'+':''}${fmtTk(Math.abs(utilNet))}</div>
          </div>
        </div>
      </div>

      <div class="profile-stats-grid">
        <div class="stat-card"><div class="stat-label">Total meals</div><div class="stat-value">${stats.totalMeals}</div></div>
        <div class="stat-card"><div class="stat-label">Active days</div><div class="stat-value">${stats.activeDays}</div></div>
        <div class="stat-card"><div class="stat-label">Avg / day</div><div class="stat-value">${stats.avgMeals}</div></div>
        <div class="stat-card"><div class="stat-label">Bazar spent</div><div class="stat-value" style="font-size:16px">${fmtTk(stats.totalBazar)}</div></div>
        <div class="stat-card"><div class="stat-label">Meal cost</div><div class="stat-value" style="font-size:16px">${fmtTk(stats.mealCost)}</div></div>
        <div class="stat-card"><div class="stat-label">Rent due</div><div class="stat-value" style="font-size:16px">${fmtTk(stats.rentDue)}</div></div>
        <div class="stat-card"><div class="stat-label">Rent paid</div><div class="stat-value" style="font-size:16px;color:var(--green)">${fmtTk(stats.rentPaid)}</div></div>
        <div class="stat-card"><div class="stat-label">Utility due</div><div class="stat-value" style="font-size:16px">${fmtTk(round2(stats.utilityDue))}</div></div>
        <div class="stat-card"><div class="stat-label">Utility paid</div><div class="stat-value" style="font-size:16px;color:var(--green)">${fmtTk(round2(stats.utilityPaid))}</div></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Share in mess (all time)</div>
        <div class="mini-bar"><div class="mini-bar-label">Meal share</div><div class="mini-bar-track"><div class="mini-bar-fill" style="width:${mealShare}%"></div></div><div class="mini-bar-val">${mealShare}%</div></div>
        <div class="mini-bar"><div class="mini-bar-label">Bazar share</div><div class="mini-bar-track"><div class="mini-bar-fill" style="width:${bazarShare}%"></div></div><div class="mini-bar-val">${bazarShare}%</div></div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Monthly meal history</div>
        ${recent8.length ? `
          <div class="hist-labels">${recent8.map(k=>`<span>${MONTHS[parseInt(k.slice(5))-1].slice(0,3)}</span>`).join('')}</div>
          <div class="hist-wrap">${recent8.map(k=>{
            const v=stats.byMonth[k]?.meals||0;
            const h=Math.max(Math.round((v/maxMeals)*44),3);
            return `<div class="hist-b" style="height:${h}px"><div class="tip">${MONTHS[parseInt(k.slice(5))-1].slice(0,3)} ${k.slice(0,4)}: ${v} meals</div></div>`;
          }).join('')}</div>` : '<div style="color:var(--text3);font-size:13px">No history</div>'}
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Recent months breakdown</div>
        <div class="tbl-wrap">
          <table><thead><tr><th>Month</th><th>Meals</th><th>Bazar</th><th>Rent paid</th><th>Utility paid</th></tr></thead>
          <tbody>${allMonthKeys.slice(-6).reverse().map(k=>{
            const d=stats.byMonth[k]||{};
            return `<tr><td>${MONTHS[parseInt(k.slice(5))-1]} ${k.slice(0,4)}</td><td>${d.meals||0}</td><td>${fmtTk(d.bazar||0)}</td><td>${fmtTk(d.rentPaid||0)}</td><td>${fmtTk(d.utilityPaid||0)}</td></tr>`;
          }).join('')}</tbody></table>
        </div>
      </div>
    </div>`;
}

/* ============================================================
   UTILITY ENTRY
   ============================================================ */
async function renderUtility() {
  const el = document.getElementById('page-utility');
  const n = new Date();
  el.innerHTML = `
    <div class="topbar">
      <div><div class="page-title">Utility Entry</div><div class="page-sub">Track bills & who has paid their share</div></div>
    </div>
    <div class="content">
      <div class="month-sel" style="margin-bottom:16px">
        <label>Month</label>
        <select class="input" id="ut-month" style="width:240px">${MONTHS.map((m,i)=>`<option value="${i}"${i===n.getMonth()?' selected':''}>${m}</option>`).join('')}</select>
        <label>Year</label>
        <select class="input" id="ut-year" style="width:100px">${Array.from({length:5},(_,i)=>2023+i).map(y=>`<option${y===n.getFullYear()?' selected':''}>${y}</option>`).join('')}</select>
        <button class="btn btn-ghost" onclick="loadUtilityMonth()">Load</button>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="card-title">Bill amounts</div>
        <div class="util-fields">
          <div class="field" style="margin:0"><label>Electricity (৳)</label><input type="number" class="input" id="ut-elec"  min="0" placeholder="0" oninput="updUtilSummary()"/></div>
          <div class="field" style="margin:0"><label>WiFi (৳)</label>        <input type="number" class="input" id="ut-wifi"  min="0" placeholder="0" oninput="updUtilSummary()"/></div>
          <div class="field" style="margin:0"><label>Gas (৳)</label>         <input type="number" class="input" id="ut-gas"   min="0" placeholder="0" oninput="updUtilSummary()"/></div>
          <div class="field" style="margin:0"><label>Khala bill (৳)</label>  <input type="number" class="input" id="ut-khala" min="0" placeholder="0" oninput="updUtilSummary()"/></div>
          <div class="field" style="margin:0"><label>Other (৳)</label>       <input type="number" class="input" id="ut-other" min="0" placeholder="0" oninput="updUtilSummary()"/></div>
        </div>
        <div class="stat-grid" style="margin-top:16px;margin-bottom:0">
          <div class="stat-card"><div class="stat-label">Total bill</div><div class="stat-value" id="ut-total">৳0</div></div>
          <div class="stat-card"><div class="stat-label">Per member</div><div class="stat-value" id="ut-per">৳0</div></div>
          <div class="stat-card"><div class="stat-label">Collected</div><div class="stat-value" id="ut-collected" style="color:var(--green)">৳0</div></div>
          <div class="stat-card"><div class="stat-label">Outstanding</div><div class="stat-value" id="ut-outstanding" style="color:var(--red)">৳0</div></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="card-title">Payment status per member</div>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Member</th><th>Share (৳)</th><th>Paid (৳)</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody id="ut-pay-tbody"></tbody>
          </table>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          <button class="btn btn-primary" onclick="saveUtility()">Save</button>
          <button class="btn btn-ghost"   onclick="markAllUtilPaid()">Mark all paid</button>
          <button class="btn btn-ghost"   onclick="clearUtility()">Clear bills</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">History</div>
        <div class="tbl-wrap" id="ut-history"><div class="loading"><div class="spinner"></div>Loading...</div></div>
      </div>
    </div>`;
  loadUtilityMonth();
  loadUtilityHistory();
}

function updUtilSummary() {
  const total = ['ut-elec','ut-wifi','ut-gas','ut-khala','ut-other']
    .reduce((s,id) => s + parseFloat(document.getElementById(id)?.value||0), 0);
  const perHead = members.length > 0 ? round2(total / members.length) : 0;
  const te = document.getElementById('ut-total'), tp = document.getElementById('ut-per');
  if(te) te.textContent = fmtTk(total);
  if(tp) tp.textContent = fmtTk(perHead);
  // If rows don't exist yet, build them; otherwise just update the share display
  const tbody = document.getElementById('ut-pay-tbody');
  if (!tbody) return;
  if (!tbody.hasChildNodes()) {
    buildUtilPayRows(perHead);
  } else {
    // update only the share amount cell per row without rebuilding
    members.forEach(m => {
      const shareCell = document.getElementById('utp-share-'+m.id);
      if (shareCell) shareCell.textContent = fmtTk(perHead);
    });
  }
  updUtilPaySummary();
}

function buildUtilPayRows(perHead) {
  const tbody = document.getElementById('ut-pay-tbody');
  if (!tbody) return;
  tbody.innerHTML = members.map(m => {
    return `<tr>
      <td><b>${m.name}</b></td>
      <td style="color:var(--text2)" id="utp-share-${m.id}">${fmtTk(perHead)}</td>
      <td><input type="number" class="input input-sm" id="utp-paid-${m.id}"
            value="0" style="width:95px" oninput="updUtilPaySummary()"/></td>
      <td><select class="input input-sm" id="utp-status-${m.id}" style="width:110px" onchange="updUtilPaySummary()">
        <option value="unpaid" selected>Not paid</option>
        <option value="paid">Paid</option>
        <option value="partial">Partial</option>
      </select></td>
      <td class="notes-cell"><input type="text" class="input input-sm notes-input" id="utp-notes-${m.id}" placeholder="—"/></td>
    </tr>`;
  }).join('');
}

function updUtilPaySummary() {
  let collected = 0;
  members.forEach(m => { collected += parseFloat(document.getElementById('utp-paid-'+m.id)?.value||0); });
  const total = ['ut-elec','ut-wifi','ut-gas','ut-khala','ut-other']
    .reduce((s,id) => s + parseFloat(document.getElementById(id)?.value||0), 0);
  const outstanding = Math.max(0, round2(total - collected));
  const ce = document.getElementById('ut-collected'), oe = document.getElementById('ut-outstanding');
  if(ce) ce.textContent = fmtTk(round2(collected));
  if(oe) oe.textContent = fmtTk(outstanding);
}

function markAllUtilPaid() {
  const total = ['ut-elec','ut-wifi','ut-gas','ut-khala','ut-other']
    .reduce((s,id) => s + parseFloat(document.getElementById(id)?.value||0), 0);
  const perHead = members.length > 0 ? round2(total / members.length) : 0;
  members.forEach(m => {
    const pp = document.getElementById('utp-paid-'+m.id);
    const ps = document.getElementById('utp-status-'+m.id);
    if(pp) pp.value = perHead;
    if(ps) ps.value = 'paid';
  });
  updUtilPaySummary();
}

async function loadUtilityMonth() {
  const month = parseInt(document.getElementById('ut-month')?.value || 0);
  const year  = parseInt(document.getElementById('ut-year')?.value  || new Date().getFullYear());
  const key   = monthKey(year, month);

  // Load from utility_payments table (or fall back to bazar utility field)
  const { data: rec } = await sb.from('utility_payments')
    .select('*').eq('month_key', key).maybeSingle();

  if (rec) {
    const u = rec.bills || {};
    ['elec','wifi','gas','khala','other'].forEach(k => {
      const el = document.getElementById('ut-'+k); if(el) el.value = u[k] || 0;
    });
    const total = ['elec','wifi','gas','khala','other'].reduce((s,k)=>s+(u[k]||0),0);
    const perHead = members.length > 0 ? round2(total / members.length) : 0;
    // ensure rows exist first
    const tbody = document.getElementById('ut-pay-tbody');
    if (tbody && !tbody.hasChildNodes()) buildUtilPayRows(perHead);
    // restore saved payment values
    const payments = rec.payments || {};
    members.forEach(m => {
      const p = payments[m.name] || {};
      const pp = document.getElementById('utp-paid-'+m.id);
      const ps = document.getElementById('utp-status-'+m.id);
      const pn = document.getElementById('utp-notes-'+m.id);
      const sc = document.getElementById('utp-share-'+m.id);
      if(pp) pp.value = p.paid ?? 0;
      if(ps) ps.value = p.status || 'unpaid';
      if(pn) pn.value = p.notes || '';
      if(sc) sc.textContent = fmtTk(perHead);
    });
    toast('Loaded utility for ' + MONTHS[month] + ' ' + year);
  } else {
    ['elec','wifi','gas','khala','other'].forEach(k => {
      const el = document.getElementById('ut-'+k); if(el) el.value = '';
    });
    toast('No utility record for ' + MONTHS[month] + ' ' + year);
  }
  updUtilSummary();
}

function clearUtility() {
  ['ut-elec','ut-wifi','ut-gas','ut-khala','ut-other'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  updUtilSummary();
}

async function saveUtility() {
  const month = parseInt(document.getElementById('ut-month')?.value || 0);
  const year  = parseInt(document.getElementById('ut-year')?.value  || new Date().getFullYear());
  const key   = monthKey(year, month);

  const bills = {
    elec:  parseFloat(document.getElementById('ut-elec')?.value  || 0),
    wifi:  parseFloat(document.getElementById('ut-wifi')?.value  || 0),
    gas:   parseFloat(document.getElementById('ut-gas')?.value   || 0),
    khala: parseFloat(document.getElementById('ut-khala')?.value || 0),
    other: parseFloat(document.getElementById('ut-other')?.value || 0)
  };
  const payments = {};
  members.forEach(m => {
    payments[m.name] = {
      paid:   parseFloat(document.getElementById('utp-paid-'+m.id)?.value   || 0),
      status: document.getElementById('utp-status-'+m.id)?.value            || 'unpaid',
      notes:  document.getElementById('utp-notes-'+m.id)?.value             || ''
    };
  });

  try {
    const { error } = await sb.from('utility_payments').upsert(
      { month_key: key, month, year, month_name: MONTHS[month], bills, payments },
      { onConflict: 'month_key' }
    );
    if (error) throw error;
    toast('Utility saved for ' + MONTHS[month] + ' ' + year);
    loadUtilityHistory();
  } catch(e) { toast('Save failed: ' + e.message, 'error'); console.error(e); }
}

async function loadUtilityHistory() {
  const wrap = document.getElementById('ut-history');
  if (!wrap) return;
  const { data: all, error } = await sb.from('utility_payments').select('*').order('month_key', { ascending: false });
  if (error || !all?.length) {
    wrap.innerHTML = '<div class="empty"><div class="empty-text">No utility records yet</div></div>'; return;
  }
  wrap.innerHTML = `<table>
    <thead>
      <tr>
        <th>Month</th><th>Total bill</th><th>Per member</th>
        ${members.map(m=>`<th>${m.name}</th>`).join('')}
        <th>Collected</th><th>Outstanding</th>
      </tr>
    </thead>
    <tbody>
      ${all.slice(0,12).map(r => {
        const bills = r.bills || {};
        const total = ['elec','wifi','gas','khala','other'].reduce((s,k)=>s+(bills[k]||0),0);
        const perHead = members.length > 0 ? round2(total / members.length) : 0;
        const payments = r.payments || {};
        let collected = 0;
        const memberCells = members.map(m => {
          const p = payments[m.name] || {};
          collected += Number(p.paid || 0);
          const cls = p.status==='paid'?'badge-green':p.status==='partial'?'badge-amber':'badge-red';
          const lbl = p.status==='paid'?'Paid':p.status==='partial'?'Part':'Due';
          return `<td><span class="badge ${cls}">${lbl}</span><span style="font-size:11px;color:var(--text2);margin-left:4px">${fmtTk(p.paid||0)}</span></td>`;
        }).join('');
        const outstanding = Math.max(0, round2(total - collected));
        return `<tr>
          <td><b>${r.month_name} ${r.year}</b></td>
          <td>${fmtTk(total)}</td>
          <td style="color:var(--text2)">${fmtTk(perHead)}</td>
          ${memberCells}
          <td style="color:var(--green)"><b>${fmtTk(round2(collected))}</b></td>
          <td style="color:${outstanding>0?'var(--red)':'var(--green)'}">${fmtTk(outstanding)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

/* ============================================================
   MONTHLY LOG
   ============================================================ */
async function renderLog() {
  const el = document.getElementById('page-log');
  const n = new Date();
  el.innerHTML = `
    <div class="topbar">
      <div><div class="page-title">Monthly Log</div><div class="page-sub">Full month report</div></div>
    </div>
    <div class="content">
      <div class="month-sel" style="margin-bottom:16px">
        <label>Month</label>
        <select class="input" id="log-month" style="width:240px">${MONTHS.map((m,i)=>`<option value="${i}"${i===n.getMonth()?' selected':''}>${m}</option>`).join('')}</select>
        <label>Year</label>
        <select class="input" id="log-year" style="width:100px">${Array.from({length:5},(_,i)=>2023+i).map(y=>`<option${y===n.getFullYear()?' selected':''}>${y}</option>`).join('')}</select>
        <button class="btn btn-primary" onclick="loadLog()">Generate report</button>
      </div>
      <div id="log-content"><div class="empty"><div class="empty-text">Select a month and click Generate report</div></div></div>
    </div>`;
}

async function loadLog() {
  const month = parseInt(document.getElementById('log-month').value);
  const year = parseInt(document.getElementById('log-year').value);
  const key = monthKey(year, month);
  const allMeals = await txGetAll('meals');
  const allBazar = await txGetAll('bazar');
  const rentRec = await txGet('rent', key);

  const fm = allMeals.filter(r=>r.date.startsWith(key)).sort((a,b)=>a.date.localeCompare(b.date));
  const fb = allBazar.filter(r=>r.date.startsWith(key)).sort((a,b)=>a.date.localeCompare(b.date));

  function getMemberMealTotal(mealsObj, memberName) {
    if ((mealsObj||{})[memberName+'_day'] != null || (mealsObj||{})[memberName+'_night'] != null) {
      return round2(Number((mealsObj||{})[memberName+'_day'] || 0) + Number((mealsObj||{})[memberName+'_night'] || 0));
    }
    return round2(Number((mealsObj||{})[memberName] || 0));
  }

  let totalMeals=0, totalBazar=0, totalUtility=0;
  const memMeals={}, memBazar={};
  members.forEach(m=>{memMeals[m.name]=0;memBazar[m.name]=0;});

  fm.forEach(r=>{
    members.forEach(m => {
      const memberTotal = getMemberMealTotal(r.meals, m.name);
      memMeals[m.name] += memberTotal;
      totalMeals += memberTotal;
    });
  });

  fb.forEach(r=>{
    Object.entries(r.bazar||{}).forEach(([n,v])=>{memBazar[n]=(memBazar[n]||0)+Number(v); totalBazar += Number(v);});
    if(r.utility) Object.values(r.utility).forEach(v=>totalUtility+=Number(v));
  });

  Object.keys(memMeals).forEach(name => memMeals[name] = round2(memMeals[name]));
  const mealRate = totalMeals>0?round2(totalBazar/totalMeals):0;

  // Payment calc
  const paymentData = members.map(m=>{
    const rentEntry = rentRec?.entries?.find(e=>e.name===m.name)||{};
    const meals = memMeals[m.name]||0;
    const bazar = memBazar[m.name]||0;
    const mealCost = round2(meals * mealRate);
    const utility = members.length>0 ? round2(totalUtility/members.length) : 0;
    const rent = Number(rentEntry.rent||m.rent||0);
    const totalOwed = round2(mealCost + utility + rent);
    const bazarCredit = bazar;
    const net = round2(totalOwed - bazarCredit);
    return { name:m.name, meals, bazar, mealCost, utility, rent, totalOwed, bazarCredit, net };
  });

  const wrap = document.getElementById('log-content');
  wrap.innerHTML = `
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">Total meals</div><div class="stat-value">${round2(totalMeals)}</div></div>
      <div class="stat-card"><div class="stat-label">Total bazar</div><div class="stat-value" style="font-size:18px">${fmtTk(totalBazar)}</div></div>
      <div class="stat-card"><div class="stat-label">Meal rate</div><div class="stat-value" style="font-size:18px">${fmtTk(mealRate)}</div></div>
      <div class="stat-card"><div class="stat-label">Total utility</div><div class="stat-value" style="font-size:18px">${fmtTk(totalUtility)}</div></div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-title">Payment summary — ${MONTHS[month]} ${year}</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Member</th><th>Meals</th><th>Meal cost</th><th>Utility share</th><th>Rent</th><th>Total owed</th><th>Bazar credit</th><th>Net (pay/get)</th></tr></thead>
        <tbody>${paymentData.map(p=>{
          const netCls = p.net>0?'net-neg':p.net<0?'net-pos':'';
          const netLabel = p.net>0?`Pay ${fmtTk(p.net)}`:p.net<0?`Get ${fmtTk(-p.net)}`:'Settled';
          return `<tr><td><b>${p.name}</b></td><td>${p.meals}</td><td>${fmtTk(p.mealCost)}</td><td>${fmtTk(p.utility)}</td><td>${fmtTk(p.rent)}</td><td>${fmtTk(p.totalOwed)}</td><td style="color:var(--green)">${fmtTk(p.bazarCredit)}</td><td class="${netCls}"><b>${netLabel}</b></td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>

    <div class="grid-2" style="gap:14px">
      <div class="card">
        <div class="card-title">Meal log</div>
        <div class="scroll-table tbl-wrap"><table>
          <thead><tr><th>Date</th>${members.map(m=>`<th>${m.name}</th>`).join('')}<th>Total</th></tr></thead>
          <tbody>${fm.map(r=>{
            let t = 0;
            const rowCells = members.map(m => {
              const memberTotal = getMemberMealTotal(r.meals, m.name);
              t += memberTotal;
              return `<td>${memberTotal}</td>`;
            }).join('');
            return `<tr><td>${r.date.slice(8)}</td>${rowCells}<td><b>${round2(t)}</b></td></tr>`;
          }).join('')}
          </tbody>
          <tfoot><tr><td>Total</td>${members.map(m=>`<td>${memMeals[m.name]||0}</td>`).join('')}<td>${round2(totalMeals)}</td></tr></tfoot>
        </table></div>
      </div>
      <div class="card">
        <div class="card-title">Bazar log</div>
        <div class="scroll-table tbl-wrap"><table>
          <thead><tr><th>Date</th>${members.map(m=>`<th>${m.name}</th>`).join('')}<th>Total</th></tr></thead>
          <tbody>${fb.map(r=>{const t=Object.values(r.bazar||{}).reduce((s,v)=>s+Number(v),0);return`<tr><td>${r.date.slice(8)}</td>${members.map(m=>`<td>${r.bazar[m.name]!=null?fmtTk(r.bazar[m.name]):'0'}</td>`).join('')}<td><b>${fmtTk(t)}</b></td></tr>`;}).join('')}
          </tbody>
          <tfoot><tr><td>Total</td>${members.map(m=>`<td>${fmtTk(memBazar[m.name]||0)}</td>`).join('')}<td>${fmtTk(totalBazar)}</td></tr></tfoot>
        </table></div>
      </div>
    </div>`;
}

/* ============================================================
   MEMBERS
   ============================================================ */
async function renderMembers() {
  const el = document.getElementById('page-members');
  el.innerHTML = `
    <div class="topbar">
      <div><div class="page-title">Members</div><div class="page-sub">Manage mess members & rent defaults</div></div>
      <div class="topbar-actions">
        <button class="btn btn-primary" onclick="openAddMemberModal()">+ Add member</button>
      </div>
    </div>
    <div class="content">
      <div class="card">
        <div class="card-title">Current members (${members.length})</div>
        <div class="tbl-wrap" id="members-table"></div>
      </div>
    </div>`;
  renderMembersTable();
}

function renderMembersTable() {
  const wrap = document.getElementById('members-table');
  if (!wrap) return;
  if (!members.length) { wrap.innerHTML='<div class="empty"><div class="empty-text">No members yet. Click + Add member to get started.</div></div>'; return; }
  wrap.innerHTML=`<table>
    <thead><tr><th>#</th><th>Name</th><th>Room</th><th>Default rent (৳)</th><th>Phone</th><th>Joined</th><th></th></tr></thead>
    <tbody>${members.map((m,i)=>{
      const col=avatarColor(i);
      return `<tr>
        <td><div class="avatar" style="background:${col.bg};color:${col.fg};width:28px;height:28px;font-size:11px">${initials(m.name)}</div></td>
        <td><b>${m.name}</b></td>
        <td style="color:var(--text2)">${m.room||'—'}</td>
        <td>${fmtTk(m.rent||0)}</td>
        <td style="color:var(--text2)">${m.phone||'—'}</td>
        <td style="color:var(--text3)">${m.joined||'—'}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm" onclick="openEditMemberModal('${m.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteMember('${m.id}')">Remove</button>
          </div>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function openAddMemberModal() {
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">Add member</div>
    <div class="modal-sub">New mess member details</div>
    <div class="field"><label>Full name *</label><input type="text" class="input" id="nm-name" placeholder="e.g. Shahriyar"/></div>
    <div class="grid-2">
      <div class="field"><label>Room / flat</label><input type="text" class="input" id="nm-room" placeholder="Room 3A"/></div>
      <div class="field"><label>Default rent (৳) *</label><input type="number" class="input" id="nm-rent" placeholder="4400"/></div>
    </div>
    <div class="grid-2">
      <div class="field"><label>Phone</label><input type="text" class="input" id="nm-phone" placeholder="017xxxxxxxx"/></div>
      <div class="field"><label>Joined date</label><input type="date" class="input" id="nm-joined"/></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="addMember()">Add member</button>
    </div>`;
  openModal();
}

function openEditMemberModal(id) {
  const m = members.find(x=>x.id===id);
  if (!m) return;
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">Edit member</div>
    <div class="modal-sub">Update ${m.name}'s details</div>
    <div class="field"><label>Full name *</label><input type="text" class="input" id="em-name" value="${m.name}"/></div>
    <div class="grid-2">
      <div class="field"><label>Room / flat</label><input type="text" class="input" id="em-room" value="${m.room||''}"/></div>
      <div class="field"><label>Default rent (৳)</label><input type="number" class="input" id="em-rent" value="${m.rent||0}"/></div>
    </div>
    <div class="grid-2">
      <div class="field"><label>Phone</label><input type="text" class="input" id="em-phone" value="${m.phone||''}"/></div>
      <div class="field"><label>Joined date</label><input type="date" class="input" id="em-joined" value="${m.joined||''}"/></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="updateMember('${id}')">Save changes</button>
    </div>`;
  openModal();
}

async function addMember() {
  const name = document.getElementById('nm-name')?.value.trim();
  if (!name) { toast('Name is required'); return; }
  try {
    await txPut('members', {
      name: cleanInputText(name), room: cleanInputText(document.getElementById('nm-room').value),
      rent: parseFloat(document.getElementById('nm-rent').value||0),
      phone: cleanInputText(document.getElementById('nm-phone').value),
      joined: document.getElementById('nm-joined').value || null
    });
    members = await txGetAll('members');
    closeModal();
    toast(name+' added');
    renderMembersTable();
  } catch(e) { toast('Save failed: '+e.message, 'error'); console.error(e); }
}

async function updateMember(id) {
  const m = members.find(x=>x.id===id);
  if (!m) return;
  try {
    await txPut('members', {
      ...m,
      name: cleanInputText(document.getElementById('em-name').value),
      room: cleanInputText(document.getElementById('em-room').value),
      rent: parseFloat(document.getElementById('em-rent').value||0),
      phone: cleanInputText(document.getElementById('em-phone').value),
      joined: document.getElementById('em-joined').value || null
    });
    members = await txGetAll('members');
    closeModal();
    toast('Member updated');
    renderMembersTable();
  } catch(e) { toast('Save failed: '+e.message, 'error'); console.error(e); }
}

async function deleteMember(id) {
  const m = members.find(x=>x.id===id);
  if (!m) return;
  if (!confirm(`Remove ${m.name}? This won't delete their historical data.`)) return;
  try {
    await txDelete('members', id);
    members = await txGetAll('members');
    toast(m.name+' removed');
    renderMembersTable();
  } catch(e) { toast('Delete failed: '+e.message, 'error'); console.error(e); }
}

/* ============================================================
   MODAL
   ============================================================ */
function openModal() { document.getElementById('modal-bg').classList.add('open'); }
function closeModal() { document.getElementById('modal-bg').classList.remove('open'); }

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer;
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (type === 'error' ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = '', 3500);
}

/* ============================================================
   SEED DEFAULT MEMBERS (first run)
   ============================================================ */
async function seedIfEmpty() {
  const existing = await txGetAll('members');
  if (existing.length > 0) return;
  const defaults = [
    {name:'Sourov',rent:4600,room:'Room 1'},{name:'Shahriyar',rent:4400,room:'Room 2'},
    {name:'Nafis',rent:4600,room:'Room 3'},{name:'Rafi',rent:4000,room:'Room 4'},
    {name:'Shanto',rent:4000,room:'Room 5'},{name:'Kanak',rent:4400,room:'Room 6'}
  ];
  for (const d of defaults) {
    await txPut('members', { name: d.name, room: d.room, rent: d.rent,
      phone: '', joined: '2025-07-01' });
  }
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  document.getElementById('db-dot').style.background = 'var(--accent)';
  document.getElementById('db-label').textContent = 'Connecting…';
  try {
    // Verify connection
    const { error } = await sb.from('members').select('id', { count: 'exact', head: true });
    if (error) throw error;
    const dbDot = document.getElementById('db-dot');
    dbDot.style.background = 'var(--green)';
    dbDot.classList.add('live');
    document.getElementById('db-label').textContent = 'Supabase connected';
    await ensureUtilityTable();
    await seedIfEmpty();
    members = await txGetAll('members');
    navigate('dashboard');
  } catch(e) {
    document.getElementById('db-dot').style.background = 'var(--red)';
    document.getElementById('db-label').textContent = 'DB error';
    console.error('Supabase error:', e.message || e);
    toast('Database connection failed. Check console.', 'error');
  }
}

async function ensureUtilityTable() {
  const { error } = await sb.from('utility_payments').select('month_key', { count: 'exact', head: true });
  if (error) {
    console.warn('utility_payments table missing. Run in Supabase SQL Editor:\ncreate table if not exists utility_payments (\n  id uuid primary key default gen_random_uuid(),\n  month_key text not null unique,\n  month int, year int, month_name text,\n  bills jsonb default \'{}\',\n  payments jsonb default \'{}\',\n  created_at timestamptz default now()\n);\nalter table utility_payments enable row level security;\ncreate policy \"open\" on utility_payments for all using (true) with check (true);');
  }
}

init();
