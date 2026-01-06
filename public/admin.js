const socket = io();
const log = document.getElementById("log");
let from = '';
let to = '';

function rankValue(r){
  if (!r) return 1000;
  const m = r.match(/^(OR|OF)(\d+)$/i);
  if (!m) return 500 + r.charCodeAt(0);
  const prefix = m[1].toUpperCase();
  const num = parseInt(m[2],10)||0;
  return (prefix === 'OR' ? 0 : 100) + num;
}

socket.on("new_checkin", (data) => {
  const row = document.createElement("tr");
  row.innerHTML = `<td>${data.name}</td><td>${data.rank || ''}</td><td>${data.time}</td>`;
  log.prepend(row);
});

async function loadHistory() {
  const params = {};
  if (from && to) {
    params.from = from;
    params.to = to;
  } else if (from) {
    params.from = from;
  }
  const qs = new URLSearchParams(params).toString();
  const url = '/admin/checkins' + (qs ? ('?' + qs) : '');
  const res = await fetch(url);
  if (!res.ok) return;
  const rows = await res.json();
  log.innerHTML = '';
  rows.forEach(r => {
    const row = document.createElement('tr');
    const displayName = r.name || ((r.first_name||'') + ' ' + (r.last_name||'')).trim();
    row.innerHTML = `<td>${displayName}</td><td>${r.rank||''}</td><td>${r.checked_in_at}</td>`;
    log.appendChild(row);
  });
  showToast(`${rows.length} records loaded`);
}
function showToast(msg){
  const t = document.getElementById('toast');
  if (!t) return;
  t.innerText = msg;
  t.classList.add('show');
  clearTimeout(t._to);
  t._to = setTimeout(()=> t.classList.remove('show'), 3500);
}

async function loadPersonnel() {
  const res = await fetch('/admin/personnel');
  if (!res.ok) return;
  const rows = await res.json();
  const list = document.getElementById('personnelList');
  list.innerHTML = '';
  rows.forEach(p => {
    const li = document.createElement('li');
    li.style.display='flex'; li.style.alignItems='center'; li.style.justifyContent='space-between'; li.style.padding='8px 6px';
    const left = document.createElement('div');
    const displayName = p.name || ((p.first_name||'') + ' ' + (p.last_name||'')).trim();
    left.innerHTML = `<strong>${displayName}</strong> <span class="muted">${p.rank||''}</span><div class="muted" style="font-size:12px">Device: ${p.device_id||'-'}</div>`;
    const actions = document.createElement('div');
    actions.style.display='flex'; actions.style.gap='8px';

    const qrBtn = document.createElement('button'); qrBtn.innerText='QR'; qrBtn.className='button';
    qrBtn.onclick = async () => {
      const r = await fetch('/admin/qrcode/' + p.id);
      if (!r.ok) return showToast('QR failed');
      const j = await r.json();
      // show modal with image and file link if present
      const modal = document.getElementById('qrModal');
      modal.innerHTML = `<div class="panel" style="max-width:420px;margin:20px auto;text-align:center"><h3>QR Code for ${p.name}</h3><div style="margin:10px"><img src="${j.file||j.qrcode}" style="max-width:260px;"/></div><div style="margin-top:8px"><a href="${j.file||j.url}" target="_blank">Open image / link</a></div><div style="margin-top:12px"><button id=\"closeQr\" class=\"button\">Close</button></div></div>`;
      modal.style.display='block';
      document.getElementById('closeQr').onclick = () => modal.style.display='none';
    };

    const delBtn = document.createElement('button'); delBtn.innerText='Delete'; delBtn.className='button'; delBtn.style.background='#d9534f';
    delBtn.onclick = async () => {
      if (!confirm('Delete this personnel?')) return;
      const r = await fetch('/admin/personnel/' + p.id, { method: 'DELETE' });
      if (r.ok) { showToast('Deleted'); loadPersonnel(); } else { showToast('Delete failed'); }
    };

    const genBtn = document.createElement('button'); genBtn.innerText='Gen Token'; genBtn.className='button';
    genBtn.onclick = async () => {
      if (!confirm('Generate a device token for this person?')) return;
      const r = await fetch('/admin/personnel/' + p.id + '/generate-token', { method: 'POST' });
      if (!r.ok) return showToast('Failed to generate token');
      const j = await r.json();
      showToast('Token generated');
      // show modal with registration QR
      const modal = document.getElementById('qrModal');
      modal.innerHTML = `<div class="panel" style="max-width:420px;margin:20px auto;text-align:center"><h3>Registration QR for ${p.name}</h3><div style="margin:10px"><img src="${j.file}" style="max-width:260px;"/></div><div style="margin-top:8px"><a href="${j.registerUrl}" target="_blank">Open registration link</a></div><div style="margin-top:12px"><button id=\"closeQr\" class=\"button\">Close</button></div></div>`;
      modal.style.display='block';
      document.getElementById('closeQr').onclick = () => modal.style.display='none';
      await loadPersonnel();
    };

    const revokeBtn = document.createElement('button'); revokeBtn.innerText='Revoke'; revokeBtn.className='button'; revokeBtn.style.background='#f39c12';
    revokeBtn.onclick = async () => {
      if (!confirm('Revoke device token for this person? This will clear their token.')) return;
      const r = await fetch('/admin/personnel/' + p.id + '/revoke-token', { method: 'POST' });
      if (r.ok) { showToast('Token revoked'); loadPersonnel(); } else { showToast('Revoke failed'); }
    };

    const regenBtn = document.createElement('button'); regenBtn.innerText='Regen Token'; regenBtn.className='button'; regenBtn.style.background='#6c757d';
    regenBtn.onclick = async () => {
      if (!confirm('Regenerate device token for this person? Existing token will be replaced.')) return;
      const r = await fetch('/admin/personnel/' + p.id + '/regenerate-token', { method: 'POST' });
      if (!r.ok) return showToast('Regenerate failed');
      const j = await r.json();
      showToast('Token regenerated');
      const modal = document.getElementById('qrModal');
      modal.innerHTML = `<div class="panel" style="max-width:420px;margin:20px auto;text-align:center"><h3>New Registration QR for ${p.name}</h3><div style="margin:10px"><img src="${j.file}" style="max-width:260px;"/></div><div style="margin-top:8px"><a href="${j.registerUrl}" target="_blank">Open registration link</a></div><div style="margin-top:12px"><button id=\"closeQr\" class=\"button\">Close</button></div></div>`;
      modal.style.display='block';
      document.getElementById('closeQr').onclick = () => modal.style.display='none';
      await loadPersonnel();
    };

    actions.appendChild(qrBtn);
    actions.appendChild(genBtn);
    actions.appendChild(revokeBtn);
    actions.appendChild(regenBtn);
    actions.appendChild(delBtn);
    li.appendChild(left); li.appendChild(actions);
    list.appendChild(li);
  });
}

