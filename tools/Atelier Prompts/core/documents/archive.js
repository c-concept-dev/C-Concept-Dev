/* ZIP is a local container, never an instruction or an executable.
 * Validate the central directory before inflation; enforce actual output bounds
 * during inflation as well, rather than trusting declared uncompressed sizes. */
export const ZIP_LIMITS = Object.freeze({ compressed: 40 * 1024 * 1024,
  expanded: 64 * 1024 * 1024, file: 40 * 1024 * 1024, entries: 200, files: 100 });
const fail = message => { throw new Error(message); };
const abort = signal => { if(signal?.aborted)throw new DOMException('Lecture annulée','AbortError'); };
const crcTable = Uint32Array.from({length:256},(_,n)=>{
  for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;
  return n>>>0;
});
function updateCRC(crc,bytes){for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return crc;}
function nameOf(bytes){
  // Some writers store UTF-8 without its flag. Decode strictly, never guess a legacy encoding.
  let name;
  try{name=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{fail('Nom ZIP ancien non UTF-8 : recréez l’archive en UTF-8.');}
  if(!name||name.length>512||/[\\:\x00-\x1f\x7f]/.test(name)||name.startsWith('/')||
    name.replace(/\/$/,'').split('/').some(p=>!p||p==='.'||p==='..'))fail('Chemin dangereux ou ambigu dans le ZIP.');
  return name;
}
const technical = name => name.split('/').some(p=>p==='__MACOSX'||p==='.DS_Store'||p==='Thumbs.db'||p.startsWith('._'));

export async function expandZip(file,{signal,progress=()=>{},inflateLoader=()=>import('./vendor/fflate.mjs')}={}){
  if(file.size>ZIP_LIMITS.compressed)fail('ZIP supérieur à 40 Mo. Séparez les documents.');
  abort(signal);
  const bytes=new Uint8Array(await file.arrayBuffer()), view=new DataView(bytes.buffer);
  const range=(p,n)=>{if(p<0||n<0||p+n>bytes.length)fail('Archive ZIP tronquée ou invalide.');};
  const u16=p=>{range(p,2);return view.getUint16(p,true);};
  const u32=p=>{range(p,4);return view.getUint32(p,true);};
  let end=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){
    if(u32(p)===0x06054b50&&p+22+u16(p+20)===bytes.length){end=p;break;}
  }
  if(end<0)fail('Archive ZIP invalide : répertoire final absent.');
  const count=u16(end+10), size=u32(end+12), start=u32(end+16);
  if(u16(end+4)||u16(end+6)||u16(end+8)!==count)fail('ZIP multi-volumes non pris en charge.');
  if(count===65535||size===0xffffffff||start===0xffffffff)fail('ZIP64 non pris en charge.');
  if(count>ZIP_LIMITS.entries)fail('ZIP trop fourni : 200 entrées maximum, dont 100 fichiers.');
  if(start+size!==end)fail('Répertoire ZIP incohérent ou ZIP64 non pris en charge.');
  range(start,size);
  const entries=[],names=new Set(),ignored=[];let pos=start,declared=0,files=0;
  for(let i=0;i<count;i++){
    range(pos,46);if(u32(pos)!==0x02014b50)fail('Répertoire ZIP endommagé.');
    const flags=u16(pos+8),method=u16(pos+10),crc=u32(pos+16),packed=u32(pos+20),plain=u32(pos+24);
    const nl=u16(pos+28),el=u16(pos+30),cl=u16(pos+32),local=u32(pos+42);
    range(pos+46,nl+el+cl);
    if(pos+46+nl+el+cl>end)fail('Entrée ZIP hors répertoire.');
    if(flags&0x2041)fail('ZIP chiffré ou protégé par mot de passe non pris en charge.');
    if(u16(pos+34)||packed===0xffffffff||plain===0xffffffff||local===0xffffffff)fail('ZIP64 ou multi-volumes non pris en charge.');
    if(![0,8].includes(method))fail('Méthode de compression ZIP non prise en charge.');
    if(method===8&&packed===0)fail('Flux compressé ZIP absent.');
    const nameBytes=bytes.subarray(pos+46,pos+46+nl),name=nameOf(nameBytes),key=name.normalize('NFC');
    if(names.has(key))fail('Noms de fichiers dupliqués dans le ZIP.');names.add(key);
    if(((u32(pos+38)>>>16)&0xf000)===0xa000)fail('Liens symboliques interdits dans le ZIP.');
    declared+=plain;
    if(plain>ZIP_LIMITS.file||declared>ZIP_LIMITS.expanded)fail('ZIP trop volumineux après décompression (64 Mo au total, 40 Mo par fichier).');
    range(local,30);if(u32(local)!==0x04034b50||u16(local+6)!==flags||u16(local+8)!==method)fail('En-têtes ZIP incohérents.');
    const lnl=u16(local+26),lel=u16(local+28),data=local+30+lnl+lel;
    range(local+30,lnl+lel);range(data,packed);
    if(data+packed>start||lnl!==nl||nameBytes.some((b,k)=>b!==bytes[local+30+k]))fail('Données ou noms ZIP incohérents.');
    if(!(flags&8)&&(u32(local+14)!==crc||u32(local+18)!==packed||u32(local+22)!==plain))fail('Tailles ou CRC ZIP incohérents.');
    const directory=name.endsWith('/');
    if(directory&&plain!==0)fail('Dossier ZIP contenant des données inattendues.');
    if(!directory&&++files>ZIP_LIMITS.files)fail('ZIP trop fourni : 100 fichiers maximum.');
    entries.push({name,local,data,packed,plain,crc,method,directory,skip:technical(name)});
    pos+=46+nl+el+cl;
  }
  if(pos!==end)fail('Nombre d’entrées ZIP incohérent.');
  const ordered=[...entries].sort((a,b)=>a.local-b.local);
  for(let i=1;i<ordered.length;i++)if(ordered[i].local<ordered[i-1].data+ordered[i-1].packed)fail('Entrées ZIP superposées.');
  const {Inflate}=await inflateLoader();abort(signal);
  const result=[];let total=0;
  for(const entry of entries){
    abort(signal);progress(`Ouverture du ZIP : ${entry.name}`);
    if(entry.directory||entry.skip){if(entry.skip&&!entry.directory)ignored.push(entry.name);continue;}
    const chunks=[];let length=0,crc=-1;
    const accept=chunk=>{
      length+=chunk.length;total+=chunk.length;
      if(length>entry.plain||length>ZIP_LIMITS.file||total>ZIP_LIMITS.expanded)fail('Décompression ZIP excessive ou taille déclarée falsifiée.');
      crc=updateCRC(crc,chunk);chunks.push(chunk.slice());
    };
    if(entry.method===0)accept(bytes.subarray(entry.data,entry.data+entry.packed));
    else {
      const stream=new Inflate(accept);
      // Small compressed chunks bound a single inflater allocation even for a bomb.
      for(let offset=0;offset<entry.packed;offset+=1024){
        abort(signal);
        stream.push(bytes.subarray(entry.data+offset,entry.data+Math.min(offset+1024,entry.packed)),offset+1024>=entry.packed);
        if(offset%32768===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    if(length!==entry.plain||((crc^-1)>>>0)!==entry.crc)fail('Fichier ZIP corrompu (taille ou CRC invalide).');
    // Prefix prevents filenames from impersonating the app's reserved AI-cycle naming convention.
    result.push(new File(chunks,`ZIP — ${file.name} / ${entry.name}`));
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  abort(signal);
  if(!result.length)fail('ZIP sans document : seuls des dossiers ou fichiers techniques sont présents.');
  return {files:result,ignored};
}
