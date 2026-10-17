'use strict';
// Local HTTP integration + isolated mutation compilation. No candidate source is mutated.
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert/strict'),Module=require('module');
const ROOT=path.resolve(__dirname,'..'), OLD=path.join(ROOT,'../MONOLITH-v1.0.17');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'ef-v1018-'));
for(const k of Object.keys(process.env)) if(/^(EVIDENCEFORGE|LLM_|ANTHROPIC|OPENAI)/.test(k))delete process.env[k];
const budget={mode:'LIMITED',costBudgetUsd:2}, payload={question:'Comparer les méthodes documentaires disponibles.',files:[{name:'note.md',contentBase64:Buffer.from('Document de référence générique.').toString('base64')}],budget};
const results=[];
const mutants={
 'M-CO-01':['lib/pipeline.js','async function createRunOnly(input) {','async function createRunOnly(input) { await input.assertProviderReady();'],
 'M-CO-02':['server.js','return send(res, 201, await PL.createRunOnly(','PL.advance("unexpected"); return send(res, 201, await PL.createRunOnly('],
 'M-CO-03':['lib/pipeline.js','async function createRunOnly(input) {','async function createRunOnly(input) { await createLlm({}).preflight();'],
 'M-CO-04':['lib/pipeline.js','state: store.publicState(store.read()), documents:','state: (fs.unlinkSync(path.join(store.dir, "state.json")), store.publicState(state)), documents:'],
 'M-CO-05':['server.js','await PL.startRun({','await PL.createRunOnly({'],
 'M-CO-06':['lib/pipeline.js','state: store.publicState(store.read()), documents:','state: Object.assign(store.publicState(store.read()), { status: "READY" }), documents:']
};
let active=null;
async function boot(root,runs,mutant=null,ready=false){
 for(const k of Object.keys(require.cache))if(k.startsWith(root+path.sep))delete require.cache[k];
 process.env.EVIDENCEFORGE_RUNS_ROOT=runs;process.env.EVIDENCEFORGE_PORT='0';
 const counts={advance:0,llm:0,reformulate:0,provider:0};
 const ext=Module._extensions['.js'];
 if(mutant){const [rel,from,to]=mutants[mutant];Module._extensions['.js']=(mod,file)=>{if(file===path.join(root,rel)){const src=fs.readFileSync(file,'utf8');assert(src.includes(from));mod._compile(src.replace(from,to),file);}else ext(mod,file);};}
 try{
 const lm=require(path.join(root,'lib/llm.js'));lm.createLlm=()=>{counts.llm++;throw Error('FORBIDDEN_LLM');};
 const sm=require(path.join(root,'lib/stage-mission.js'));sm.reformulate=()=>{counts.reformulate++;throw Error('FORBIDDEN_REFORMULATION');};
 const pd=require(path.join(root,'lib/provider-diagnostic.js'));const probe=pd.probeWorker;
 pd.probeWorker=async o=>{counts.provider++;return ready?{ready:true,code:'TEST_ONLY_READY',checkedAt:new Date().toISOString()}:probe(o);};
 const pl=require(path.join(root,'lib/pipeline.js'));pl.advance=()=>{counts.advance++; if(!ready)throw Error('FORBIDDEN_ADVANCE');return Promise.resolve();};
 const server=require(path.join(root,'server.js')).server;
 await new Promise((res,rej)=>{server.once('listening',res);server.once('error',rej);});
 await new Promise(r=>setImmediate(r));
 const initialProvider=counts.provider;
 const request=(method,url,body)=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:url,method,headers:{'content-type':'application/json'}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>{try{resolve({status:res.statusCode,data:res.headers['content-type']?.includes('application/json')?JSON.parse(data):data});}catch(e){reject(e);}});});req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('timeout')));req.end(body===undefined?undefined:JSON.stringify(body));});
 active={server,request,counts,initialProvider,pl};return active;
 }finally{Module._extensions['.js']=ext;}
}
async function close(){if(active){const a=active;active=null;await new Promise(r=>a.server.close(r));}}
const norm=o=>Array.isArray(o)?o.map(norm):o&&typeof o==='object'?Object.fromEntries(Object.entries(o).filter(([k])=>!['runId','createdAt','updatedAt','at','atLocal','eventId','missionId','checkedAt','ms','pid','startedAt','port','runsRoot'].includes(k)).map(([k,v])=>[k,norm(v)])):typeof o==='string'?o.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g,'<timestamp>').replace(/efm-\d{8}-[a-f0-9]{8}/g,'<runId>'):o;
async function scenario(mutant=null){
 const runs=fs.mkdtempSync(path.join(scratch,'runs-'));let a=await boot(ROOT,runs,mutant);
 const r=await a.request('POST','/api/runs/create',payload);assert.equal(r.status,201,'CO-01');
 const id=r.data.runId;assert.match(id,/^efm-\d{8}-[a-f0-9]{8}$/,'CO-02');
 const dir=path.join(runs,id);assert(fs.existsSync(path.join(dir,'state.json')),'CO-03');
 const state=JSON.parse(fs.readFileSync(path.join(dir,'state.json')));assert.equal(state.status,'CREATED');assert.equal(state.stage,'MISSION');assert.equal(state.attempts,0);assert.equal(state.mission.reformulated,null);
 assert(Object.values(state.stages).every(s=>s.status==='PENDING'));
 const list=await a.request('GET','/api/runs');assert(list.data.runs.some(x=>x.runId===id),'CO-04');
 const detail=await a.request('GET','/api/runs/'+id);assert.deepEqual(r.data.state,detail.data,'CO-05/06');
 assert.equal(a.counts.llm,0,'CO-06');assert.equal(a.counts.reformulate,0,'CO-07');assert.equal(a.counts.advance,0,'CO-08');assert.equal(a.counts.provider,a.initialProvider,'CO-09');
 const cost=await a.request('GET','/api/runs/'+id+'/cost');assert.equal(detail.data.cost.totalUsd,null,'canonical absent ledger');assert.equal(detail.data.cost.realCalls,null);assert.equal(state.counters.llmReal,0,'CO-10');assert(!fs.existsSync(path.join(dir,'cost-ledger.jsonl')));
 const rejected={...payload,files:[{name:'x.pdf',contentBase64:'eA=='}]};
 assert.equal((await a.request('POST','/api/runs/create',rejected)).data.error,'DOCUMENTS_REJECTED','CO-11');
 const ack=await a.request('POST','/api/runs/create',{...rejected,acknowledgeRejected:true});assert.equal(ack.status,201);assert.equal(ack.data.rejected.length,1);
 for(const b of [null,{}, {mode:'LIMITED',costBudgetUsd:0},{mode:'LIMITED',costBudgetUsd:2,warningThresholdUsd:2},{mode:'UNLIMITED_CONFIRMED',confirmedUnlimited:false}]){
 const n=fs.readdirSync(runs).length;const x=await a.request('POST','/api/runs/create',{...payload,budget:b});assert.equal(x.status,400,'CO-12');assert.match(x.data.error,/^BUDGET_(REQUIRED|INVALID)$/);assert.equal(fs.readdirSync(runs).length,n,'invalid budget leaves no artifact');}
 assert.equal((await a.request('POST','/api/runs/create',{...payload,question:'x'})).data.error,'MISSION_INVALID','CO-13');
 const legacy=await a.request('POST','/api/runs',payload);assert.equal(legacy.status,409,'CO-16');assert.equal(legacy.data.error,'PROVIDER_NOT_READY');assert.equal(a.counts.advance,0);
 await close();a=await boot(ROOT,runs,mutant);const restarted=await a.request('GET','/api/runs/'+id);assert.deepEqual(restarted.data,detail.data,'CO-14');assert.equal(a.counts.advance,0);await close();
 a=await boot(ROOT,runs,mutant,true);const historical=await a.request('POST','/api/runs',payload);assert.equal(historical.status,201,'CO-15');assert.equal(a.counts.advance,1,'CO-17');assert(!('state' in historical.data),'legacy response unchanged');
 const equivalent=await a.request('POST','/api/runs/create',payload);const {state:equivalentState,...equivalentResult}=equivalent.data;assert.deepEqual(norm(equivalentResult),norm(historical.data),'canonical creation response parity');
 assert.deepEqual(norm(equivalentState),norm((await a.request('GET','/api/runs/'+historical.data.runId)).data),'canonical initial public state parity');
 for(const f of ['state.json','documents-chunks.json','budget.json','pricing-snapshot.json']){const left=path.join(runs,equivalent.data.runId,f),right=path.join(runs,historical.data.runId,f);assert.equal(fs.existsSync(left),fs.existsSync(right));if(fs.existsSync(left))assert.deepEqual(norm(JSON.parse(fs.readFileSync(left))),norm(JSON.parse(fs.readFileSync(right))),f);}
 for(const body of [{...payload,budget:{costBudgetUsd:3}},{...payload,budget:{mode:'UNLIMITED_CONFIRMED',confirmedUnlimited:true}},{...payload,files:[]},{...payload,files:[{name:'empty.txt',contentBase64:''}]},{...payload,files:[{name:'large.txt',contentBase64:Buffer.alloc(2000001,120).toString('base64')}]},{...payload,files:[...payload.files,{name:'reject.pdf',contentBase64:'eA=='}],acknowledgeRejected:true}]){const old=await a.request('POST','/api/runs',body),fresh=await a.request('POST','/api/runs/create',body);const copy={...fresh.data};delete copy.state;assert.deepEqual(norm({status:fresh.status,data:copy}),norm(old),'document/budget differential');}
 await close();
 return {runId:id,runs,state:r.data.state,cost:cost.data};
}
async function differential(){
 const answers=[];
 for(const root of [OLD,ROOT]){
 const runs=fs.mkdtempSync(path.join(scratch,'diff-'));const a=await boot(root,runs,null,true);
 const created=await a.request('POST','/api/runs',payload);assert.equal(created.status,201);const id=created.data.runId;
 const cases=[['GET','/'],['GET','/index.html'],['GET','/api/config'],['GET','/api/provider'],['POST','/api/preflight',{}],['POST','/api/runs',{...payload,question:'x'}],['POST','/api/runs',{...payload,files:[{name:'x.pdf',contentBase64:'eA=='}]}],['POST','/api/runs',{...payload,budget:null}],['POST','/api/documents/preview',payload],['POST','/api/reports/import',{}],['GET','/api/runs'],...['','log','gate','cost','economics','projection','report','artifacts','artifacts/state.json','artifacts/absent.json','evidence/absent'].map(x=>['GET','/api/runs/'+id+(x?'/'+x:'')]),...['confirm-plan','ratify-sources','confirm-economics','replay-reviews','budget','stop','resume'].map(x=>['POST','/api/runs/'+id+'/'+x,{}]),['GET','/unknown']];
 const sse=await new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port:a.server.address().port,path:'/api/runs/'+id+'/events'},res=>{let text='';res.on('data',b=>{text+=b;const line=/^data: (.+)\n/m.exec(text);if(line){resolve(JSON.parse(line[1]));req.destroy();}});});req.on('error',reject);});
 const rows=[{method:'GET',url:'/api/runs/:id/events',firstEvent:norm(sse)}];for(const [method,url,body]of cases){const r=await a.request(method,url,body);if(url==='/api/config'){assert.equal(r.data.version,root===OLD?'MONOLITH-v1.0.17':'MONOLITH-v1.0.19');r.data.version='<expected-version>';}rows.push({method,url:url.replaceAll(id,':id'),...norm(r)});}
 const files=fs.readdirSync(path.join(runs,id)).filter(f=>f.endsWith('.json')).map(f=>[f,norm(JSON.parse(fs.readFileSync(path.join(runs,id,f))))]);
 answers.push({creation:norm(created),rows,files});await close();}
 assert.deepEqual(answers[1],answers[0],'historical differential');return answers[1];
}
(async()=>{try{
 const oldServer=fs.readFileSync(path.join(OLD,'server.js'),'utf8'),newServer=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');
 const routeStart=newServer.indexOf('    /* v1.0.18 : creation seule');const routeEnd=newServer.indexOf('    if (m === "POST" && p === "/api/runs")',routeStart);
 assert.equal(newServer.slice(0,routeStart)+newServer.slice(routeEnd),oldServer,'all historical server routes byte-identical');
 const oldPipe=fs.readFileSync(path.join(OLD,'lib/pipeline.js'),'utf8'),newPipe=fs.readFileSync(path.join(ROOT,'lib/pipeline.js'),'utf8');
 const addStart=newPipe.indexOf('\n/** v1.0.18 : creation locale'),addEnd=newPipe.indexOf('\nfunction loadDocuments',addStart);
 assert.equal((newPipe.slice(0,addStart)+newPipe.slice(addEnd)).replace('module.exports = { createRunOnly,','module.exports = {'),oldPipe,'historical pipeline byte-identical');
 const added=newPipe.slice(addStart,addEnd);assert(!/Electron|React|JMMJS/.test(added));
 const baseline=await scenario();results.push({id:'BASELINE',ok:true,baseline});
 const diff=await differential();results.push({id:'DIFFERENTIAL',ok:true,diff});
 for(const id of Object.keys(mutants)){let killed=false,error=null;try{await scenario(id);}catch(e){killed=true;error=e.message;}finally{await close();}results.push({id,killed,error});assert(killed,id+' survived');}
 const out={passed:true,results,scope:'Loopback HTTP, real persistence; provider readiness and advance simulated only for historical success compatibility. No real provider.'};
 fs.writeFileSync(path.join(__dirname,'results-v1018-create-only.json'),JSON.stringify(out,null,2)+'\n');console.log('CREATE_ONLY_PASS: baseline, differential, 6/6 mutants killed');
}catch(e){await close();console.error(e);process.exitCode=1;}finally{fs.rmSync(scratch,{recursive:true,force:true});}})();
