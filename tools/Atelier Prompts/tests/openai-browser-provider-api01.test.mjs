import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'atelier-prompts-v11.5-lot10g-decision-provider.html'),'utf8');
const tranche=(a,b)=>{const i=html.indexOf(a);assert.ok(i>=0,`début introuvable: ${a}`);const j=html.indexOf(b,i+a.length);assert.ok(j>i,`fin introuvable: ${b}`);return html.slice(i,j)};

test('OPENAI-01 · le registre expose Anthropic ET OpenAI derrière le même appelFournisseur',()=>{
  const reg=tranche('const FOURNISSEURS_API = {','window.FOURNISSEURS_API = FOURNISSEURS_API;');
  assert.match(reg,/anthropic:\s*\{/);
  assert.match(reg,/openai:\s*\{/);
  assert.match(reg,/transport:transportAnthropic/);
  assert.match(reg,/transport:transportOpenAI/);
  const facade=tranche('async function appelFournisseur(','function obtenirFournisseurActif(');
  assert.match(facade,/const id = params\.fournisseur \|\| 'anthropic'/);
  assert.match(facade,/FOURNISSEURS_API\[id\]/);
  assert.match(facade,/return f\.transport\(appelParams\)/);
});

test('OPENAI-02 · OpenAI utilise Responses API, Bearer auth, store:false et le modèle choisi',()=>{
  const src=tranche('function entetesOpenAI(','async function listerModelesOpenAI(');
  assert.match(src,/Authorization':'Bearer '\+cle/);
  assert.match(src,/https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(src,/const body=\{model:modele,input:demandeUtilisateur,max_output_tokens:maxTokens,store:false\}/);
});

test('OPENAI-03 · la sortie structurée force une fonction non stricte puis repasse par le schéma canonique local',()=>{
  const src=tranche('async function transportOpenAI(','async function listerModelesOpenAI(');
  assert.match(src,/type:'function',name:NOM_OUTIL_SORTIE_STRUCTUREE/);
  assert.match(src,/strict:false/);
  assert.match(src,/tool_choice=\{type:'function',name:NOM_OUTIL_SORTIE_STRUCTUREE\}/);
  assert.match(src,/violationsContreSchema\(schema,objet\)/);
  assert.match(src,/CORRECTION OBLIGATOIRE/);
});

test('OPENAI-04 · clés et modèles persistés sont isolés par fournisseur, sans exigence de préfixe Anthropic',()=>{
  const cfg=tranche('function chargerConfigApi(){','/* Reprise automatique sur erreur transitoire.');
  assert.match(cfg,/atelier\.cle\.\+'?\+?fournisseur|atelier\.cle\.'\+fournisseur/);
  assert.match(cfg,/atelier\.modele\.'\+fournisseur/);
  assert.equal(/sk-ant-/.test(tranche('function enregistrerCle(){','/* Reprise automatique sur erreur transitoire.')),false);
});

test('OPENAI-05 · l’UI adapte console et placeholder au fournisseur actif',()=>{
  const src=tranche('function majTextesFournisseurDynamiques(){','window.majTextesFournisseurDynamiques = majTextesFournisseurDynamiques;');
  assert.match(src,/platform\.openai\.com\/api-keys/);
  assert.match(src,/console\.anthropic\.com/);
  assert.match(src,/sk-proj-/);
});

test('OPENAI-06 · un appel texte réel simulé envoie le bon payload et lit output_text',async()=>{
  const src=tranche('function entetesOpenAI(','async function listerModelesOpenAI(');
  let requete=null;
  const ctx={
    JSON, Object, Array, String, RegExp, structuredClone, AbortController,
    setTimeout, clearTimeout,
    NOM_OUTIL_SORTIE_STRUCTUREE:'sortie_structuree',
    DESCRIPTION_OUTIL_SORTIE_STRUCTUREE:'Sortie',
    attendre:async()=>{},
    qCategorieDepuisStatutHttp:s=>'http_'+s,
    violationsContreSchema:()=>[],
    creerErreurApi:o=>Object.assign(new Error(o.message_utilisateur||o.categorie),o),
    fetch:async(url,options)=>{
      requete={url,options,body:JSON.parse(options.body)};
      return {ok:true,status:200,json:async()=>({status:'completed',usage:{input_tokens:7,output_tokens:3},output:[{type:'message',content:[{type:'output_text',text:'OK OpenAI'}]}]})};
    }
  };
  vm.createContext(ctx);vm.runInContext(src+';globalThis.__transport=transportOpenAI;',ctx);
  const r=await ctx.__transport({cle:'secret-test',modele:'gpt-6.1-sol',maxTokens:64,systeme:'S',contenuUtilisateur:'U',essaisMax:1,delaiMs:1000});
  assert.equal(requete.url,'https://api.openai.com/v1/responses');
  assert.equal(requete.options.headers.Authorization,'Bearer secret-test');
  assert.deepEqual({model:requete.body.model,input:requete.body.input,instructions:requete.body.instructions,store:requete.body.store},{model:'gpt-6.1-sol',input:'U',instructions:'S',store:false});
  assert.equal(r.texte,'OK OpenAI');
  assert.equal(r.tokens.entree,7);
  assert.equal(r.tokens.sortie,3);
});

test('OPENAI-07 · un appel structuré simulé force la fonction et valide ses arguments JSON',async()=>{
  const src=tranche('function entetesOpenAI(','async function listerModelesOpenAI(');
  let body=null;
  const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok']};
  const ctx={JSON,Object,Array,String,RegExp,structuredClone,AbortController,setTimeout,clearTimeout,
    NOM_OUTIL_SORTIE_STRUCTUREE:'sortie_structuree',DESCRIPTION_OUTIL_SORTIE_STRUCTUREE:'Sortie',attendre:async()=>{},qCategorieDepuisStatutHttp:s=>'http_'+s,
    violationsContreSchema:(s,o)=>o&&o.ok===true?[]:['ok manquant'],creerErreurApi:o=>Object.assign(new Error(o.message_utilisateur||o.categorie),o),
    fetch:async(url,options)=>{body=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({status:'completed',usage:{input_tokens:9,output_tokens:5},output:[{type:'function_call',name:'sortie_structuree',arguments:'{"ok":true}'}]})}}
  };
  vm.createContext(ctx);vm.runInContext(src+';globalThis.__transport=transportOpenAI;',ctx);
  const r=await ctx.__transport({cle:'secret-test',modele:'gpt-6.1-sol',maxTokens:128,contenuUtilisateur:'U',schema,effort:'high',essaisMax:1,delaiMs:1000});
  assert.equal(body.tools[0].strict,false);
  assert.equal(body.tool_choice.type,'function');
  assert.equal(body.tool_choice.name,'sortie_structuree');
  assert.equal(body.reasoning.effort,'high');
  assert.equal(r.structure_validee,true);
  assert.equal(r.texte,'{"ok":true}');
});
