import test from "node:test"; import assert from "node:assert/strict"; import {readFileSync} from "node:fs"; import {runInNewContext} from "node:vm";
const c={};c.globalThis=c;runInNewContext(readFileSync("src/core/tourism-services-core.js","utf8"),c);const {mergeTourismPois,describePoi}=c.JMMJSTourismServicesCore;
test("D048 fusion doublons",()=>{const r=mergeTourismPois([[{name:"Musée",type:"Patrimoine",lat:43,lon:1,distance:80,source:"Geoapify"}],[{name:"Musee",type:"Patrimoine",lat:43.0001,lon:1.0001,distance:85,source:"DATAtourisme"}]]);assert.equal(r.length,1);assert.match(r[0].source,/DATAtourisme/)});
test("D048 filtre distance",()=>assert.equal(mergeTourismPois([[{name:"Loin",type:"Café",lat:43,lon:1,distance:350}]]).length,0));
test("D048 inconnues",()=>{const v=describePoi({hours:null,accessibility:"unknown"});assert.equal(v.hoursLabel,"Horaires non documentés");assert.equal(v.accessibilityLabel,"Accessibilité inconnue")});
