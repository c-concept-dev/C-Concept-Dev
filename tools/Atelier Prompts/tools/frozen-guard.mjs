import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=process.argv.find(arg=>arg.startsWith('--target='))?.slice(9)||path.join(root,'atelier-prompts-v11.5-lot10g-decision-provider.html');
const source=process.argv.find(arg=>arg.startsWith('--source='))?.slice(9);
const baselinePath=path.join(root,'anti-regression-baseline.json');
const specs={
  'moteur Rapide':[
    ['function assemblerRapideAdaptatif(){','async function copierRapideAdaptatif'],
    ['function assemblerRapide(){','async function copierRapide()']
  ],
  'moteur Architecte':[['function archContexte(){','const ARCH_SAUVEGARDE_VERSION=']],
  'moteur Atelier':[['function contexte(demande, format, niveau, champs){','/* ---------------------------------------------------------------------- *\n * 5. MESURES']],
  FORMATS:[['const FORMATS = {','const SCHEMA_JSON =']],
  VERROUS:[['const VERROUS = [','const MODELES =']],
  ARCH_SYSTEM:[['let ARCH_SYSTEM=','const ARCH_LOCAL_FIELDS=']],
  ARCH_SCHEMA:[['const ARCH_SCHEMA=','let ARCH_SYSTEM=']]
};

function extract(text,label,ranges){
  return ranges.map(([start,end])=>{
    const a=text.indexOf(start);assert.notEqual(a,-1,`${label}: début introuvable (${start})`);
    const b=text.indexOf(end,a+start.length);assert.notEqual(b,-1,`${label}: fin introuvable (${end})`);
    return text.slice(a,b);
  }).join('\n<LOT10G-RANGE>\n');
}
function hashes(file){
  const text=fs.readFileSync(file,'utf8');
  return Object.fromEntries(Object.entries(specs).map(([label,ranges])=>[label,crypto.createHash('sha256').update(extract(text,label,ranges)).digest('hex')]));
}

if(process.argv.includes('--write-baseline')){
  assert.ok(source,'--write-baseline exige --source=<fichier>');
  fs.writeFileSync(baselinePath,JSON.stringify({algorithm:'SHA-256',source_filename:path.basename(source),hashes:hashes(source)},null,2)+'\n');
  console.log(`Baseline écrite : ${baselinePath}`);
  process.exit(0);
}

const actual=hashes(target);
const expected=source?hashes(source):JSON.parse(fs.readFileSync(baselinePath,'utf8')).hashes;
for(const label of Object.keys(specs))assert.equal(actual[label],expected[label],`${label} a été modifié`);
console.log(JSON.stringify({status:'OK',algorithm:'SHA-256',target,hashes:actual},null,2));
