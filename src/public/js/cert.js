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
})();
