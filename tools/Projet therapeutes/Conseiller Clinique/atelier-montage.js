/* Atelier Diapos — montage local. Source embarquée dans atelier-diapos.html par
 * tests/embarquer-atelier-montage.cjs ; aucun fichier voisin requis à l'usage. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { tracks: [], images: [], cuts: [], total: 0, playing: false, started: 0,
    previewAt: 0, raf: 0, bitmap: null, bitmapIndex: -1, exporting: false,
    selectedId: null, zoom: 4, master: {voice: {db: 0, muted: false}, music: {db: 0, muted: false}} };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const time = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const badge = (message, error) => { const el = $('am-status'); el.textContent = message; el.dataset.error = error ? '1' : '0'; };
  const tracks = () => state.tracks.filter(t => !t.muted && !state.master[t.kind].muted);
  const selected = () => state.tracks.find(t => t.id === state.selectedId);
  const clipLength = t => t.out - t.in;
  const dbGain = db => Math.pow(10, db / 20);
  const automationDb = (t, local) => {
    const points = t.automation || [{time:0,db:0}];
    if (local <= points[0].time) return points[0].db;
    for (let i=1;i<points.length;i++) if (local <= points[i].time) {
      const a=points[i-1],b=points[i];
      return a.db+(b.db-a.db)*(local-a.time)/(b.time-a.time);
    }
    return points.at(-1).db;
  };
  const duration = () => state.total || state.images.length * Math.max(1, +($('cv-duree')?.value || 4));

  const css = document.createElement('style');
  css.textContent = `
    #am-workbench{margin:28px 0;padding:12px;background:#fffdf9;border:1px solid #c9c3b8;border-radius:16px;box-shadow:0 8px 28px #322b2314;color:#273331;height:min(900px,calc(100vh - 16px));min-height:560px;display:flex;flex-direction:column;gap:6px;overflow:hidden}
    #am-workbench *{box-sizing:border-box} #am-workbench h2{font:600 29px/1.15 'Source Serif 4',Georgia,serif;margin:0 0 7px;color:#102f31}
    #am-workbench p{margin:0;color:#5d6966;font-size:12px}
    .am-toolbar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:3px 0}
    #am-workbench button,#am-workbench .am-file{font:600 13px/1.2 -apple-system,system-ui,sans-serif;border:1.5px solid #1f5053;border-radius:9px;background:#fffdf9;color:#1f5053;padding:9px 12px;cursor:pointer}
    #am-workbench button:hover,#am-workbench .am-file:hover{background:#dce8e6}
    #am-workbench button:focus-visible,#am-workbench input:focus-visible{outline:3px solid #8a3f29;outline-offset:2px}
    #am-workbench button:disabled{opacity:.45;cursor:not-allowed}
    .am-file input{display:none}.am-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,1fr);gap:10px;min-height:0;flex:0 0 min(25vh,220px)}
    .am-panel{border:1px solid #c9c3b8;border-radius:12px;padding:13px;background:#f6f2ea;min-width:0}
    .am-panel h3{font:700 15px/1.3 -apple-system,system-ui,sans-serif;margin:0 0 10px}
    .am-grid .am-panel:first-child{display:flex;flex-direction:column;min-height:0;overflow:hidden}
    #am-preview{width:100%;height:0;min-height:0;flex:1;object-fit:contain;display:block;background:#102f31;border-radius:9px}
    #am-seek{width:100%;margin:12px 0 2px}.am-track{border:1px solid #5d6966;background:#fffdf9;border-radius:9px;padding:10px;margin-bottom:9px}
    .am-track[data-kind=voice]{border-left:5px solid #1f5053}.am-track[data-kind=music]{border-left:5px solid #8a3f29}
    .am-track-head{display:flex;align-items:center;gap:7px;justify-content:space-between;flex-wrap:wrap}
    .am-track-fields{display:grid;grid-template-columns:repeat(4,minmax(62px,1fr));gap:7px;margin-top:10px}
    .am-track label,.am-step label{font-size:11px;color:#5d6966;display:flex;flex-direction:column;gap:3px}
    .am-track input[type=number],.am-step input{width:100%;min-width:0;border:1px solid #5d6966;border-radius:5px;padding:5px;background:#fff;font:inherit}
    .am-track input[type=range]{width:100%}.am-wave{display:block;width:100%;height:38px;background:#dce8e6;border-radius:4px;margin-top:9px}
    .am-step{display:grid;grid-template-columns:42px minmax(0,1fr) 100px 66px;align-items:center;gap:7px;border-bottom:1px solid #ddd7cc;padding:7px 0;font-size:12px}
    .am-step img{width:42px;height:30px;object-fit:contain;background:#e9e4d9}.am-step button{padding:4px 7px!important}
    .am-timeline{margin:0;border:1px solid #b6afa4;border-radius:12px;background:#eee9df;padding:12px;overflow:auto;flex:1;min-height:150px}
    .am-ruler,.am-lane{min-width:600px;position:relative;margin-left:110px}
    .am-ruler{height:25px;border-bottom:1px solid #9a938a;font-size:11px;color:#52615f}
    .am-tick{position:absolute;top:0;transform:translateX(-50%);border-left:1px solid #9a938a;padding-left:4px;height:25px}
    .am-lane{height:48px;border-bottom:1px solid #d5cec2;background:repeating-linear-gradient(to right,transparent 0,transparent calc(10% - 1px),#d5cec2 calc(10% - 1px),#d5cec2 10%)}
    .am-lane-name{position:absolute;right:calc(100% + 10px);top:13px;width:100px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;font-weight:700;color:#183b3d}
    .am-clip{position:absolute;top:8px;height:31px;border-radius:5px;background:#1f5053;color:#fff;padding:7px 8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;cursor:grab;touch-action:none;box-shadow:0 2px 5px #102f3130}
    .am-clip[data-kind=music]{background:#8a3f29}.am-clip:active{cursor:grabbing}
    .am-clip[data-selected=true]{outline:3px solid #e6b15c;outline-offset:1px}
    .am-clip .am-envelope{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
    .am-master{display:flex;align-items:center;gap:7px;font-size:12px;margin:3px 0 7px;flex:0 0 auto;flex-wrap:wrap}
    .am-master input[type=range]{width:90px}.am-master strong{min-width:100px}
    .am-inspector{overflow:auto;min-height:0}.am-inspector .am-track{margin-bottom:0}
    .am-automation{height:90px;position:relative;background:linear-gradient(#f8f6f0,#e7ecea);border:1px solid #adb9b6;border-radius:6px;margin:7px 0;touch-action:none;cursor:crosshair}
    .am-automation svg{width:100%;height:100%;overflow:visible}
    .am-automation circle{fill:#b44e30;stroke:white;stroke-width:2;cursor:grab}
    .am-steps-panel{overflow:auto;min-height:0}.am-step{grid-template-columns:32px minmax(0,1fr) 72px 52px;padding:3px 0}
    .am-step img{width:32px;height:24px}
    .am-ruler,.am-lane{margin-left:120px}.am-lane{height:55px;background-size:100% 100%}
    .am-lane-name{width:112px;right:calc(100% + 7px);top:17px;text-align:left}
    .am-clip{height:38px;top:8px;padding:5px 8px}.am-step-clip{height:30px;top:8px}
    .am-clip[aria-disabled=true]{opacity:.4}.am-step-clip{background:#dce8e6;color:#102f31;border:1px solid #1f5053;cursor:pointer}
    .am-playhead{position:absolute;top:0;bottom:0;width:2px;background:#ab4329;pointer-events:none;z-index:2}
    #am-status[data-error=1]{color:#8a3f29}#am-status{font-weight:600!important;margin:12px 0 0!important}
    @media(max-width:760px){#am-workbench{height:calc(100vh - 20px);min-height:560px}.am-grid{grid-template-columns:1fr;flex-basis:260px}.am-grid .am-panel:first-child{display:none}.am-track-fields{grid-template-columns:repeat(2,1fr)}}`;
  document.head.appendChild(css);

  const root = document.createElement('section');
  root.id = 'am-workbench';
  root.innerHTML = `<h2>Atelier Diapos · Montage</h2><p>Montez vos clips sur les pistes Voix Master et Musique Master. Les fichiers MP3 restent sur cet ordinateur.</p>
    <div class="am-toolbar"><label class="am-file">+ Piste voix<input id="am-add-voice" type="file" accept=".mp3,audio/mpeg" multiple></label>
    <label class="am-file">+ Piste musique ou ambiance<input id="am-add-music" type="file" accept=".mp3,audio/mpeg" multiple></label>
    <button id="am-play" type="button">Lire</button><button id="am-stop" type="button">Arrêter</button>
    <button id="am-split" type="button" title="Couper le clip sélectionné au curseur de lecture">✂ Couper au curseur</button>
    <button id="am-add-point" type="button" title="Créer un point de volume sur le clip sélectionné">+ Point de volume</button>
    <button id="am-marker" type="button" title="La prochaine étape commencera à la position courante">Poser un repère</button>
    <label style="font-size:12px">Baisse musique sous la voix <select id="am-duck"><option value="0.126">−18 dB</option><option value="0.251">−12 dB</option><option value="1">Aucune</option></select></label>
    <label style="font-size:12px">Durée du film (s) <input id="am-total" type="number" min="1" step="0.1" style="width:78px" aria-label="Durée totale du film"></label>
    <label style="font-size:12px">Zoom <input id="am-zoom" type="range" min="2" max="14" step="1" value="4" aria-label="Zoom de la chronologie"></label>
    <span id="am-clock">00:00 / 00:00</span><button id="am-cancel-export" type="button" disabled>Annuler l’export</button></div>
    <div class="am-grid"><div class="am-panel"><h3>Aperçu vidéo</h3><canvas id="am-preview" width="960" height="540"></canvas>
      <input id="am-seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Position de lecture">
      </div>
    <div class="am-panel am-inspector"><h3>Clip sélectionné</h3><div id="am-tracks"></div></div></div>
    <div class="am-master"><strong>Voix Master</strong><button type="button" data-master-mute="voice">Muet</button><label>Volume <input type="range" data-master-db="voice" min="-36" max="12" value="0"></label><output id="am-voice-db">0 dB</output>
      <strong>Musique Master</strong><button type="button" data-master-mute="music">Muet</button><label>Volume <input type="range" data-master-db="music" min="-36" max="12" value="0"></label><output id="am-music-db">0 dB</output></div>
    <div class="am-timeline" aria-label="Ligne de temps du montage"><div id="am-timeline-inner"><div id="am-ruler" class="am-ruler"></div><div id="am-lanes"></div></div></div>
    <details class="am-panel am-steps-panel"><summary>Étapes et repères · <span id="am-step-count">0</span> images</summary><p>Chaque repère donne l’heure de début d’une image.</p>
      <div id="am-steps"></div><p id="am-empty">Importez une présentation pour régler ses étapes.</p>
    </details>
    <p id="am-status" role="status" aria-live="polite">Prêt pour l’import MP3.</p>`;
  $('cv-vignettes').before(root);

  function render() {
    $('am-clock').textContent = `${time(state.previewAt)} / ${time(duration())}`;
    $('am-seek').max = Math.max(1, duration()); $('am-seek').value = clamp(state.previewAt, 0, duration());
    $('am-total').value = +duration().toFixed(1);
    $('am-step-count').textContent = state.images.length;
    $('am-empty').hidden = !!state.images.length;
    $('am-steps').innerHTML = state.images.map((im, i) => `<div class="am-step" data-step="${i}">
      <img src="${esc(im.url)}" alt=""><span>${i + 1}. ${esc(im.titre || 'Étape')} · diapositive ${(im.cardIndex || 0) + 1}</span>
      <label>Début (s)<input type="number" min="0" step="0.01" value="${state.cuts[i].toFixed(2)}" data-cut="${i}"></label>
      <button type="button" data-focus="${i}">Voir</button></div>`).join('');
    const t = selected(), i = state.tracks.indexOf(t);
    $('am-tracks').innerHTML = !t ? '<p>Sélectionnez un clip dans la chronologie pour le régler.</p>' : `<article class="am-track" data-kind="${t.kind}" data-track="${i}">
      <div class="am-track-head"><strong>${t.kind === 'voice' ? 'Voix' : 'Musique'} ${i + 1} · ${esc(t.name)}</strong>
      <span>${time(clipLength(t))}</span><button type="button" data-mute="${i}">${t.muted ? 'Réactiver' : 'Muet'}</button>
      <button type="button" data-remove="${i}" aria-label="Supprimer la piste ${esc(t.name)}">Retirer</button></div>
      <canvas class="am-wave" data-wave="${i}" width="500" height="38" aria-label="Forme d’onde"></canvas>
      <div class="am-track-fields"><label>Placement (s)<input type="number" min="0" step="0.1" value="${t.at}" data-field="at" data-track="${i}"></label>
      <label>Entrée (s)<input type="number" min="0" step="0.1" value="${t.in}" data-field="in" data-track="${i}"></label>
      <label>Sortie (s)<input type="number" min="0" step="0.1" value="${t.out}" data-field="out" data-track="${i}"></label>
      <label>Volume (dB)<input type="number" min="-60" max="12" step="1" value="${t.db}" data-field="db" data-track="${i}"></label>
      <label>Fondu entrée (s)<input type="number" min="0" step="0.1" value="${t.fadeIn}" data-field="fadeIn" data-track="${i}"></label>
      <label>Fondu sortie (s)<input type="number" min="0" step="0.1" value="${t.fadeOut}" data-field="fadeOut" data-track="${i}"></label>
      <label>Piste Master<select data-field="kind" data-track="${i}"><option value="voice" ${t.kind==='voice'?'selected':''}>Voix</option><option value="music" ${t.kind==='music'?'selected':''}>Musique</option></select></label>
      <label style="justify-content:center">Boucler<input type="checkbox" data-field="loop" data-track="${i}" ${t.loop ? 'checked' : ''}></label></div>
      <strong style="font-size:12px">Automatisation du volume · glissez les points</strong><div class="am-automation" role="img" aria-label="Courbe de volume du clip"><svg viewBox="0 0 500 90" preserveAspectRatio="none"><polyline points="${(t.automation||[]).map(p=>`${p.time/clipLength(t)*500},${(12-p.db)/72*90}`).join(' ')}" fill="none" stroke="#b44e30" stroke-width="3"/>${(t.automation||[]).map((p,j)=>`<circle data-point="${j}" cx="${p.time/clipLength(t)*500}" cy="${(12-p.db)/72*90}" r="6"/>`).join('')}</svg></div>
      <small>Double-cliquez sur la courbe pour ajouter un point ; double-cliquez sur un point pour le retirer.</small></article>`;
    if (t) drawWave(t, root.querySelector(`[data-wave="${i}"]`));
    for (const kind of ['voice','music']) {
      root.querySelector(`[data-master-db="${kind}"]`).value = state.master[kind].db;
      $(`am-${kind}-db`).textContent = `${state.master[kind].db} dB`;
      root.querySelector(`[data-master-mute="${kind}"]`).textContent = state.master[kind].muted ? 'Réactiver' : 'Muet';
    }
    renderTimeline();
  }
  function renderTimeline() {
    const total = Math.max(1, duration());
    $('am-timeline-inner').style.width = `${Math.max(650,Math.ceil(total*state.zoom)+120)}px`;
    $('am-ruler').innerHTML = Array.from({length:11}, (_, i) => `<span class="am-tick" style="left:${i*10}%">${time(total*i/10)}</span>`).join('') + `<span class="am-playhead" style="left:${state.previewAt/total*100}%"></span>`;
    const stepLane = `<div class="am-lane"><span class="am-lane-name">Diapositives</span>${state.images.map((im,i) => {
      const left = state.cuts[i]/total*100, end = (state.cuts[i+1] ?? total)/total*100;
      return `<button type="button" class="am-clip am-step-clip" data-focus="${i}" style="left:${left}%;width:${Math.max(0,end-left)}%" title="Étape ${i+1}">${i+1}. ${esc(im.titre||'Étape')}</button>`;
    }).join('')}</div>`;
    $('am-lanes').innerHTML = stepLane + ['voice','music'].map(kind => `<div class="am-lane" data-master-lane="${kind}"><span class="am-lane-name">${kind==='voice'?'Voix':'Musique'} Master</span>${state.tracks.map((t,i) => {
      if (t.kind!==kind) return '';
      const left = Math.min(100,t.at/total*100), length = (t.loop ? total-t.at : clipLength(t))/total*100;
      const points = t.automation || [{time:0,db:0},{time:clipLength(t),db:0}];
      return `<div class="am-clip" data-kind="${kind}" data-clip="${i}" data-selected="${t.id===state.selectedId}" aria-disabled="${t.muted}" style="left:${left}%;width:${Math.max(0,Math.min(100-left,length))}%" title="Glisser horizontalement ou vers l’autre piste Master">${esc(t.name)}<svg class="am-envelope" viewBox="0 0 100 50" preserveAspectRatio="none"><polyline points="${points.map(p=>`${p.time/clipLength(t)*100},${7+(12-p.db)/72*35}`).join(' ')}" fill="none" stroke="#f6d386" stroke-width="2"/></svg></div>`;
    }).join('')}</div>`).join('');
  }
  function drawWave(t, canvas) {
    const c = canvas.getContext('2d'), data = t.buffer.getChannelData(0), mid = canvas.height / 2;
    c.clearRect(0, 0, canvas.width, canvas.height); c.fillStyle = t.kind === 'voice' ? '#1f5053' : '#8a3f29';
    const first = Math.floor(t.in * t.buffer.sampleRate), last = Math.min(data.length, Math.floor(t.out * t.buffer.sampleRate));
    const stride = Math.max(1, Math.floor((last - first) / canvas.width));
    for (let x = 0; x < canvas.width; x++) {
      let peak = 0, start = first + x * stride;
      for (let j = start; j < Math.min(last, start + stride); j += Math.max(1, Math.floor(stride / 20))) peak = Math.max(peak, Math.abs(data[j]));
      c.fillRect(x, mid - peak * mid, 1, Math.max(1, peak * canvas.height));
    }
  }
  function refreshImages() {
    const d = window.__chutier && window.__chutier.dernier();
    if (!d || !d.res || !d.res.images || !d.res.images.length) return;
    state.images.forEach(im => URL.revokeObjectURL(im.url));
    state.images = d.res.images.map(im => ({...im, url: URL.createObjectURL(im.blob)}));
    const voice = state.tracks.find(t => t.kind === 'voice');
    if (voice) state.total = +voice.buffer.duration.toFixed(2);
    const n = state.images.length, total = duration();
    state.cuts = Array.from({length:n}, (_, i) => i * total / n);
    state.bitmapIndex = -1;
    render(); drawPreview(0);
  }
  let imageResult = null;
  new MutationObserver(() => {
    const d = window.__chutier && window.__chutier.dernier();
    if (d && d.res && d.res.images && d.res.images.length && imageResult !== d.res.images) {
      imageResult = d.res.images; refreshImages();
    }
  }).observe($('cv-vignettes'), {childList:true});

  async function importFiles(files, kind) {
    if (!state.images.length) refreshImages();
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return badge('Ce navigateur ne peut pas lire les MP3.', true);
    const ctx = new Audio();
    try {
      for (const file of files) {
        if (!/\.mp3$/i.test(file.name) && file.type !== 'audio/mpeg') { badge(`${file.name} : un fichier MP3 est attendu.`, true); continue; }
        try {
          const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
          if (!buffer.duration || !Number.isFinite(buffer.duration)) throw Error('durée invalide');
          const existing = state.tracks.filter(t=>t.kind===kind);
          const at = existing.length ? Math.max(...existing.map(t=>t.at+clipLength(t))) : 0;
          const id = crypto.randomUUID();
          state.tracks.push({id, name:file.name, file, buffer, kind, at, in:0,
            out:+buffer.duration.toFixed(2), db:kind === 'voice' ? 0 : -18, fadeIn:0.3, fadeOut:0.5,
            loop:false, muted:false, automation:[{time:0,db:0},{time:+buffer.duration.toFixed(2),db:0}]});
          state.selectedId = id;
          badge(`Piste « ${file.name} » ajoutée.`, false);
        } catch (e) { badge(`${file.name} : MP3 illisible (${e.message}).`, true); }
      }
      const voice = state.tracks.find(t => t.kind === 'voice');
      if (voice && state.images.length && (!state.total || state.total === state.images.length * 4)) {
        state.total = Math.round(voice.buffer.duration * 100) / 100;
        state.cuts = state.images.map((_, i) => i * state.total / state.images.length);
      }
      if (state.images.length) state.total = Math.max(duration(), ...state.tracks.map(t => t.at + clipLength(t)));
      render();
    } finally { await ctx.close(); }
  }
  $('am-add-voice').onchange = e => importFiles([...e.target.files], 'voice');
  $('am-add-music').onchange = e => importFiles([...e.target.files], 'music');
  $('am-tracks').onchange = e => {
    const i = +e.target.dataset.track, t = state.tracks[i], f = e.target.dataset.field;
    if (!t || !f) return;
    if (f === 'loop') t.loop = e.target.checked;
    else if (f === 'kind') t.kind = e.target.value;
    else t[f] = +e.target.value;
    t.at = Math.max(0, t.at); t.in = clamp(t.in, 0, t.buffer.duration);
    t.out = clamp(t.out, t.in + 0.01, t.buffer.duration);
    t.db = clamp(t.db, -60, 12); t.fadeIn = Math.max(0, t.fadeIn); t.fadeOut = Math.max(0, t.fadeOut);
    // Laisser le contrôle natif finir son changement avant de reconstruire l'inspecteur.
    requestAnimationFrame(render);
  };
  $('am-tracks').onclick = e => {
    const i = e.target.dataset.mute ?? e.target.dataset.remove;
    if (i === undefined) return;
    if (e.target.dataset.mute !== undefined) state.tracks[+i].muted = !state.tracks[+i].muted;
    else { const removed = state.tracks.splice(+i, 1)[0]; if (removed.id===state.selectedId) state.selectedId=null; }
    render();
  };
  root.querySelector('.am-master').oninput = e => {
    const kind=e.target.dataset.masterDb; if (!kind) return;
    state.master[kind].db=+e.target.value; $(`am-${kind}-db`).textContent=`${e.target.value} dB`;
  };
  root.querySelector('.am-master').onclick = e => {
    const kind=e.target.dataset.masterMute; if (!kind) return;
    state.master[kind].muted=!state.master[kind].muted; render();
  };
  $('am-zoom').oninput = e => { state.zoom=+e.target.value; renderTimeline(); };
  $('am-split').onclick = () => {
    const t=selected(); if (!t) return badge('Sélectionnez un clip à couper.',true);
    if (t.loop) return badge('Désactivez la boucle avant de couper ce clip.',true);
    const local=state.previewAt-t.at;
    if (local<0.05 || local>clipLength(t)-0.05) return badge('Placez le curseur à l’intérieur du clip.',true);
    const originalIn=t.in, originalOut=t.out, boundary=t.in+local, at=t.at;
    const originalPoints=t.automation||[{time:0,db:0},{time:clipLength(t),db:0}];
    const boundaryDb=automationDb(t,local);
    const left=originalPoints.filter(p=>p.time<local).concat({time:local,db:boundaryDb});
    const right=[{time:0,db:boundaryDb}].concat(originalPoints.filter(p=>p.time>local).map(p=>({time:p.time-local,db:p.db})));
    t.out=boundary; t.automation=left; t.fadeOut=0;
    const second={...t,id:crypto.randomUUID(),name:t.name+' · suite',at:at+local,in:boundary,out:originalOut,
      automation:right,fadeIn:0,fadeOut:0.5};
    state.tracks.splice(state.tracks.indexOf(t)+1,0,second); state.selectedId=second.id;
    badge(`Clip coupé à ${time(state.previewAt)}. Déplacez chaque partie indépendamment.`,false); render();
  };
  $('am-add-point').onclick = () => {
    const t=selected(); if (!t) return badge('Sélectionnez un clip.',true);
    const local=state.previewAt-t.at;
    if (local<=0 || local>=clipLength(t)) return badge('Placez le curseur dans le clip.',true);
    t.automation.push({time:local,db:automationDb(t,local)});
    t.automation.sort((a,b)=>a.time-b.time); render();
  };
  $('am-tracks').ondblclick = e => {
    const t=selected(), panel=e.target.closest('.am-automation'); if (!t||!panel) return;
    const point=e.target.closest('[data-point]');
    if (point) { const j=+point.dataset.point; if (j>0 && j<t.automation.length-1) t.automation.splice(j,1); }
    else { const r=panel.getBoundingClientRect(); t.automation.push({time:clamp((e.clientX-r.left)/r.width*clipLength(t),0,clipLength(t)),db:clamp(12-(e.clientY-r.top)/r.height*72,-60,12)}); t.automation.sort((a,b)=>a.time-b.time); }
    render();
  };
  $('am-tracks').onpointerdown = e => {
    const dot=e.target.closest('[data-point]'), t=selected(); if (!dot||!t) return;
    const j=+dot.dataset.point, panel=dot.closest('.am-automation'), r=panel.getBoundingClientRect();
    dot.setPointerCapture(e.pointerId);
    dot.onpointermove=move => {
      const p=t.automation[j];
      p.db=Math.round(clamp(12-(move.clientY-r.top)/r.height*72,-60,12));
      if (j>0&&j<t.automation.length-1) p.time=clamp((move.clientX-r.left)/r.width*clipLength(t),t.automation[j-1].time+0.01,t.automation[j+1].time-0.01);
      dot.setAttribute('cx',p.time/clipLength(t)*500); dot.setAttribute('cy',(12-p.db)/72*90);
      panel.querySelector('polyline').setAttribute('points',t.automation.map(q=>`${q.time/clipLength(t)*500},${(12-q.db)/72*90}`).join(' '));
    };
    dot.onpointerup=()=>{dot.onpointermove=null;dot.onpointerup=null;render();};
  };
  $('am-steps').onchange = e => {
    if (e.target.dataset.cut === undefined) return;
    const i = +e.target.dataset.cut, value = +e.target.value;
    if (i === 0 || !Number.isFinite(value) || value <= state.cuts[i-1] || value >= (state.cuts[i+1] ?? duration())) {
      badge('Le repère doit rester entre ceux des étapes voisines ; la première commence à zéro.', true); render(); return;
    }
    state.cuts[i] = value; render();
  };
  $('am-steps').onclick = e => { if (e.target.dataset.focus === undefined) return; seek(state.cuts[+e.target.dataset.focus]); };
  $('am-lanes').onclick = e => { if (e.target.dataset.focus !== undefined) seek(state.cuts[+e.target.dataset.focus]); };
  $('am-lanes').onpointerdown = e => {
    const clip = e.target.closest('[data-clip]'); if (!clip) return;
    const i = +clip.dataset.clip, t = state.tracks[i], lane = clip.parentElement;
    state.selectedId=t.id;
    const initial = t.at, x = e.clientX, width = lane.getBoundingClientRect().width;
    clip.setPointerCapture(e.pointerId);
    clip.onpointermove = move => {
      t.at = Math.round(clamp(initial + (move.clientX-x)/width*duration(),0,duration())*10)/10;
      clip.style.left = `${t.at/duration()*100}%`;
    };
    clip.onpointerup = up => {
      const target=[...root.querySelectorAll('[data-master-lane]')].find(row=>{const r=row.getBoundingClientRect();return up.clientY>=r.top&&up.clientY<=r.bottom;});
      if (target) t.kind=target.dataset.masterLane;
      clip.onpointermove = null; clip.onpointerup = null; render();
    };
  };
  $('am-seek').oninput = e => seek(+e.target.value);
  $('am-total').onchange = e => {
    const proposed = +e.target.value;
    if (!Number.isFinite(proposed) || proposed < 1 || proposed <= (state.cuts.at(-1) || 0)) {
      badge('La durée doit dépasser le début de la dernière étape.', true); render(); return;
    }
    state.total = proposed; state.previewAt = Math.min(state.previewAt, proposed); render();
  };
  $('am-marker').onclick = () => {
    const i = state.cuts.findIndex((v, idx) => idx > 0 && v > state.previewAt);
    const target = i < 0 ? state.cuts.length - 1 : i;
    if (target <= 0 || state.previewAt <= state.cuts[target - 1] || state.previewAt >= (state.cuts[target + 1] ?? duration())) {
      badge('Placez la lecture entre deux repères pour déplacer le prochain.', true); return;
    }
    state.cuts[target] = Math.round(state.previewAt * 100) / 100;
    badge(`Repère ${target + 1} placé à ${time(state.previewAt)}.`, false); render();
  };
  async function drawPreview(at) {
    if (!state.images.length) return;
    let idx = state.cuts.findLastIndex(v => v <= at); idx = Math.max(0, idx);
    if (idx !== state.bitmapIndex) {
      const next = await createImageBitmap(state.images[idx].blob);
      if (state.bitmap) state.bitmap.close(); state.bitmap = next; state.bitmapIndex = idx;
    }
    const canvas = $('am-preview'), c = canvas.getContext('2d'), im = state.bitmap;
    c.fillStyle = '#fffdf9'; c.fillRect(0, 0, canvas.width, canvas.height);
    const ratio = Math.min(canvas.width / im.width, canvas.height / im.height);
    c.drawImage(im, (canvas.width-im.width*ratio)/2, (canvas.height-im.height*ratio)/2, im.width*ratio, im.height*ratio);
  }
  function seek(at) { state.previewAt = clamp(at, 0, duration()); drawPreview(state.previewAt); renderClock(); }
  function renderClock() {
    $('am-clock').textContent = `${time(state.previewAt)} / ${time(duration())}`;
    $('am-seek').value = state.previewAt;
    const playhead = root.querySelector('.am-playhead');
    if (playhead) playhead.style.left = `${state.previewAt / Math.max(1, duration()) * 100}%`;
  }
  let previewCtx = null, previewSources = [];
  function stopPreview() {
    state.playing = false; cancelAnimationFrame(state.raf);
    previewSources.forEach(s => { try { s.stop(); } catch {} }); previewSources = [];
    if (previewCtx) { previewCtx.close(); previewCtx = null; }
    $('am-play').textContent = 'Lire';
  }
  function schedule(ctx, destination, from, output) {
    const result = [];
    for (const t of tracks()) {
      const length = clipLength(t);
      if (length <= 0) continue;
      const gain = ctx.createGain(), source = ctx.createBufferSource();
      source.buffer = t.buffer; source.loop = t.loop; source.loopStart = t.in; source.loopEnd = t.out;
      const begin = Math.max(t.at, from);
      const offset = t.in + (t.loop ? Math.max(0,from-t.at) % length : Math.max(0,from-t.at));
      if (!t.loop && offset >= t.out) continue;
      const when = ctx.currentTime + Math.max(0.05, begin-from);
      const maxLength = Math.max(0, Math.min((t.loop ? duration()-begin : t.out-offset), duration()-begin));
      if (!maxLength) continue;
      // Une courbe échantillonnée applique les points, les fondus, le bus Master et le ducking
      // de façon identique à la lecture et au rendu OfflineAudioContext du MP4.
      const steps=Math.max(2,Math.ceil(maxLength/0.05));
      const curve=new Float32Array(steps+1);
      for(let k=0;k<=steps;k++) {
        const elapsed=k/steps*maxLength, absolute=begin+elapsed;
        const local=t.loop ? (absolute-t.at)%length : absolute-t.at;
        let level=dbGain(t.db+state.master[t.kind].db+automationDb(t,local));
        if(t.fadeIn>0) level*=clamp((absolute-t.at)/t.fadeIn,0,1);
        if(t.fadeOut>0 && !t.loop) level*=clamp((t.at+length-absolute)/t.fadeOut,0,1);
        if(t.kind==='music') {
          const under=state.tracks.some(v=>v.kind==='voice'&&!v.muted&&!state.master.voice.muted&&absolute>=v.at&&absolute<v.at+clipLength(v));
          if(under) level*=+$('am-duck').value;
        }
        curve[k]=level;
      }
      gain.gain.setValueCurveAtTime(curve,when,maxLength);
      source.connect(gain).connect(destination);
      source.start(when, offset, maxLength);
      result.push(source);
    }
    return result;
  }
  $('am-play').onclick = async () => {
    if (state.playing) return stopPreview();
    if (!state.images.length) return badge('Importez d’abord une présentation.', true);
    previewCtx = new (window.AudioContext || window.webkitAudioContext)();
    await previewCtx.resume();
    previewSources = schedule(previewCtx, previewCtx.destination, state.previewAt, true);
    state.playing = true; state.started = performance.now() - state.previewAt * 1000;
    $('am-play').textContent = 'Pause';
    const tick = now => { if (!state.playing) return; seek((now-state.started)/1000);
      if (state.previewAt >= duration()) stopPreview(); else state.raf = requestAnimationFrame(tick); };
    state.raf = requestAnimationFrame(tick);
  };
  $('am-stop').onclick = () => { stopPreview(); seek(0); };

  // Export déterministe : chaque étape est écrite avec son instant et sa durée.
  // Le temps réel de l'onglet ne peut donc plus sauter de diapositive.
  let cancelExport = false;
  $('am-cancel-export').onclick = () => { cancelExport = true; badge('Annulation demandée…', false); };
  function paint(canvas, bitmap) {
    const c = canvas.getContext('2d', {alpha:false});
    c.fillStyle = '#fffdf9'; c.fillRect(0,0,canvas.width,canvas.height);
    const width = bitmap.displayWidth || bitmap.width, height = bitmap.displayHeight || bitmap.height;
    const scale = Math.min(canvas.width/width,canvas.height/height);
    c.drawImage(bitmap,(canvas.width-width*scale)/2,(canvas.height-height*scale)/2,width*scale,height*scale);
  }
  async function mixedAudio() {
    const rate = 44100, seconds = duration();
    const offline = new OfflineAudioContext(2, Math.ceil(seconds*rate), rate);
    schedule(offline, offline.destination, 0, true);
    return offline.startRendering();
  }
  async function validateMp4(blob, expectedAudio) {
    const M = window.AtelierMuxer;
    const input = new M.Input({source:new M.BlobSource(blob),formats:M.ALL_FORMATS});
    const v = await input.getPrimaryVideoTrack(), a = await input.getPrimaryAudioTrack();
    if (!v || (!!a !== expectedAudio)) throw Error('Piste vidéo ou audio absente du MP4.');
    const videoSeconds = await v.computeDuration();
    if (Math.abs(videoSeconds-duration()) > 0.25) throw Error(`Durée vidéo incorrecte (${videoSeconds.toFixed(2)} s).`);
    if (a && Math.abs((await a.computeDuration())-duration()) > 0.25) throw Error('Durée audio incorrecte.');
    const sink = new M.VideoSampleSink(v);
    for (let i=0;i<state.images.length;i++) {
      const middle = (state.cuts[i]+(state.cuts[i+1] ?? duration()))/2;
      const sample = await sink.getSample(middle);
      if (!sample) throw Error(`Étape ${i+1} absente du MP4.`);
      const original = await createImageBitmap(state.images[i].blob);
      const aCanvas = document.createElement('canvas'), bCanvas = document.createElement('canvas');
      aCanvas.width = bCanvas.width = 32; aCanvas.height = bCanvas.height = 18;
      paint(aCanvas,original);
      // Mediabunny ferme le VideoFrame à la microtâche suivante : dessiner sans await.
      const decoded = sample.toCanvasImageSource();
      paint(bCanvas,decoded);
      const ap = aCanvas.getContext('2d').getImageData(0,0,32,18).data;
      const bp = bCanvas.getContext('2d').getImageData(0,0,32,18).data;
      let error = 0;
      for (let j=0;j<ap.length;j+=4) error += Math.abs(ap[j]-bp[j])+Math.abs(ap[j+1]-bp[j+1])+Math.abs(ap[j+2]-bp[j+2]);
      original.close(); if (sample.close) sample.close();
      if (error/(32*18*3)>32) throw Error(`Étape ${i+1} différente dans le MP4 (écart ${Math.round(error/(32*18*3))}).`);
    }
    return videoSeconds;
  }
  $('cv-mp4').onclick = async function () {
    const d = window.__chutier && window.__chutier.dernier();
    if (!d || !d.res.images.length) return badge('Importez d’abord une présentation.',true);
    if (!state.images.length) refreshImages();
    const M = window.AtelierMuxer;
    if (!M || typeof VideoEncoder === 'undefined') return badge('Encodage MP4 indisponible dans ce navigateur. Le ZIP d’images reste utilisable.',true);
    stopPreview(); cancelExport = false;
    const button = this; button.disabled = true; $('am-cancel-export').disabled = false; state.exporting = true;
    try {
      const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
      const output = new M.Output({format:new M.Mp4OutputFormat(),target:new M.BufferTarget()});
      const video = new M.CanvasSource(canvas,{codec:'avc',bitrate:6000000});
      output.addVideoTrack(video,{frameRate:30});
      let audio = null;
      if (tracks().length) { audio = new M.AudioBufferSource({codec:'aac',bitrate:192000}); output.addAudioTrack(audio); }
      await output.start();
      if (audio) { badge('Mixage des pistes audio…',false); await audio.add(await mixedAudio()); audio.close(); }
      for (let i=0;i<state.images.length;i++) {
        if (cancelExport) throw Error('Export annulé.');
        const bitmap = await createImageBitmap(state.images[i].blob);
        paint(canvas,bitmap); bitmap.close();
        const span = (state.cuts[i+1] ?? duration())-state.cuts[i];
        if (span <= 0) throw Error(`Durée invalide pour l’étape ${i+1}.`);
        await video.add(state.cuts[i],span);
        $('cv-avancement').style.display='block';
        $('cv-avancement-texte').textContent=`MP4 : étape ${i+1} sur ${state.images.length}`;
        $('cv-barre').style.width=`${Math.round((i+1)/state.images.length*100)}%`;
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      video.close(); await output.finalize();
      const blob = new Blob([output.target.buffer],{type:'video/mp4'});
      badge('Vérification des étapes et des pistes…',false);
      const actual = await validateMp4(blob,!!audio);
      if (cancelExport) throw Error('Export annulé.');
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='atelier-diapos-montage.mp4';document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      badge(`MP4 vérifié : ${state.images.length} étapes, ${tracks().length} piste(s) audio, ${actual.toFixed(1)} s.`,false);
    } catch(e) { badge(`Aucun MP4 téléchargé : ${e.message}`,true); }
    finally { button.disabled=false;$('am-cancel-export').disabled=true;state.exporting=false; }
  };
  render();
})();
