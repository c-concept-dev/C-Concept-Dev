const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../../tools/Projet therapeutes/bibliotheque-admin.html'), 'utf8');
const code = html.slice(html.indexOf('async function testSearch()'), html.indexOf('// ── Auto-detect metadata'));
async function run(statuses, payloadError = false) {
    const elements = {searchQuery:{value:'ADHD marriage'}, searchApproach:{value:''}, searchTopK:{value:'5'}, searchResults:{innerHTML:''}};
    let calls = 0, columns = 0;
    const ctx = vm.createContext({
        document:{getElementById:id=>elements[id]},
        getAdminApiKey:async()=>'', adminApiKey:'', getWorkerUrl:()=> 'https://test.invalid',
        fetch:async(url, init)=>{
            const body = JSON.parse(init.body);
            if (url.endsWith('/rag-search')) { assert.equal(body.language, 'all'); assert.equal(body.target_lang, 'fr'); }
            const status=statuses[calls++];
            return {ok:status===200,status,json:async()=>payloadError?{error:'failure'}:{results:[],chunks:[]}};
        }, escHtml:s=>s, log:()=>{}, renderSearchColumn:()=>{columns++; return 'Aucun résultat';}
    });
    vm.runInContext(code,ctx);
    await ctx.testSearch();
    return {text:elements.searchResults.innerHTML,columns};
}
(async()=>{
    for (const statuses of [[401,200],[200,401],[403,403],[500,200],[200,429]]) {
        const result=await run(statuses);
        assert.equal(result.columns,0);
        assert.match(result.text,/HTTP/);
        assert.ok(!result.text.includes('Aucun résultat'));
        if(statuses.includes(401)||statuses.includes(403)) assert.match(result.text,/accès refusé/);
    }
    assert.equal((await run([200,200])).columns,3);
    assert.equal((await run([200,200],true)).columns,0);
    console.log('PASS: 401/403/429/500 visibles, succès vide distingué, erreur JSON visible, langue all conservée.');
})().catch(e=>{console.error(e);process.exitCode=1;});
