(function(){
  const form = document.getElementById('issue-form');
  const btn = document.getElementById('issue-submit');
  const flash = document.getElementById('flash-inline');
  if (!form || !btn || !flash) return;

  function setFlash(type, html) {
    const cls = type === 'error' ? 'danger' : (type === 'warn' ? 'warning' : 'success');
    flash.innerHTML = '<div class="alert alert-'+cls+'" role="alert">'+ html +'</div>';
  }

  // Show immediate feedback on click (before network)
  btn.addEventListener('click', function(){
    const cnEl = form.querySelector('[name="commonName"]');
    const cn = (cnEl && cnEl.value) ? cnEl.value : 'certificate';
    setFlash('success', 'Generating certificate for '+ cn.replace(/</g,'&lt;') +'… your download will start when ready.');
  });

  form.addEventListener('submit', async function(ev){
    try {
      ev.preventDefault();
      btn.disabled = true;
      const cnEl = form.querySelector('[name="commonName"]');
      const sansEl = form.querySelector('[name="sans"]');
      const daysEl = form.querySelector('[name="days"]');
      const keyEl = form.querySelector('[name="keyType"]');
      const tokenEl = form.querySelector('input[name="_csrf"]');
      const cn = (cnEl && cnEl.value) ? cnEl.value : 'certificate';

      const params = new URLSearchParams();
      params.set('_csrf', (tokenEl && tokenEl.value) || '');
      params.set('commonName', (cnEl && cnEl.value) || '');
      params.set('sans', (sansEl && sansEl.value) || '');
      params.set('days', (daysEl && daysEl.value) || '365');
      params.set('keyType', (keyEl && keyEl.value) || 'RSA');

      const res = await fetch('/certs/issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'x-csrf-token': (tokenEl && tokenEl.value) || ''
        },
        body: params.toString()
      });

      if (!res.ok) {
        const text = await res.text().catch(()=> '');
        setFlash('error', 'Issuance failed. ' + (text ? 'Details: ' + text : ''));
        return;
      }

      setFlash('success', 'Certificate for '+ cn.replace(/</g,'&lt;') +' generated. Your download should begin shortly.');
      // Refresh the issued list without a full reload
      try {
        const listWrap = document.getElementById('issued-list');
        const paramsNow = new URLSearchParams(window.location.search);
        const r = await fetch('/certs/list.json?' + paramsNow.toString(), { credentials: 'same-origin' });
        if (r.ok) {
          const j = await r.json();
          if (listWrap && j && Array.isArray(j.rows)) {
            listWrap.innerHTML = renderIssuedTable(j, (document.querySelector('input[name="_csrf"]')||{}).value || '');
          }
        }
      } catch (_) { /* non-fatal */ }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get('content-disposition') || '';
      const m = /filename="([^"]+)"/i.exec(cd);
      const name = m ? m[1] : (cn.replace(/[^a-zA-Z0-9_.-]+/g,'_') + '.zip');
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=> URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setFlash('error', 'Unexpected error: ' + (err && err.message ? err.message : String(err)));
    } finally {
      setTimeout(function(){ btn.disabled = false; }, 1500);
    }
  });

  // Intercept revoke forms in the issued list and perform AJAX revoke
  document.addEventListener('submit', async function(ev){
    const f = ev.target.closest('form[data-action="revoke"]');
    if (!f) return;
    ev.preventDefault();
    try {
      const tokenEl = f.querySelector('input[name="_csrf"]');
      const serialEl = f.querySelector('input[name="serial"]');
      const token = tokenEl ? tokenEl.value : '';
      const serial = serialEl ? serialEl.value : '';
      if (!serial) return;
      if (!confirm('Revoke certificate ' + serial + '?')) return;
      const params = new URLSearchParams();
      params.set('_csrf', token);
      params.set('serial', serial);
      const res = await fetch('/certs/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'x-csrf-token': token,
          'x-requested-with': 'fetch'
        },
        body: params.toString()
      });
      if (!res.ok) {
        const text = await res.text().catch(()=> '');
        setFlash('error', 'Revocation failed. ' + (text ? 'Details: ' + text : ''));
        return;
      }
      setFlash('success', 'Certificate ' + serial + ' revoked. Refreshing…');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setFlash('error', 'Unexpected error: ' + (e && e.message ? e.message : String(e)));
    }
  });

  // Ensure renew buttons always navigate (avoid being captured by containing elements)
  document.addEventListener('click', function(ev){
    const a = ev.target.closest('a[data-action="go-renew"]');
    if (!a) return;
    ev.preventDefault();
    window.location.assign(a.getAttribute('href'));
  });

  // Render helpers for issued list refresh
  function renderIssuedTable(data, csrfToken) {
    const { rows = [], totalPages = 1, page = 1, pageSize = 10, sortBy = 'not_after', sortDir = 'desc' } = data || {};
    const q = new URLSearchParams(window.location.search).get('q') || '';
    const qEnc = encodeURIComponent(q);
    let html = '';
    html += '<div class="table-responsive">\n';
    html += '  <table class="table table-sm table-striped align-middle">\n';
    html += '    <thead><tr><th>Serial</th><th>CN</th><th>Not Before</th><th>Not After</th><th>SANs</th><th>Revoked</th></tr></thead>\n';
    html += '    <tbody>\n';
    if (!rows.length) {
      html += '      <tr><td colspan="6" class="text-center text-muted py-4">No certificates found.</td></tr>\n';
    }
    for (const r of rows) {
      const sans = r.sans_json ? JSON.parse(r.sans_json) : [];
      const sanStr = sans.map(s => s.value).join(', ');
      html += '      <tr>\n';
      html += '        <td><code>'+ escapeHtml(r.serial_hex || '') +'</code></td>\n';
      html += '        <td>'+ escapeHtml(r.subject_cn || '') +'</td>\n';
      html += '        <td>'+ escapeHtml((r.not_before||'').replace('T',' ').replace('Z','')) +'</td>\n';
      html += '        <td>'+ escapeHtml((r.not_after ||'').replace('T',' ').replace('Z','')) +'</td>\n';
      html += '        <td class="text-truncate" style="max-width: 280px" title="'+ escapeHtml(sanStr) +'">'+ escapeHtml(sanStr) +'</td>\n';
      html += '        <td>\n';
      if (r.revoked_at) {
        html += '          <span class="badge bg-danger">Yes</span>\n';
        html += '          <div class="small text-muted">'+ escapeHtml(r.reason || '') +'</div>\n';
        html += '          <div class="small text-muted">'+ escapeHtml((r.revoked_at||'').replace('T',' ').replace('Z','')) +'</div>\n';
      } else {
        html += '          <span class="badge bg-success">No</span>\n';
        html += '          <div class="mt-1 d-flex gap-2 flex-wrap">\n';
        html += '            <form class="d-inline" data-action="revoke" method="post" action="/certs/revoke">\n';
        html += '              <input type="hidden" name="_csrf" value="'+ escapeHtml(csrfToken) +'">\n';
        html += '              <input type="hidden" name="serial" value="'+ escapeHtml(r.serial_hex || '') +'">\n';
        html += '              <button type="submit" class="btn btn-sm btn-outline-danger">Revoke</button>\n';
        html += '            </form>\n';
        html += '            <a class="btn btn-sm btn-outline-secondary" href="/certs/renew?serial='+ encodeURIComponent(r.serial_hex || '') +'" data-action="go-renew">Renew</a>\n';
        html += '            <a class="btn btn-sm btn-outline-primary" href="/certs/by-serial/'+ encodeURIComponent(r.serial_hex || '') +'.pem">Download Cert</a>\n';
        html += '          </div>\n';
      }
      html += '        </td>\n';
      html += '      </tr>\n';
    }
    html += '    </tbody>\n';
    html += '  </table>\n';
    if (totalPages > 1) {
      const base = `?q=${qEnc}&pageSize=${pageSize}&sortBy=${sortBy}&sortDir=${sortDir}`;
      html += '  <nav><ul class="pagination">\n';
      html += '    <li class="page-item '+ (page===1?'disabled':'') +'"><a class="page-link" href="'+ (page===1?'#':(base+'&page='+(page-1))) +'">Prev</a></li>\n';
      const start = Math.max(1, page - 3), end = Math.min(totalPages, page + 3);
      for (let p=start; p<=end; p++) {
        html += '    <li class="page-item '+ (p===page?'active':'') +'"><a class="page-link" href="'+ (base+'&page='+p) +'">'+ p +'</a></li>\n';
      }
      html += '    <li class="page-item '+ (page===totalPages?'disabled':'') +'"><a class="page-link" href="'+ (page===totalPages?'#':(base+'&page='+(page+1))) +'">Next</a></li>\n';
      html += '  </ul></nav>\n';
    }
    html += '</div>\n';
    return html;
  }

  function escapeHtml(s) {
    return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }
})();