document.getElementById('addPerson').addEventListener('submit', async (e) => {
  e.preventDefault();
  const first = document.getElementById('personFirst').value.trim();
  const last = document.getElementById('personLast').value.trim();
  const name = `${first} ${last}`.trim();
  const rank = document.getElementById('personRank').value;
  const device_id = document.getElementById('personDevice') ? document.getElementById('personDevice').value.trim() : '';
  const res = await fetch('/admin/personnel', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, rank, device_id})});
  const j = await res.json();
  if (res.ok) {
    document.getElementById('personFirst').value=''; document.getElementById('personLast').value='';
    document.getElementById('personRank').value='';
    if (document.getElementById('personDevice')) document.getElementById('personDevice').value='';
    // If server returned a generated token and file, show registration QR modal
    if (j && j.token && j.file) {
      const modal = document.getElementById('qrModal');
      modal.innerHTML = `<div class="panel" style="max-width:420px;margin:20px auto;text-align:center"><h3>Registration QR (give to user)</h3><div style="margin:10px"><img src="${j.file}" style="max-width:260px;"/></div><div style="margin-top:8px"><a href="${j.registerUrl}" target="_blank">Open registration link</a></div><div style="margin-top:12px"><button id=\"closeQr\" class=\"button\">Close</button></div></div>`;
      modal.style.display='block';
      document.getElementById('closeQr').onclick = () => modal.style.display='none';
    }
    await loadPersonnel();
  } else {
    showToast((j && j.error) ? j.error : 'Failed to add personnel');
  }
});

// Sidebar routing: show/hide panels
function showPanel(name){
  document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
  const el = document.getElementById('panel-' + name);
  if (el) el.style.display = 'block';
}

document.querySelectorAll('.sidebar a').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const text = a.innerText.trim().toLowerCase();
    // map to panel ids: overview, personnel, exports, settings
    if (text === 'overview') { history.pushState({}, '', '/admin/overview'); showPanel('overview'); }
    if (text === 'personnel') { history.pushState({}, '', '/admin/personnel'); showPanel('personnel'); }
    if (text === 'exports') { history.pushState({}, '', '/admin/exports'); showPanel('exports'); }
    if (text === 'settings') { history.pushState({}, '', '/admin/settings'); showPanel('settings'); }
  });
});

