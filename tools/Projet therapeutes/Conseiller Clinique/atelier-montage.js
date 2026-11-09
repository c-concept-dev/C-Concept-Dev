/* Atelier Diapos — montage local. Source embarquée dans atelier-diapos.html par
 * tests/embarquer-atelier-montage.cjs ; aucun fichier voisin requis à l'usage. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { tracks: [], sources: [], copiedSource: null, images: [], cuts: [], total: 0, playing: false, started: 0,
    previewAt: 0, raf: 0, bitmap: null, bitmapIndex: -1, exporting: false,
    selectedId: null, selectedIds: [], copiedTracks: [], zoom: 20, annexZoom: {voice: 1, music: 1}, linkedZoom: false,
    placementMode: 'free', previewQuality: 'full', workspace: 'all', transitions: [], selectedTransition: 1, previewRequest: 0,
    previewCache: new Map(), previewDrawAt: null, previewDrawing: false, previewGeneration: 0, scrubbing: false,
    historyPast: [], historyFuture: [], lastAction: '',
    master: {voice: {db: 0, muted: false}, music: {db: 0, muted: false}} };
  function clearPreviewCache() {
    state.previewGeneration++;
    for (const value of state.previewCache.values()) Promise.resolve(value).then(bitmap => bitmap?.close?.()).catch(()=>{});
    state.previewCache.clear();state.previewDrawAt=null;state.bitmap=null;state.bitmapIndex=-1;
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const time = s => { s=Number.isFinite(s)?Math.max(0,s):0; return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
  const timeFrame = s => { s=Number.isFinite(s)?Math.max(0,s):0;const whole=Math.floor(s),frame=Math.min(29,Math.floor((s-whole)*30+0.0001));return `${time(whole)}.${String(frame).padStart(2,'0')}`; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const badge = (message, error) => { const el = $('am-status'); el.textContent = message; el.dataset.error = error ? '1' : '0'; };
  const tracks = () => { const audible=state.tracks.filter(t => !t.muted && !state.master[t.kind].muted);return audible.some(t=>t.solo)?audible.filter(t=>t.solo):audible; };
  const selected = () => state.tracks.find(t => t.id === state.selectedId);
  const clipLength = t => t.out - t.in;
  const dbGain = db => Math.pow(10, db / 20);
  const trackColors = {
    voice:['#0072B2','#2487C4','#0B5F91','#56B4E9'],
    music:['#B7482A','#D55E00','#96351F','#C96A4C']
  };
  const nextTrackColor = kind => {
    const palette=trackColors[kind]||trackColors.voice;
    return palette[state.sources.filter(s => s.kind === kind).length % palette.length];
  };
  function voiceLevel(buffer, inSeconds=0, outSeconds=buffer.duration) {
    const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
    const frame=Math.max(1,Math.round(buffer.sampleRate*0.1)),stride=Math.max(1,Math.floor(buffer.sampleRate/8000));
    const first=Math.max(0,Math.floor(inSeconds*buffer.sampleRate)),last=Math.min(buffer.length,Math.ceil(outSeconds*buffer.sampleRate));
    const frameRms=[];let peak=0;
    for(let start=first;start<last;start+=frame){
      let sum=0,count=0;
      for(let j=start;j<Math.min(last,start+frame);j+=stride)for(const ch of channels){const v=ch[j];sum+=v*v;count++;peak=Math.max(peak,Math.abs(v));}
      const rms=Math.sqrt(sum/Math.max(1,count));
      frameRms.push(rms);
    }
    // Une voix enregistrée à bas niveau ne doit pas perdre ses syllabes calmes
    // à cause d'un seuil absolu pensé pour une autre prise de son.
    const threshold=Math.max(0.001,peak*0.08);
    let activeSum=0,activeCount=0;
    for(const rms of frameRms)if(rms>threshold){activeSum+=rms*rms;activeCount++;}
    const activeRms=Math.sqrt(activeSum/Math.max(1,activeCount));
    if(!activeCount||peak<=0)return {rmsDb:null,autoGainDb:0};
    const rmsDb=20*Math.log10(activeRms);
    const autoGainDb=Math.round(clamp(Math.min(-20-rmsDb,-3-20*Math.log10(peak)),-18,24)*10)/10;
    return {rmsDb:Math.round(rmsDb*10)/10,autoGainDb};
  }
  const voiceGain = t => t.kind==='voice' && $('am-uniform-voices')?.checked ? (t.autoGainDb||0) : 0;
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
  const transitionLength = i => i>0 && i<state.images.length && state.transitions[i] && state.transitions[i].type!=='cut'
    ? Math.min(state.transitions[i].duration||0.6, (state.cuts[i]-state.cuts[i-1])*0.4,
      ((state.cuts[i+1]??duration())-state.cuts[i])*0.4) : 0;
  const activeTransition = at => {
    const i=state.cuts.findIndex((v,j)=>j>0 && at>=v-transitionLength(j) && at<v);
    return i<0?null:{i,p:(at-state.cuts[i]+transitionLength(i))/transitionLength(i)};
  };
  const cloneItem = item => item ? {...item,automation:(item.automation||[]).map(point=>({...point}))} : null;
  function projectSnapshot() {
    return {
      tracks:state.tracks.map(cloneItem),sources:state.sources.map(cloneItem),copiedSource:cloneItem(state.copiedSource),
      copiedTracks:state.copiedTracks.map(cloneItem),images:state.images.slice(),cuts:state.cuts.slice(),total:state.total,
      previewAt:state.previewAt,selectedId:state.selectedId,selectedIds:state.selectedIds.slice(),zoom:state.zoom,
      annexZoom:{...state.annexZoom},linkedZoom:state.linkedZoom,placementMode:state.placementMode,
      previewQuality:state.previewQuality,workspace:state.workspace,transitions:state.transitions.map(t=>({...t,params:{...(t.params||{})}})),
      selectedTransition:state.selectedTransition,master:{voice:{...state.master.voice},music:{...state.master.music}}
    };
  }
  function updateHistoryButtons() {
    if($('am-undo')) $('am-undo').disabled=!state.historyPast.length;
    if($('am-redo')) $('am-redo').disabled=!state.historyFuture.length;
  }
  function checkpoint(label) {
    state.historyPast.push({label,snapshot:projectSnapshot()});
    state.historyFuture=[];state.lastAction=label;updateHistoryButtons();
  }
  function restoreSnapshot(snapshot) {
    if(state.playing)stopPreview();
    for(const key of ['tracks','sources','copiedTracks','images','cuts','selectedIds','transitions']) state[key]=snapshot[key];
    for(const key of ['copiedSource','total','previewAt','selectedId','zoom','linkedZoom','placementMode','previewQuality','workspace','selectedTransition','master']) state[key]=snapshot[key];
    state.annexZoom=typeof snapshot.annexZoom==='number'?{voice:snapshot.annexZoom,music:snapshot.annexZoom}:{...snapshot.annexZoom};
    clearPreviewCache();applyPreviewQuality();render();drawPreview(state.previewAt);updateHistoryButtons();
  }
  function undo() {
    const entry=state.historyPast.pop();if(!entry)return;
    state.historyFuture.push({label:entry.label,snapshot:projectSnapshot()});restoreSnapshot(entry.snapshot);
    badge(`Annulé : ${entry.label}.`,false);
  }
  function redo() {
    const entry=state.historyFuture.pop();if(!entry)return;
    state.historyPast.push({label:entry.label,snapshot:projectSnapshot()});restoreSnapshot(entry.snapshot);
    badge(`Rétabli : ${entry.label}.`,false);
  }

  const css = document.createElement('style');
  css.textContent = `
    #am-workbench{margin:12px 0;padding:12px;background:#fffdf9;border:1px solid #c9c3b8;border-radius:16px;box-shadow:0 8px 28px #322b2314;color:#273331;min-height:680px;display:flex;flex-direction:column;gap:6px}
    #am-workbench.am-focused{position:fixed;inset:0;z-index:99999;margin:0;width:100vw;height:100dvh;min-height:0;border-radius:0;padding:8px 14px;overflow:hidden;gap:4px}
    #am-workbench.am-focused h2{font-size:23px;margin:0}
    #am-workbench.am-focused .am-toolbar{margin:0}
    #am-workbench.am-focused .am-toolbar-row.am-edit{padding-top:3px}
    #am-workbench.am-focused>p{display:none}
    .am-workspace-deck{display:flex;flex:1 1 auto;min-height:0}.am-workspace{display:none;min-height:0;flex-direction:column;gap:6px;width:100%}
    #am-workbench[data-workspace=preview] .am-workspace-preview,#am-workbench[data-workspace=master] .am-workspace-master,#am-workbench[data-workspace=sources] .am-workspace-sources{display:flex}
    #am-workbench[data-workspace=all] .am-workspace{display:flex}
    #am-workbench.am-focused .am-workspace{overflow:hidden}
    #am-workbench[data-workspace=all] .am-workspace-deck{display:flex;flex-direction:column;gap:10px;overflow:visible}
    #am-workbench[data-workspace=all] .am-workspace-preview{min-height:360px}#am-workbench[data-workspace=all] .am-workspace-master{min-height:520px}#am-workbench[data-workspace=all] .am-workspace-sources{min-height:440px}
    #am-workbench.am-focused[data-workspace=all] .am-workspace-preview{height:clamp(430px,58vh,640px);min-height:430px;max-height:640px;flex:0 0 clamp(430px,58vh,640px)}
    #am-workbench.am-focused[data-workspace=all] .am-workspace-master{height:clamp(540px,70vh,700px);min-height:540px;max-height:700px;flex:0 0 clamp(540px,70vh,700px)}
    #am-workbench.am-focused[data-workspace=all] .am-workspace-sources{height:clamp(440px,62vh,620px);min-height:440px;max-height:620px;flex:0 0 clamp(440px,62vh,620px)}
    #am-workbench.am-focused[data-workspace=all]{overflow-y:auto}
    #am-workbench.am-focused[data-workspace=all] .am-workspace-deck{flex:0 0 auto;overflow:visible}
    #am-workbench.am-focused[data-workspace=all] .am-preview-panel{min-height:0;padding:8px}#am-workbench.am-focused[data-workspace=all] .am-section-help{display:none}
    #am-workbench.am-focused[data-workspace=all] .am-preview-actions .am-command-label{display:none}
    #am-workbench.am-focused[data-workspace=all] .am-workspace-sources .am-sources{min-height:360px}
    #am-workbench.am-focused[data-workspace=all] .am-workspace-master .am-timeline{min-height:260px}
    #am-workbench.am-focused .am-grid{flex:1 1 auto;min-height:0}
    #am-workbench.am-focused .am-preview-panel{min-height:0;height:100%}
    #am-workbench.am-focused .am-sources{flex:1 1 auto;height:auto;min-height:0}
    #am-workbench.am-focused .am-master{margin:0}
    #am-workbench.am-focused .am-master-picker{min-height:24px}
    #am-workbench.am-focused .am-workspace-master .am-timeline,#am-workbench.am-focused .am-workspace-master .am-steps-panel{min-height:300px;flex:1 1 auto}
    #am-workbench.am-focused .am-timeline{padding:7px 10px}
    #am-workbench.am-focused .am-lane:not([data-master-lane]){height:58px}
    #am-workbench.am-focused .am-lane:not([data-master-lane]) .am-lane-name{top:19px}
    #am-workbench.am-focused .am-clip{height:40px;top:9px;padding:6px 8px}
    #am-workbench.am-focused .am-playhead{height:199px}
    #am-workbench.am-focused #am-status{margin:0!important}
    #am-workbench *{box-sizing:border-box} #am-workbench h2{font:600 29px/1.15 'Source Serif 4',Georgia,serif;margin:0 0 7px;color:#102f31}
    #am-workbench p{margin:0;color:#5d6966;font-size:12px}
    .am-toolbar{display:flex;gap:5px;flex-direction:column;margin:3px 0}
    .am-toolbar-row{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
    .am-toolbar-row.am-edit{padding-top:5px;border-top:1px solid #e5ded3}
    #am-workbench button,#am-workbench .am-file{font:600 12px/1.15 -apple-system,system-ui,sans-serif;border:1.5px solid #1f5053;border-radius:8px;background:#fffdf9;color:#1f5053;padding:7px 10px;min-height:34px;cursor:pointer}
    #am-workbench button:hover,#am-workbench .am-file:hover{background:#dce8e6}
    #am-workbench button.am-transport{background:#1f5053;color:#fff}
    #am-workbench button.am-export-button{background:#a34d30;color:#fff;border-color:#a34d30}
    #am-workbench button:focus-visible,#am-workbench input:focus-visible{outline:3px solid #8a3f29;outline-offset:2px}
    #am-workbench button:disabled{opacity:.45;cursor:not-allowed}
    #am-workbench select{border:1px solid #5d6966;border-radius:6px;background:#fffdf9;color:#17393b;padding:5px;font:inherit}
    .am-command-group{display:flex;align-items:center;gap:5px;padding-right:7px;border-right:1px solid #d7cfc3}.am-command-group:last-child{border-right:0}
    .am-command-label{font-size:11px;font-weight:700;color:#52615f}.am-project-input{display:none}
    #am-workbench .am-compact{padding:5px 8px;min-height:34px}.am-toggle-active{background:#1f5053!important;color:#fff!important}
    .am-file-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.am-grid{display:grid;grid-template-columns:1fr;gap:10px;min-height:0;flex:1 1 auto}
    #am-workbench:not(.am-has-selection) .am-inspector{display:none}
    .am-panel{border:1px solid #c9c3b8;border-radius:12px;padding:13px;background:#f6f2ea;min-width:0}
    .am-panel h3{font:700 15px/1.3 -apple-system,system-ui,sans-serif;margin:0 0 10px}
    .am-grid .am-panel:first-child{display:flex;flex-direction:column;min-height:0;overflow:hidden}
    .am-preview-panel{min-height:clamp(440px,62vh,760px)}.am-preview-stage{flex:1;min-height:280px;display:grid;place-items:center;background:#eee9df;border-radius:10px;padding:8px;overflow:hidden}
    #am-preview{width:min(100%,1050px);height:auto;max-height:100%;aspect-ratio:16/9;display:block;background:#fffdf9;border-radius:9px;object-fit:contain;box-shadow:0 3px 16px #102f3120}
    #am-workbench.am-focused #am-preview{width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain}
    #am-workbench.am-focused #am-seek{margin:4px 0 0}
    #am-preview:fullscreen{width:100vw;height:100vh;max-width:none;max-height:none;object-fit:contain;background:#102f31}
    #am-seek{width:100%;margin:7px 0 0}.am-preview-actions{justify-content:flex-end;gap:5px;padding-top:3px;flex:0 0 auto;font-size:11px}.am-preview-actions button{min-height:28px!important;padding:4px 7px!important;font-size:11px!important}.am-preview-actions select{padding:3px!important;font-size:11px}.am-preview-actions #am-clock{font-size:12px;font-variant-numeric:tabular-nums}.am-track{border:1px solid #5d6966;background:#fffdf9;border-radius:9px;padding:10px;margin-bottom:9px}
    .am-track[data-kind=voice]{border-left:5px solid #1f5053}.am-track[data-kind=music]{border-left:5px solid #8a3f29}
    .am-track-head{display:flex;align-items:center;gap:7px;justify-content:space-between;flex-wrap:wrap}
    .am-track-fields{display:grid;grid-template-columns:repeat(4,minmax(62px,1fr));gap:7px;margin-top:10px}
    .am-track label,.am-step label{font-size:11px;color:#5d6966;display:flex;flex-direction:column;gap:3px}
    .am-track input[type=number],.am-step input{width:100%;min-width:0;border:1px solid #5d6966;border-radius:5px;padding:5px;background:#fff;font:inherit}
    .am-track input[type=range]{width:100%}.am-wave{display:block;width:100%;height:38px;background:#dce8e6;border-radius:4px;margin-top:9px}
    .am-step{display:grid;grid-template-columns:42px minmax(0,1fr) 100px 66px;align-items:center;gap:7px;border-bottom:1px solid #ddd7cc;padding:7px 0;font-size:12px}
    .am-step img{width:42px;height:30px;object-fit:contain;background:#e9e4d9}.am-step button{padding:4px 7px!important}
    .am-timeline{margin:0;border:1px solid #b6afa4;border-radius:12px;background:#eee9df;padding:12px;overflow:auto;scrollbar-gutter:stable;flex:1;min-height:255px}
    .am-minimap{position:sticky;left:120px;z-index:8;height:16px;width:calc(100% - 120px);margin:4px 0 4px 120px;border:1px solid #9a938a;border-radius:5px;background:linear-gradient(90deg,#dce8e6,#f2dfd4);cursor:pointer;touch-action:none}
    .am-minimap-window{position:absolute;top:1px;bottom:1px;left:0;width:100%;min-width:20px;border:2px solid #1f5053;border-radius:3px;background:#fff8;cursor:ew-resize}
    .am-ruler,.am-lane{min-width:600px;position:relative;margin-left:110px}
    .am-ruler{height:25px;border-bottom:1px solid #9a938a;font-size:11px;color:#52615f}
    .am-tick{position:absolute;top:0;transform:translateX(-50%);border-left:1px solid #9a938a;padding-left:4px;height:25px}
    .am-lane{height:48px;border-bottom:1px solid #d5cec2;background:repeating-linear-gradient(to right,transparent 0,transparent calc(10% - 1px),#d5cec2 calc(10% - 1px),#d5cec2 10%)}
    .am-lane-name{position:absolute;right:calc(100% + 10px);top:13px;width:100px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;font-weight:700;color:#183b3d}
    .am-lane[data-master-lane]{height:66px}.am-lane[data-master-lane] .am-lane-name{top:4px;height:58px;overflow:visible;text-overflow:clip}.am-lane-name>strong{display:block}.am-lane-mix{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:2px 4px;margin-top:3px}.am-lane-mix button{min-height:19px!important;padding:1px 4px!important;font-size:9px!important}.am-lane-mix input[type=range]{width:100%;min-width:0}.am-lane-mix output{grid-column:1/-1;text-align:right;font-size:9px;font-weight:500;color:#52615f}
    .am-clip{position:absolute;top:8px;height:31px;border-radius:5px;background:var(--track-color,#1f5053);color:#fff;padding:7px 8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;cursor:grab;touch-action:none;box-shadow:0 2px 5px #102f3130}
    .am-clip[data-kind=music]{background:var(--track-color,#8a3f29)}.am-clip:active{cursor:grabbing}
    .am-clip[data-selected=true]{outline:3px solid #e6b15c;outline-offset:1px}
    .am-clip[data-locked=true]{cursor:not-allowed;opacity:.72;background-image:repeating-linear-gradient(135deg,transparent 0 7px,#fff3 7px 10px)}
    .am-clip .am-envelope{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.am-envelope-point{position:absolute;z-index:5;width:8px;height:8px;transform:translate(-50%,-50%);border:1.5px solid #7b3b25;border-radius:50%;background:#f6d386;box-shadow:0 0 0 1px #fff8;cursor:grab;touch-action:none}.am-envelope-point::before{content:'';position:absolute;inset:-6px}.am-envelope-point:hover,.am-envelope-point:focus-visible{width:10px;height:10px;outline:none}.am-clip-label{position:relative;z-index:3;display:block;max-width:100%;cursor:grab}
    #am-workbench .am-source-remove{padding:0 3px;border:0;background:transparent;color:#806e65;font-size:11px;line-height:1;opacity:.65}
    #am-workbench .am-source-remove:hover,#am-workbench .am-source-remove:focus-visible{opacity:1;color:#8a3f29}
    .am-clip-label{margin-left:20px;display:block;overflow:hidden;text-overflow:ellipsis}
    .am-master{display:flex;align-items:center;gap:7px;font-size:12px;margin:3px 0 7px;flex:0 0 auto;flex-wrap:wrap}
    .am-final-timeline-head{position:sticky;left:0;z-index:9;display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:600px;margin-bottom:3px}.am-final-timeline-head>strong{font-size:12px}.am-final-timeline-head .am-zoom-tools{margin-left:auto;flex:0 1 auto;font-size:10.5px;gap:4px}.am-final-timeline-head .am-zoom-tools input[type=range]{width:105px}.am-final-timeline-head .am-zoom-tools output{font-size:10.5px;min-width:42px}.am-final-timeline-head .am-zoom-tools button{min-height:28px!important;padding:3px 6px!important;font-size:11px!important}
    .am-master input[type=range]{width:90px}.am-master strong{min-width:100px}
    .am-master-mix-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0}.am-bus{display:flex;align-items:center;gap:8px;min-height:48px;padding:5px 8px;border:1px solid #c9c3b8;border-radius:9px;background:#f6f2ea}.am-bus label{display:flex;align-items:center;gap:6px}.am-bus-voice{border-left:5px solid #1f5053}.am-bus-music{border-left:5px solid #a34d30}.am-master-settings-row{align-items:flex-start;padding:4px 0;border-top:1px solid #e5ded3;border-bottom:1px solid #e5ded3}.am-master-settings-row .am-zoom-tools{margin-right:auto}.am-settings-disclosure{position:static;flex:1 1 520px;min-width:min(360px,100%);max-width:100%;border:1px solid #c9c3b8;border-radius:8px;background:#f6f2ea;padding:5px 7px;font-size:11px}.am-settings-disclosure summary{cursor:pointer;font-size:11px;line-height:1.15;font-weight:750;color:#1f5053}.am-advanced-grid{display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%;max-width:100%;padding-top:6px;overflow:hidden}.am-advanced-grid label{display:flex;align-items:center;gap:4px;font-size:11px;max-width:100%}.am-advanced-grid button{min-height:28px!important;padding:4px 7px!important;font-size:11px!important}
    .am-master-shell{display:block;min-height:0;flex:1}.am-master-main{display:flex;flex-direction:column;gap:6px;min-width:0;min-height:0;height:100%;overflow:hidden}.am-master-main .am-timeline,.am-master-main .am-steps-panel{flex:1 1 auto}.am-workspace-sources .am-sources{flex:1 1 auto;height:auto;min-height:420px}
    .am-timeline-tools{position:sticky;left:0;z-index:12;width:100%;min-width:0;margin:-4px 0 8px;padding:4px;border:1px solid #c9c3b8;border-radius:9px;background:#f8f5ee}.am-timeline-tools .am-master-actions{display:flex;align-items:center;gap:5px;padding:3px;flex-wrap:wrap}.am-timeline-tools .am-master-actions button{min-height:28px!important;padding:4px 7px!important;font-size:11px!important}.am-timeline-tools .am-master-actions .am-cursor-readout{margin-right:3px}.am-timeline-tools .am-master-settings-row{padding:4px 3px;border-bottom:0}.am-timeline-tools .am-master-picker{padding:0 3px}.am-timeline-tools .am-bottom-tabs{padding:3px}
    .am-master-picker{display:flex;align-items:center;gap:5px;overflow-x:auto;min-height:35px;flex:0 0 auto;white-space:nowrap}
    .am-master-picker>span{font-size:12px;color:#52615f}
    #am-workbench .am-master-picker button{padding:5px 8px;font-size:11px;flex:0 0 auto}
    #am-workbench .am-master-picker button[aria-pressed=true]{background:#1f5053;color:#fff}
    .am-zone-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:30px;flex-wrap:wrap;font-size:12px}.am-zone-head h3{margin:0;font:700 15px/1.2 -apple-system,system-ui,sans-serif}.am-zoom-tools{display:flex;align-items:center;gap:5px}.am-zoom-tools input[type=range]{width:150px}.am-zoom-tools output{min-width:46px;text-align:right}
    #am-workbench .am-zoom-tools button{padding:4px 7px;font-size:11.5px;min-height:30px}
    .am-sources{display:grid;grid-template-columns:1fr 1fr;gap:8px;flex:0 0 205px;height:205px;min-height:0}
    .am-source-lane{--lane-color:#187fc2;border:2px solid var(--lane-color);border-radius:11px;padding:8px;overflow:auto;min-height:0;background:#f6f2ea;font-size:13px}.am-source-lane[data-import-lane=music]{--lane-color:#b7482a}
    .am-source-lane-head{position:sticky;left:0;z-index:7;display:flex;align-items:center;gap:6px;margin-bottom:6px;background:#f6f2ea;min-width:0}.am-source-lane-title{margin-right:auto;min-width:96px}.am-source-lane-title strong{display:block;margin:0}.am-source-lane-title small{color:#5d6966}.am-source-lane-head .am-zoom-tools{gap:2px;flex:0 1 280px;justify-content:flex-end;min-width:0}.am-source-lane-head .am-zoom-tools label{font-size:10px}.am-source-lane-head .am-zoom-tools input[type=range]{width:70px}.am-source-lane-head .am-zoom-tools button{min-height:25px!important;padding:3px 5px!important;font-size:10px!important}.am-source-lane-head .am-zoom-tools output{font-size:10px;min-width:26px}.am-source-lane-head>.am-compact-import{min-height:29px!important;padding:4px 7px!important;font-size:10px!important;white-space:nowrap;flex:0 0 auto}
    #am-workbench .am-drop-audio{border:2px dashed var(--lane-color,#187fc2);border-radius:8px;background:color-mix(in srgb,var(--lane-color,#187fc2) 8%,white);color:var(--lane-color,#174a67);font-weight:750;box-shadow:none}
    #am-workbench .am-drop-audio:hover,#am-workbench .am-source-lane.am-drop-target .am-drop-audio{background:color-mix(in srgb,var(--lane-color,#187fc2) 16%,white);border-color:var(--lane-color,#0b68a7)}
    .am-source-list{display:flex;gap:8px;flex-direction:column;align-items:flex-start;min-width:100%}.am-source-paste{position:sticky;left:0;top:0;z-index:8;align-self:flex-start;background:#fff7df!important;box-shadow:0 2px 6px #0002}
    .am-source-track{min-width:100%;border:1px solid #b8b0a5;border-radius:9px;background:#fffdf9;padding:6px}.am-source-track-head{position:sticky;left:0;z-index:5;display:flex;gap:7px;align-items:center;margin-bottom:5px;width:min(100%,760px);max-width:100%;background:#fffdf9;padding-right:3px}.am-source-track-head strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.am-source-track-head>span{white-space:nowrap;color:#52615f;font-size:10px}.am-source-track-toggle{margin-left:auto;white-space:nowrap}.am-source-track-remove{display:grid!important;place-items:center;width:20px;min-width:20px;min-height:20px!important;padding:0!important;border:0!important;background:transparent!important;color:#8a3f29!important;font-size:14px!important;line-height:1!important;opacity:.5}.am-source-track-remove:hover,.am-source-track-remove:focus-visible{background:#f3e5df!important;opacity:1}.am-source-track[data-collapsed=true]{padding-block:4px}.am-source-track[data-collapsed=true] .am-source-track-head{margin-bottom:0}.am-source-track[data-collapsed=true] .am-source-regions{display:none}.am-source-regions{display:flex;align-items:stretch;width:calc(100% * var(--annex-zoom,1));min-width:100%}
    .am-source-clip{position:relative;flex:0 0 calc(var(--region-ratio,1) * 100%);min-width:150px;background:#e4efee;background:color-mix(in srgb,var(--track-color,#1f5053) 13%,white);color:#17393b;border:2px solid var(--track-color,#1f5053);border-radius:7px;padding:5px;cursor:grab;display:grid;gap:3px;user-select:none;-webkit-user-select:none}
    .am-source-clip+.am-source-clip{margin-left:-2px}.am-source-primary{display:flex;align-items:center;gap:3px;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;padding-bottom:1px}.am-source-primary>*{flex:0 0 auto}
    .am-source-advanced{position:absolute;right:5px;top:3px;z-index:12;font-size:10px}.am-source-advanced summary{display:grid;place-items:center;width:25px;height:23px;border:1px solid currentColor;border-radius:5px;background:#fffdf9;cursor:pointer;font-weight:800;color:#52615f;list-style:none}.am-source-advanced summary::-webkit-details-marker{display:none}.am-source-advanced[open]{position:static;grid-column:1;min-width:0}.am-source-advanced[open] summary{position:absolute;right:5px;top:3px}.am-source-advanced[open] .am-source-actions{display:flex;flex-wrap:wrap;width:100%;padding:5px;border:1px solid #9baba7;border-radius:7px;background:#fffdf9;box-shadow:0 2px 7px #102f3128}.am-source-advanced:not([open]) .am-source-actions{display:none}
    .am-source-clip:active{cursor:grabbing}.am-region-label{display:inline-block;margin-right:6px;padding:2px 6px;border-radius:10px;background:var(--track-color);color:#fff;font-style:normal;font-size:10px;font-weight:800}.am-drag-hint{font-size:10px;font-weight:700;color:#52615f;white-space:nowrap}
    .am-source-clip[data-locked=true]{opacity:.7;cursor:not-allowed}.am-source-clip[data-used=true]{background-image:repeating-linear-gradient(135deg,transparent 0 9px,color-mix(in srgb,var(--track-color) 20%,transparent) 9px 13px)}
    .am-source-clip[data-kind=music]{background:#f3e5df;background:color-mix(in srgb,var(--track-color,#8a3f29) 13%,white);border-color:var(--track-color,#8a3f29);color:#4f2d22}.am-source-clip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .am-track-badge{display:inline-grid;place-items:center;min-width:28px;height:22px;padding:0 5px;border-radius:12px;background:var(--track-color);color:#fff;font-size:11px;font-weight:800;flex:0 0 auto}
    .am-source-head,.am-source-actions{display:flex;align-items:center;gap:5px;min-width:0}.am-source-head{padding-right:29px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}.am-source-head:active{cursor:grabbing}.am-source-head span:first-child{flex:1;font-weight:700}.am-source-head .am-drag-hint{flex:0 0 auto}
    .am-source-wave-wrap{position:relative;width:100%;overflow:hidden;border-radius:4px;background:#fffdf9;cursor:grab;touch-action:none}.am-source-wave-wrap:active{cursor:grabbing}.am-source-wave{width:100%;height:30px;display:block;background:#fffdf9;border-radius:4px;cursor:inherit;touch-action:none}.am-source-playhead{position:absolute;top:0;bottom:0;left:clamp(7px,var(--playhead,50%),calc(100% - 7px));width:10px;transform:translateX(-5px);border-left:2px solid var(--track-color,#187fc2);cursor:ew-resize;pointer-events:auto;touch-action:none;z-index:4}.am-source-playhead::before{content:'';position:absolute;left:-6px;top:0;width:10px;height:8px;border-radius:0 0 5px 5px;background:var(--track-color,#187fc2);box-shadow:0 0 0 1px #fff8}.am-source-playhead:hover{border-left-width:3px}.am-source-clip.am-dragging{opacity:.62;outline:3px solid #e6b15c}
    .am-source-cut-time{font-size:10px;white-space:nowrap}.am-source-cut-time input[type=number]{width:60px}.am-source-clip input[type=number]{width:62px;min-width:0;padding:2px;border:1px solid #83918c;border-radius:4px}
    .am-source-gain{display:inline-flex;align-items:center;gap:3px;padding:1px 3px;border:1px solid #9baba7;border-radius:5px;background:#fffdf9;font-size:10px;white-space:nowrap}.am-source-gain output{min-width:38px;text-align:center;font-variant-numeric:tabular-nums}.am-source-gain button{width:25px;min-width:25px;min-height:25px!important;padding:0!important;font-size:13px!important;line-height:1!important}
    #am-workbench .am-source-clip button{padding:2px 5px;font-size:10px;min-height:25px;background:#fffdf9;border-color:currentColor}.am-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
    #am-workbench .am-source-clip .am-source-remove{padding:0 3px;border:0;background:transparent;color:inherit;font-size:12px;opacity:.7}
    #am-workbench .am-source-clip .am-source-remove:hover{opacity:1;background:transparent;color:inherit}
    .am-lane[data-master-lane]{outline-offset:-3px}.am-lane.am-drop-target,.am-source-lane.am-drop-target{outline:3px dashed #e6b15c;background:#f8edcf}
    .am-inspector{display:none}.am-master-picker{max-height:34px;overflow-x:auto;overflow-y:hidden;white-space:nowrap}.am-master-picker button{min-height:26px!important;padding:3px 7px!important;font-size:10px!important}
    .am-lane.am-has-editor{height:104px}.am-clip[data-selected=true]{height:86px;z-index:8;overflow:visible;box-shadow:0 0 0 3px #e6b15c}.am-clip-integrated-tools{position:absolute;left:3px;top:43px;display:flex;align-items:center;gap:2px;width:max-content;max-width:min(700px,calc(100vw - 220px));padding:3px 4px;border-radius:5px;background:#fffdf9ee;color:#17393b;box-shadow:0 2px 7px #102f3140;font-size:8.5px;white-space:nowrap;overflow-x:auto}.am-clip-integrated-tools label{display:flex;align-items:center;gap:1px}.am-clip-integrated-tools input[type=number]{width:43px;min-height:22px;padding:1px 2px;font:inherit}.am-clip-integrated-tools input[type=checkbox]{width:14px;height:14px}.am-clip-integrated-tools button{min-height:23px!important;padding:1px 4px!important;font-size:8.5px!important}.am-clip-integrated-tools .am-danger{color:#8a3f29}
    .am-automation{height:90px;position:relative;background:linear-gradient(#f8f6f0,#e7ecea);border:1px solid #adb9b6;border-radius:6px;margin:7px 0;touch-action:none;cursor:crosshair}
    .am-automation svg{width:100%;height:100%;overflow:visible}
    .am-automation circle{fill:#f6d386;stroke:#7b3b25;stroke-width:1.4;cursor:grab;pointer-events:auto}.am-envelope{pointer-events:none}.am-clip[data-selected=true] .am-envelope{pointer-events:auto;cursor:crosshair}.am-clip[data-selected=true] .am-envelope polyline{stroke-width:3}
    .am-bottom-tabs{display:flex;gap:7px}.am-bottom-tabs button[aria-selected=true]{background:#1f5053!important;color:#fff!important}
    #am-workbench[data-view=steps] .am-timeline,#am-workbench:not([data-view=steps]) .am-steps-panel{display:none}
    .am-steps-panel{overflow:auto;min-height:150px;flex:1}.am-steps-head{position:sticky;top:-13px;z-index:6;display:flex;align-items:center;justify-content:space-between;gap:8px;margin:-13px -13px 8px;padding:8px 13px;background:#f6f2eaf2;border-bottom:1px solid #d7cfc3}.am-steps-head p{font-size:11px!important}.am-steps-head button{min-height:28px!important;padding:4px 7px!important;font-size:11px!important;white-space:nowrap}.am-step{grid-template-columns:56px minmax(0,1fr) 105px 64px;padding:9px 0;font-size:13px}
    .am-step img{width:56px;height:38px}
    .am-ruler,.am-lane{margin-left:120px}.am-lane:not([data-master-lane]){height:55px;background-size:100% 100%}
    .am-lane-name{width:112px;right:calc(100% + 7px);top:17px;text-align:left}
    .am-clip{height:38px;top:8px;padding:5px 8px}.am-step-clip{height:30px;top:8px}
    .am-clip[aria-disabled=true]{opacity:.4}.am-step-clip{background:#dce8e6;color:#102f31;border:1px solid #1f5053;cursor:pointer}
    .am-step-resize{position:absolute;right:0;top:0;bottom:0;width:12px;cursor:ew-resize;background:rgba(31,80,83,.2);border-left:1px solid #1f5053;touch-action:none}
    .am-transition-marker{position:absolute;top:34px;transform:translateX(-50%);z-index:3;border-radius:50%!important;padding:0!important;width:22px;height:22px;line-height:18px!important;font-size:12px!important;background:#fff8e8!important;border:2px solid #a45337!important;color:#183d3f!important}
    .am-transition-panel{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:7px 10px;background:#f4e8d9;border:1px solid #c4a88e;border-radius:8px;font-size:13px}
    .am-transition-panel[hidden]{display:none}
    .am-transition-panel label{display:flex;align-items:center;gap:5px}.am-transition-panel select,.am-transition-panel input{font:inherit}.am-transition-panel input{width:68px}
    .am-playhead{position:absolute;top:0;width:2px;height:190px;transform:translateX(-1px);background:#ab4329;box-shadow:0 0 0 1px #fff8;pointer-events:none;z-index:20}
    .am-playhead-handle{position:absolute;left:-5px;top:0;width:12px;height:12px;border-radius:50%;background:#ab4329;border:2px solid #fff;box-shadow:0 1px 3px #0005;cursor:ew-resize;touch-action:none;pointer-events:auto}
    .am-playhead-handle:focus-visible{outline:2px solid #e6b15c;outline-offset:2px}
    .am-project-bar,.am-preview-actions,.am-master-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.am-project-bar{justify-content:space-between;padding:7px 0;border-bottom:1px solid #e5ded3}.am-project-actions,.am-final-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.am-step-nav{display:flex;gap:7px;align-items:center;padding:5px 0;background:#fffdf9;z-index:40}.am-step-nav strong{margin-right:4px}.am-step-nav button[aria-selected=true]{background:#1f5053!important;color:#fff!important}#am-workbench.am-focused .am-step-nav{border-bottom:1px solid #d7cfc3}.am-project-bar,.am-step-nav,.am-master-head,.am-master-mix-row,.am-master-settings-row{flex-shrink:0}.am-master-head{display:block;flex-basis:auto}.am-master-head .am-master-actions{width:100%;margin-top:8px}.am-master-head .am-zoom-tools{margin-left:auto}.am-section-help{font-size:12px;color:#5d6966}.am-cursor-readout{display:inline-flex;align-items:center;gap:6px;font-weight:750;color:#8a3f29}.am-cursor-dot{width:10px;height:10px;border-radius:50%;background:#ab4329;box-shadow:0 0 0 3px #ab432933}
    #am-status[data-error=1]{color:#8a3f29}#am-status{font-weight:600!important;margin:12px 0 0!important}
    @media(max-width:900px){.am-master-head .am-master-actions{align-items:flex-start}.am-preview-actions{align-items:flex-start}}
    @media(max-width:760px){#am-workbench{height:auto;min-height:760px}.am-grid{grid-template-columns:1fr;flex-basis:auto}.am-grid .am-panel:first-child{display:flex}.am-sources{grid-template-columns:1fr;overflow:auto}.am-track-fields{grid-template-columns:repeat(2,1fr)}#am-workbench.am-focused{overflow:auto}.am-toolbar-row{gap:4px}}`;
  document.head.appendChild(css);

  const root = document.createElement('section');
  root.id = 'am-workbench';
  root.dataset.workspace = state.workspace;
  root.innerHTML = `<div class="am-track-head"><div><h2>Atelier Diapos · Montage</h2><p>Préparez vos voix et musiques en blocs, puis glissez les passages utiles dans le film.</p></div><button id="am-focus" type="button" aria-pressed="false" data-commande="plein-ecran-banc">Ouvrir le banc plein écran</button></div>
    <div class="am-project-bar" aria-label="Projet et export"><div class="am-project-actions"><strong>Projet</strong><button id="am-undo" class="am-compact" type="button" data-commande="annuler" title="Annuler la dernière action (⌘Z)" disabled>↶ Annuler</button><button id="am-redo" class="am-compact" type="button" data-commande="retablir" title="Rétablir l’action annulée (⇧⌘Z)" disabled>↷ Rétablir</button><button id="am-save-project" class="am-compact" type="button" data-commande="sauvegarder-projet">💾 Sauvegarder le projet</button><button id="am-open-project" class="am-compact" type="button" data-commande="ouvrir-projet">📂 Ouvrir un projet</button><input class="am-project-input" id="am-project-file" type="file" accept=".json,application/json" aria-label="Fichier projet Atelier Diapos"></div><div class="am-final-actions"><button id="am-export" class="am-export-button" type="button">Exporter le film en MP4</button><button id="am-cancel-export" type="button" disabled>Annuler l’export</button></div></div><nav class="am-step-nav" role="tablist" aria-label="Espaces de travail"><strong>Espace de travail :</strong><button type="button" role="tab" aria-selected="true" data-jump="all">Montage complet</button><button type="button" role="tab" aria-selected="false" data-jump="preview">Aperçu</button><button type="button" role="tab" aria-selected="false" data-jump="master">Timeline</button><button type="button" role="tab" aria-selected="false" data-jump="sources">Voix et musiques</button></nav>
    <input class="am-file-input" id="am-add-voice" type="file" accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" multiple aria-label="Fichiers voix MP3, M4A ou WAV"><input class="am-file-input" id="am-add-music" type="file" accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" multiple aria-label="Fichiers musique MP3, M4A ou WAV">
    <div class="am-workspace-deck"><section class="am-workspace am-workspace-preview" data-workspace-panel="preview" role="tabpanel"><div class="am-grid"><div class="am-panel am-preview-panel"><div class="am-track-head"><div><h3>1 · Aperçu du film</h3><span class="am-section-help">Vérifiez ici l’image et le son au même moment.</span></div></div><div class="am-preview-stage"><canvas id="am-preview" width="1920" height="1080"></canvas></div>
      <input id="am-seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Position de lecture dans le film"><div class="am-preview-actions"><button id="am-play" class="am-transport" type="button">▶ Lire le film</button><button id="am-stop" type="button">Arrêter</button><strong id="am-clock">00:00 / 00:00</strong><label class="am-command-label">Qualité <select id="am-preview-quality"><option value="full">Nette 1080p</option><option value="economy">Économique 540p</option></select></label><button id="am-preview-fullscreen" type="button" title="Afficher uniquement l’image en plein écran">Plein écran</button></div>
      </div></div></section>
    <section class="am-workspace am-workspace-master" data-workspace-panel="master" role="tabpanel">
    <div class="am-zone-head am-master-head"><div><h3>2 · Timeline Master</h3><span class="am-section-help">Placez le curseur rouge dans la règle, puis utilisez les outils juste au-dessus de la timeline.</span></div></div>
    <div class="am-master-shell"><div class="am-master-main"><div class="am-timeline" aria-label="Master final du montage"><div class="am-timeline-tools"><div class="am-master-actions" aria-label="Outils de la timeline"><span class="am-cursor-readout"><i class="am-cursor-dot"></i> <output id="am-cursor-time">00:00</output></span><button id="am-split" type="button" title="Scinder le bloc Master sélectionné à l’endroit du curseur rouge">✂ Scinder</button><button id="am-add-point" type="button" title="Créer un point de volume sur le bloc sélectionné">+ Volume</button><button id="am-marker" type="button" title="Faire commencer la prochaine image à l’endroit du curseur">Repère image</button><label class="am-command-label">Placement <select id="am-placement-mode" aria-label="Mode de placement"><option value="free">Libre</option><option value="snap">Aimanté</option><option value="insert">Insérer et décaler</option></select></label></div>
    <div class="am-toolbar-row am-edit am-master-settings-row"><details class="am-settings-disclosure"><summary>Réglages du son et des pauses</summary><div class="am-advanced-grid"><label>Baisse de la musique pendant la voix <select id="am-duck"><option value="0.126">−18 dB</option><option value="0.251">−12 dB</option><option value="1">Aucune</option></select></label><label title="Rapproche automatiquement le volume des différentes voix"><input id="am-uniform-voices" type="checkbox" checked> Égaliser le volume des voix</label><button id="am-linked-zoom" class="am-compact" type="button" aria-pressed="false" data-commande="lier-zooms" title="Appliquer le zoom Master aux deux zones de sources">Lier les 3 zooms</button><label>Durée du film (s) <input id="am-total" type="number" min="1" step="0.1" style="width:78px" aria-label="Durée totale du film"></label><button id="am-pause-all" type="button" title="Ajouter la même pause entre toutes les diapositives">⏸ Pauses entre toutes les images…</button></div></details></div>
    <div id="am-master-picker" class="am-master-picker" aria-label="Sélectionner un clip du Master"></div><div id="am-tracks" class="am-inspector" hidden></div>
    <div id="am-transition-panel" class="am-transition-panel" hidden><strong id="am-transition-title">Transition</strong><label>Effet <select id="am-transition-type"><optgroup label="Base"><option value="cut">Coupe</option></optgroup><optgroup label="Fondus"><option value="dissolve">Fondu enchaîné</option><option value="blur-cross">Flou croisé</option><option value="fade-black">Fondu au noir</option><option value="fade-white">Fondu au blanc</option></optgroup><optgroup label="Mouvement"><option value="zoom-cross">Zoom croisé</option><option value="wave">Onde</option></optgroup><optgroup label="Balayages"><option value="wipe-left">Balayage à gauche</option><option value="wipe-right">Balayage à droite</option><option value="wipe-up">Balayage en haut</option><option value="wipe-down">Balayage en bas</option></optgroup><optgroup label="Glissements"><option value="slide-left">Glisser à gauche</option><option value="slide-right">Glisser à droite</option></optgroup><optgroup label="Formes"><option value="circle-open">Cercle ouvert</option><option value="circle-close">Cercle fermé</option><option value="portal">Portail</option><option value="mosaic">Mosaïque</option></optgroup><optgroup label="3D"><option value="rotate-in">Rotation intérieure</option><option value="rotate-out">Rotation extérieure</option><option value="exchange">Échange</option><option value="cube">Cube</option><option value="page-previous">Page précédente</option><option value="page-turn">Page tournée</option></optgroup><optgroup label="Puzzle"><option value="puzzle-left">Puzzle gauche</option><option value="puzzle-right">Puzzle droite</option></optgroup></select></label><label>Durée <input id="am-transition-duration" type="number" min="0.1" max="5" step="0.1" value="0.6"> s</label><label>Douceur <select id="am-transition-easing"><option value="linear">Linéaire</option><option value="ease-in">Entrée douce</option><option value="ease-out">Sortie douce</option><option value="ease-in-out">Entrée-sortie douces</option></select></label><button id="am-transition-all" type="button">Appliquer à toutes</button><button id="am-transition-remove-all" type="button">Retirer toutes</button><label>Pause <input id="am-pause-duration" type="number" min="0.1" max="30" step="0.1" value="1"> s</label><button id="am-add-pause" type="button" title="Prolonger la diapositive avant cette jonction">Ajouter la pause</button><span id="am-transition-help">Cliquez sur une jonction entre deux diapositives.</span></div>
    <div class="am-bottom-tabs" role="tablist" aria-label="Vue du montage"><button id="am-view-master" type="button" role="tab" aria-selected="true">Pistes Master</button><button id="am-view-steps" type="button" role="tab" aria-selected="false">Étapes et repères · <span id="am-step-count">0</span> images</button></div></div>
    <div class="am-final-timeline-head"><strong>Master final · voix et musique exportées en un seul mixage</strong><div class="am-zoom-tools" aria-label="Zoom précis du Master"><button id="am-zoom-out" type="button" title="Dézoomer le Master">−</button><label>Zoom <input id="am-zoom" type="range" min="2" max="720" step="1" value="20" aria-label="Zoom précis de la timeline Master, jusqu’à l’image près"></label><button id="am-zoom-in" type="button" title="Zoomer le Master">+</button><button id="am-zoom-fit" type="button">Tout voir</button><output id="am-zoom-value">20 px/s</output></div></div><div id="am-minimap" class="am-minimap" aria-label="Mini-carte du projet" role="scrollbar" tabindex="0"><span id="am-minimap-window" class="am-minimap-window"></span></div><div id="am-timeline-inner"><div id="am-ruler" class="am-ruler"></div><div id="am-lanes"></div></div></div>
    <div class="am-panel am-steps-panel" aria-label="Étapes et repères"><div class="am-steps-head"><p>Réglez l’heure de début de chaque image. « Voir » affiche l’étape dans l’aperçu.</p><button id="am-steps-back" type="button">← Retour aux pistes Master</button></div>
      <div id="am-steps"></div><p id="am-empty">Importez une présentation pour régler ses étapes.</p>
    </div></div></div></section>
    <section class="am-workspace am-workspace-sources" data-workspace-panel="sources" role="tabpanel"><div class="am-zone-head"><div><h3>3 · Préparer les sons avant de les placer dans le film</h3><span class="am-section-help">Une piste reste sur une seule ligne. Chaque scission crée deux blocs adjacents, que vous pouvez glisser séparément dans le Master.</span></div></div>
    <div class="am-sources" aria-label="Sources voix et musique"><div class="am-source-lane" data-import-lane="voice"><div class="am-source-lane-head"><div class="am-source-lane-title"><strong>Voix</strong><small>Paroles et narration</small></div><div class="am-zoom-tools" aria-label="Zoom des voix"><button id="am-voice-zoom-out" type="button" title="Dézoomer les voix">−</button><label>Zoom <input id="am-voice-zoom" type="range" min="1" max="100" step="0.5" value="1" aria-label="Zoom précis des sources voix"></label><button id="am-voice-zoom-in" type="button" title="Zoomer les voix">+</button><button id="am-voice-zoom-precision" type="button">×10</button><button id="am-voice-zoom-fit" type="button">Tout voir</button><output id="am-voice-zoom-value">×1</output></div><button id="am-open-voice" class="am-compact-import am-drop-audio" type="button" data-commande="importer-voix" title="Cliquez pour choisir des fichiers, ou déposez-les dans toute la zone Voix">+ Importer / déposer</button></div><div class="am-source-list" data-source-lane="voice"></div></div>
    <div class="am-source-lane" data-import-lane="music"><div class="am-source-lane-head"><div class="am-source-lane-title"><strong>Musique</strong><small>Fond et ambiance</small></div><div class="am-zoom-tools" aria-label="Zoom des musiques"><button id="am-music-zoom-out" type="button" title="Dézoomer les musiques">−</button><label>Zoom <input id="am-music-zoom" type="range" min="1" max="100" step="0.5" value="1" aria-label="Zoom précis des sources musique"></label><button id="am-music-zoom-in" type="button" title="Zoomer les musiques">+</button><button id="am-music-zoom-precision" type="button">×10</button><button id="am-music-zoom-fit" type="button">Tout voir</button><output id="am-music-zoom-value">×1</output></div><button id="am-open-music" class="am-compact-import am-drop-audio" type="button" data-commande="importer-musique" title="Cliquez pour choisir des fichiers, ou déposez-les dans toute la zone Musique">+ Importer / déposer</button></div><div class="am-source-list" data-source-lane="music"></div></div></div></section></div>
    <p id="am-status" role="status" aria-live="polite">Prêt pour l’import audio MP3, M4A ou WAV.</p>`;
  $('cv-vignettes').before(root);
  const vignetteDetails = document.createElement('details');
  vignetteDetails.id = 'am-vignettes-details';
  vignetteDetails.innerHTML = '<summary>Afficher les vignettes des diapositives</summary>';
  root.after(vignetteDetails);
  vignetteDetails.append($('cv-vignettes'));

  function sourceRegionMeta(source) {
    const candidates=state.sources.filter(s=>s.kind===source.kind);
    const originId=source.originId||source.id;
    const origins=[...new Set(candidates.map(s=>s.originId||s.id))];
    const blocks=candidates.filter(s=>(s.originId||s.id)===originId);
    return {track:`${source.kind==='voice'?'V':'M'}${origins.indexOf(originId)+1}`,blockIndex:blocks.indexOf(source)+1,blockCount:blocks.length};
  }

  function render() {
    root.classList.toggle('am-has-selection', !!selected());
    $('am-clock').textContent = `${time(state.previewAt)} / ${time(duration())}`;
    $('am-cursor-time').textContent = state.zoom>=300?timeFrame(state.previewAt):time(state.previewAt);
    $('am-seek').max = Math.max(1, duration()); $('am-seek').value = clamp(state.previewAt, 0, duration());
    $('am-total').value = +duration().toFixed(1);
    $('am-step-count').textContent = state.images.length;
    $('am-empty').hidden = !!state.images.length;
    $('am-zoom-value').textContent = `${state.zoom} px/s`;
    $('am-zoom').value=state.zoom;$('am-placement-mode').value=state.placementMode;$('am-preview-quality').value=state.previewQuality;root.dataset.workspace=state.workspace;
    root.querySelectorAll('[data-jump]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.jump===state.workspace)));
    for(const kind of ['voice','music']){$(`am-${kind}-zoom`).value=state.annexZoom[kind];$(`am-${kind}-zoom-value`).textContent=`×${state.annexZoom[kind]}`;}
    $('am-linked-zoom').classList.toggle('am-toggle-active',state.linkedZoom);$('am-linked-zoom').setAttribute('aria-pressed',String(state.linkedZoom));$('am-linked-zoom').textContent=state.linkedZoom?'🔗 Les 3 zooms sont liés':'Lier les 3 zooms';
    for (const kind of ['voice','music']) {
      const kindSources=state.sources.filter(s=>s.kind===kind),originIds=[...new Set(kindSources.map(s=>s.originId||s.id))];
      const sourceClips = originIds.map(originId => {
        const blocks=kindSources.filter(s=>(s.originId||s.id)===originId),first=blocks[0],fullDuration=Math.max(0.01,blocks.reduce((sum,s)=>sum+s.out-s.in,0)),track=sourceRegionMeta(first).track;
        const regions=blocks.map(s=>{const region=sourceRegionMeta(s),used=state.tracks.some(t=>(t.sourceId||t.originId)===s.id||(t.originId&&t.originId===(s.originId||s.id))),ratio=(s.out-s.in)/fullDuration;
          const listenAt=clamp(Number.isFinite(s.listenAt)?s.listenAt:0,0,Math.max(0,s.out-s.in-0.01)),listenPercent=(listenAt/Math.max(0.01,s.out-s.in)*100).toFixed(3);
          return `<div class="am-source-clip" draggable="false" data-drag-block="true" data-locked="${!!s.locked}" data-used="${used}" role="group" aria-label="${region.track} bloc ${region.blockIndex} sur ${region.blockCount}, glissable vers le Master" data-source="${s.id}" data-kind="${kind}" style="--track-color:${s.color};--region-ratio:${ratio}" title="Saisir la bande supérieure de ce bloc et la glisser vers le Master"><div class="am-source-head" draggable="true" data-source-handle="${s.id}" aria-label="Poignée pour glisser ce bloc vers le Master"><span><em class="am-region-label" style="--track-color:${s.color}">Bloc ${region.blockIndex}/${region.blockCount}</em>${time(s.out-s.in)}${used?' · déjà utilisé':''}</span><span class="am-drag-hint">☷ Glisser</span></div><div class="am-source-wave-wrap"><canvas class="am-source-wave" data-source-wave="${s.id}" width="${Math.min(16000,Math.max(500,Math.ceil(500*state.annexZoom[kind])))}" height="${s.height==='L'?54:s.height==='S'?22:30}" aria-label="Forme d’onde du bloc ${region.blockIndex} de ${esc(s.name)}" title="Cliquez pour placer la tête de lecture et de scission"></canvas><span class="am-source-playhead" data-source-playhead="${s.id}" style="--playhead:${listenPercent}%" role="slider" tabindex="0" aria-label="Curseur audio de ${esc(s.name)}" aria-valuemin="0" aria-valuemax="${(s.out-s.in).toFixed(2)}" aria-valuenow="${listenAt.toFixed(2)}" title="Glissez ce curseur rouge horizontalement"></span></div><div class="am-source-primary"><button class="am-source-listen" type="button" data-source-action="listen" data-source-id="${s.id}" title="Écouter ce bloc" aria-label="Écouter ce bloc">▶<span class="am-visually-hidden"> Écouter</span></button><label class="am-source-cut-time" title="Position précise du curseur">Position <input type="number" min="0.01" max="${(s.out-s.in-0.01).toFixed(2)}" step="0.01" value="${Math.max(0.01,listenAt).toFixed(2)}" data-source-cursor="${s.id}" aria-label="Position précise du curseur annexe en secondes"> s</label><span class="am-source-gain" aria-label="Volume précis de ce bloc"><button type="button" data-source-action="gain-down" data-source-id="${s.id}" title="Baisser le volume de 1 dB">−</button><output>${s.db} dB</output><button type="button" data-source-action="gain-up" data-source-id="${s.id}" title="Augmenter le volume de 1 dB">+</button></span><button type="button" data-source-action="split" data-source-id="${s.id}" title="Scinder ce bloc au curseur" aria-label="Scinder ce bloc au curseur">✂</button><button type="button" data-source-action="place" data-source-id="${s.id}" title="Placer ce bloc à l’endroit du curseur rouge dans le Master">→ Master</button></div><details class="am-source-advanced"><summary title="Autres réglages du bloc" aria-label="Autres réglages du bloc">•••</summary><div class="am-source-actions"><label>Gain <input type="number" min="-60" max="12" step="1" value="${s.db}" data-source-field="db" data-source-id="${s.id}"></label><label>Hauteur <select data-source-field="height" data-source-id="${s.id}"><option ${s.height==='S'?'selected':''}>S</option><option ${!s.height||s.height==='M'?'selected':''}>M</option><option ${s.height==='L'?'selected':''}>L</option></select></label><input type="color" value="${s.color}" data-source-field="color" data-source-id="${s.id}" aria-label="Couleur de ${esc(s.name)}"><button type="button" data-source-action="mute" data-source-id="${s.id}">${s.muted?'Réactiver':'Muet'}</button><button type="button" data-source-action="solo" data-source-id="${s.id}" aria-pressed="${!!s.solo}">Solo</button><button type="button" data-source-action="lock" data-source-id="${s.id}" aria-pressed="${!!s.locked}">${s.locked?'Déverrouiller':'Verrouiller'}</button><button type="button" data-source-action="copy" data-source-id="${s.id}">Copier</button><button type="button" class="am-source-remove" data-source-action="remove" data-source-id="${s.id}">Effacer</button></div></details></div>`;}).join('');
        const collapsed=blocks.every(s=>s.collapsed===true);
        return `<section class="am-source-track" data-collapsed="${collapsed}" style="--track-color:${first.color};--annex-zoom:${state.annexZoom[kind]}"><div class="am-source-track-head"><b class="am-track-badge" style="--track-color:${first.color}">${track}</b><strong>${esc(first.name)}</strong><span>${blocks.length} bloc${blocks.length>1?'s':''}</span><button class="am-source-track-toggle" type="button" data-source-action="collapse-track" data-source-id="${first.id}" aria-expanded="${!collapsed}" title="${collapsed?'Afficher les blocs de cette piste':'Réduire cette piste'}">${collapsed?'Afficher':'Réduire'}</button><button class="am-source-track-remove" type="button" data-source-action="remove-track" data-source-id="${first.id}" title="Effacer toute la piste ${kind==='voice'?'voix':'musique'} « ${esc(first.name)} »" aria-label="Effacer toute la piste ${kind==='voice'?'voix':'musique'} ${esc(first.name)}">×</button></div><div class="am-source-regions">${regions}</div></section>`;
      }).join('');
      const paste = state.copiedSource ? `<button class="am-source-paste" type="button" data-source-action="paste" data-source-kind="${kind}">Coller le bloc copié ici</button>` : '';
      root.querySelector(`[data-source-lane="${kind}"]`).innerHTML = paste + (sourceClips || `<span>Aucun fichier ${kind==='voice'?'voix':'musique'} importé. Utilisez le bouton ci-dessus ou déposez vos fichiers dans la zone en pointillés.</span>`);
    }
    $('am-steps').innerHTML = state.images.map((im, i) => `<div class="am-step" data-step="${i}">
      <img src="${esc(im.url)}" alt=""><span>${i + 1}. ${esc(im.titre || 'Étape')} · diapositive ${(im.cardIndex || 0) + 1}</span>
      <label>Début (s)<input type="number" min="0" step="0.01" value="${state.cuts[i].toFixed(2)}" data-cut="${i}"></label>
      <button type="button" data-focus="${i}">Voir</button></div>`).join('');
    const t = selected(), i = state.tracks.indexOf(t);
    if(!state.images.length&&root.dataset.view==='steps'){$('am-view-master').click();}
    $('am-view-steps').disabled=!state.images.length;
    $('am-master-picker').innerHTML = state.tracks.length ? `<span>Clips du Master :</span>${state.tracks.map((clip,index)=>`<button type="button" data-select-track="${index}" aria-pressed="${state.selectedIds.includes(clip.id)||clip.id===state.selectedId}" title="Sélectionner ${esc(clip.name)} à ${time(clip.at)}">${clip.kind==='voice'?'Voix':'Musique'} · ${esc(clip.name)} · ${time(clip.at)}${clip.locked?' · verrouillé':''}</button>`).join('')}` : '<span>Glissez un clip annexe sur le Master, ou utilisez « → Master » pour le placer au curseur.</span>';
    $('am-tracks').innerHTML='';
    for (const source of state.sources) {
      const wave = root.querySelector(`[data-source-wave="${source.id}"]`);
      if (wave) drawWave(source, wave);
    }
    renderTimeline();
    for (const kind of ['voice','music']) {
      root.querySelector(`[data-master-db="${kind}"]`).value = state.master[kind].db;
      $(`am-${kind}-db`).textContent = `${state.master[kind].db} dB`;
      root.querySelector(`[data-master-mute="${kind}"]`).textContent = state.master[kind].muted ? 'Réactiver' : 'Muet';
    }
  }
  function inlineClipEditor(t,i) {
    if(!t)return '';
    return `<div class="am-inline-clip-editor" data-kind="${t.kind}" data-track="${i}" aria-label="Réglages intégrés de ${esc(t.name)}">
      <strong title="${esc(t.name)}">Clip · ${esc(t.name)}</strong>
      <label>Début<input type="number" min="0" step="0.1" value="${t.at}" data-field="at" data-track="${i}" aria-label="Placement du clip en secondes"></label>
      <label>Entrée<input type="number" min="0" step="0.1" value="${t.in}" data-field="in" data-track="${i}" aria-label="Entrée du clip en secondes"></label>
      <label>Sortie<input type="number" min="0" step="0.1" value="${t.out}" data-field="out" data-track="${i}" aria-label="Sortie du clip en secondes"></label>
      <label>Volume<input type="number" min="-60" max="12" step="1" value="${t.db}" data-field="db" data-track="${i}" aria-label="Volume du clip en décibels"></label>
      <span class="am-inline-actions"><button type="button" data-mute="${i}" title="Rendre uniquement ce clip muet">${t.muted?'Son':'Muet'}</button><button type="button" data-solo="${i}" aria-pressed="${!!t.solo}" title="Écouter uniquement ce clip">Solo</button><button type="button" data-lock="${i}" aria-pressed="${!!t.locked}" title="Empêcher les modifications">${t.locked?'Déverr.':'Verrou'}</button><button type="button" data-remove="${i}" aria-label="Retirer ${esc(t.name)} du Master">Retirer</button></span>
      <details class="am-clip-details"><summary>Fondus et boucle</summary><div class="am-track-fields-secondary"><label>Fondu entrée<input type="number" min="0" step="0.1" value="${t.fadeIn}" data-field="fadeIn" data-track="${i}"></label><label>Fondu sortie<input type="number" min="0" step="0.1" value="${t.fadeOut}" data-field="fadeOut" data-track="${i}"></label><label>Piste<select data-field="kind" data-track="${i}"><option value="voice" ${t.kind==='voice'?'selected':''}>Voix</option><option value="music" ${t.kind==='music'?'selected':''}>Musique</option></select></label><label>Boucler<input type="checkbox" data-field="loop" data-track="${i}" ${t.loop?'checked':''}></label></div></details>
      <details class="am-automation-details"><summary>Courbe de volume</summary><div class="am-automation" role="img" aria-label="Courbe de volume du clip"><svg viewBox="0 0 500 90" preserveAspectRatio="none"><polyline points="${(t.automation||[]).map(p=>`${p.time/clipLength(t)*500},${(12-p.db)/72*90}`).join(' ')}" fill="none" stroke="#b44e30" stroke-width="3"/>${(t.automation||[]).map((p,j)=>`<circle data-point="${j}" cx="${p.time/clipLength(t)*500}" cy="${(12-p.db)/72*90}" r="6"/>`).join('')}</svg></div><small>Double-cliquez pour ajouter ou retirer un point.</small></details>
    </div>`;
  }
  function renderTimeline() {
    const total = Math.max(1, duration());
    $('am-timeline-inner').style.width = `${Math.max(650,Math.ceil(total*state.zoom)+120)}px`;
    const intervals=[1/30,0.1,0.5,1,2,5,10,30,60,120],tickEvery=intervals.find(value=>value*state.zoom>=70)||120;
    const ticks=[];for(let at=0;at<=total+tickEvery/2;at+=tickEvery)ticks.push(`<span class="am-tick" style="left:${at/total*100}%">${state.zoom>=300?timeFrame(at):time(at)}</span>`);
    $('am-ruler').innerHTML = ticks.join('') + `<span class="am-playhead" style="left:${state.previewAt/total*100}%"><span class="am-playhead-handle" role="slider" tabindex="0" aria-label="Tête de lecture du Master" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${state.previewAt.toFixed(2)}" title="Glissez la tête de lecture, ou cliquez dans la timeline"></span></span>`;
    const stepLane = `<div class="am-lane"><span class="am-lane-name">Diapositives</span>${state.images.map((im,i) => {
      const left = state.cuts[i]/total*100, end = (state.cuts[i+1] ?? total)/total*100;
      return `<div class="am-clip am-step-clip" data-focus="${i}" style="left:${left}%;width:${Math.max(0,end-left)}%" title="Étape ${i+1} — glissez le bord droit pour changer sa durée">${i+1}. ${esc(im.titre||'Étape')}<span class="am-step-resize" data-resize-step="${i}" title="Étirer ou raccourcir la diapositive ${i+1}"></span></div>`;
    }).join('')}${state.images.slice(1).map((_,j)=>{const i=j+1,t=state.transitions[i]||{type:'cut'};return `<button type="button" class="am-transition-marker" data-transition="${i}" style="left:${state.cuts[i]/total*100}%" title="Transition ${i} → ${i+1} : ${t.type==='cut'?'coupe franche':t.type}">${t.type==='cut'?'·':'✦'}</button>`;}).join('')}</div>`;
    $('am-lanes').innerHTML = stepLane + ['voice','music'].map(kind => {const chosen=selected(),chosenIndex=state.tracks.indexOf(chosen),hasEditor=chosen?.kind===kind;return `<div class="am-lane${hasEditor?' am-has-editor':''}" data-master-lane="${kind}"><span class="am-lane-name"><strong>${kind==='voice'?'Voix':'Musique'} Master</strong><span class="am-lane-mix"><button type="button" data-master-mute="${kind}">${state.master[kind].muted?'Réactiver':'Muet'}</button><input type="range" data-master-db="${kind}" min="-36" max="12" value="${state.master[kind].db}" aria-label="Volume de la piste ${kind==='voice'?'voix':'musique'} Master"><output id="am-${kind}-db">${state.master[kind].db} dB</output></span></span>${state.tracks.map((t,i) => {
      if (t.kind!==kind) return '';
      const left = Math.min(100,t.at/total*100), length = (t.loop ? total-t.at : clipLength(t))/total*100;
      const points = t.automation || [{time:0,db:0},{time:clipLength(t),db:0}];
      const selectedNow=state.selectedIds.includes(t.id)||t.id===state.selectedId;
      const tools=selectedNow?`<div class="am-clip-integrated-tools" aria-label="Outils intégrés du clip ${esc(t.name)}">
        <label title="Position du clip">Début <input type="number" min="0" step="0.1" value="${t.at}" data-field="at" data-track="${i}"></label>
        <label title="Début utilisé dans le fichier">Entrée <input type="number" min="0" step="0.1" value="${t.in}" data-field="in" data-track="${i}"></label>
        <label title="Fin utilisée dans le fichier">Sortie <input type="number" min="0" step="0.1" value="${t.out}" data-field="out" data-track="${i}"></label>
        <label title="Volume général du bloc">dB <input type="number" min="-60" max="12" step="1" value="${t.db}" data-field="db" data-track="${i}"></label>
        <label title="Durée du fondu d’entrée en secondes">Fondu début <input type="number" min="0" step="0.1" value="${t.fadeIn}" data-field="fadeIn" data-track="${i}" aria-label="Durée du fondu de début en secondes"></label>
        <label title="Durée du fondu de sortie en secondes">Fondu fin <input type="number" min="0" step="0.1" value="${t.fadeOut}" data-field="fadeOut" data-track="${i}" aria-label="Durée du fondu de fin en secondes"></label>
        <label title="Répéter ce bloc en boucle"><input type="checkbox" data-field="loop" data-track="${i}" ${t.loop?'checked':''}> Boucle</label>
        <button type="button" data-mute="${i}">${t.muted?'Son':'Muet'}</button><button type="button" data-solo="${i}" aria-pressed="${!!t.solo}">Solo</button><button type="button" data-lock="${i}" aria-pressed="${!!t.locked}">${t.locked?'Déverr.':'Verrou'}</button><button class="am-danger" type="button" data-remove="${i}">Retirer</button>
      </div>`:'';
      return `<div class="am-clip" data-kind="${kind}" data-clip="${i}" data-selected="${selectedNow}" data-locked="${!!t.locked}" aria-disabled="${t.muted}" style="--track-color:${t.color};left:${left}%;width:${Math.max(0,Math.min(100-left,length))}%" title="${t.locked?'Clip verrouillé':'Glisser le bloc ; cliquez sur la ligne jaune pour créer un point de volume'}"><span class="am-clip-label">${t.locked?'🔒 ':''}${esc(t.name)}</span><svg class="am-envelope" data-automation-track="${i}" viewBox="0 0 100 50" preserveAspectRatio="none" aria-label="Courbe de volume directement sur le clip"><polyline points="${points.map(p=>`${p.time/clipLength(t)*100},${7+(12-p.db)/72*35}`).join(' ')}" fill="none" stroke="#f6d386" stroke-width="2"/></svg>${selectedNow?points.map((p,j)=>`<span class="am-envelope-point" data-point="${j}" tabindex="0" style="left:${p.time/clipLength(t)*100}%;top:${(7+(12-p.db)/72*35)/50*100}%" aria-label="Point de volume ${j+1} — glissez verticalement pour régler le volume${j===points.length-1?' de fin':''}"></span>`).join(''):''}${tools}</div>`;
    }).join('')}</div>`;}).join('');
    updateMinimap();
    if(!state.scrubbing)requestAnimationFrame(()=>ensurePlayheadVisible());
  }
  function drawWave(t, canvas) {
    const c = canvas.getContext('2d'), data = t.buffer.getChannelData(0), mid = canvas.height / 2;
    c.clearRect(0, 0, canvas.width, canvas.height); c.fillStyle = t.color || (t.kind === 'voice' ? '#1f5053' : '#8a3f29');
    const first = Math.floor(t.in * t.buffer.sampleRate), last = Math.min(data.length, Math.floor(t.out * t.buffer.sampleRate));
    const stride = Math.max(1, Math.floor((last - first) / canvas.width));
    for (let x = 0; x < canvas.width; x++) {
      let peak = 0, start = first + x * stride;
      for (let j = start; j < Math.min(last, start + stride); j += Math.max(1, Math.floor(stride / 20))) peak = Math.max(peak, Math.abs(data[j]));
      c.fillRect(x, mid - peak * mid, 1, Math.max(1, peak * canvas.height));
    }
  }
  let sourceAudition = null;
  function updateSourceAuditionUI(source, local, playing=false) {
    if(!source)return;
    const length=Math.max(0.01,source.out-source.in),position=clamp(local,0,length);
    source.listenAt=position;
    root.querySelectorAll(`[data-source-playhead="${source.id}"]`).forEach(cursor=>cursor.style.setProperty('--playhead',`${position/length*100}%`));
    root.querySelectorAll(`[data-source-action="listen"][data-source-id="${source.id}"]`).forEach(button=>{
      button.innerHTML=playing?'■<span class="am-visually-hidden"> Arrêter</span>':'▶<span class="am-visually-hidden"> Écouter</span>';
      button.setAttribute('aria-label',playing?'Arrêter l’écoute':'Écouter ce bloc');
      button.title=playing?'Arrêter l’écoute':'Écouter ce bloc';
    });
    const input=root.querySelector(`[data-source="${source.id}"] .am-source-cut-time input`);
    if(input)input.value=clamp(position,0.01,Math.max(0.01,length-0.01)).toFixed(2);
  }
  function stopSourceAudition() {
    const audition=sourceAudition;if(!audition)return;
    sourceAudition=null;cancelAnimationFrame(audition.raf);
    try{audition.node.onended=null;audition.node.stop();}catch{}
    audition.ctx.close().catch(()=>{});
    updateSourceAuditionUI(audition.source,audition.source.listenAt||0,false);
  }
  async function toggleSourceAudition(source) {
    if(sourceAudition?.source.id===source.id){stopSourceAudition();return;}
    stopSourceAudition();if(state.playing)stopPreview();
    if(source.muted)return badge(`« ${source.name} » est muet. Réactivez-le dans Réglages du bloc pour l’écouter.`,true);
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return badge('Ce navigateur ne peut pas lire ce fichier audio.',true);
    const length=Math.max(0.01,source.out-source.in);let local=clamp(source.listenAt||0,0,length);
    if(local>=length-0.01)local=0;
    const ctx=new Audio(),node=ctx.createBufferSource(),gain=ctx.createGain();
    node.buffer=source.buffer;gain.gain.value=dbGain(source.db+voiceGain(source));node.connect(gain).connect(ctx.destination);
    const audition={source,ctx,node,gain,startLocal:local,startedAt:ctx.currentTime,raf:0};sourceAudition=audition;
    updateSourceAuditionUI(source,local,true);node.start(0,source.in+local,length-local);
    await ctx.resume();
    if(sourceAudition!==audition){try{node.stop();}catch{}ctx.close().catch(()=>{});return;}
    audition.startedAt=ctx.currentTime;
    badge(`Lecture du bloc « ${source.name} ». Le petit curseur rouge indique la position d’écoute et de scission.`,false);
    const tick=()=>{
      if(sourceAudition!==audition)return;
      const position=Math.min(length,audition.startLocal+ctx.currentTime-audition.startedAt);
      updateSourceAuditionUI(source,position,true);
      if(position>=length-0.01){stopSourceAudition();return;}
      audition.raf=requestAnimationFrame(tick);
    };
    node.onended=()=>{if(sourceAudition===audition)stopSourceAudition();};
    audition.raf=requestAnimationFrame(tick);
  }
  function refreshImages() {
    const d = window.__chutier && window.__chutier.dernier();
    if (!d || !d.res || !d.res.images || !d.res.images.length) return;
    state.images.forEach(im => URL.revokeObjectURL(im.url));
    state.images = d.res.images.map(im => ({...im, url: URL.createObjectURL(im.blob)}));
    const n = state.images.length, total = duration();
    state.cuts = Array.from({length:n}, (_, i) => i * total / n);
    state.transitions = Array.from({length:n},()=>({type:'cut',duration:0.6,easing:'linear'}));
    clearPreviewCache();
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
    if (!Audio) return badge('Ce navigateur ne peut pas décoder les fichiers audio.', true);
    const ctx = new Audio();
    try {
      for (const file of files) {
        if (!/\.(mp3|m4a|wav)$/i.test(file.name) && !/^audio\/(mpeg|mp4|x-m4a|wav|x-wav)$/i.test(file.type)) { badge(`${file.name} : utilisez un fichier MP3, M4A ou WAV.`, true); continue; }
        try {
          const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
          if (!buffer.duration || !Number.isFinite(buffer.duration)) throw Error('durée invalide');
          const id = crypto.randomUUID();
          const level = kind==='voice' ? voiceLevel(buffer) : {rmsDb:null,autoGainDb:0};
          checkpoint(`import de ${file.name}`);
          state.sources.push({id, originId:id, name:file.name, file, buffer, kind, color:nextTrackColor(kind), height:'M', at:0, in:0, listenAt:0,
            out:+buffer.duration.toFixed(2), db:kind === 'voice' ? 0 : -18, fadeIn:0.3, fadeOut:0.5,
            loop:false, muted:false, solo:false, locked:false, ...level, automation:[{time:0,db:0},{time:+buffer.duration.toFixed(2),db:0}]});
          badge(`Source « ${file.name} » prête : glissez-la vers ${kind==='voice'?'Voix':'Musique'} Master.`, false);
        } catch (e) { badge(`${file.name} : audio illisible (${e.message}).`, true); }
      }
      if (state.images.length) state.total = Math.max(duration(), ...state.tracks.map(t => t.at + clipLength(t)));
      render();
    } finally { await ctx.close(); }
  }
  $('am-open-voice').onclick = () => $('am-add-voice').click();
  $('am-open-music').onclick = () => $('am-add-music').click();
  $('am-add-voice').onchange = async e => { const files=[...e.target.files]; e.target.value=''; await importFiles(files, 'voice'); };
  $('am-add-music').onchange = async e => { const files=[...e.target.files]; e.target.value=''; await importFiles(files, 'music'); };
  const blobDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
  async function dataUrlBlob(data){const response=await fetch(data);return response.blob();}
  const audioDescriptor=item=>{const {file,buffer,...descriptor}=item;return {...descriptor,automation:(descriptor.automation||[]).map(point=>({...point}))};};
  async function saveProject(){
    if(!state.images.length&&!state.sources.length)return badge('Le projet est vide : importez une présentation ou un son.',true);
    const button=$('am-save-project');button.disabled=true;badge('Préparation du fichier projet autonome…',false);
    try{
      const origins=[];
      for(const source of [...state.sources,...state.tracks]){const originId=source.originId||source.id;if(origins.some(item=>item.originId===originId))continue;if(!source.file)throw Error(`fichier source absent pour ${source.name}`);origins.push({originId,name:source.file.name||source.name,type:source.file.type||'audio/mpeg',data:await blobDataUrl(source.file)});}
      const images=[];
      for(const image of state.images){const {blob,url,...metadata}=image;images.push({...metadata,type:blob.type||'image/jpeg',data:await blobDataUrl(blob)});}
      const project={format:'atelier-diapos-project',version:1,savedAt:new Date().toISOString(),origins,images,
        sources:state.sources.map(audioDescriptor),tracks:state.tracks.map(audioDescriptor),cuts:state.cuts,total:state.total,
        zoom:{master:state.zoom,annexes:state.annexZoom,linked:state.linkedZoom},placementMode:state.placementMode,
        previewQuality:state.previewQuality,workspace:state.workspace,transitions:state.transitions,master:state.master,
        mix:{duck:+$('am-duck').value,uniformVoices:$('am-uniform-voices').checked}};
      const blob=new Blob([JSON.stringify(project)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='projet-atelier-diapos.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      badge(`Projet sauvegardé : ${state.images.length} images et ${origins.length} fichier(s) audio inclus.`,false);
    }catch(error){badge(`Sauvegarde impossible : ${error.message}`,true);}finally{button.disabled=false;}
  }
  async function openProject(file){
    const project=JSON.parse(await file.text());if(project.format!=='atelier-diapos-project'||project.version!==1)throw Error('format de projet non reconnu');
    checkpoint('ouverture d’un projet');badge('Décodage du projet sauvegardé…',false);
    const Audio=window.AudioContext||window.webkitAudioContext,ctx=new Audio(),audioByOrigin=new Map();
    try{
      for(const origin of project.origins||[]){const blob=await dataUrlBlob(origin.data),savedFile=new File([blob],origin.name,{type:origin.type}),buffer=await ctx.decodeAudioData(await blob.arrayBuffer());audioByOrigin.set(origin.originId,{file:savedFile,buffer});}
      state.images=[];
      for(const saved of project.images||[]){const blob=await dataUrlBlob(saved.data),{data,type,...metadata}=saved;state.images.push({...metadata,blob,url:URL.createObjectURL(blob)});}
      const restoreAudio=item=>{const audio=audioByOrigin.get(item.originId||item.sourceId||item.id);if(!audio)throw Error(`audio manquant pour ${item.name}`);return {...item,...audio,automation:(item.automation||[]).map(point=>({...point}))};};
      state.sources=(project.sources||[]).map(restoreAudio);state.tracks=(project.tracks||[]).map(restoreAudio);state.cuts=(project.cuts||[]).slice();state.total=+project.total||0;
      state.zoom=project.zoom?.master||20;const savedAnnex=project.zoom?.annexes||1;state.annexZoom=typeof savedAnnex==='number'?{voice:savedAnnex,music:savedAnnex}:{voice:savedAnnex.voice||1,music:savedAnnex.music||1};state.linkedZoom=project.zoom?.linked===true;state.placementMode=project.placementMode||'free';state.previewQuality=project.previewQuality||'full';state.workspace=['all','preview','master','sources'].includes(project.workspace)?project.workspace:'all';
      state.transitions=(project.transitions||[]).map(transition=>({...transition,params:{...(transition.params||{})}}));state.master=project.master||{voice:{db:0,muted:false},music:{db:0,muted:false}};
      state.selectedId=null;state.selectedIds=[];state.previewAt=0;clearPreviewCache();$('am-duck').value=String(project.mix?.duck??0.126);$('am-uniform-voices').checked=project.mix?.uniformVoices!==false;
      if($('cv-mp4'))$('cv-mp4').disabled=!state.images.length;applyPreviewQuality();render();drawPreview(0);badge(`Projet restauré : ${state.images.length} images, ${state.sources.length} blocs annexes et ${state.tracks.length} clips Master.`,false);
    }finally{await ctx.close();}
  }
  $('am-save-project').onclick=saveProject;$('am-open-project').onclick=()=>$('am-project-file').click();
  $('am-project-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{await openProject(file);}catch(error){badge(`Ouverture impossible : ${error.message}`,true);}};
  function showMasterView(){root.dataset.view='master';$('am-view-master').setAttribute('aria-selected','true');$('am-view-steps').setAttribute('aria-selected','false');}
  $('am-view-master').onclick = showMasterView;
  $('am-steps-back').onclick = () => {showMasterView();$('am-view-master').focus();};
  $('am-view-steps').onclick = () => { root.dataset.view='steps'; $('am-view-master').setAttribute('aria-selected','false'); $('am-view-steps').setAttribute('aria-selected','true'); };
  // L'importeur HTML général de la page affiche un voile plein écran dès qu'un
  // fichier entre dans Safari. Il peut alors devenir la cible du drop à la place
  // de la piste audio. On route donc les fichiers audio en phase de capture,
  // d'après la position réelle du pointeur, avant que ce voile ne soit affiché.
  const importLanes=[...root.querySelectorAll('[data-import-lane]')];
  const importLaneAt=(x,y)=>importLanes.find(lane=>{const rect=lane.getBoundingClientRect();return x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom;})||null;
  const isFileDrag=e=>!!e.dataTransfer&&([...e.dataTransfer.types||[]].includes('Files')||e.dataTransfer.files?.length);
  const routeAudioFileDrag=e=>{
    const lane=importLaneAt(e.clientX,e.clientY);if(!lane||!isFileDrag(e))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(e.dataTransfer)e.dataTransfer.dropEffect='copy';
    importLanes.forEach(item=>item.classList.toggle('am-drop-target',item===lane));
    const veil=$('cv-voile');if(veil)veil.style.display='none';
    if(e.type==='drop'){
      importLanes.forEach(item=>item.classList.remove('am-drop-target'));
      const files=[...e.dataTransfer.files];if(files.length)importFiles(files,lane.dataset.importLane);
    }
  };
  for(const type of ['dragenter','dragover','drop'])window.addEventListener(type,routeAudioFileDrag,true);
  root.querySelectorAll('[data-import-lane]').forEach(lane => {
    lane.ondragenter=e=>{if([...e.dataTransfer?.types||[]].includes('Files')){e.preventDefault();e.stopPropagation();lane.classList.add('am-drop-target');$('cv-voile').style.display='none';}};
    lane.ondragover=e=>{if([...e.dataTransfer?.types||[]].includes('Files')){e.preventDefault();e.stopPropagation();lane.classList.add('am-drop-target');}};
    lane.ondragleave=e=>{e.stopPropagation();if(!lane.contains(e.relatedTarget))lane.classList.remove('am-drop-target');};
    lane.ondrop=e=>{if(!e.dataTransfer?.files?.length)return;e.preventDefault();e.stopPropagation();lane.classList.remove('am-drop-target');$('cv-voile').style.display='none';importFiles([...e.dataTransfer.files],lane.dataset.importLane);};
  });
  function placeAnnexCursor(wave,clientX) {
    const source=state.sources.find(s=>s.id===wave?.dataset.sourceWave);if(!source)return;
    if(sourceAudition?.source.id===source.id)stopSourceAudition();
    const rect=wave.getBoundingClientRect(),seconds=(source.out-source.in)*clamp((clientX-rect.left)/rect.width,0,1);
    const field=wave.closest('.am-source-clip').querySelector('input[type=number]');
    field.value=clamp(seconds,0.01,source.out-source.in-0.01).toFixed(2);updateSourceAuditionUI(source,seconds,false);
    badge(`Curseur annexe placé à ${field.value} s dans « ${source.name} ». Cliquez sur « Scinder ici » pour créer deux blocs.`,false);
  }
  // Safari peut considérer le bouton d'écoute comme le début d'un glisser du bloc.
  // Intercepter ce transport avant la délégation générale rend Lecture/Arrêt déterministe.
  let sourceTransportPointerAt=0;
  root.querySelector('.am-sources').addEventListener('pointerdown',e=>{
    const button=e.target.closest?.('[data-source-action="listen"]');if(!button)return;
    e.preventDefault();e.stopPropagation();sourceTransportPointerAt=performance.now();
    const source=state.sources.find(s=>s.id===button.dataset.sourceId);if(source)toggleSourceAudition(source);
  },true);
  root.querySelector('.am-sources').addEventListener('click',e=>{
    const button=e.target.closest?.('[data-source-action="listen"]');if(!button)return;
    e.preventDefault();e.stopPropagation();
    if(performance.now()-sourceTransportPointerAt<500)return;
    const source=state.sources.find(s=>s.id===button.dataset.sourceId);if(source)toggleSourceAudition(source);
  },true);
  root.querySelector('.am-sources').onclick = e => {
    const wave=e.target.closest('[data-source-wave]');
    if (wave) {placeAnnexCursor(wave,e.clientX);return;}
    const action=e.target.dataset.sourceAction; if (!action) return;
    const source=state.sources.find(s=>s.id===e.target.dataset.sourceId);
    if (action==='listen') return;
    if (action==='collapse-track' && source) {
      const originId=source.originId||source.id,blocks=state.sources.filter(item=>(item.originId||item.id)===originId),collapsed=!blocks.every(item=>item.collapsed===true);
      blocks.forEach(item=>item.collapsed=collapsed);render();
    }
    if (action==='remove-track' && source) {
      const originId=source.originId||source.id,blocks=state.sources.filter(item=>(item.originId||item.id)===originId);
      if(blocks.some(item=>item.locked))return badge('Déverrouillez les blocs de cette piste avant de la supprimer.',true);
      if(sourceAudition&&blocks.some(item=>item.id===sourceAudition.source.id))stopSourceAudition();
      checkpoint(`suppression de la piste ${source.name}`);state.sources=state.sources.filter(item=>(item.originId||item.id)!==originId);
      badge(`Piste annexe « ${source.name} » effacée. Utilisez « Annuler » pour la restaurer. Les clips déjà placés sur le Master sont conservés.`,false);render();
    }
    if (action==='place' && source) { const lane=root.querySelector(`[data-master-lane="${source.kind}"]`);const r=lane.getBoundingClientRect(),filmDuration=duration();placeSource(source,lane,filmDuration>0?r.left+r.width*state.previewAt/filmDuration:r.left); }
    if (action==='mute' && source) { checkpoint(`muet de ${source.name}`);source.muted=!source.muted;render(); }
    if (action==='solo' && source) { checkpoint(`solo de ${source.name}`);source.solo=!source.solo;render(); }
    if (action==='lock' && source) { checkpoint(`verrouillage de ${source.name}`);source.locked=!source.locked;render(); }
    if ((action==='gain-down'||action==='gain-up') && source) {
      if(source.locked)return badge('Déverrouillez ce bloc avant de modifier son volume.',true);
      checkpoint(`volume de ${source.name}`);source.db=clamp(source.db+(action==='gain-up'?1:-1),-60,12);
      if(sourceAudition?.source.id===source.id)sourceAudition.gain.gain.value=dbGain(source.db+voiceGain(source));
      badge(`Volume de « ${source.name} » : ${source.db} dB.`,false);render();
    }
    if ((action==='up'||action==='down') && source) {
      const from=state.sources.indexOf(source),step=action==='up'?-1:1,to=clamp(from+step,0,state.sources.length-1);
      if(from!==to){checkpoint(`réorganisation de ${source.name}`);state.sources.splice(from,1);state.sources.splice(to,0,source);render();}
    }
    if (action==='remove' && source) { if(source.locked)return badge('Déverrouillez ce bloc avant de le supprimer.',true);if(sourceAudition?.source.id===source.id)stopSourceAudition();checkpoint(`suppression de ${source.name}`);state.sources=state.sources.filter(s=>s.id!==source.id); badge(`Bloc annexe « ${source.name} » effacé. Les clips déjà placés sur le Master restent en place.`,false); render(); }
    if (action==='copy' && source) { state.copiedSource={...source,automation:source.automation.map(p=>({...p}))}; badge(`« ${source.name} » copié.`,false); render(); }
    if (action==='paste' && state.copiedSource) {
      checkpoint('collage d’un bloc annexe');
      const copy={...state.copiedSource,id:crypto.randomUUID(),kind:e.target.dataset.sourceKind,automation:state.copiedSource.automation.map(p=>({...p}))};
      state.sources.push(copy); badge(`Copie ajoutée aux sources ${copy.kind==='voice'?'voix':'musique'}.`,false); render();
    }
    if (action==='split' && source) {
      if(source.locked)return badge('Déverrouillez ce bloc avant de le scinder.',true);
      if(sourceAudition?.source.id===source.id)stopSourceAudition();
      const field=e.target.parentElement.querySelector('input[type=number]');
      const local=+field.value,length=source.out-source.in;
      if (!Number.isFinite(local)||local<0.01||local>length-0.01) return badge('Point de scission hors du bloc.',true);
      checkpoint(`scission de ${source.name}`);
      const oldOut=source.out, oldIn=source.in;
      const level=automationDb(source,local), points=source.automation;
      const right={...source,id:crypto.randomUUID(),in:oldIn+local,out:oldOut,
        listenAt:0,
        automation:[{time:0,db:level},...points.filter(p=>p.time>local).map(p=>({time:p.time-local,db:p.db}))]};
      source.out=oldIn+local;source.listenAt=Math.min(source.listenAt||0,local);source.automation=[...points.filter(p=>p.time<local),{time:local,db:level}];
      if(source.kind==='voice'){
        Object.assign(source,voiceLevel(source.buffer,source.in,source.out));
        Object.assign(right,voiceLevel(right.buffer,right.in,right.out));
      }
      state.sources.splice(state.sources.indexOf(source)+1,0,right);
      badge(`Piste scindée en deux blocs à ${local.toFixed(2)} s. Les deux blocs sont conservés et peuvent être glissés séparément sur le Master.`,false);render();
    }
  };
  root.querySelector('.am-sources').oninput = e => {
    const source=state.sources.find(s=>s.id===e.target.dataset.sourceCursor);if(!source)return;
    if(sourceAudition?.source.id===source.id)stopSourceAudition();
    updateSourceAuditionUI(source,clamp(+e.target.value,0,source.out-source.in),false);
  };
  root.querySelector('.am-sources').onchange = e => {
    const source=state.sources.find(s=>s.id===e.target.dataset.sourceId),field=e.target.dataset.sourceField;if(!source||!field)return;
    if(source.locked){render();return badge('Déverrouillez ce bloc avant de modifier ses réglages.',true);}
    checkpoint(`réglage ${field} de ${source.name}`);
    if(field==='db')source.db=clamp(+e.target.value,-60,12);else source[field]=e.target.value;
    const sourceId=source.id;
    setTimeout(()=>{render();const details=root.querySelector(`[data-source="${sourceId}"] .am-source-advanced`);if(details)details.open=true;},0);
  };
  root.querySelector('.am-sources').ondragstart = e => {
    const clip=e.target.closest('[data-source]'); if (!clip) return;
    const source=state.sources.find(s=>s.id===clip.dataset.source);
    if(!source||source.locked){e.preventDefault();return badge('Déverrouillez ce bloc avant de le glisser.',true);}
    e.dataTransfer.setData('application/x-atelier-source',clip.dataset.source);e.dataTransfer.setData('text/plain',clip.dataset.source);e.dataTransfer.effectAllowed='copy';clip.classList.add('am-dragging');
  };
  root.querySelector('.am-sources').ondragend = e => {e.target.closest('[data-source]')?.classList.remove('am-dragging');root.querySelectorAll('.am-drop-target').forEach(el=>el.classList.remove('am-drop-target'));};
  function placeSource(source,lane,clientX) {
    const r=lane.getBoundingClientRect(),filmDuration=Math.max(0,duration());
    const at=filmDuration>0?Math.round(clamp((clientX-r.left)/r.width*filmDuration,0,filmDuration)*30)/30:0;
    const region=sourceRegionMeta(source),kind=lane.dataset.masterLane,length=clipLength(source);
    let placedAt=at;
    if(state.placementMode==='snap'){
      const candidates=[state.previewAt,...state.cuts,...state.tracks.flatMap(t=>[t.at,t.at+clipLength(t)])];
      const nearest=candidates.reduce((best,value)=>Math.abs(value-at)<Math.abs(best-at)?value:best,at);
      if(Math.abs(nearest-at)<=Math.max(1/30,12/state.zoom))placedAt=Math.round(nearest*30)/30;
    }
    checkpoint(`placement de ${source.name} sur le Master`);
    if(state.placementMode==='insert')state.tracks.filter(t=>t.kind===kind&&t.at>=placedAt&&!t.locked).forEach(t=>t.at+=length);
    const clip={...source,sourceId:source.id,id:crypto.randomUUID(),name:`${source.name} · bloc ${region.blockIndex}/${region.blockCount}`,kind,at:placedAt,locked:false,automation:source.automation.map(p=>({...p}))};
    state.tracks.push(clip);state.selectedId=clip.id;
    state.selectedIds=[clip.id];
    const end=placedAt+length;if(end>duration()){state.total=end;badge(`Film prolongé à ${time(end)} pour contenir « ${source.name} ».`,false);}
    else badge(`« ${source.name} » placé sur ${clip.kind==='voice'?'Voix':'Musique'} Master à ${timeFrame(placedAt)} (${state.placementMode}).`,false);
    render();
  }
  $('am-master-picker').onclick = e => {
    const button=e.target.closest('[data-select-track]');if(!button)return;
    const clip=state.tracks[+button.dataset.selectTrack];if(!clip)return;
    if(e.shiftKey||e.metaKey){state.selectedIds=state.selectedIds.includes(clip.id)?state.selectedIds.filter(id=>id!==clip.id):[...state.selectedIds,clip.id];state.selectedId=clip.id;}
    else{state.selectedId=clip.id;state.selectedIds=[clip.id];}
    render();
  };
  root.querySelector('.am-sources').onpointerdown = e => {
    // Safari peut perdre le dépôt HTML natif pendant un long glisser vertical.
    // L’en-tête possède donc aussi une voie pointeur explicite, souris comprise.
    const sourceHead=e.target.closest('[data-source-playhead]');
    if(sourceHead){
      const source=state.sources.find(s=>s.id===sourceHead.dataset.sourcePlayhead),wave=sourceHead.previousElementSibling;
      if(!source||!wave)return;
      e.preventDefault();e.stopPropagation();if(sourceAudition?.source.id===source.id)stopSourceAudition();
      const moveCursor=clientX=>{
        const rect=wave.getBoundingClientRect(),seconds=(source.out-source.in)*clamp((clientX-rect.left)/rect.width,0,1);
        updateSourceAuditionUI(source,seconds,false);sourceHead.setAttribute('aria-valuenow',seconds.toFixed(2));
      };
      sourceHead.setPointerCapture(e.pointerId);moveCursor(e.clientX);
      sourceHead.onpointermove=move=>moveCursor(move.clientX);
      const finish=up=>{moveCursor(up.clientX);sourceHead.onpointermove=null;sourceHead.onpointerup=null;sourceHead.onpointercancel=null;badge(`Curseur annexe placé à ${(source.listenAt||0).toFixed(2)} s dans « ${source.name} ».`,false);};
      sourceHead.onpointerup=finish;sourceHead.onpointercancel=finish;return;
    }
    if(e.target.closest('button,input,label,select,summary,details'))return;
    const clip=e.target.closest('[data-source]');if(!clip)return;
    const id=clip.dataset.source,startX=e.clientX,startY=e.clientY;
    if(state.sources.find(s=>s.id===id)?.locked)return badge('Ce bloc est verrouillé.',true);
    e.preventDefault();
    clip.setPointerCapture(e.pointerId);
    const laneAt=(x,y)=>document.elementFromPoint(x,y)?.closest?.('[data-master-lane]')||[...root.querySelectorAll('[data-master-lane]')].find(row=>{const r=row.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});
    let dragX=startX,dragY=startY,dragging=false,scrollRaf=0;
    const refreshTarget=()=>root.querySelectorAll('[data-master-lane]').forEach(row=>row.classList.toggle('am-drop-target',row===laneAt(dragX,dragY)));
    const autoScroll=()=>{
      if(!dragging)return;
      const edge=Math.min(110,window.innerHeight*.18),speed=dragY<edge?-Math.ceil((edge-dragY)/4):dragY>window.innerHeight-edge?Math.ceil((dragY-(window.innerHeight-edge))/4):0;
      if(speed){if(root.classList.contains('am-focused'))root.scrollTop+=speed;else window.scrollBy(0,speed);refreshTarget();}
      scrollRaf=requestAnimationFrame(autoScroll);
    };
    clip.onpointermove=move=>{
      dragX=move.clientX;dragY=move.clientY;
      if(!dragging&&Math.hypot(move.clientX-startX,move.clientY-startY)>=8){dragging=true;clip.classList.add('am-dragging');badge('Glissez vers le haut : la page défile automatiquement jusqu’à Voix Master ou Musique Master.',false);scrollRaf=requestAnimationFrame(autoScroll);}
      if(dragging)refreshTarget();
    };
    clip.onpointerup=up=>{
      cancelAnimationFrame(scrollRaf);clip.classList.remove('am-dragging');clip.onpointerup=null;clip.onpointermove=null;root.querySelectorAll('[data-master-lane]').forEach(row=>row.classList.remove('am-drop-target'));
      if(Math.hypot(up.clientX-startX,up.clientY-startY)<12){const wave=e.target.closest('[data-source-wave]');if(wave)placeAnnexCursor(wave,up.clientX);return;}
      const lane=laneAt(up.clientX,up.clientY);
      const source=state.sources.find(s=>s.id===id);
      if(lane&&source)placeSource(source,lane,up.clientX);else badge('Bloc non déposé : relâchez-le sur la piste Voix Master ou Musique Master surlignée.',true);
    };
    clip.onpointercancel=()=>{cancelAnimationFrame(scrollRaf);clip.classList.remove('am-dragging');clip.onpointerup=null;clip.onpointermove=null;root.querySelectorAll('[data-master-lane]').forEach(row=>row.classList.remove('am-drop-target'));};
  };
  $('am-lanes').ondragover = e => {
    const lane=e.target.closest('[data-master-lane]'); if (!lane) return;
    e.preventDefault();e.dataTransfer.dropEffect='copy';lane.classList.add('am-drop-target');
  };
  $('am-lanes').ondragleave = e => { const lane=e.target.closest('[data-master-lane]');if(lane&&!lane.contains(e.relatedTarget))lane.classList.remove('am-drop-target'); };
  $('am-lanes').ondrop = e => {
    const lane=e.target.closest('[data-master-lane]');if(!lane)return;
    e.preventDefault();lane.classList.remove('am-drop-target');
    const sourceId=e.dataTransfer.getData('application/x-atelier-source')||e.dataTransfer.getData('text/plain');
    const source=state.sources.find(s=>s.id===sourceId);if(!source)return;
    placeSource(source,lane,e.clientX);
  };
  const trackSurfaces=[$('am-tracks'),$('am-lanes')];
  const changeTrackField = e => {
    const i = +e.target.dataset.track, t = state.tracks[i], f = e.target.dataset.field;
    if (!t || !f) return;
    if(t.locked){render();return badge('Déverrouillez ce clip avant de le modifier.',true);}
    if (f !== 'db' || e.target.dataset.historyStarted !== 'true') checkpoint(`réglage ${f} de ${t.name}`);
    delete e.target.dataset.historyStarted;
    if (f === 'loop') t.loop = e.target.checked;
    else if (f === 'kind') t.kind = e.target.value;
    else t[f] = +e.target.value;
    t.at = Math.max(0, t.at); t.in = clamp(t.in, 0, t.buffer.duration);
    t.out = clamp(t.out, t.in + 0.01, t.buffer.duration);
    t.db = clamp(t.db, -60, 12); t.fadeIn = Math.max(0, t.fadeIn); t.fadeOut = Math.max(0, t.fadeOut);
    if(t.kind==='voice'&&(f==='in'||f==='out'||f==='kind'))Object.assign(t,voiceLevel(t.buffer,t.in,t.out));
    updateLiveGains();
    // Laisser le contrôle natif finir son changement avant de reconstruire l'inspecteur.
    requestAnimationFrame(render);
  };
  const inputTrackField = e => {
    if (e.target.dataset.field !== 'db') return;
    const t=state.tracks[+e.target.dataset.track];if(!t)return;
    t.db=clamp(+e.target.value,-60,12);updateLiveGains();
  };
  const startTrackField = e => {
    if (e.target.dataset.field !== 'db') return;
    const t=state.tracks[+e.target.dataset.track];if(!t||t.locked)return;
    checkpoint(`volume de ${t.name}`);e.target.dataset.historyStarted='true';
  };
  const clickTrackAction = e => {
    const i = e.target.dataset.mute ?? e.target.dataset.remove ?? e.target.dataset.solo ?? e.target.dataset.lock;
    if (i === undefined) return;
    const track=state.tracks[+i];
    if(e.target.dataset.lock!==undefined){checkpoint(`verrouillage de ${track.name}`);track.locked=!track.locked;}
    else if(track.locked)return badge('Déverrouillez ce clip avant cette action.',true);
    else if (e.target.dataset.mute !== undefined) {checkpoint(`muet de ${track.name}`);track.muted = !track.muted;updateLiveGains();}
    else if (e.target.dataset.solo !== undefined) {checkpoint(`solo de ${track.name}`);track.solo = !track.solo;updateLiveGains();}
    else { checkpoint(`suppression de ${track.name}`);const removed = state.tracks.splice(+i, 1)[0];state.selectedIds=state.selectedIds.filter(id=>id!==removed.id);if (removed.id===state.selectedId) state.selectedId=state.selectedIds.at(-1)||null; }
    render();
  };
  trackSurfaces.forEach(surface=>{surface.addEventListener('change',changeTrackField);surface.addEventListener('input',inputTrackField);surface.addEventListener('pointerdown',startTrackField);surface.addEventListener('click',clickTrackAction);});
  root.addEventListener('input', e => {
    const kind=e.target.dataset.masterDb; if (!kind) return;
    state.master[kind].db=+e.target.value; $(`am-${kind}-db`).textContent=`${e.target.value} dB`;updateLiveGains();
  });
  root.addEventListener('pointerdown', e => {
    const kind=e.target.dataset.masterDb;if(!kind)return;
    checkpoint(`volume du bus ${kind}`);
  });
  $('am-uniform-voices').onchange=()=>{checkpoint('uniformisation des voix');updateLiveGains();render();};
  $('am-duck').onchange=()=>{checkpoint('baisse de la musique sous la voix');updateLiveGains();};
  root.addEventListener('click', e => {
    const kind=e.target.dataset.masterMute; if (!kind) return;
    checkpoint(`muet du bus ${kind}`);
    state.master[kind].muted=!state.master[kind].muted; updateLiveGains();render();
  });
  function setMasterZoom(value,link=true) {
    state.zoom=clamp(Math.round(value),2,720);
    $('am-zoom').value=state.zoom;
    $('am-zoom-value').textContent=`${state.zoom} px/s`;
    if(link&&state.linkedZoom){setAnnexZoom('voice',state.zoom/20,false);setAnnexZoom('music',state.zoom/20,false);}
    renderTimeline();
    requestAnimationFrame(()=>ensurePlayheadVisible(true));
  }
  function setAnnexZoom(kind,value,link=true) {
    state.annexZoom[kind]=clamp(Math.round(value*2)/2,1,100);
    $(`am-${kind}-zoom`).value=state.annexZoom[kind];
    $(`am-${kind}-zoom-value`).textContent=`×${state.annexZoom[kind]}`;
    root.querySelectorAll(`.am-source-lane[data-import-lane="${kind}"] .am-source-track`).forEach(track=>track.style.setProperty('--annex-zoom',state.annexZoom[kind]));
    if(link&&state.linkedZoom){const other=kind==='voice'?'music':'voice';setAnnexZoom(other,state.annexZoom[kind],false);setMasterZoom(state.annexZoom[kind]*20,false);}
  }
  $('am-zoom').oninput = e => setMasterZoom(+e.target.value);
  $('am-zoom-out').onclick = () => setMasterZoom(state.zoom-5);
  $('am-zoom-in').onclick = () => setMasterZoom(state.zoom+5);
  $('am-zoom-fit').onclick = () => setMasterZoom(clamp((root.querySelector('.am-timeline').clientWidth-160)/Math.max(1,duration()),2,720));
  for(const kind of ['voice','music']){
    $(`am-${kind}-zoom`).oninput=e=>setAnnexZoom(kind,+e.target.value);
    $(`am-${kind}-zoom-out`).onclick=()=>setAnnexZoom(kind,state.annexZoom[kind]-(state.annexZoom[kind]>=10?5:0.5));
    $(`am-${kind}-zoom-in`).onclick=()=>setAnnexZoom(kind,state.annexZoom[kind]+(state.annexZoom[kind]>=10?5:0.5));
    $(`am-${kind}-zoom-precision`).onclick=()=>setAnnexZoom(kind,10);
    $(`am-${kind}-zoom-fit`).onclick=()=>setAnnexZoom(kind,1);
  }
  $('am-linked-zoom').onclick=()=>{state.linkedZoom=!state.linkedZoom;if(state.linkedZoom){setAnnexZoom('voice',state.zoom/20,false);setAnnexZoom('music',state.zoom/20,false);}$('am-linked-zoom').classList.toggle('am-toggle-active',state.linkedZoom);$('am-linked-zoom').setAttribute('aria-pressed',String(state.linkedZoom));$('am-linked-zoom').textContent=state.linkedZoom?'🔗 Les 3 zooms sont liés':'Lier les 3 zooms';badge(state.linkedZoom?'Les zooms Master, voix et musique évoluent ensemble.':'Les trois zooms sont maintenant indépendants.',false);};
  $('am-placement-mode').onchange=e=>{checkpoint('mode de placement');state.placementMode=e.target.value;badge(`Mode de placement : ${e.target.selectedOptions[0].textContent}.`,false);};
  function updateMinimap(){
    const timeline=root.querySelector('.am-timeline'),handle=$('am-minimap-window');if(!timeline||!handle)return;
    const max=Math.max(0,timeline.scrollWidth-timeline.clientWidth),ratio=Math.min(1,timeline.clientWidth/Math.max(1,timeline.scrollWidth));
    handle.style.width=`${Math.max(4,ratio*100)}%`;handle.style.left=`${max?timeline.scrollLeft/max*(100-ratio*100):0}%`;
    $('am-minimap').setAttribute('aria-valuenow',String(Math.round(max?timeline.scrollLeft/max*100:0)));
  }
  function ensurePlayheadVisible(center=false){
    const timeline=root.querySelector('.am-timeline'),ruler=$('am-ruler');if(!timeline||!ruler)return;
    const x=ruler.offsetLeft+ruler.clientWidth*(state.previewAt/Math.max(1,duration())),left=timeline.scrollLeft,right=left+timeline.clientWidth;
    if(center||x<left+150||x>right-90){timeline.scrollLeft=Math.max(0,x-timeline.clientWidth*.48);updateMinimap();}
  }
  root.querySelector('.am-timeline').addEventListener('scroll',updateMinimap,{passive:true});
  $('am-minimap').onpointerdown=e=>{
    const map=$('am-minimap'),timeline=root.querySelector('.am-timeline'),rect=map.getBoundingClientRect();
    const move=pointer=>{const ratio=clamp((pointer.clientX-rect.left)/rect.width,0,1),max=Math.max(0,timeline.scrollWidth-timeline.clientWidth);timeline.scrollLeft=ratio*max;updateMinimap();};
    move(e);map.setPointerCapture(e.pointerId);map.onpointermove=move;map.onpointerup=()=>{map.onpointermove=null;map.onpointerup=null;};
  };
  root.querySelector('.am-timeline').addEventListener('wheel',e=>{
    if(!e.metaKey)return;e.preventDefault();
    const timeline=e.currentTarget,rect=timeline.getBoundingClientRect(),pointerX=e.clientX-rect.left+timeline.scrollLeft,timeAtPointer=pointerX/Math.max(1,timeline.scrollWidth)*duration();
    setMasterZoom(state.zoom*(e.deltaY<0?1.12:0.89));
    timeline.scrollLeft=Math.max(0,timeAtPointer/duration()*timeline.scrollWidth-(e.clientX-rect.left));updateMinimap();
  },{passive:false});
  $('am-split').onclick = () => {
    const t=selected(); if (!t) return badge('Sélectionnez un clip Master à scinder.',true);
    if(t.locked)return badge('Déverrouillez ce clip avant de le scinder.',true);
    if (t.loop) return badge('Désactivez la boucle avant de scinder ce clip.',true);
    const local=state.previewAt-t.at;
    if (local<0.05 || local>clipLength(t)-0.05) return badge('Placez la tête de lecture à l’intérieur du clip.',true);
    checkpoint(`scission Master de ${t.name}`);
    const originalIn=t.in, originalOut=t.out, boundary=t.in+local, at=t.at;
    const originalPoints=t.automation||[{time:0,db:0},{time:clipLength(t),db:0}];
    const boundaryDb=automationDb(t,local);
    const left=originalPoints.filter(p=>p.time<local).concat({time:local,db:boundaryDb});
    const right=[{time:0,db:boundaryDb}].concat(originalPoints.filter(p=>p.time>local).map(p=>({time:p.time-local,db:p.db})));
    t.out=boundary; t.automation=left; t.fadeOut=0;
    const second={...t,id:crypto.randomUUID(),name:t.name+' · suite',at:at+local,in:boundary,out:originalOut,
      automation:right,fadeIn:0,fadeOut:0.5};
    if(t.kind==='voice'){
      Object.assign(t,voiceLevel(t.buffer,t.in,t.out));
      Object.assign(second,voiceLevel(second.buffer,second.in,second.out));
    }
    state.tracks.splice(state.tracks.indexOf(t)+1,0,second); state.selectedId=second.id;state.selectedIds=[second.id];
    badge(`Clip Master scindé à ${time(state.previewAt)}. Les deux blocs sont conservés et se déplacent indépendamment.`,false); render();
  };
  $('am-add-point').onclick = () => {
    const t=selected(); if (!t) return badge('Sélectionnez un clip.',true);
    const local=state.previewAt-t.at;
    if (local<=0 || local>=clipLength(t)) return badge('Placez le curseur dans le clip.',true);
    if(t.locked)return badge('Déverrouillez ce clip avant de modifier son volume.',true);
    checkpoint(`point de volume de ${t.name}`);
    t.automation.push({time:local,db:automationDb(t,local)});
    t.automation.sort((a,b)=>a.time-b.time); render();
  };
  const automationTrack=(panel)=>state.tracks[+(panel?.dataset.automationTrack??state.tracks.indexOf(selected()))];
  const automationPanel=target=>target?.closest('.am-automation,.am-envelope')||target?.closest('.am-clip')?.querySelector('.am-envelope');
  const editAutomation = e => {
    const panel=automationPanel(e.target),t=automationTrack(panel); if (!t||!panel) return;
    e.preventDefault();e.stopPropagation();
    if(t.locked)return badge('Déverrouillez ce clip avant de modifier son automatisation.',true);
    checkpoint(`automatisation de ${t.name}`);
    const point=e.target.closest('[data-point]');
    if (point) { const j=+point.dataset.point; if (j>0 && j<t.automation.length-1) t.automation.splice(j,1); }
    else { const r=panel.getBoundingClientRect(),compact=panel.classList.contains('am-envelope'); t.automation.push({time:clamp((e.clientX-r.left)/r.width*clipLength(t),0,clipLength(t)),db:compact?automationDb(t,clamp((e.clientX-r.left)/r.width*clipLength(t),0,clipLength(t))):clamp(12-(e.clientY-r.top)/r.height*72,-60,12)}); t.automation.sort((a,b)=>a.time-b.time); }
    render();
  };
  const dragAutomationPoint = e => {
    const dot=e.target.closest('[data-point]'),panel=automationPanel(dot),t=automationTrack(panel); if (!dot||!t) return;
    e.preventDefault();e.stopPropagation();
    if(t.locked)return badge('Déverrouillez ce clip avant de modifier son automatisation.',true);
    checkpoint(`automatisation de ${t.name}`);
    const j=+dot.dataset.point,r=panel.getBoundingClientRect(),compact=panel.classList.contains('am-envelope'),viewWidth=compact?100:500,viewHeight=compact?50:90;
    dot.setPointerCapture(e.pointerId);
    dot.onpointermove=move => {
      const p=t.automation[j];
      p.db=Math.round(compact?clamp(12-((move.clientY-r.top)/r.height*50-7)/35*72,-60,12):clamp(12-(move.clientY-r.top)/r.height*72,-60,12));
      if (j>0&&j<t.automation.length-1) p.time=clamp((move.clientX-r.left)/r.width*clipLength(t),t.automation[j-1].time+0.01,t.automation[j+1].time-0.01);
      if(dot.classList.contains('am-envelope-point')){dot.style.left=`${p.time/clipLength(t)*100}%`;dot.style.top=`${(7+(12-p.db)/72*35)/50*100}%`;}
      else {dot.setAttribute('cx',p.time/clipLength(t)*viewWidth);dot.setAttribute('cy',(12-p.db)/72*viewHeight);}
      panel.querySelector('polyline').setAttribute('points',t.automation.map(q=>`${q.time/clipLength(t)*viewWidth},${compact?7+(12-q.db)/72*35:(12-q.db)/72*viewHeight}`).join(' '));
    };
    dot.onpointerup=()=>{dot.onpointermove=null;dot.onpointerup=null;render();};
  };
  trackSurfaces.forEach(surface=>{surface.addEventListener('click',e=>{if(e.target.closest('.am-envelope')&&!e.target.closest('[data-point]'))editAutomation(e);});surface.addEventListener('dblclick',e=>{if(e.target.closest('[data-point]'))editAutomation(e);});surface.addEventListener('pointerdown',dragAutomationPoint);});
  $('am-steps').onchange = e => {
    if (e.target.dataset.cut === undefined) return;
    const i = +e.target.dataset.cut, value = +e.target.value;
    if (i === 0 || !Number.isFinite(value) || value <= state.cuts[i-1] || value >= (state.cuts[i+1] ?? duration())) {
      badge('Le repère doit rester entre ceux des étapes voisines ; la première commence à zéro.', true); render(); return;
    }
    checkpoint(`repère de la diapositive ${i+1}`);
    state.cuts[i] = value; render();
  };
  $('am-steps').onclick = e => { if (e.target.dataset.focus === undefined) return; seek(state.cuts[+e.target.dataset.focus]); };
  function showTransition(i) {
    state.selectedTransition=i;
    const setting=state.transitions[i]||{type:'cut',duration:0.6};
    $('am-transition-title').textContent=`Diapositives ${i} → ${i+1}`;
    $('am-transition-type').value=setting.type;
    $('am-transition-duration').value=setting.duration;
    $('am-transition-easing').value=setting.easing||'linear';
    $('am-transition-panel').hidden=false;
    seek(Math.max(0,state.cuts[i]-Math.min(0.3,transitionLength(i)/2)));
  }
  $('am-transition-type').onchange = e => { checkpoint('changement de transition');const i=state.selectedTransition; state.transitions[i].type=e.target.value; renderTimeline(); seek(state.cuts[i]-transitionLength(i)/2); };
  $('am-transition-duration').onchange = e => { checkpoint('durée de transition');const i=state.selectedTransition; state.transitions[i].duration=clamp(+e.target.value||0.6,0.1,5); e.target.value=state.transitions[i].duration; seek(state.cuts[i]-transitionLength(i)/2); };
  $('am-transition-easing').onchange=e=>{checkpoint('douceur de transition');state.transitions[state.selectedTransition].easing=e.target.value;drawPreview(state.previewAt);};
  $('am-transition-all').onclick = () => { checkpoint('transition sur toutes les frontières');const chosen=state.transitions[state.selectedTransition]; for(let i=1;i<state.images.length;i++) state.transitions[i]={...chosen,params:{...(chosen.params||{})}}; renderTimeline(); badge(`Transition appliquée aux ${state.images.length-1} jonctions.`,false); };
  $('am-transition-remove-all').onclick=()=>{checkpoint('retrait de toutes les transitions');for(let i=1;i<state.transitions.length;i++)state.transitions[i]={type:'cut',duration:0.6,easing:'linear'};renderTimeline();badge('Toutes les transitions ont été retirées.',false);};
  $('am-add-pause').onclick = () => {
    const i=state.selectedTransition, seconds=clamp(+$('am-pause-duration').value||1,0.1,30);
    if(!i||i>=state.images.length)return badge('Choisissez une jonction entre deux diapositives.',true);
    checkpoint('ajout d’une pause');
    for(let j=i;j<state.cuts.length;j++)state.cuts[j]+=seconds;
    state.total=duration()+seconds;
    badge(`Pause de ${seconds.toFixed(1)} s ajoutée après la diapositive ${i}.`,false);
    render();seek(Math.max(0,state.cuts[i]-seconds/2));
  };
  function pointerTime(event) {
    const rect=$('am-ruler').getBoundingClientRect();
    return clamp((event.clientX-rect.left)/Math.max(1,rect.width)*duration(),0,duration());
  }
  function scrubMaster(event) {
    if(event.button!==0)return;
    if(state.playing)stopPreview();
    const handle=event.target.closest('.am-playhead-handle');
    seek(pointerTime(event));
    const currentHandle=root.querySelector('.am-playhead-handle');currentHandle?.focus({preventScroll:true});
    if(!handle){badge(`Tête de lecture placée à ${time(state.previewAt)}. Saisissez la petite poignée rouge pour la glisser.`,false);return;}
    state.scrubbing=true;
    const update=pointer=>seek(pointerTime(pointer));
    handle.setPointerCapture(event.pointerId);
    handle.onpointermove=update;
    const finish=()=>{
      state.scrubbing=false;handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;
      ensurePlayheadVisible();
      badge(`Tête de lecture placée à ${time(state.previewAt)}.`,false);
    };
    handle.onpointerup=finish;handle.onpointercancel=finish;
  }
  $('am-ruler').onpointerdown = scrubMaster;
  $('am-ruler').onkeydown = e => {
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();
    if(e.key==='Home')seek(0);
    else if(e.key==='End')seek(duration());
    else seek(state.previewAt+(e.key==='ArrowRight'?1:-1)/30);
  };
  $('am-lanes').onclick = e => {
    const junction=e.target.closest('[data-transition]');
    if(junction){showTransition(+junction.dataset.transition);return;}
  };
  $('am-lanes').onpointerdown = e => {
    if(e.target.closest('.am-clip-integrated-tools,.am-envelope,.am-envelope-point'))return;
    const handle=e.target.closest('[data-resize-step]');
    if(handle){
      const i=+handle.dataset.resizeStep, boundary=i+1, lane=handle.parentElement.parentElement;
      checkpoint(`durée de la diapositive ${i+1}`);const rect=lane.getBoundingClientRect(), initialTotal=duration();
      handle.setPointerCapture(e.pointerId);
      handle.onpointermove=move=>{
        if(boundary===state.images.length){
          state.total=Math.round(clamp((move.clientX-rect.left)/rect.width*initialTotal,state.cuts[i]+0.5,initialTotal*4)*100)/100;
          handle.parentElement.style.width=`${(state.total-state.cuts[i])/initialTotal*100}%`;
          return;
        }
        state.cuts[boundary]=Math.round(clamp((move.clientX-rect.left)/rect.width*duration(),state.cuts[i]+0.5,(state.cuts[boundary+1]??duration())-0.5)*100)/100;
        handle.parentElement.style.width=`${(state.cuts[boundary]-state.cuts[i])/duration()*100}%`;
        const next=lane.querySelector(`[data-focus="${boundary}"]`);
        if(next){next.style.left=`${state.cuts[boundary]/duration()*100}%`;next.style.width=`${((state.cuts[boundary+1]??duration())-state.cuts[boundary])/duration()*100}%`;}
        const marker=lane.querySelector(`[data-transition="${boundary}"]`);if(marker)marker.style.left=`${state.cuts[boundary]/duration()*100}%`;
      };
      handle.onpointerup=()=>{handle.onpointermove=null;handle.onpointerup=null;render();seek(Math.min(duration()-0.05,state.cuts[boundary]??state.cuts[i]));};
      return;
    }
    if(e.target.closest('[data-transition]'))return;
    if(e.target.closest('.am-step-clip')||!e.target.closest('[data-clip]'))return;
    const clip = e.target.closest('[data-clip]'); if (!clip) return;
    const i = +clip.dataset.clip, t = state.tracks[i], lane = clip.parentElement;
    if(e.shiftKey||e.metaKey)state.selectedIds=state.selectedIds.includes(t.id)?state.selectedIds.filter(id=>id!==t.id):[...state.selectedIds,t.id];
    else if(!state.selectedIds.includes(t.id))state.selectedIds=[t.id];
    state.selectedId=t.id;
    if(t.locked){render();return badge('Ce clip Master est verrouillé.',true);}
    checkpoint(`déplacement de ${state.selectedIds.length} clip(s) Master`);
    const moving=state.tracks.filter(track=>state.selectedIds.includes(track.id)&&!track.locked),initials=new Map(moving.map(track=>[track.id,track.at]));
    const x = e.clientX, width = lane.getBoundingClientRect().width;
    clip.setPointerCapture(e.pointerId);
    clip.onpointermove = move => {
      const delta=(move.clientX-x)/width*duration();
      for(const track of moving)track.at=Math.round(clamp(initials.get(track.id)+delta,0,duration())*30)/30;
      root.querySelectorAll('[data-clip]').forEach(node=>{const track=state.tracks[+node.dataset.clip];if(initials.has(track?.id))node.style.left=`${track.at/duration()*100}%`;});
    };
    clip.onpointerup = up => {
      const target=[...root.querySelectorAll('[data-master-lane]')].find(row=>{const r=row.getBoundingClientRect();return up.clientY>=r.top&&up.clientY<=r.bottom;});
      if (target) moving.forEach(track=>track.kind=target.dataset.masterLane);
      clip.onpointermove = null; clip.onpointerup = null; render();
    };
  };
  $('am-seek').oninput = e => {
    const at = +e.target.value;
    if (state.playing) {
      stopPreview();
      seek(at);
      $('am-play').click();
    } else seek(at);
  };
  $('am-preview-fullscreen').onclick = () => {
    if (document.fullscreenElement === $('am-preview')) document.exitFullscreen();
    else $('am-preview').requestFullscreen();
  };
  function applyPreviewQuality(){const canvas=$('am-preview');const size=state.previewQuality==='economy'?[960,540]:[1920,1080];if(canvas.width!==size[0]){canvas.width=size[0];canvas.height=size[1];}}
  $('am-preview-quality').onchange=e=>{checkpoint('qualité de prévisualisation');state.previewQuality=e.target.value;applyPreviewQuality();drawPreview(state.previewAt);badge(state.previewQuality==='economy'?'Aperçu économique 540p ; export inchangé en 1080p.':'Aperçu pleine qualité 1080p.',false);};
  root.querySelector('.am-step-nav').onclick=e=>{
    const jump=e.target.dataset.jump;if(!jump)return;
    if(jump!=='sources'&&jump!=='all')stopSourceAudition();
    state.workspace=jump;root.dataset.workspace=jump;if(jump==='master'||jump==='all')showMasterView();
    root.querySelectorAll('[data-jump]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.jump===jump)));
    requestAnimationFrame(()=>{if(root.classList.contains('am-focused'))root.scrollTop=0;if(jump==='preview'||jump==='all')drawPreview(state.previewAt);});
    badge(jump==='all'?'Montage complet : aperçu, timeline et sons visibles ensemble.':jump==='preview'?'Espace Aperçu.':jump==='master'?'Espace Timeline Master.':'Espace Voix et musiques.',false);
  };
  $('am-focus').onclick = () => {
    const focused = root.classList.toggle('am-focused');
    $('am-focus').textContent = focused ? 'Fermer le banc plein écran' : 'Ouvrir le banc plein écran';
    $('am-focus').setAttribute('aria-pressed', String(focused));
    if(focused)root.scrollTop=0;requestAnimationFrame(()=>{if(focused)root.scrollTop=0;drawPreview(state.previewAt);});
  };
  document.addEventListener('keydown', e => {
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();return e.shiftKey?redo():undo();}
    if((e.metaKey||e.ctrlKey)&&['+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')$('am-zoom-fit').click();else setMasterZoom(state.zoom*(e.key==='-'?0.8:1.25));return;}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='c'&&state.selectedIds.length){e.preventDefault();state.copiedTracks=state.tracks.filter(t=>state.selectedIds.includes(t.id)).map(cloneItem);badge(`${state.copiedTracks.length} clip(s) Master copié(s).`,false);return;}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='v'&&state.copiedTracks.length){e.preventDefault();checkpoint('collage de clips Master');const first=Math.min(...state.copiedTracks.map(t=>t.at));const copies=state.copiedTracks.map(t=>({...cloneItem(t),id:crypto.randomUUID(),at:Math.max(0,state.previewAt+t.at-first),locked:false}));state.tracks.push(...copies);state.selectedIds=copies.map(t=>t.id);state.selectedId=copies.at(-1).id;render();return;}
    const editing=/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);if(editing)return;
    if((e.key==='Delete'||e.key==='Backspace')&&state.selectedIds.length){const removable=state.tracks.filter(t=>state.selectedIds.includes(t.id)&&!t.locked);if(!removable.length)return badge('Les clips sélectionnés sont verrouillés.',true);e.preventDefault();checkpoint('suppression de la sélection Master');const ids=new Set(removable.map(t=>t.id));state.tracks=state.tracks.filter(t=>!ids.has(t.id));state.selectedIds=[];state.selectedId=null;render();return;}
    if (e.key === 'Escape' && root.classList.contains('am-focused') && !document.fullscreenElement) $('am-focus').click();
  });
  $('am-undo').onclick=undo;$('am-redo').onclick=redo;
  $('am-pause-all').onclick=()=>{if(state.images.length<2)return badge('Importez au moins deux diapositives.',true);const raw=window.prompt('Durée de la pause entre toutes les diapositives (secondes)','1');if(raw===null)return;const seconds=+String(raw).replace(',','.');if(!Number.isFinite(seconds)||seconds<0||seconds>30)return badge('Saisissez une pause comprise entre 0 et 30 secondes.',true);checkpoint('pauses entre toutes les diapositives');state.cuts=state.cuts.map((cut,i)=>cut+seconds*i);state.total=duration()+seconds*(state.images.length-1);render();badge(`Pause de ${seconds.toFixed(1)} s ajoutée entre les ${state.images.length} diapositives.`,false);};
  $('am-total').onchange = e => {
    const proposed = +e.target.value;
    if (!Number.isFinite(proposed) || proposed < 1 || proposed < state.images.length / 30) {
      badge('Durée trop courte : chaque image doit rester visible au moins une image vidéo.', true); render(); return;
    }
    if (Math.abs(proposed - duration()) < 0.001) return;
    checkpoint('durée totale du film');
    const previous = duration(),ratio=previous>0?proposed/previous:1;
    state.cuts = state.cuts.map(cut => cut * ratio);
    state.total = proposed; state.previewAt = previous>0?Math.min(state.previewAt * ratio,proposed):clamp(Number.isFinite(state.previewAt)?state.previewAt:0,0,proposed);
    badge(`Durée réglée à ${time(proposed)} ; les ${state.images.length} repères ont été répartis proportionnellement.`, false);
    render(); drawPreview(state.previewAt);
  };
  $('am-marker').onclick = () => {
    const i = state.cuts.findIndex((v, idx) => idx > 0 && v > state.previewAt);
    const target = i < 0 ? state.cuts.length - 1 : i;
    if (target <= 0 || state.previewAt <= state.cuts[target - 1] || state.previewAt >= (state.cuts[target + 1] ?? duration())) {
      badge('Placez la lecture entre deux repères pour déplacer le prochain.', true); return;
    }
    checkpoint('déplacement d’un repère');
    state.cuts[target] = Math.round(state.previewAt * 100) / 100;
    badge(`Repère ${target + 1} placé à ${time(state.previewAt)}.`, false); render();
  };
  function paintPreviewMessage(message) {
    const canvas=$('am-preview'),c=canvas.getContext('2d',{alpha:false});
    c.fillStyle='#eee9df';c.fillRect(0,0,canvas.width,canvas.height);
    c.fillStyle='#52615f';c.textAlign='center';c.textBaseline='middle';c.font=`600 ${Math.max(22,Math.round(canvas.width/55))}px -apple-system,system-ui,sans-serif`;
    c.fillText(message,canvas.width/2,canvas.height/2);
  }
  async function previewBitmap(index) {
    if(state.previewCache.has(index))return await state.previewCache.get(index);
    const generation=state.previewGeneration;
    const pending=createImageBitmap(state.images[index].blob).then(bitmap=>{
      if(generation!==state.previewGeneration){bitmap.close();throw Error('aperçu remplacé');}
      state.previewCache.delete(index);state.previewCache.set(index,bitmap);
      while(state.previewCache.size>4){const [oldIndex,oldValue]=state.previewCache.entries().next().value;if(oldIndex===index)break;state.previewCache.delete(oldIndex);Promise.resolve(oldValue).then(old=>old?.close?.()).catch(()=>{});}
      return bitmap;
    });
    state.previewCache.set(index,pending);return await pending;
  }
  async function drawPreviewFrame(at,generation) {
    const transition = activeTransition(at);
    if (transition) {
      const [from,to] = await Promise.all([
        previewBitmap(transition.i-1),
        previewBitmap(transition.i)
      ]);
      if (generation === state.previewGeneration) paintTransition($('am-preview'),from,to,state.transitions[transition.i].type,transition.p,state.transitions[transition.i].easing);
      return;
    }
    let idx = state.cuts.findLastIndex(v => v <= at); idx = Math.max(0, idx);
    const bitmap=await previewBitmap(idx);
    if (generation === state.previewGeneration) paint($('am-preview'),bitmap);
  }
  async function drawPreview(at) {
    if (!state.images.length){paintPreviewMessage('Importez une présentation HTML pour afficher le film');return;}
    state.previewDrawAt=at;
    if(state.previewDrawing)return;
    state.previewDrawing=true;
    try{
      while(state.previewDrawAt!==null){
        const frameAt=state.previewDrawAt,generation=state.previewGeneration;state.previewDrawAt=null;
        try{await drawPreviewFrame(frameAt,generation);}catch(error){if(error.message!=='aperçu remplacé')badge(`Aperçu impossible : ${error.message}`,true);}
      }
    }finally{
      state.previewDrawing=false;
      if(state.previewDrawAt!==null)drawPreview(state.previewDrawAt);
    }
  }
  function seek(at) { state.previewAt = clamp(at, 0, duration()); drawPreview(state.previewAt); renderClock(); }
  function renderClock() {
    $('am-clock').textContent = `${time(state.previewAt)} / ${time(duration())}`;
    $('am-cursor-time').textContent = state.zoom>=300?timeFrame(state.previewAt):time(state.previewAt);
    $('am-seek').value = state.previewAt;
    const playhead = root.querySelector('.am-playhead');
    if (playhead) { playhead.style.left = `${state.previewAt / Math.max(1, duration()) * 100}%`; playhead.querySelector('.am-playhead-handle')?.setAttribute('aria-valuenow',state.previewAt.toFixed(2)); }
    if(!state.scrubbing)requestAnimationFrame(()=>ensurePlayheadVisible());
  }
  let previewCtx = null, previewSources = [], previewGains = [];
  function updateLiveGains() {
    if (!previewCtx) return;
    const hasSolo=state.tracks.some(t=>t.solo&&!t.muted);
    for (const {track,gain} of previewGains) {
      const level=(track.muted||state.master[track.kind].muted||(hasSolo&&!track.solo))?0:dbGain(track.db+state.master[track.kind].db+voiceGain(track));
      gain.gain.setTargetAtTime(level,previewCtx.currentTime,0.015);
    }
  }
  function stopPreview() {
    state.playing = false; cancelAnimationFrame(state.raf);
    previewSources.forEach(s => { try { s.stop(); } catch {} }); previewSources = [];previewGains=[];
    if (previewCtx) { previewCtx.close(); previewCtx = null; }
    $('am-play').textContent = 'Lire';
  }
  function schedule(ctx, destination, from, live) {
    const result = [];
    for (const t of live ? state.tracks : tracks()) {
      const length = clipLength(t);
      if (length <= 0) continue;
      const gain = ctx.createGain(), volume = live ? ctx.createGain() : null, source = ctx.createBufferSource();
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
        let level=dbGain((live?0:t.db+state.master[t.kind].db+voiceGain(t))+automationDb(t,local));
        if(t.fadeIn>0) level*=clamp((absolute-t.at)/t.fadeIn,0,1);
        if(t.fadeOut>0 && !t.loop) level*=clamp((t.at+length-absolute)/t.fadeOut,0,1);
        if(t.kind==='music') {
          const under=state.tracks.some(v=>v.kind==='voice'&&!v.muted&&!state.master.voice.muted&&absolute>=v.at&&absolute<v.at+clipLength(v));
          if(under) level*=+$('am-duck').value;
        }
        curve[k]=level;
      }
      gain.gain.setValueCurveAtTime(curve,when,maxLength);
      if (live) { source.connect(gain).connect(volume).connect(destination);previewGains.push({track:t,gain:volume}); }
      else source.connect(gain).connect(destination);
      source.start(when, offset, maxLength);
      result.push(source);
    }
    return result;
  }
  $('am-play').onclick = async () => {
    if (state.playing) return stopPreview();
    if (!state.images.length) return badge('Importez d’abord une présentation.', true);
    stopSourceAudition();
    previewCtx = new (window.AudioContext || window.webkitAudioContext)();
    await previewCtx.resume();
    previewSources = schedule(previewCtx, previewCtx.destination, state.previewAt, true);updateLiveGains();
    state.playing = true; state.started = performance.now() - state.previewAt * 1000;
    $('am-play').textContent = 'Pause';
    const tick = now => { if (!state.playing) return; seek((now-state.started)/1000);
      if (state.previewAt >= duration()) stopPreview(); else state.raf = requestAnimationFrame(tick); };
    state.raf = requestAnimationFrame(tick);
  };
  $('am-stop').onclick = () => { stopSourceAudition();stopPreview();seek(0);badge('Lecture arrêtée.',false); };

  // Export déterministe : chaque étape est écrite avec son instant et sa durée.
  // Le temps réel de l'onglet ne peut donc plus sauter de diapositive.
  let cancelExport = false;
  $('am-cancel-export').onclick = () => { cancelExport = true; badge('Annulation demandée…', false); };
  function paint(canvas, bitmap, clear=true) {
    const c = canvas.getContext('2d', {alpha:false});
    c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
    if(clear){c.fillStyle = '#fffdf9'; c.fillRect(0,0,canvas.width,canvas.height);}
    const width = bitmap.displayWidth || bitmap.width, height = bitmap.displayHeight || bitmap.height;
    const scale = Math.min(canvas.width/width,canvas.height/height);
    c.drawImage(bitmap,(canvas.width-width*scale)/2,(canvas.height-height*scale)/2,width*scale,height*scale);
  }
  function paintTransition(canvas,from,to,type,progress,easing='linear') {
    let p=clamp(progress,0,1);if(easing==='ease-in')p*=p;else if(easing==='ease-out')p=1-(1-p)*(1-p);else if(easing==='ease-in-out')p=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
    const c=canvas.getContext('2d',{alpha:false}),w=canvas.width,h=canvas.height;
    if(['blur-cross','mosaic','exchange'].includes(type))type='dissolve';
    if(['wave','puzzle-left'].includes(type))type='wipe-left';if(type==='puzzle-right')type='wipe-right';
    if(['rotate-in','cube','page-previous'].includes(type))type='slide-left';if(['rotate-out','page-turn'].includes(type))type='slide-right';
    if(type==='dissolve') { paint(canvas,from);c.save();c.globalAlpha=p;paint(canvas,to,false);c.restore();return; }
    if(type==='zoom-cross') {paint(canvas,from);c.save();c.globalAlpha=p;c.translate(w/2,h/2);const scale=1.18-.18*p;c.scale(scale,scale);c.translate(-w/2,-h/2);paint(canvas,to,false);c.restore();return;}
    if(type==='fade-black'||type==='fade-white') {
      paint(canvas,p<0.5?from:to);
      c.fillStyle=type==='fade-black'?'#000':'#fff';c.globalAlpha=p<0.5?p*2:(1-p)*2;
      c.fillRect(0,0,w,h);c.globalAlpha=1;return;
    }
    if(type.startsWith('wipe-')) {
      paint(canvas,from);c.save();c.beginPath();if(type==='wipe-left'||type==='wipe-right')c.rect(type==='wipe-left'?0:w*(1-p),0,w*p,h);else c.rect(0,type==='wipe-up'?0:h*(1-p),w,h*p);c.clip();paint(canvas,to,false);c.restore();return;
    }
    if(type==='circle-open'||type==='circle-close'){paint(canvas,type==='circle-open'?from:to);c.save();c.beginPath();const radius=Math.hypot(w,h)*(type==='circle-open'?p:1-p);c.arc(w/2,h/2,radius,0,Math.PI*2);c.clip();paint(canvas,type==='circle-open'?to:from,false);c.restore();return;}
    if(type==='portal'){paint(canvas,from);c.save();c.beginPath();c.rect(w*(.5-p/2),0,w*p,h);c.clip();paint(canvas,to,false);c.restore();return;}
    if(type==='slide-left'||type==='slide-right') {
      c.fillStyle='#fffdf9';c.fillRect(0,0,w,h);
      const sign=type==='slide-left'?-1:1;
      c.save();c.translate(sign*w*p,0);paint(canvas,from,false);c.restore();
      c.save();c.translate(sign*w*(p-1),0);paint(canvas,to,false);c.restore();return;
    }
    paint(canvas,p<0.5?from:to);
  }
  async function mixedAudio() {
    const rate = 44100, seconds = duration();
    const offline = new OfflineAudioContext(2, Math.ceil(seconds*rate), rate);
    schedule(offline, offline.destination, 0, false);
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
    if (!state.images.length) refreshImages();
    if (!state.images.length) return badge('Importez d’abord une présentation.',true);
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
        const start=state.cuts[i],end=state.cuts[i+1] ?? duration();
        const span=end-start,blend=transitionLength(i+1),stillEnd=end-blend;
        if (span <= 0) throw Error(`Durée invalide pour l’étape ${i+1}.`);
        if(stillEnd>start){paint(canvas,bitmap);await video.add(start,stillEnd-start);}
        if(blend>0){
          const next=await createImageBitmap(state.images[i+1].blob);
          for(let at=stillEnd;at<end-0.00001;){
            if(cancelExport){next.close();bitmap.close();throw Error('Export annulé.');}
            const step=Math.min(1/30,end-at);
            paintTransition(canvas,bitmap,next,state.transitions[i+1].type,(at-stillEnd+step/2)/blend,state.transitions[i+1].easing);
            await video.add(at,step);at+=step;
          }
          next.close();
        }
        bitmap.close();
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
  $('am-export').onclick = () => {
    if (state.exporting) return;
    if (!$('cv-mp4').disabled) $('cv-mp4').click();
    else badge('Importez et préparez d’abord une présentation pour exporter le MP4.', true);
  };
  render();drawPreview(0);
})();
