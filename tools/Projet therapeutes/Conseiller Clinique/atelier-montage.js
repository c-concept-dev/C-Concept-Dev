/* Atelier Diapos — montage local. Source embarquée dans atelier-diapos.html par
 * tests/embarquer-atelier-montage.cjs ; aucun fichier voisin requis à l'usage. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { tracks: [], sources: [], copiedSource: null, images: [], cuts: [], total: 0, playing: false, started: 0,
    previewAt: 0, raf: 0, bitmap: null, bitmapIndex: -1, exporting: false,
    selectedId: null, selectedIds: [], copiedTracks: [], zoom: 20, annexZoom: 1, linkedZoom: true,
    placementMode: 'free', previewQuality: 'full', layoutMode: 'montage', transitions: [], selectedTransition: 1, previewRequest: 0,
    historyPast: [], historyFuture: [], lastAction: '',
    master: {voice: {db: 0, muted: false}, music: {db: 0, muted: false}} };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const time = s => { s=Number.isFinite(s)?Math.max(0,s):0; return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
  const timeFrame = s => { s=Number.isFinite(s)?Math.max(0,s):0;const whole=Math.floor(s),frame=Math.min(29,Math.floor((s-whole)*30+0.0001));return `${time(whole)}.${String(frame).padStart(2,'0')}`; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const badge = (message, error) => { const el = $('am-status'); el.textContent = message; el.dataset.error = error ? '1' : '0'; };
  const tracks = () => { const audible=state.tracks.filter(t => !t.muted && !state.master[t.kind].muted);return audible.some(t=>t.solo)?audible.filter(t=>t.solo):audible; };
  const selected = () => state.tracks.find(t => t.id === state.selectedId);
  const clipLength = t => t.out - t.in;
  const dbGain = db => Math.pow(10, db / 20);
  const trackColors = ['#0072B2','#D55E00','#009E73','#CC79A7','#E69F00','#56B4E9','#7A5195','#8C564B'];
  const nextTrackColor = kind => trackColors[state.sources.filter(s => s.kind === kind).length % trackColors.length];
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
      annexZoom:state.annexZoom,linkedZoom:state.linkedZoom,placementMode:state.placementMode,
      previewQuality:state.previewQuality,layoutMode:state.layoutMode,transitions:state.transitions.map(t=>({...t,params:{...(t.params||{})}})),
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
    for(const key of ['copiedSource','total','previewAt','selectedId','zoom','annexZoom','linkedZoom','placementMode','previewQuality','layoutMode','selectedTransition','master']) state[key]=snapshot[key];
    state.bitmapIndex=-1;applyPreviewQuality();render();drawPreview(state.previewAt);updateHistoryButtons();
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
    #am-workbench.am-focused .am-grid{flex:0 0 clamp(205px,34dvh,380px)}
    #am-workbench.am-focused .am-sources{flex:0 0 clamp(170px,25dvh,290px);height:auto}
    #am-workbench.am-focused .am-master{margin:0}
    #am-workbench.am-focused .am-master-picker{min-height:24px}
    #am-workbench.am-focused .am-timeline,#am-workbench.am-focused .am-steps-panel{min-height:125px;flex:0 0 clamp(135px,20dvh,220px)}
    #am-workbench.am-focused[data-layout=preview] .am-grid{flex-basis:48dvh}#am-workbench.am-focused[data-layout=preview] .am-sources{flex-basis:95px}#am-workbench.am-focused[data-layout=preview] .am-source-actions,#am-workbench.am-focused[data-layout=preview] .am-source-wave{display:none}
    #am-workbench.am-focused[data-layout=annexes] .am-grid{flex-basis:170px}#am-workbench.am-focused[data-layout=annexes] .am-sources{flex-basis:42dvh}#am-workbench.am-focused[data-layout=annexes] .am-timeline{flex-basis:130px}
    #am-workbench.am-focused .am-timeline{padding:7px 10px}
    #am-workbench.am-focused .am-lane{height:42px}
    #am-workbench.am-focused .am-lane-name{top:11px}
    #am-workbench.am-focused .am-clip{height:29px;top:6px;padding:4px 8px}
    #am-workbench.am-focused #am-status{margin:0!important}
    #am-workbench *{box-sizing:border-box} #am-workbench h2{font:600 29px/1.15 'Source Serif 4',Georgia,serif;margin:0 0 7px;color:#102f31}
    #am-workbench p{margin:0;color:#5d6966;font-size:12px}
    .am-toolbar{display:flex;gap:5px;flex-direction:column;margin:3px 0}
    .am-toolbar-row{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
    .am-toolbar-row.am-edit{padding-top:5px;border-top:1px solid #e5ded3}
    #am-workbench button,#am-workbench .am-file{font:600 13px/1.2 -apple-system,system-ui,sans-serif;border:1.5px solid #1f5053;border-radius:9px;background:#fffdf9;color:#1f5053;padding:9px 12px;cursor:pointer}
    #am-workbench button:hover,#am-workbench .am-file:hover{background:#dce8e6}
    #am-workbench button.am-transport{background:#1f5053;color:#fff}
    #am-workbench button.am-export-button{background:#a34d30;color:#fff;border-color:#a34d30}
    #am-workbench button:focus-visible,#am-workbench input:focus-visible{outline:3px solid #8a3f29;outline-offset:2px}
    #am-workbench button:disabled{opacity:.45;cursor:not-allowed}
    #am-workbench select{border:1px solid #5d6966;border-radius:6px;background:#fffdf9;color:#17393b;padding:5px;font:inherit}
    .am-command-group{display:flex;align-items:center;gap:5px;padding-right:7px;border-right:1px solid #d7cfc3}.am-command-group:last-child{border-right:0}
    .am-command-label{font-size:11px;font-weight:700;color:#52615f}.am-project-input{display:none}
    #am-workbench .am-compact{padding:6px 9px}.am-toggle-active{background:#1f5053!important;color:#fff!important}
    .am-file-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.am-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,1fr);gap:10px;min-height:0;flex:0 0 min(30vh,280px)}
    #am-workbench:not(.am-has-selection) .am-grid{grid-template-columns:1fr}#am-workbench:not(.am-has-selection) .am-inspector{display:none}
    .am-panel{border:1px solid #c9c3b8;border-radius:12px;padding:13px;background:#f6f2ea;min-width:0}
    .am-panel h3{font:700 15px/1.3 -apple-system,system-ui,sans-serif;margin:0 0 10px}
    .am-grid .am-panel:first-child{display:flex;flex-direction:column;min-height:0;overflow:hidden}
    #am-preview{width:auto;max-width:100%;height:calc(30vh - 70px);max-height:100%;aspect-ratio:16/9;display:block;background:#fffdf9;border-radius:9px;margin:auto}
    #am-workbench.am-focused #am-preview{height:calc(100% - 52px);max-height:calc(100% - 52px);object-fit:contain}
    #am-workbench.am-focused #am-seek{margin:3px 0 0}
    #am-preview:fullscreen{width:100vw;height:100vh;max-width:none;max-height:none;object-fit:contain;background:#102f31}
    #am-seek{width:100%;margin:12px 0 2px}.am-track{border:1px solid #5d6966;background:#fffdf9;border-radius:9px;padding:10px;margin-bottom:9px}
    .am-track[data-kind=voice]{border-left:5px solid #1f5053}.am-track[data-kind=music]{border-left:5px solid #8a3f29}
    .am-track-head{display:flex;align-items:center;gap:7px;justify-content:space-between;flex-wrap:wrap}
    .am-track-fields{display:grid;grid-template-columns:repeat(4,minmax(62px,1fr));gap:7px;margin-top:10px}
    .am-track label,.am-step label{font-size:11px;color:#5d6966;display:flex;flex-direction:column;gap:3px}
    .am-track input[type=number],.am-step input{width:100%;min-width:0;border:1px solid #5d6966;border-radius:5px;padding:5px;background:#fff;font:inherit}
    .am-track input[type=range]{width:100%}.am-wave{display:block;width:100%;height:38px;background:#dce8e6;border-radius:4px;margin-top:9px}
    .am-step{display:grid;grid-template-columns:42px minmax(0,1fr) 100px 66px;align-items:center;gap:7px;border-bottom:1px solid #ddd7cc;padding:7px 0;font-size:12px}
    .am-step img{width:42px;height:30px;object-fit:contain;background:#e9e4d9}.am-step button{padding:4px 7px!important}
    .am-timeline{margin:0;border:1px solid #b6afa4;border-radius:12px;background:#eee9df;padding:12px;overflow:auto;flex:1;min-height:190px}
    .am-minimap{position:sticky;left:120px;z-index:8;height:16px;width:calc(100% - 120px);margin:4px 0 4px 120px;border:1px solid #9a938a;border-radius:5px;background:linear-gradient(90deg,#dce8e6,#f2dfd4);cursor:pointer;touch-action:none}
    .am-minimap-window{position:absolute;top:1px;bottom:1px;left:0;width:100%;min-width:20px;border:2px solid #1f5053;border-radius:3px;background:#fff8;cursor:ew-resize}
    .am-ruler,.am-lane{min-width:600px;position:relative;margin-left:110px}
    .am-ruler{height:25px;border-bottom:1px solid #9a938a;font-size:11px;color:#52615f}
    .am-tick{position:absolute;top:0;transform:translateX(-50%);border-left:1px solid #9a938a;padding-left:4px;height:25px}
    .am-lane{height:48px;border-bottom:1px solid #d5cec2;background:repeating-linear-gradient(to right,transparent 0,transparent calc(10% - 1px),#d5cec2 calc(10% - 1px),#d5cec2 10%)}
    .am-lane-name{position:absolute;right:calc(100% + 10px);top:13px;width:100px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;font-weight:700;color:#183b3d}
    .am-clip{position:absolute;top:8px;height:31px;border-radius:5px;background:var(--track-color,#1f5053);color:#fff;padding:7px 8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;cursor:grab;touch-action:none;box-shadow:0 2px 5px #102f3130}
    .am-clip[data-kind=music]{background:var(--track-color,#8a3f29)}.am-clip:active{cursor:grabbing}
    .am-clip[data-selected=true]{outline:3px solid #e6b15c;outline-offset:1px}
    .am-clip[data-locked=true]{cursor:not-allowed;opacity:.72;background-image:repeating-linear-gradient(135deg,transparent 0 7px,#fff3 7px 10px)}
    .am-clip .am-envelope{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
    #am-workbench .am-source-remove{padding:0 3px;border:0;background:transparent;color:#806e65;font-size:11px;line-height:1;opacity:.65}
    #am-workbench .am-source-remove:hover,#am-workbench .am-source-remove:focus-visible{opacity:1;color:#8a3f29}
    .am-clip-label{margin-left:20px;display:block;overflow:hidden;text-overflow:ellipsis}
    .am-master{display:flex;align-items:center;gap:7px;font-size:12px;margin:3px 0 7px;flex:0 0 auto;flex-wrap:wrap}
    .am-master input[type=range]{width:90px}.am-master strong{min-width:100px}
    .am-master-picker{display:flex;align-items:center;gap:5px;overflow-x:auto;min-height:35px;flex:0 0 auto;white-space:nowrap}
    .am-master-picker>span{font-size:12px;color:#52615f}
    #am-workbench .am-master-picker button{padding:5px 8px;font-size:11px;flex:0 0 auto}
    #am-workbench .am-master-picker button[aria-pressed=true]{background:#1f5053;color:#fff}
    .am-zone-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:30px;flex-wrap:wrap;font-size:12px}.am-zone-head h3{margin:0;font:700 15px/1.2 -apple-system,system-ui,sans-serif}.am-zoom-tools{display:flex;align-items:center;gap:5px}.am-zoom-tools input[type=range]{width:150px}.am-zoom-tools output{min-width:46px;text-align:right}
    #am-workbench .am-zoom-tools button{padding:5px 8px;font-size:12px}
    .am-sources{display:grid;grid-template-columns:1fr 1fr;gap:8px;flex:0 0 205px;height:205px;min-height:0}
    .am-source-lane{border:1px solid #c9c3b8;border-radius:9px;padding:7px 8px;overflow:auto;min-height:0;background:#f6f2ea;font-size:13px}
    .am-source-lane strong{display:block;margin-bottom:6px}.am-source-list{display:flex;gap:7px;flex-direction:column;align-items:flex-start;min-width:100%}.am-source-paste{position:sticky;left:0;top:0;z-index:4;align-self:flex-start;background:#fff7df!important;box-shadow:0 2px 6px #0002}
    .am-source-clip{width:calc(100% * var(--annex-zoom,1));background:#e4efee;background:color-mix(in srgb,var(--track-color,#1f5053) 13%,white);color:#17393b;border:2px solid var(--track-color,#1f5053);border-radius:8px;padding:7px;cursor:grab;display:grid;gap:4px;min-width:100%}
    .am-source-clip:active{cursor:grabbing}.am-region-label{display:inline-block;margin-right:6px;padding:2px 6px;border-radius:10px;background:var(--track-color);color:#fff;font-style:normal;font-size:10px;font-weight:800}.am-drag-hint{font-size:10px;font-weight:700;color:#52615f;white-space:nowrap}
    .am-source-clip[data-locked=true]{opacity:.7;cursor:not-allowed}.am-source-clip[data-used=true]{background-image:repeating-linear-gradient(135deg,transparent 0 9px,color-mix(in srgb,var(--track-color) 20%,transparent) 9px 13px)}
    .am-source-clip[data-kind=music]{background:#f3e5df;background:color-mix(in srgb,var(--track-color,#8a3f29) 13%,white);border-color:var(--track-color,#8a3f29);color:#4f2d22}.am-source-clip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .am-track-badge{display:inline-grid;place-items:center;min-width:28px;height:22px;padding:0 5px;border-radius:12px;background:var(--track-color);color:#fff;font-size:11px;font-weight:800;flex:0 0 auto}
    .am-source-head,.am-source-actions{display:flex;align-items:center;gap:5px;min-width:0}.am-source-head span{flex:1;font-weight:700}.am-source-actions{flex-wrap:wrap}
    .am-source-wave{width:100%;height:30px;display:block;background:#fffdf9;border-radius:4px;cursor:crosshair;touch-action:manipulation}
    .am-source-cut-time{font-size:11px;white-space:nowrap}.am-source-clip input[type=number]{width:72px;min-width:0;padding:3px;border:1px solid #83918c;border-radius:4px}
    #am-workbench .am-source-clip button{padding:4px 7px;font-size:11px;background:#fffdf9;border-color:currentColor}
    #am-workbench .am-source-clip .am-source-remove{padding:0 3px;border:0;background:transparent;color:inherit;font-size:12px;opacity:.7}
    #am-workbench .am-source-clip .am-source-remove:hover{opacity:1;background:transparent;color:inherit}
    .am-lane[data-master-lane]{outline-offset:-3px}.am-lane.am-drop-target{outline:3px dashed #e6b15c;background:#f8edcf}
    .am-inspector{overflow:auto;min-height:0}.am-inspector .am-track{margin-bottom:0}
    .am-automation{height:90px;position:relative;background:linear-gradient(#f8f6f0,#e7ecea);border:1px solid #adb9b6;border-radius:6px;margin:7px 0;touch-action:none;cursor:crosshair}
    .am-automation svg{width:100%;height:100%;overflow:visible}
    .am-automation circle{fill:#b44e30;stroke:white;stroke-width:2;cursor:grab}
    .am-bottom-tabs{display:flex;gap:7px}.am-bottom-tabs button[aria-selected=true]{background:#1f5053!important;color:#fff!important}
    #am-workbench[data-view=steps] .am-timeline,#am-workbench:not([data-view=steps]) .am-steps-panel{display:none}
    .am-steps-panel{overflow:auto;min-height:150px;flex:1}.am-step{grid-template-columns:56px minmax(0,1fr) 105px 64px;padding:9px 0;font-size:13px}
    .am-step img{width:56px;height:38px}
    .am-ruler,.am-lane{margin-left:120px}.am-lane{height:55px;background-size:100% 100%}
    .am-lane-name{width:112px;right:calc(100% + 7px);top:17px;text-align:left}
    .am-clip{height:38px;top:8px;padding:5px 8px}.am-step-clip{height:30px;top:8px}
    .am-clip[aria-disabled=true]{opacity:.4}.am-step-clip{background:#dce8e6;color:#102f31;border:1px solid #1f5053;cursor:pointer}
    .am-step-resize{position:absolute;right:0;top:0;bottom:0;width:12px;cursor:ew-resize;background:rgba(31,80,83,.2);border-left:1px solid #1f5053;touch-action:none}
    .am-transition-marker{position:absolute;top:34px;transform:translateX(-50%);z-index:3;border-radius:50%!important;padding:0!important;width:22px;height:22px;line-height:18px!important;font-size:12px!important;background:#fff8e8!important;border:2px solid #a45337!important;color:#183d3f!important}
    .am-transition-panel{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:7px 10px;background:#f4e8d9;border:1px solid #c4a88e;border-radius:8px;font-size:13px}
    .am-transition-panel[hidden]{display:none}
    .am-transition-panel label{display:flex;align-items:center;gap:5px}.am-transition-panel select,.am-transition-panel input{font:inherit}.am-transition-panel input{width:68px}
    .am-playhead{position:absolute;top:0;width:2px;height:190px;transform:translateX(-1px);background:#ab4329;box-shadow:0 0 0 1px #fff8;pointer-events:none;z-index:6}
    .am-playhead-handle{position:absolute;left:-6px;top:-2px;width:14px;height:16px;border-radius:50%;background:#ab4329;border:2px solid #fff;box-shadow:0 1px 4px #0005;cursor:ew-resize;touch-action:none;pointer-events:auto}
    #am-status[data-error=1]{color:#8a3f29}#am-status{font-weight:600!important;margin:12px 0 0!important}
    @media(max-width:760px){#am-workbench{height:auto;min-height:760px}.am-grid{grid-template-columns:1fr;flex-basis:auto}.am-grid .am-panel:first-child{display:flex}.am-sources{grid-template-columns:1fr;max-height:220px;overflow:auto}.am-track-fields{grid-template-columns:repeat(2,1fr)}#am-workbench.am-focused{overflow:auto}.am-toolbar-row{gap:4px}}`;
  document.head.appendChild(css);

  const root = document.createElement('section');
  root.id = 'am-workbench';
  root.innerHTML = `<div class="am-track-head"><h2>Atelier Diapos · Montage</h2><button id="am-focus" type="button" aria-pressed="false" data-commande="plein-ecran-banc">Ouvrir le banc plein écran</button></div><p>1. Importez vos sons · 2. Scindez-les en blocs sans supprimer de son · 3. Glissez les blocs sur Voix ou Musique Master · 4. Écoutez le résultat · 5. Sauvegardez ou exportez.</p>
    <div class="am-toolbar"><div class="am-toolbar-row"><span class="am-command-group"><button id="am-undo" class="am-compact" type="button" data-commande="annuler" title="Annuler (⌘Z)" disabled>↶ Annuler</button><button id="am-redo" class="am-compact" type="button" data-commande="retablir" title="Rétablir (⇧⌘Z)" disabled>↷ Rétablir</button></span>
    <span class="am-command-group"><button id="am-save-project" class="am-compact" type="button" data-commande="sauvegarder-projet">💾 Sauvegarder</button><button id="am-open-project" class="am-compact" type="button" data-commande="ouvrir-projet">📂 Ouvrir</button><input class="am-project-input" id="am-project-file" type="file" accept=".json,application/json" aria-label="Fichier projet Atelier Diapos"></span>
    <button id="am-open-voice" type="button" data-commande="importer-voix">Importer une voix…</button><input class="am-file-input" id="am-add-voice" type="file" accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" multiple aria-label="Fichiers voix MP3, M4A ou WAV">
    <button id="am-open-music" type="button" data-commande="importer-musique">Importer une musique…</button><input class="am-file-input" id="am-add-music" type="file" accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" multiple aria-label="Fichiers musique MP3, M4A ou WAV">
    <button id="am-play" class="am-transport" type="button">▶ Lire</button><button id="am-stop" type="button">Arrêter</button>
    <button id="am-export" class="am-export-button" type="button">Exporter le montage en MP4</button><button id="am-cancel-export" type="button" disabled>Annuler l’export</button></div><div class="am-toolbar-row am-edit">
    <button id="am-split" type="button" title="Scinder le clip Master sélectionné en deux blocs au curseur de lecture">✂ Scinder au curseur</button>
    <button id="am-add-point" type="button" title="Créer un point de volume sur le clip sélectionné">+ Point de volume</button>
    <button id="am-marker" type="button" title="La prochaine étape commencera à la position courante">Poser un repère</button>
    <label style="font-size:12px">Baisse musique sous la voix <select id="am-duck"><option value="0.126">−18 dB</option><option value="0.251">−12 dB</option><option value="1">Aucune</option></select></label>
    <label style="font-size:12px" title="Ajuste les fichiers voix à un niveau moyen proche de −20 dBFS, sans pousser leurs crêtes au-delà de −3 dBFS"><input id="am-uniform-voices" type="checkbox" checked> Uniformiser les voix</label>
    <label class="am-command-label">Placement <select id="am-placement-mode" aria-label="Mode de placement"><option value="free">Libre</option><option value="snap">Aimanté</option><option value="insert">Insertion</option></select></label>
    <button id="am-linked-zoom" class="am-compact am-toggle-active" type="button" aria-pressed="true" data-commande="lier-zooms" title="Lier le zoom Master et Annexes">🔗 Zooms liés</button>
    <label class="am-command-label">Aperçu <select id="am-preview-quality"><option value="full">Plein 1080p</option><option value="economy">Économique 540p</option></select></label>
    <label class="am-command-label">Disposition <select id="am-layout-mode"><option value="montage">Montage</option><option value="preview">Aperçu large</option><option value="annexes">Annexes larges</option></select></label>
    <label style="font-size:12px">Durée du film (s) <input id="am-total" type="number" min="1" step="0.1" style="width:78px" aria-label="Durée totale du film"></label>
    <span id="am-clock">00:00 / 00:00</span></div></div>
    <div class="am-grid"><div class="am-panel"><div class="am-track-head"><h3>Aperçu vidéo</h3><button id="am-preview-fullscreen" type="button" title="Agrandir l’aperçu pour vérifier la synchronisation">Agrandir l’aperçu</button></div><canvas id="am-preview" width="1920" height="1080"></canvas>
      <input id="am-seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Position de lecture">
      </div>
    <div class="am-panel am-inspector"><h3>Réglages du clip sur le Master</h3><div id="am-tracks"></div></div></div>
    <div class="am-zone-head"><h3>Timeline Master</h3><div class="am-zoom-tools" aria-label="Zoom précis du Master"><button id="am-zoom-out" type="button" title="Dézoomer le Master">−</button><label>Zoom Master <input id="am-zoom" type="range" min="2" max="720" step="1" value="20" aria-label="Zoom précis de la timeline Master, jusqu’à l’image près"></label><button id="am-zoom-in" type="button" title="Zoomer le Master">+</button><button id="am-zoom-fit" type="button">Tout voir</button><output id="am-zoom-value">20 px/s</output></div></div>
    <div class="am-master"><strong>Voix Master</strong><button type="button" data-master-mute="voice">Muet</button><label>Volume <input type="range" data-master-db="voice" min="-36" max="12" value="0"></label><output id="am-voice-db">0 dB</output>
      <strong>Musique Master</strong><button type="button" data-master-mute="music">Muet</button><label>Volume <input type="range" data-master-db="music" min="-36" max="12" value="0"></label><output id="am-music-db">0 dB</output></div>
    <div id="am-master-picker" class="am-master-picker" aria-label="Sélectionner un clip du Master"></div>
    <div id="am-transition-panel" class="am-transition-panel" hidden><strong id="am-transition-title">Transition</strong><label>Effet <select id="am-transition-type"><optgroup label="Base"><option value="cut">Coupe</option></optgroup><optgroup label="Fondus"><option value="dissolve">Fondu enchaîné</option><option value="blur-cross">Flou croisé</option><option value="fade-black">Fondu au noir</option><option value="fade-white">Fondu au blanc</option></optgroup><optgroup label="Mouvement"><option value="zoom-cross">Zoom croisé</option><option value="wave">Onde</option></optgroup><optgroup label="Balayages"><option value="wipe-left">Balayage à gauche</option><option value="wipe-right">Balayage à droite</option><option value="wipe-up">Balayage en haut</option><option value="wipe-down">Balayage en bas</option></optgroup><optgroup label="Glissements"><option value="slide-left">Glisser à gauche</option><option value="slide-right">Glisser à droite</option></optgroup><optgroup label="Formes"><option value="circle-open">Cercle ouvert</option><option value="circle-close">Cercle fermé</option><option value="portal">Portail</option><option value="mosaic">Mosaïque</option></optgroup><optgroup label="3D"><option value="rotate-in">Rotation intérieure</option><option value="rotate-out">Rotation extérieure</option><option value="exchange">Échange</option><option value="cube">Cube</option><option value="page-previous">Page précédente</option><option value="page-turn">Page tournée</option></optgroup><optgroup label="Puzzle"><option value="puzzle-left">Puzzle gauche</option><option value="puzzle-right">Puzzle droite</option></optgroup></select></label><label>Durée <input id="am-transition-duration" type="number" min="0.1" max="5" step="0.1" value="0.6"> s</label><label>Douceur <select id="am-transition-easing"><option value="linear">Linéaire</option><option value="ease-in">Entrée douce</option><option value="ease-out">Sortie douce</option><option value="ease-in-out">Entrée-sortie douces</option></select></label><button id="am-transition-all" type="button">Appliquer à toutes</button><button id="am-transition-remove-all" type="button">Retirer toutes</button><label>Pause <input id="am-pause-duration" type="number" min="0.1" max="30" step="0.1" value="1"> s</label><button id="am-add-pause" type="button" title="Prolonger la diapositive avant cette jonction">Ajouter la pause</button><span id="am-transition-help">Cliquez sur une jonction entre deux diapositives.</span></div>
    <div class="am-bottom-tabs" role="tablist" aria-label="Vue du montage"><button id="am-view-master" type="button" role="tab" aria-selected="true">Pistes Master</button><button id="am-view-steps" type="button" role="tab" aria-selected="false">Étapes et repères · <span id="am-step-count">0</span> images</button></div>
    <div class="am-timeline" aria-label="Master final du montage"><strong>Master final · voix et musique exportées en un seul mixage</strong><div id="am-minimap" class="am-minimap" aria-label="Mini-carte du projet" role="scrollbar" tabindex="0"><span id="am-minimap-window" class="am-minimap-window"></span></div><div id="am-timeline-inner"><div id="am-ruler" class="am-ruler"></div><div id="am-lanes"></div></div></div>
    <div class="am-panel am-steps-panel" aria-label="Étapes et repères"><p>Réglez l’heure de début de chaque image. « Voir » affiche l’étape dans l’aperçu.</p>
      <div id="am-steps"></div><p id="am-empty">Importez une présentation pour régler ses étapes.</p>
    </div>
    <div class="am-zone-head"><h3>Pistes annexes · scinder en blocs puis glisser sur le Master</h3><div class="am-zoom-tools" aria-label="Zoom puissant des pistes annexes"><button id="am-pause-all" type="button" title="Ajouter la même pause entre toutes les diapositives">⏸ Pauses partout…</button><button id="am-annex-zoom-out" type="button" title="Dézoomer les annexes">−</button><label>Zoom annexes <input id="am-annex-zoom" type="range" min="1" max="100" step="0.5" value="1" aria-label="Zoom puissant des pistes annexes, jusqu’à cent fois"></label><button id="am-annex-zoom-in" type="button" title="Zoomer les annexes">+</button><button id="am-annex-zoom-precision" type="button" title="Afficher dix fois plus large pour placer une scission au centième de seconde">Précision ×10</button><button id="am-annex-zoom-fit" type="button">Tout voir</button><output id="am-annex-zoom-value">×1</output></div></div>
    <div class="am-sources" aria-label="Pistes annexes"><div class="am-source-lane" data-import-lane="voice"><strong>Voix · cliquez dans la forme d’onde, scindez, puis glissez chaque bloc vers le Master</strong><div class="am-source-list" data-source-lane="voice"></div></div>
    <div class="am-source-lane" data-import-lane="music"><strong>Musique · cliquez dans la forme d’onde, scindez, puis glissez chaque bloc vers le Master</strong><div class="am-source-list" data-source-lane="music"></div></div></div>
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
    $('am-seek').max = Math.max(1, duration()); $('am-seek').value = clamp(state.previewAt, 0, duration());
    $('am-total').value = +duration().toFixed(1);
    $('am-step-count').textContent = state.images.length;
    $('am-empty').hidden = !!state.images.length;
    $('am-zoom-value').textContent = `${state.zoom} px/s`;
    $('am-annex-zoom-value').textContent = `×${state.annexZoom}`;
    $('am-zoom').value=state.zoom;$('am-annex-zoom').value=state.annexZoom;$('am-placement-mode').value=state.placementMode;$('am-preview-quality').value=state.previewQuality;$('am-layout-mode').value=state.layoutMode;root.dataset.layout=state.layoutMode;
    $('am-linked-zoom').classList.toggle('am-toggle-active',state.linkedZoom);$('am-linked-zoom').setAttribute('aria-pressed',String(state.linkedZoom));$('am-linked-zoom').textContent=state.linkedZoom?'🔗 Zooms liés':'⛓ Zooms libres';
    for (const kind of ['voice','music']) {
      const sourceClips = state.sources.filter(s=>s.kind===kind).map(s => {
        const region=sourceRegionMeta(s),used=state.tracks.some(t=>(t.sourceId||t.originId)===s.id||(t.originId&&t.originId===(s.originId||s.id)));
        return `<div class="am-source-clip" data-drag-block="true" data-locked="${!!s.locked}" data-used="${used}" role="group" aria-label="${region.track} bloc ${region.blockIndex} sur ${region.blockCount}, glissable vers le Master" data-source="${s.id}" data-kind="${kind}" style="--track-color:${s.color};--annex-zoom:${state.annexZoom}" title="Saisir et glisser ce bloc vers le Master final"><div class="am-source-head"><b class="am-track-badge" style="--track-color:${s.color}" title="Couleur de cette piste">${region.track}</b><span><em class="am-region-label" style="--track-color:${s.color}">Bloc ${region.blockIndex}/${region.blockCount}</em>${esc(s.name)} · ${time(s.out-s.in)}${used?' · utilisé':''}</span><span class="am-drag-hint">☷ Glisser</span><button type="button" data-source-action="mute" data-source-id="${s.id}" title="Muet">${s.muted?'🔇':'🔊'}</button><button type="button" data-source-action="solo" data-source-id="${s.id}" title="Solo" aria-pressed="${!!s.solo}">S</button><button type="button" data-source-action="lock" data-source-id="${s.id}" title="Verrouiller" aria-pressed="${!!s.locked}">${s.locked?'🔒':'🔓'}</button><button type="button" data-source-action="up" data-source-id="${s.id}" title="Monter la piste">↑</button><button type="button" data-source-action="down" data-source-id="${s.id}" title="Descendre la piste">↓</button><button type="button" class="am-source-remove" data-source-action="remove" data-source-id="${s.id}" aria-label="Effacer le bloc annexe ${esc(s.name)}" title="Effacer ce bloc annexe">×</button></div><canvas class="am-source-wave" data-source-wave="${s.id}" width="${Math.min(16000,Math.max(500,Math.ceil(500*state.annexZoom)))}" height="${s.height==='L'?54:s.height==='S'?22:30}" aria-label="Forme d’onde de ${esc(s.name)} ; cliquer pour placer la tête de scission" title="Cliquez sur la forme d’onde à l’endroit où scinder"></canvas><div class="am-source-actions"><label class="am-source-cut-time">Scission à <input type="number" min="0.01" max="${(s.out-s.in-0.01).toFixed(2)}" step="0.01" value="${((s.out-s.in)/2).toFixed(2)}" aria-label="Point de scission précis en secondes"> s</label><label>Gain <input type="number" min="-60" max="12" step="1" value="${s.db}" data-source-field="db" data-source-id="${s.id}"></label><label>Hauteur <select data-source-field="height" data-source-id="${s.id}"><option ${s.height==='S'?'selected':''}>S</option><option ${!s.height||s.height==='M'?'selected':''}>M</option><option ${s.height==='L'?'selected':''}>L</option></select></label><input type="color" value="${s.color}" data-source-field="color" data-source-id="${s.id}" aria-label="Couleur de ${esc(s.name)}"><button type="button" data-source-action="split" data-source-id="${s.id}">✂ Scinder</button><button type="button" data-source-action="copy" data-source-id="${s.id}">Copier</button><button type="button" data-source-action="place" data-source-id="${s.id}" title="Placer ce bloc au curseur sur le Master final">→ Master</button></div></div>`;
      }).join('');
      const paste = state.copiedSource ? `<button class="am-source-paste" type="button" data-source-action="paste" data-source-kind="${kind}">Coller le bloc copié ici</button>` : '';
      root.querySelector(`[data-source-lane="${kind}"]`).innerHTML = paste + (sourceClips || `<span>Aucun son importé. Utilisez le bouton « Importer » ci-dessus ou déposez un fichier MP3, M4A ou WAV ici.</span>`);
    }
    $('am-steps').innerHTML = state.images.map((im, i) => `<div class="am-step" data-step="${i}">
      <img src="${esc(im.url)}" alt=""><span>${i + 1}. ${esc(im.titre || 'Étape')} · diapositive ${(im.cardIndex || 0) + 1}</span>
      <label>Début (s)<input type="number" min="0" step="0.01" value="${state.cuts[i].toFixed(2)}" data-cut="${i}"></label>
      <button type="button" data-focus="${i}">Voir</button></div>`).join('');
    const t = selected(), i = state.tracks.indexOf(t);
    $('am-master-picker').innerHTML = state.tracks.length ? `<span>Clips du Master :</span>${state.tracks.map((clip,index)=>`<button type="button" data-select-track="${index}" aria-pressed="${state.selectedIds.includes(clip.id)||clip.id===state.selectedId}" title="Sélectionner ${esc(clip.name)} à ${time(clip.at)}">${clip.kind==='voice'?'Voix':'Musique'} · ${esc(clip.name)} · ${time(clip.at)}${clip.locked?' · verrouillé':''}</button>`).join('')}` : '<span>Glissez un clip annexe sur le Master, ou utilisez « → Master » pour le placer au curseur.</span>';
    $('am-tracks').innerHTML = !t ? '<p>Sélectionnez un clip dans la chronologie pour le régler.</p>' : `<article class="am-track" data-kind="${t.kind}" data-track="${i}">
      <div class="am-track-head"><strong>${t.kind === 'voice' ? 'Voix' : 'Musique'} ${i + 1} · ${esc(t.name)}</strong>
      <span>${time(clipLength(t))}${t.kind==='voice'&&t.rmsDb!==null?` · source ${t.rmsDb} dBFS · correction auto ${t.autoGainDb>=0?'+':''}${t.autoGainDb} dB`:''}</span><button type="button" data-mute="${i}">${t.muted ? 'Réactiver' : 'Muet'}</button><button type="button" data-solo="${i}" aria-pressed="${!!t.solo}">Solo</button><button type="button" data-lock="${i}" aria-pressed="${!!t.locked}">${t.locked?'Déverrouiller':'Verrouiller'}</button>
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
    for (const source of state.sources) {
      const wave = root.querySelector(`[data-source-wave="${source.id}"]`);
      if (wave) drawWave(source, wave);
    }
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
    const intervals=[1/30,0.1,0.5,1,2,5,10,30,60,120],tickEvery=intervals.find(value=>value*state.zoom>=70)||120;
    const ticks=[];for(let at=0;at<=total+tickEvery/2;at+=tickEvery)ticks.push(`<span class="am-tick" style="left:${at/total*100}%">${state.zoom>=300?timeFrame(at):time(at)}</span>`);
    $('am-ruler').innerHTML = ticks.join('') + `<span class="am-playhead" style="left:${state.previewAt/total*100}%"><span class="am-playhead-handle" role="slider" tabindex="0" aria-label="Tête de lecture du Master" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${state.previewAt.toFixed(2)}" title="Glissez la tête de lecture, ou cliquez dans la timeline"></span></span>`;
    const stepLane = `<div class="am-lane"><span class="am-lane-name">Diapositives</span>${state.images.map((im,i) => {
      const left = state.cuts[i]/total*100, end = (state.cuts[i+1] ?? total)/total*100;
      return `<div class="am-clip am-step-clip" data-focus="${i}" style="left:${left}%;width:${Math.max(0,end-left)}%" title="Étape ${i+1} — glissez le bord droit pour changer sa durée">${i+1}. ${esc(im.titre||'Étape')}<span class="am-step-resize" data-resize-step="${i}" title="Étirer ou raccourcir la diapositive ${i+1}"></span></div>`;
    }).join('')}${state.images.slice(1).map((_,j)=>{const i=j+1,t=state.transitions[i]||{type:'cut'};return `<button type="button" class="am-transition-marker" data-transition="${i}" style="left:${state.cuts[i]/total*100}%" title="Transition ${i} → ${i+1} : ${t.type==='cut'?'coupe franche':t.type}">${t.type==='cut'?'·':'✦'}</button>`;}).join('')}</div>`;
    $('am-lanes').innerHTML = stepLane + ['voice','music'].map(kind => `<div class="am-lane" data-master-lane="${kind}"><span class="am-lane-name">${kind==='voice'?'Voix':'Musique'} Master</span>${state.tracks.map((t,i) => {
      if (t.kind!==kind) return '';
      const left = Math.min(100,t.at/total*100), length = (t.loop ? total-t.at : clipLength(t))/total*100;
      const points = t.automation || [{time:0,db:0},{time:clipLength(t),db:0}];
      return `<div class="am-clip" data-kind="${kind}" data-clip="${i}" data-selected="${state.selectedIds.includes(t.id)||t.id===state.selectedId}" data-locked="${!!t.locked}" aria-disabled="${t.muted}" style="--track-color:${t.color};left:${left}%;width:${Math.max(0,Math.min(100-left,length))}%" title="${t.locked?'Clip verrouillé':'Glisser horizontalement ou vers l’autre piste Master'}"><span class="am-clip-label">${t.locked?'🔒 ':''}${esc(t.name)}</span><svg class="am-envelope" viewBox="0 0 100 50" preserveAspectRatio="none"><polyline points="${points.map(p=>`${p.time/clipLength(t)*100},${7+(12-p.db)/72*35}`).join(' ')}" fill="none" stroke="#f6d386" stroke-width="2"/></svg></div>`;
    }).join('')}</div>`).join('');
    updateMinimap();
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
  function refreshImages() {
    const d = window.__chutier && window.__chutier.dernier();
    if (!d || !d.res || !d.res.images || !d.res.images.length) return;
    state.images.forEach(im => URL.revokeObjectURL(im.url));
    state.images = d.res.images.map(im => ({...im, url: URL.createObjectURL(im.blob)}));
    const n = state.images.length, total = duration();
    state.cuts = Array.from({length:n}, (_, i) => i * total / n);
    state.transitions = Array.from({length:n},()=>({type:'cut',duration:0.6,easing:'linear'}));
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
          state.sources.push({id, originId:id, name:file.name, file, buffer, kind, color:nextTrackColor(kind), height:'M', at:0, in:0,
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
        previewQuality:state.previewQuality,layoutMode:state.layoutMode,transitions:state.transitions,master:state.master,
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
      state.zoom=project.zoom?.master||20;state.annexZoom=project.zoom?.annexes||1;state.linkedZoom=project.zoom?.linked!==false;state.placementMode=project.placementMode||'free';state.previewQuality=project.previewQuality||'full';state.layoutMode=project.layoutMode||'montage';
      state.transitions=(project.transitions||[]).map(transition=>({...transition,params:{...(transition.params||{})}}));state.master=project.master||{voice:{db:0,muted:false},music:{db:0,muted:false}};
      state.selectedId=null;state.selectedIds=[];state.previewAt=0;state.bitmapIndex=-1;$('am-duck').value=String(project.mix?.duck??0.126);$('am-uniform-voices').checked=project.mix?.uniformVoices!==false;
      if($('cv-mp4'))$('cv-mp4').disabled=!state.images.length;applyPreviewQuality();render();drawPreview(0);badge(`Projet restauré : ${state.images.length} images, ${state.sources.length} blocs annexes et ${state.tracks.length} clips Master.`,false);
    }finally{await ctx.close();}
  }
  $('am-save-project').onclick=saveProject;$('am-open-project').onclick=()=>$('am-project-file').click();
  $('am-project-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{await openProject(file);}catch(error){badge(`Ouverture impossible : ${error.message}`,true);}};
  $('am-view-master').onclick = () => { root.dataset.view='master'; $('am-view-master').setAttribute('aria-selected','true'); $('am-view-steps').setAttribute('aria-selected','false'); };
  $('am-view-steps').onclick = () => { root.dataset.view='steps'; $('am-view-master').setAttribute('aria-selected','false'); $('am-view-steps').setAttribute('aria-selected','true'); };
  root.querySelectorAll('[data-import-lane]').forEach(lane => {
    lane.ondragover=e=>{if([...e.dataTransfer?.types||[]].includes('Files')){e.preventDefault();lane.classList.add('am-drop-target');}};
    lane.ondragleave=()=>lane.classList.remove('am-drop-target');
    lane.ondrop=e=>{if(!e.dataTransfer?.files?.length)return;e.preventDefault();lane.classList.remove('am-drop-target');importFiles([...e.dataTransfer.files],lane.dataset.importLane);};
  });
  root.querySelector('.am-sources').onclick = e => {
    const wave=e.target.closest('[data-source-wave]');
    if (wave) {
      const source=state.sources.find(s=>s.id===wave.dataset.sourceWave);
      if (!source) return;
      const rect=wave.getBoundingClientRect(), seconds=(source.out-source.in)*clamp((e.clientX-rect.left)/rect.width,0,1);
      const field=wave.closest('.am-source-clip').querySelector('input[type=number]');
      field.value=clamp(seconds,0.01,source.out-source.in-0.01).toFixed(2);
      badge(`Tête de scission placée à ${field.value} s dans « ${source.name} ». Cliquez sur « Scinder en 2 blocs » : aucun son ne sera supprimé.`,false);
      return;
    }
    const action=e.target.dataset.sourceAction; if (!action) return;
    const source=state.sources.find(s=>s.id===e.target.dataset.sourceId);
    if (action==='place' && source) { const lane=root.querySelector(`[data-master-lane="${source.kind}"]`);const r=lane.getBoundingClientRect(),filmDuration=duration();placeSource(source,lane,filmDuration>0?r.left+r.width*state.previewAt/filmDuration:r.left); }
    if (action==='mute' && source) { checkpoint(`muet de ${source.name}`);source.muted=!source.muted;render(); }
    if (action==='solo' && source) { checkpoint(`solo de ${source.name}`);source.solo=!source.solo;render(); }
    if (action==='lock' && source) { checkpoint(`verrouillage de ${source.name}`);source.locked=!source.locked;render(); }
    if ((action==='up'||action==='down') && source) {
      const from=state.sources.indexOf(source),step=action==='up'?-1:1,to=clamp(from+step,0,state.sources.length-1);
      if(from!==to){checkpoint(`réorganisation de ${source.name}`);state.sources.splice(from,1);state.sources.splice(to,0,source);render();}
    }
    if (action==='remove' && source) { if(source.locked)return badge('Déverrouillez ce bloc avant de le supprimer.',true);checkpoint(`suppression de ${source.name}`);state.sources=state.sources.filter(s=>s.id!==source.id); badge(`Bloc annexe « ${source.name} » effacé. Les clips déjà placés sur le Master restent en place.`,false); render(); }
    if (action==='copy' && source) { state.copiedSource={...source,automation:source.automation.map(p=>({...p}))}; badge(`« ${source.name} » copié.`,false); render(); }
    if (action==='paste' && state.copiedSource) {
      checkpoint('collage d’un bloc annexe');
      const copy={...state.copiedSource,id:crypto.randomUUID(),kind:e.target.dataset.sourceKind,automation:state.copiedSource.automation.map(p=>({...p}))};
      state.sources.push(copy); badge(`Copie ajoutée aux sources ${copy.kind==='voice'?'voix':'musique'}.`,false); render();
    }
    if (action==='split' && source) {
      if(source.locked)return badge('Déverrouillez ce bloc avant de le scinder.',true);
      const field=e.target.parentElement.querySelector('input[type=number]');
      const local=+field.value,length=source.out-source.in;
      if (!Number.isFinite(local)||local<0.01||local>length-0.01) return badge('Point de scission hors du bloc.',true);
      checkpoint(`scission de ${source.name}`);
      const oldOut=source.out, oldIn=source.in;
      const level=automationDb(source,local), points=source.automation;
      const right={...source,id:crypto.randomUUID(),in:oldIn+local,out:oldOut,
        automation:[{time:0,db:level},...points.filter(p=>p.time>local).map(p=>({time:p.time-local,db:p.db}))]};
      source.out=oldIn+local;source.automation=[...points.filter(p=>p.time<local),{time:local,db:level}];
      if(source.kind==='voice'){
        Object.assign(source,voiceLevel(source.buffer,source.in,source.out));
        Object.assign(right,voiceLevel(right.buffer,right.in,right.out));
      }
      state.sources.splice(state.sources.indexOf(source)+1,0,right);
      badge(`Piste scindée en deux blocs à ${local.toFixed(2)} s. Les deux blocs sont conservés et peuvent être glissés séparément sur le Master.`,false);render();
    }
  };
  root.querySelector('.am-sources').onchange = e => {
    const source=state.sources.find(s=>s.id===e.target.dataset.sourceId),field=e.target.dataset.sourceField;if(!source||!field)return;
    if(source.locked){render();return badge('Déverrouillez ce bloc avant de modifier ses réglages.',true);}
    checkpoint(`réglage ${field} de ${source.name}`);
    if(field==='db')source.db=clamp(+e.target.value,-60,12);else source[field]=e.target.value;
    render();
  };
  root.querySelector('.am-sources').ondragstart = e => {
    const clip=e.target.closest('[data-source]'); if (!clip) return;
    e.dataTransfer.setData('text/plain',clip.dataset.source);e.dataTransfer.effectAllowed='copy';
  };
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
    if(e.target.closest('button,input,canvas'))return;
    const clip=e.target.closest('[data-source]');if(!clip)return;
    const id=clip.dataset.source,startX=e.clientX,startY=e.clientY;
    if(state.sources.find(s=>s.id===id)?.locked)return badge('Ce bloc est verrouillé.',true);
    clip.setPointerCapture(e.pointerId);
    clip.onpointerup=up=>{
      clip.onpointerup=null;
      if(Math.hypot(up.clientX-startX,up.clientY-startY)<12)return;
      const lane=[...root.querySelectorAll('[data-master-lane]')].find(row=>{const r=row.getBoundingClientRect();return up.clientX>=r.left&&up.clientX<=r.right&&up.clientY>=r.top&&up.clientY<=r.bottom;});
      const source=state.sources.find(s=>s.id===id);
      if(lane&&source)placeSource(source,lane,up.clientX);
    };
  };
  $('am-lanes').ondragover = e => {
    const lane=e.target.closest('[data-master-lane]'); if (!lane) return;
    e.preventDefault();e.dataTransfer.dropEffect='copy';lane.classList.add('am-drop-target');
  };
  $('am-lanes').ondragleave = e => { const lane=e.target.closest('[data-master-lane]');if(lane&&!lane.contains(e.relatedTarget))lane.classList.remove('am-drop-target'); };
  $('am-lanes').ondrop = e => {
    const lane=e.target.closest('[data-master-lane]');if(!lane)return;
    e.preventDefault();lane.classList.remove('am-drop-target');
    const source=state.sources.find(s=>s.id===e.dataTransfer.getData('text/plain'));if(!source)return;
    placeSource(source,lane,e.clientX);
  };
  $('am-tracks').onchange = e => {
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
  $('am-tracks').oninput = e => {
    if (e.target.dataset.field !== 'db') return;
    const t=state.tracks[+e.target.dataset.track];if(!t)return;
    t.db=clamp(+e.target.value,-60,12);updateLiveGains();
  };
  $('am-tracks').addEventListener('pointerdown', e => {
    if (e.target.dataset.field !== 'db') return;
    const t=state.tracks[+e.target.dataset.track];if(!t||t.locked)return;
    checkpoint(`volume de ${t.name}`);e.target.dataset.historyStarted='true';
  });
  $('am-tracks').onclick = e => {
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
  root.querySelector('.am-master').oninput = e => {
    const kind=e.target.dataset.masterDb; if (!kind) return;
    state.master[kind].db=+e.target.value; $(`am-${kind}-db`).textContent=`${e.target.value} dB`;updateLiveGains();
  };
  root.querySelector('.am-master').onpointerdown = e => {
    const kind=e.target.dataset.masterDb;if(!kind)return;
    checkpoint(`volume du bus ${kind}`);
  };
  $('am-uniform-voices').onchange=()=>{checkpoint('uniformisation des voix');updateLiveGains();render();};
  $('am-duck').onchange=()=>{checkpoint('baisse de la musique sous la voix');updateLiveGains();};
  root.querySelector('.am-master').onclick = e => {
    const kind=e.target.dataset.masterMute; if (!kind) return;
    checkpoint(`muet du bus ${kind}`);
    state.master[kind].muted=!state.master[kind].muted; updateLiveGains();render();
  };
  function setMasterZoom(value,link=true) {
    state.zoom=clamp(Math.round(value),2,720);
    $('am-zoom').value=state.zoom;
    $('am-zoom-value').textContent=`${state.zoom} px/s`;
    if(link&&state.linkedZoom)setAnnexZoom(state.zoom/20,false);
    renderTimeline();
  }
  function setAnnexZoom(value,link=true) {
    state.annexZoom=clamp(Math.round(value*2)/2,1,100);
    $('am-annex-zoom').value=state.annexZoom;
    $('am-annex-zoom-value').textContent=`×${state.annexZoom}`;
    root.querySelectorAll('.am-source-clip').forEach(clip=>clip.style.setProperty('--annex-zoom',state.annexZoom));
    if(link&&state.linkedZoom)setMasterZoom(state.annexZoom*20,false);
  }
  $('am-zoom').oninput = e => setMasterZoom(+e.target.value);
  $('am-zoom-out').onclick = () => setMasterZoom(state.zoom-5);
  $('am-zoom-in').onclick = () => setMasterZoom(state.zoom+5);
  $('am-zoom-fit').onclick = () => setMasterZoom(clamp((root.querySelector('.am-timeline').clientWidth-160)/Math.max(1,duration()),2,720));
  $('am-annex-zoom').oninput = e => setAnnexZoom(+e.target.value);
  $('am-annex-zoom-out').onclick = () => setAnnexZoom(state.annexZoom-(state.annexZoom>=10?5:0.5));
  $('am-annex-zoom-in').onclick = () => setAnnexZoom(state.annexZoom+(state.annexZoom>=10?5:0.5));
  $('am-annex-zoom-precision').onclick = () => setAnnexZoom(10);
  $('am-annex-zoom-fit').onclick = () => setAnnexZoom(1);
  $('am-linked-zoom').onclick=()=>{state.linkedZoom=!state.linkedZoom;$('am-linked-zoom').classList.toggle('am-toggle-active',state.linkedZoom);$('am-linked-zoom').setAttribute('aria-pressed',String(state.linkedZoom));$('am-linked-zoom').textContent=state.linkedZoom?'🔗 Zooms liés':'⛓ Zooms libres';badge(state.linkedZoom?'Zoom Master et Annexes liés.':'Zooms indépendants.',false);};
  $('am-placement-mode').onchange=e=>{checkpoint('mode de placement');state.placementMode=e.target.value;badge(`Mode de placement : ${e.target.selectedOptions[0].textContent}.`,false);};
  function updateMinimap(){
    const timeline=root.querySelector('.am-timeline'),handle=$('am-minimap-window');if(!timeline||!handle)return;
    const max=Math.max(0,timeline.scrollWidth-timeline.clientWidth),ratio=Math.min(1,timeline.clientWidth/Math.max(1,timeline.scrollWidth));
    handle.style.width=`${Math.max(4,ratio*100)}%`;handle.style.left=`${max?timeline.scrollLeft/max*(100-ratio*100):0}%`;
    $('am-minimap').setAttribute('aria-valuenow',String(Math.round(max?timeline.scrollLeft/max*100:0)));
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
  $('am-tracks').ondblclick = e => {
    const t=selected(), panel=e.target.closest('.am-automation'); if (!t||!panel) return;
    if(t.locked)return badge('Déverrouillez ce clip avant de modifier son automatisation.',true);
    checkpoint(`automatisation de ${t.name}`);
    const point=e.target.closest('[data-point]');
    if (point) { const j=+point.dataset.point; if (j>0 && j<t.automation.length-1) t.automation.splice(j,1); }
    else { const r=panel.getBoundingClientRect(); t.automation.push({time:clamp((e.clientX-r.left)/r.width*clipLength(t),0,clipLength(t)),db:clamp(12-(e.clientY-r.top)/r.height*72,-60,12)}); t.automation.sort((a,b)=>a.time-b.time); }
    render();
  };
  $('am-tracks').onpointerdown = e => {
    const dot=e.target.closest('[data-point]'), t=selected(); if (!dot||!t) return;
    if(t.locked)return badge('Déverrouillez ce clip avant de modifier son automatisation.',true);
    checkpoint(`automatisation de ${t.name}`);
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
  function scrubMaster(event,captureTarget) {
    if(state.playing)stopPreview();
    const ruler=$('am-ruler'),rect=ruler.getBoundingClientRect();
    const update=pointer=>seek(clamp((pointer.clientX-rect.left)/Math.max(1,rect.width)*duration(),0,duration()));
    update(event);
    captureTarget.setPointerCapture(event.pointerId);
    captureTarget.onpointermove=update;
    captureTarget.onpointerup=()=>{
      captureTarget.onpointermove=null;captureTarget.onpointerup=null;
      badge(`Tête de lecture placée à ${time(state.previewAt)}.`,false);
    };
  }
  $('am-ruler').onpointerdown = e => scrubMaster(e,$('am-ruler'));
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
    if(e.target.closest('.am-step-clip')||!e.target.closest('[data-clip]')){
      scrubMaster(e,$('am-lanes'));
      return;
    }
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
  $('am-layout-mode').onchange=e=>{checkpoint('disposition du banc');state.layoutMode=e.target.value;root.dataset.layout=state.layoutMode;drawPreview(state.previewAt);badge(`Disposition : ${e.target.selectedOptions[0].textContent}.`,false);};
  $('am-focus').onclick = () => {
    const focused = root.classList.toggle('am-focused');
    $('am-focus').textContent = focused ? 'Fermer le banc plein écran' : 'Ouvrir le banc plein écran';
    $('am-focus').setAttribute('aria-pressed', String(focused));
    drawPreview(state.previewAt);
  };
  document.addEventListener('keydown', e => {
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();return e.shiftKey?redo():undo();}
    if((e.metaKey||e.ctrlKey)&&['+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')$('am-zoom-fit').click();else setMasterZoom(state.zoom*(e.key==='-'?0.8:1.25));return;}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='c'&&state.selectedIds.length){e.preventDefault();state.copiedTracks=state.tracks.filter(t=>state.selectedIds.includes(t.id)).map(cloneItem);badge(`${state.copiedTracks.length} clip(s) Master copié(s).`,false);return;}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='v'&&state.copiedTracks.length){e.preventDefault();checkpoint('collage de clips Master');const first=Math.min(...state.copiedTracks.map(t=>t.at));const copies=state.copiedTracks.map(t=>({...cloneItem(t),id:crypto.randomUUID(),at:Math.max(0,state.previewAt+t.at-first),locked:false}));state.tracks.push(...copies);state.selectedIds=copies.map(t=>t.id);state.selectedId=copies.at(-1).id;render();return;}
    const editing=/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);if(editing)return;
    if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();seek(state.previewAt+(e.key==='ArrowRight'?1:-1)/30);return;}
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
  async function drawPreview(at) {
    if (!state.images.length) return;
    const request = ++state.previewRequest;
    const transition = activeTransition(at);
    if (transition) {
      const [from,to] = await Promise.all([
        createImageBitmap(state.images[transition.i-1].blob),
        createImageBitmap(state.images[transition.i].blob)
      ]);
      if (request === state.previewRequest) paintTransition($('am-preview'),from,to,state.transitions[transition.i].type,transition.p,state.transitions[transition.i].easing);
      from.close(); to.close();
      return;
    }
    let idx = state.cuts.findLastIndex(v => v <= at); idx = Math.max(0, idx);
    if (idx !== state.bitmapIndex) {
      const next = await createImageBitmap(state.images[idx].blob);
      if (request !== state.previewRequest) { next.close(); return; }
      if (state.bitmap) state.bitmap.close(); state.bitmap = next; state.bitmapIndex = idx;
    }
    if (request === state.previewRequest) paint($('am-preview'),state.bitmap);
  }
  function seek(at) { state.previewAt = clamp(at, 0, duration()); drawPreview(state.previewAt); renderClock(); }
  function renderClock() {
    $('am-clock').textContent = `${time(state.previewAt)} / ${time(duration())}`;
    $('am-seek').value = state.previewAt;
    const playhead = root.querySelector('.am-playhead');
    if (playhead) { playhead.style.left = `${state.previewAt / Math.max(1, duration()) * 100}%`; playhead.querySelector('.am-playhead-handle')?.setAttribute('aria-valuenow',state.previewAt.toFixed(2)); }
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
    previewCtx = new (window.AudioContext || window.webkitAudioContext)();
    await previewCtx.resume();
    previewSources = schedule(previewCtx, previewCtx.destination, state.previewAt, true);updateLiveGains();
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
  render();
})();
