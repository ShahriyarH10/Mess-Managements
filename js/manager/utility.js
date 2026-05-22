/* ═══════════════════════════════════════════════
   MANAGER — Utility: bills entry, payment tracking
   ═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   ROOM RENT
═══════════════════════════════════════════ */
function renderRent(el) {
  const n=new Date();
  el.innerHTML=`<div class="topbar"><div><div class="page-title">Room Rent</div><div class="page-sub">Track monthly rent collection</div></div></div>
  <div class="content">
    <div class="month-sel"><label>Month</label><select class="input" id="rent-month" style="width:180px">${MONTHS.map((m,i)=>`<option value="${i}"${i===n.getMonth()?" selected":""}>${m}</option>`).join("")}</select><label>Year</label><select class="input" id="rent-year" style="width:90px">${Array.from({length:5},(_,i)=>2023+i).map(y=>`<option${y===n.getFullYear()?" selected":""}>${y}</option>`).join("")}</select><button class="btn btn-ghost" onclick="loadRentMonth()">Load</button></div>
    <div class="stat-grid" id="rent-stats"></div>
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">Rent entries</div>
      <div class="tbl-wrap"><table><thead><tr><th>Member</th><th>Rent due (৳)</th><th>Paid (৳)</th><th>Status</th><th>Notes</th></tr></thead><tbody id="rent-tbody"></tbody></table></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button class="btn btn-primary" onclick="saveRent()">Save rent</button>
        <button class="btn btn-ghost" onclick="markAllRentPaid()">Mark all paid</button>
      </div>
    </div>
    <div class="card"><div class="card-title">History</div><div class="tbl-wrap" id="rent-history"></div></div>
  </div>`;
  loadRentMonth(); loadRentHistory();
}

async function loadRentMonth() {
  members = await dbGetMembers();
  const month=parseInt(document.getElementById("rent-month")?.value||0);
  const year=parseInt(document.getElementById("rent-year")?.value||new Date().getFullYear());
  const key=monthKey(year,month);
  const {data:rec}=await getClient().from("rent").select("*").eq("mess_id",messId()).eq("month_key",key).maybeSingle();
  const tbody=document.getElementById("rent-tbody"); if(!tbody) return;
  tbody.innerHTML=members.map(m=>{
    const e=rec?.entries?.find(x=>x.name===m.name)||{};
    const due=Number(e.rent||0);
    const paid=Number(e.paid||0);
    const status=e.status||"unpaid";
    const notes=e.notes||"";
    return `<tr>
      <td><b>${m.name}</b></td>
      <td><input type="number" class="input input-sm" id="rd-${m.id}" value="${due}" style="width:95px" oninput="updRentDue('${m.id}')"/></td>
      <td><input type="number" class="input input-sm" id="rp-${m.id}" value="${paid}" data-due="${due}" style="width:95px" oninput="updRentSum()"/></td>
      <td><select class="input input-sm" id="rs-${m.id}" style="width:100px">
        <option value="paid"    ${status==="paid"   ?"selected":""}>Paid</option>
        <option value="unpaid"  ${status==="unpaid" ?"selected":""}>Not paid</option>
        <option value="partial" ${status==="partial"?"selected":""}>Partial</option>
      </select></td>
      <td><input type="text" class="input input-sm" id="rn-${m.id}" placeholder="—" value="${notes}" style="width:100px"/></td>
    </tr>`;
  }).join("");
  updRentSum();
}

function updRentDue(memberId) {
  const dueInput=document.getElementById("rd-"+memberId);
  const paidInput=document.getElementById("rp-"+memberId);
  if(!dueInput||!paidInput) return;
  paidInput.dataset.due=dueInput.value||0;
  updRentSum();
}

function updRentSum() {
  let due=0, paid=0;
  members.forEach(m=>{
    const di=document.getElementById("rd-"+m.id);
    const pi=document.getElementById("rp-"+m.id);
    if(!di||!pi) return;
    due+=parseFloat(di.value||0);
    paid+=parseFloat(pi.value||0);
  });
  const el=document.getElementById("rent-stats"); if(!el) return;
  el.innerHTML=`
    <div class="stat-card"><div class="stat-label">Total due</div><div class="stat-value" style="font-size:17px">${fmtTk(due)}</div></div>
    <div class="stat-card"><div class="stat-label">Collected</div><div class="stat-value" style="font-size:17px;color:var(--green)">${fmtTk(paid)}</div></div>
    <div class="stat-card"><div class="stat-label">Outstanding</div><div class="stat-value" style="font-size:17px;color:${due-paid>0?"var(--red)":"var(--green)"}">${fmtTk(round2(due-paid))}</div></div>
    <div class="stat-card"><div class="stat-label">Collection rate</div><div class="stat-value">${due>0?Math.round((paid/due)*100):0}%</div></div>`;
}

function markAllRentPaid() {
  members.forEach(m=>{
    const rd=document.getElementById("rd-"+m.id);
    const rp=document.getElementById("rp-"+m.id);
    const rs=document.getElementById("rs-"+m.id);
    if(rd&&rp&&rs){ const due=parseFloat(rd.value||0); rp.value=due; rp.dataset.due=due; rs.value="paid"; }
  });
  updRentSum();
}