// on load, pick panel from path
(() => {
  const p = window.location.pathname.replace('/admin','').replace(/^\//,'') || 'overview';
  showPanel(p || 'overview');
})();

document.getElementById('from2026').addEventListener('click', async () => {
  // load all logs from 2026-01-01
  from = '2026-01-01';
  to = '';
  await loadHistory();
});

// change password
document.getElementById('changePassword').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = document.getElementById('currentPass').value;
  const password = document.getElementById('newPass').value;
  // client-side validation: at least 10 chars, letters, numbers, symbols
  const ok = /(?=.{10,})(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])/;
  const pwMsg = document.getElementById('pwMsg');
  pwMsg.innerText = '';
  if (!ok.test(password)) {
    pwMsg.innerText = 'Password must be at least 10 characters and include letters, numbers and symbols.';
    return;
  }
  const res = await fetch('/admin/change-password', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({current, password})});
  if (res.ok) {
    pwMsg.innerText = 'Password changed.';
    document.getElementById('currentPass').value=''; document.getElementById('newPass').value='';
  } else {
    const j = await res.json(); pwMsg.innerText = j.error||'Failed to change password';
  }
});

// password visibility toggles
document.getElementById('toggleCurrent').addEventListener('click', ()=>{
  const p = document.getElementById('currentPass'); p.type = p.type === 'password' ? 'text' : 'password';
});
document.getElementById('toggleNew').addEventListener('click', ()=>{
  const p = document.getElementById('newPass'); p.type = p.type === 'password' ? 'text' : 'password';
});

document.getElementById('logout').addEventListener('click', async () => {
  await fetch('/admin/logout', {method:'POST'});
  window.location = '/admin';
});

document.getElementById('closeQr').addEventListener('click', () => {
  document.getElementById('qrModal').style.display = 'none';
});

// Initial load
loadHistory();
loadPersonnel();

// Download PDF for a selected day
document.getElementById('downloadDay').addEventListener('click', () => {
  const d = document.getElementById('dayPicker').value;
  if (!d) return showToast('Pick a date');
  window.open('/admin/download?date=' + d, '_blank');
});

// generate common QR
document.getElementById('from2026').insertAdjacentElement('afterend', (function(){
  const btn = document.createElement('button'); btn.className='button'; btn.style.marginLeft='8px'; btn.innerText='Generate Shared QR';
  btn.onclick = async () => {
    const r = await fetch('/admin/qrcode/common');
    if (!r.ok) return showToast('Failed to create QR');
    const j = await r.json();
    // show modal
    const modal = document.getElementById('qrModal');
    modal.innerHTML = `<div class="panel" style="max-width:420px;margin:20px auto;text-align:center"><h3>Shared QR</h3><div style="margin:10px"><img src="${j.file}" style="max-width:260px;"/></div><div style="margin-top:8px"><a href="${j.file}" target="_blank">Open image</a></div><div style="margin-top:12px"><button id=\"closeQr\" class=\"button\">Close</button></div></div>`;
    modal.style.display='block';
    document.getElementById('closeQr').onclick = () => modal.style.display='none';
    showToast('Shared QR generated');
  };
  return btn;
})());

// Sorting: click headers
document.querySelectorAll('th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.getAttribute('data-sort');
    const rows = Array.from(document.querySelectorAll('#log tr'));
    rows.sort((a,b) => {
      if (key === 'rank') {
        const av = rankValue(a.children[1].innerText.trim());
        const bv = rankValue(b.children[1].innerText.trim());
        return av - bv;
      }
      if (key === 'name') {
        const an = a.children[0].innerText.trim().toLowerCase();
        const bn = b.children[0].innerText.trim().toLowerCase();
        const as = an.split(' ').slice(-1)[0];
        const bs = bn.split(' ').slice(-1)[0];
        if (as < bs) return -1; if (as > bs) return 1; return 0;
      }
      const av = a.children[2].innerText.toLowerCase();
      const bv = b.children[2].innerText.toLowerCase();
      if (av < bv) return -1; if (av > bv) return 1; return 0;
    });
    const parent = document.getElementById('log'); parent.innerHTML=''; rows.forEach(r=>parent.appendChild(r));
  });
});

