const fs = require('node:fs');
const path = require('node:path');

const base = path.join(__dirname, '..');
const html = `<!doctype html>
<html lang="fr" data-atelier-diapos-standalone="true">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Trame — images, voix, rythme</title>
  <style>
    :root{--petrole:#173f42;--petrole2:#1f5053;--bleu:#147db3;--rouge:#b64b2f;--ivoire:#f6f2ea;--papier:#fffdf9;--trait:#c9c3b8;--texte:#273331;--muet:#5d6966}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background-color:var(--ivoire);background-image:linear-gradient(90deg,rgba(246,242,234,.985),rgba(246,242,234,.93)),url("atelier-diapos-fond.jpg");background-size:cover;background-position:72% center;background-repeat:no-repeat;background-attachment:fixed;color:var(--texte);font:16px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    button,input,select{font:inherit}button{border:2px solid var(--petrole2);border-radius:10px;background:var(--papier);color:var(--petrole);font-weight:700;padding:.6rem .85rem;cursor:pointer}button:hover{background:#eaf2f1}button:disabled{opacity:.45;cursor:not-allowed}
    #cv-ecran{width:min(1800px,100%);margin:auto;padding:18px}.cv-entete{position:relative;overflow:hidden;display:flex;align-items:center;gap:18px;justify-content:space-between;border:1px solid #d7cfc3;border-radius:16px;padding:16px 18px;background:linear-gradient(90deg,rgba(255,253,249,.98) 0%,rgba(255,253,249,.93) 55%,rgba(255,253,249,.68) 100%),url("atelier-diapos-fond.jpg") 76% 48%/cover no-repeat;box-shadow:0 10px 30px #4b332512}.cv-identite{display:flex;align-items:center;gap:12px;min-width:0}.cv-logo{width:52px;height:52px;flex:0 0 auto}.cv-entete h1{font:700 clamp(28px,3vw,40px)/1 Georgia,serif;color:#17383a;margin:0}.cv-signature{display:block;margin-top:5px;color:#8a3f29;font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase}.cv-entete p{margin:.35rem 0 0;color:var(--muet)}
    .cv-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.cv-export{background:#a84f34;color:white;border-color:#a84f34}
    .cv-import{position:relative;isolation:isolate;overflow:hidden;margin:14px 0;border:1px solid #d2c5b6;border-radius:18px;padding:20px;background:linear-gradient(90deg,rgba(255,253,249,.98) 0%,rgba(255,253,249,.95) 56%,rgba(255,253,249,.68) 100%),url("assets/trame-presentation.jpg") 76% 54%/cover no-repeat;box-shadow:0 12px 34px rgba(75,51,37,.12)}
    .cv-import::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(120deg,transparent 50%,rgba(182,75,47,.08));pointer-events:none}.cv-import-entete{max-width:700px;margin-bottom:14px}.cv-etape{display:inline-flex;align-items:center;gap:7px;margin-bottom:4px;color:#8a3f29;font-size:11px;font-weight:850;letter-spacing:.16em;text-transform:uppercase}.cv-etape::before{content:"";width:22px;height:2px;background:#b64b2f;border-radius:4px}.cv-import h2{margin:0;color:#17383a;font:700 clamp(22px,2vw,29px)/1.15 Georgia,serif}.cv-import-intro{margin:5px 0 0;color:var(--muet);font-size:14px}.cv-import-barre{display:grid;grid-template-columns:minmax(360px,1.35fr) minmax(280px,.65fr);align-items:stretch;gap:14px}
    #cv-zone{min-width:0;border:1.5px dashed #467477;border-radius:13px;padding:15px 16px;display:flex;align-items:center;justify-content:space-between;gap:14px;background:rgba(247,251,250,.88);box-shadow:inset 0 0 0 1px rgba(255,255,255,.7);transition:background .2s,border-color .2s,transform .2s}#cv-zone:focus-visible{outline:3px solid #9bc9df;outline-offset:3px}.cv-zone-contenu{display:flex;align-items:center;gap:12px;min-width:0}.cv-zone-icone{width:38px;height:38px;display:grid;place-items:center;flex:0 0 auto;border-radius:11px;background:#dce8e6;color:var(--petrole);font-size:21px}.cv-zone-texte{font-weight:760;color:#173f42}.cv-zone-texte small{display:block;margin-top:2px;color:var(--muet);font-size:12px;font-weight:450}.cv-formats{display:block;margin-top:5px;color:#8a3f29;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}#cv-importer{flex:0 0 auto;background:var(--petrole2);color:white;border-color:var(--petrole2);font-size:13px;padding:.55rem .75rem}.cv-reglages{margin:0;border:1px solid rgba(201,195,184,.9);border-radius:13px;padding:11px 13px;background:rgba(255,253,249,.88)}.cv-reglages legend{padding:0 5px;color:#173f42;font:700 15px Georgia,serif}.cv-reglages-ligne{display:grid;grid-template-columns:1fr;gap:9px}.cv-reglage{display:grid;grid-template-columns:minmax(118px,1fr) auto;align-items:center;gap:8px;color:#3d4947;font-size:12px;font-weight:700}.cv-reglage input,.cv-reglage select{height:34px;border:1px solid #b9b2a7;border-radius:8px;background:#fffdf9;color:var(--texte);padding:4px 7px}.cv-reglage input{width:76px}.cv-reglage select{max-width:190px}.cv-reglages-aide{display:block;margin-top:8px;padding-top:7px;border-top:1px solid #e2dbd0;color:var(--muet);font-size:11px}.cv-confidentialite{margin:11px 0 0;display:flex;align-items:center;gap:6px;color:#52615e;font-size:11px}.cv-confidentialite::before{content:"✓";display:grid;place-items:center;width:17px;height:17px;border-radius:50%;background:#dce8e6;color:#173f42;font-weight:900}.survol{outline:4px solid #9bc9df!important;background:#eaf6fb!important;transform:translateY(-1px)}
    #cv-message{margin-top:9px;padding:8px 10px;border-left:4px solid var(--petrole2);background:#eef5f4}.erreur{border-color:var(--rouge)!important;background:#fff1ed!important;color:#7e2e1d}.cv-progres{margin-top:8px}.cv-progres-piste{height:7px;background:#ddd;border-radius:9px;overflow:hidden}.cv-progres-piste span{display:block;height:100%;width:0;background:var(--petrole2);transition:width .15s}
    #cv-vignettes{display:flex;gap:10px;overflow:auto;padding:10px 0}#cv-vignettes figure{margin:0;min-width:150px}#cv-vignettes img{display:block;width:150px;aspect-ratio:16/9;object-fit:contain;background:white;border:1px solid var(--trait)}#cv-vignettes figcaption{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #cv-voile{position:fixed;inset:0;background:rgba(23,63,66,.18);z-index:999;pointer-events:none}.cv-pied{color:var(--muet);font-size:12px;padding:12px 0;text-align:center}
    @media(max-width:900px){.cv-import{background-position:70% center}.cv-import-barre{grid-template-columns:1fr}.cv-reglages-ligne{grid-template-columns:repeat(2,minmax(0,1fr))}.cv-reglage{grid-template-columns:1fr}.cv-reglage input,.cv-reglage select{width:100%;max-width:none}}
    @media(max-width:760px){body{background-position:78% center;background-attachment:scroll}#cv-ecran{padding:8px}.cv-entete{align-items:flex-start;flex-direction:column;background-position:80% center}.cv-logo{width:44px;height:44px}.cv-import{padding:15px;background-position:64% center}#cv-zone{flex-direction:column;align-items:stretch}.cv-zone-contenu{align-items:flex-start}#cv-importer{width:100%}.cv-reglages-ligne{grid-template-columns:1fr}.cv-actions{justify-content:flex-start}}
  </style>
  <script type="application/json" id="adoc-sc-render-manifests">{"manifest-default-001":{"id":"manifest-default-001","schemaVersion":1,"rendererVersion":"1.0.0","templateRef":{"id":"fiche-editoriale","version":1},"brandKitRef":{"id":"atelier-diapos-default","version":1},"tokensSnapshotId":"tokens-atelier-diapos-default-v1","assetsSnapshotId":null,"createdAt":"2026-09-03T09:00:00Z","manifestChecksum":"sha256:531d86a80100df4c521d59e4541e65f4f95893f807061b14511c3830521d59e4"}}</script>
  <script type="application/json" id="adoc-sc-tokens-snapshots">{"tokens-atelier-diapos-default-v1":{"tokensSnapshotId":"tokens-atelier-diapos-default-v1","colors":{"petrol950":"#102f31","petrol900":"#173f42","petrol800":"#1f5053","petrol100":"#dce8e6","terracotta700":"#8a3f29","terracotta600":"#9b4e36","terracotta100":"#f4e5de","ink":"#273331","muted":"#5d6966","stone400":"#a9a49a","stone300":"#c9c3b8","stone200":"#ddd7cc","ivory":"#f6f2ea","paper":"#fffdf9","white":"#ffffff"},"typography":{"headingFontFamily":"Source Serif 4, Georgia, serif","bodyFontFamily":"IBM Plex Sans, system-ui, sans-serif"}}}</script>
</head>
<body>
  <main id="cv-ecran">
    <header class="cv-entete">
      <div class="cv-identite"><img class="cv-logo" src="trame-logo.svg" alt=""><div><h1>Trame</h1><span class="cv-signature">Images · voix · rythme</span><p>Montez simplement vos diapositives, vos voix et vos musiques.</p></div></div>
      <div class="cv-actions"><button id="cv-zip" type="button" disabled>JPEG 1920 × 1080 en ZIP</button><button id="cv-mp4" class="cv-export" type="button" disabled>Exporter le film en MP4</button></div>
    </header>
    <section class="cv-import" aria-labelledby="cv-import-titre">
      <div class="cv-import-entete"><span class="cv-etape">Étape 1</span><h2 id="cv-import-titre">Importer la présentation</h2><p class="cv-import-intro">Commencez par ajouter le document qui contient vos diapositives.</p></div>
      <div class="cv-import-barre">
        <div id="cv-zone" tabindex="0">
          <div class="cv-zone-contenu"><span class="cv-zone-icone" aria-hidden="true">↥</span><span class="cv-zone-texte">Déposez votre présentation ici<small>Ou choisissez le fichier dans votre Mac</small><span class="cv-formats">HTML interactif · Projet JSON</span></span></div>
          <button id="cv-importer" type="button">Choisir un fichier</button>
        </div>
        <fieldset class="cv-reglages"><legend>Réglages de départ</legend><div class="cv-reglages-ligne"><label class="cv-reglage"><span>Durée par image</span><span><input id="cv-duree" type="number" min="1" max="60" step=".5" value="4" aria-label="Durée initiale par image"> s</span></label><label class="cv-reglage"><span>Format des images</span><select id="cv-cadrage"><option value="imovie">iMovie · 1920 × 1080</option><option value="fidele">Format fidèle</option></select></label></div><small class="cv-reglages-aide">Vous pourrez ajuster chaque durée dans la timeline.</small></fieldset>
      </div>
      <p class="cv-confidentialite">Traitement local : votre présentation reste sur cet ordinateur.</p>
      <input id="cv-fichier" type="file" accept=".html,.htm,.json,text/html,application/json" hidden>
      <p id="cv-message" hidden role="status"></p>
      <div id="cv-avancement" class="cv-progres" hidden><span id="cv-avancement-texte">Préparation…</span><div class="cv-progres-piste"><span id="cv-barre"></span></div></div>
      <div id="cv-vignettes" aria-live="polite"></div>
    </section>
    <footer class="cv-pied">Traitement local dans votre navigateur. Vos fichiers ne sont pas envoyés sur Internet.</footer>
  </main>
  <div id="cv-voile" hidden></div>
  <script src="studio-clinique-core.js"></script>
  <script src="atelier-images.js"></script>
  <script src="atelier-muxer.bundle.js"></script>
  <script src="zip-stocke.js"></script>
  <script src="atelier-diapos-base.js"></script>
  <script src="atelier-montage.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(base, 'atelier-diapos.html'), html);
console.log(`Atelier autonome généré (${Buffer.byteLength(html)} octets)`);