async function saveRent() {
  if (!requireManager('saveRent')) return;
  const month=parseInt(document.getElementById("rent-month")?.value||0);
  const year=parseInt(document.getElementById("rent-year")?.value||new Date().getFullYear());
  const key=monthKey(year,month);
  const entries=members.map(m=>({
    name:   m.name,
    rent:   parseFloat(document.getElementById("rd-"+m.id)?.value||0),
    paid:   parseFloat(document.getElementById("rp-"+m.id)?.value||0),
    status: document.getElementById("rs-"+m.id)?.value||"unpaid",
    notes:  cleanText(document.getElementById("rn-"+m.id)?.value||""),
  }));
  try{ await dbUpsertRent(month,year,key,entries); toast("Rent saved","success"); loadRentHistory(); }catch(e){ toast("Error: "+e.message,"error"); }
}

async function loadRentHistory() {
  const wrap = document.getElementById("rent-history");
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

  const [{ data: all }, allMeals] = await Promise.all([
    getClient().from("rent").select("*").eq("mess_id", messId()).order("month_key", { ascending: false }),
    dbGetAll("meals"),
  ]);

  if (!all?.length) { wrap.innerHTML = '<div class="empty">No rent records</div>'; return; }

  // Pre-aggregate meals per month_key so each card can show meal stats.
  const mealsByKey = {};
  (allMeals || []).forEach(r => {
    const k = String(r.date || "").slice(0, 7);
    if (!k) return;
    let dayTotal = 0;
    dayTotal += mealRowTotal(r.meals || {});
    if (!mealsByKey[k]) mealsByKey[k] = { total: 0, days: 0 };
    if (dayTotal > 0) { mealsByKey[k].total += dayTotal; mealsByKey[k].days++; }
  });

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
      ${all.map(r => {
        const due       = r.entries.reduce((s, e) => s + Number(e.rent || 0), 0);
        const paid      = r.entries.reduce((s, e) => s + Number(e.paid || 0), 0);
        const rate      = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;
        const allPaid   = r.entries.every(e => e.status === "paid");
        const anyUnpaid = r.entries.some(e  => e.status === "unpaid");
        const status    = allPaid ? "complete" : anyUnpaid && paid === 0 ? "pending" : "partial";
        const sCfg = {
          complete: { cls: "badge-green", label: "✓ Complete", bar: "var(--green)",  border: "rgba(39,174,96,.35)" },
          partial:  { cls: "badge-amber", label: "⚠ Partial",  bar: "var(--amber)",  border: "rgba(243,156,18,.35)" },
          pending:  { cls: "badge-red",   label: "✗ Pending",  bar: "var(--red)",    border: "rgba(231,76,60,.35)"  },
        }[status];

        // Per-member breakdown: paid count + unpaid names (top 3 then "+N more")
        const paidCount   = r.entries.filter(e => e.status === "paid").length;
        const totalCount  = r.entries.length;
        const unpaidNames = r.entries.filter(e => e.status !== "paid").map(e => e.name);
        const dueList = unpaidNames.length === 0
          ? '<span style="color:var(--green);font-weight:600">All cleared 🎉</span>'
          : `<span style="color:var(--text2)">Pending: ${unpaidNames.slice(0,3).join(", ")}${unpaidNames.length>3?` +${unpaidNames.length-3}`:""}</span>`;

        const m = mealsByKey[r.month_key] || { total: 0, days: 0 };

        return `
          <div class="profile-card" style="
            padding:14px 14px 12px;
            border:1px solid ${sCfg.border};
            display:flex;flex-direction:column;gap:10px
          ">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div>
                <div style="font-family:var(--font-serif);font-size:17px;font-weight:700;line-height:1.1">
                  ${r.month_name} ${r.year}
                </div>
                <div style="font-size:11px;color:var(--text3);margin-top:2px">
                  ${paidCount}/${totalCount} members paid
                </div>
              </div>
              <span class="badge ${sCfg.cls}" style="font-size:10px;white-space:nowrap">${sCfg.label}</span>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="background:var(--bg3);border-radius:6px;padding:7px 9px">
                <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Total due</div>
                <div style="font-size:14px;font-weight:700;margin-top:1px">${fmtTk(due)}</div>
              </div>
              <div style="background:var(--bg3);border-radius:6px;padding:7px 9px">
                <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Collected</div>
                <div style="font-size:14px;font-weight:700;margin-top:1px;color:var(--green)">${fmtTk(paid)}</div>
              </div>
              <div style="background:var(--bg3);border-radius:6px;padding:7px 9px">
                <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">🍽 Meals</div>
                <div style="font-size:14px;font-weight:700;margin-top:1px">${round2(m.total)}</div>
                <div style="font-size:10px;color:var(--text3)">${m.days} active day${m.days===1?"":"s"}</div>
              </div>
              <div style="background:var(--bg3);border-radius:6px;padding:7px 9px">
                <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Members</div>
                <div style="font-size:14px;font-weight:700;margin-top:1px">${totalCount}</div>
                <div style="font-size:10px;color:var(--text3)">${paidCount} done</div>
              </div>
            </div>

            <div>
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-bottom:3px">
                <span>Collection rate</span><span><b style="color:var(--text2)">${rate}%</b></span>
              </div>
              <div style="height:6px;background:var(--bg3);border-radius:99px;overflow:hidden">
                <div style="height:100%;width:${rate}%;background:${sCfg.bar};transition:width .4s"></div>
              </div>
            </div>

            <div style="font-size:11px;line-height:1.4">
              ${dueList}
            </div>
          </div>`;
      }).join("")}
    </div>`;
}
