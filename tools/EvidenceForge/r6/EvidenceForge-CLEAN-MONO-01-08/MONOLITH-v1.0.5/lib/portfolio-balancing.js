"use strict";
/** Deterministic proposal only. No I/O, provider, human identity or ratification. */
const { redundancyGroups, DEFAULTS: REVIEW_DEFAULTS } = require('./corpus-portfolio-review.js');
const crypto = require('crypto');
const hash = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const POLICY = Object.freeze({ coverageTargetFactor: 0.5, minimumIndependentSources: 2, overRepresentationFactor: 2, swapSimilarityThreshold: 0.85 });
const rank = x => ({ haute: 3, moyenne: 2, basse: 1 }[x] || 0);
const clone = x => JSON.parse(JSON.stringify(x));

function balancePortfolio({ sources, dimensions, evidence, review, config = {} }) {
  const policy = Object.assign({}, POLICY, config);
  for (const k of Object.keys(POLICY)) if (!Number.isFinite(policy[k]) || policy[k] <= 0) throw new Error('INVALID_BALANCING_POLICY: ' + k);
  if (policy.swapSimilarityThreshold > 1 || !Number.isInteger(policy.minimumIndependentSources)) throw new Error('INVALID_BALANCING_POLICY');
  const ids = [...new Set(dimensions.map(d => d.id))];
  const proposals = new Map(evidence.proposals.map(p => [p.sourceId, clone(p)]));
  const assessments = new Map((review.domainVsMethod || []).map(a => [a.sourceId, a]));
  const rows = sources.map(s => {
    const p = proposals.get(s.sourceId), a = assessments.get(s.sourceId);
    const validEvidence = a && Array.isArray(a.evidence) && a.evidence.length > 0 && a.evidence.every(e => typeof e === 'string' && e.trim() && ((s.titre || '') + '\n' + (s.resume || '')).includes(e));
    const assessedAngles = validEvidence && Array.isArray(a.anglesConcernes) ? [...new Set(a.anglesConcernes.filter(d => ids.includes(d)))] : [];
    const direct = validEvidence && a.domainRelevance === 'haute';
    const method = validEvidence && a.methodologicalRelevance === 'haute' && typeof a.methodologicalInterest === 'string' && a.methodologicalInterest.trim().length > 0;
    const admissible = !!(p && p.proposed === 'exclu' && assessedAngles.length && (direct || method));
    // Query lineage is a fallback, explicitly distinguished from evaluated multi-angle coverage.
    const angles = assessedAngles.length ? assessedAngles : ids.includes(s.discipline) ? [s.discipline] : [];
    return { s, p, a, angles, angleBasis: assessedAngles.length ? 'EVALUATED_METADATA' : 'QUERY_LINEAGE_ONLY', admissible,
      quality: p && p.proposed === 'inclus' ? rank(p.confiance) : direct ? 3 : method ? 2 : 0,
      methodOutsideDomain: !!(method && a.domainRelevance !== 'haute') };
  });
  const originalIncluded = rows.filter(r => r.p && r.p.proposed === 'inclus').length;
  const target = Math.max(1, originalIncluded / Math.max(1, ids.length) * policy.coverageTargetFactor);
  function metrics() {
    const included = rows.filter(r => r.p && r.p.proposed === 'inclus');
    const map = Object.fromEntries(ids.map(id => [id, { dimensionId: id, label: (dimensions.find(d => d.id === id) || {}).label || id, found: 0, proposedIncluded: 0, weightedIncluded: 0, includedSourceIds: [], targetWeight: target }]));
    rows.forEach(r => r.angles.forEach(id => { map[id].found++; if (r.p && r.p.proposed === 'inclus') { map[id].proposedIncluded++; map[id].weightedIncluded += 1 / r.angles.length; map[id].includedSourceIds.push(r.s.sourceId); } }));
    const totalWeight = Object.values(map).reduce((n,c) => n+c.weightedIncluded,0);
    Object.values(map).forEach(c => { c.under = c.weightedIncluded + 1e-9 < target || c.proposedIncluded < policy.minimumIndependentSources; c.shareOfIncluded = totalWeight ? c.weightedIncluded / totalWeight : 0; c.over = c.shareOfIncluded > policy.overRepresentationFactor / Math.max(1,ids.length); });
    const types = {}; included.forEach(r => { const t=r.s.type || '(type inconnu)'; types[t]=(types[t]||0)+1; });
    return { map, totalIncluded: included.length, concentration: Object.values(map).reduce((n,c)=>n+c.shareOfIncluded**2,0), diversity: { counts: types, distinctTypes: Object.keys(types).length } };
  }
  const deficit = m => Object.values(m.map).reduce((n,c)=>n+Math.max(0,target-c.weightedIncluded)/target+Math.max(0,policy.minimumIndependentSources-c.proposedIncluded)/policy.minimumIndependentSources,0);
  const before = metrics(), adjustments = [], considered = [];
  const candidates = rows.filter(r => r.p && r.p.proposed === 'exclu');
  candidates.forEach(r => considered.push({ sourceId:r.s.sourceId, angles:r.angles, admissible:r.admissible, qualityRank:r.quality, confidenceOfOriginalExclusion:r.p.confiance || null, methodologicalOutsideDomain:r.methodOutsideDomain,
    reason:r.admissible?'HIGH_RELEVANCE_WITH_LITERAL_EVIDENCE':'NO_ADMISSIBLE_RELEVANCE_EVIDENCE' }));
  while (true) {
    const current=metrics();
    const options=candidates.filter(r=>r.admissible && r.p.proposed==='exclu' && r.angles.some(d=>current.map[d].under)).map(r=>{
      r.p.proposed='inclus'; const after=metrics(); r.p.proposed='exclu';
      return {r,gain:deficit(current)-deficit(after),newType:current.diversity.counts[r.s.type||'(type inconnu)']?0:1};
    }).filter(x=>x.gain>1e-9).sort((a,b)=>b.r.quality-a.r.quality || b.gain-a.gain || b.newType-a.newType || a.r.s.sourceId.localeCompare(b.r.s.sourceId));
    if (!options.length) break;
    const candidate=options[0].r;
    const included=rows.filter(r=>r.p && r.p.proposed==='inclus');
    const red=redundancyGroups(included.map(r=>r.s),Object.assign({},REVIEW_DEFAULTS,{redundancySimilarityThreshold:policy.swapSimilarityThreshold}));
    let donor=null, witness=null;
    for (const d of included.slice().sort((a,b)=>a.quality-b.quality || a.s.sourceId.localeCompare(b.s.sourceId))) {
      if (d.quality>candidate.quality || !d.angles.some(id=>current.map[id].over)) continue;
      const pair=red.pairs.find(p=> {
        const otherId=p.a===d.s.sourceId?p.b:p.b===d.s.sourceId?p.a:null;
        const w=included.find(x=>x.s.sourceId===otherId);
        return w && d.s.type && w.s.type===d.s.type && d.angles.every(id=>w.angles.includes(id));
      });
      if (!pair) continue;
      d.p.proposed='exclu'; candidate.p.proposed='inclus'; const trial=metrics();
      d.p.proposed='inclus'; candidate.p.proposed='exclu';
      const safe=ids.every(id=>trial.map[id].weightedIncluded+1e-9>=Math.min(target,current.map[id].weightedIncluded) && trial.map[id].proposedIncluded>=Math.min(policy.minimumIndependentSources,current.map[id].proposedIncluded));
      if(safe && deficit(trial)<deficit(current)-1e-9 && trial.concentration<=current.concentration+1e-9 && trial.diversity.distinctTypes>=current.diversity.distinctTypes) { donor=d; witness=pair; break; }
    }
    candidate.p.proposed='inclus'; if(donor) donor.p.proposed='exclu';
    const reason='Pertinence '+(candidate.methodOutsideDomain?'méthodologique haute et transposable':'du domaine haute')+' étayée par des extraits ; améliore les angles sous-couverts : '+candidate.angles.filter(d=>current.map[d].under).join(', ')+'. Proposition à ratifier.';
    const adjusted=[{row:candidate,to:'inclus',reason}];
    if(donor) adjusted.push({row:donor,to:'exclu',reason:'Swap proposé : similarité lexicale directe avec '+(witness.a===donor.s.sourceId?witness.b:witness.a)+', angle surreprésenté ; couverture et diversité préservées. Redondance à vérifier humainement.'});
    adjusted.forEach(({row,to,reason})=>{ row.p.primaryProposal=evidence.proposals.find(p=>p.sourceId===row.s.sourceId).proposed; row.p.primaryJustification=row.p.justification; row.p.proposed=to; row.p.justification=reason+' Screening primaire : '+row.p.justification; row.p.portfolioAdjusted=true;
      if(to==='inclus') {row.p.evidence=row.a.evidence.slice(); row.p.methodologicalOutsideDomain=row.methodOutsideDomain;}
    });
    adjustments.push({kind:donor?'SWAP':'ADD',added:candidate.s.sourceId,removed:donor?donor.s.sourceId:null,reason,donorReason:donor?donor.p.justification:null,redundancyEvidence:witness,qualityRankAdded:candidate.quality,qualityRankRemoved:donor?donor.quality:null,before:current,after:metrics()});
  }
  const after=metrics();
  const statuses=ids.map(id=>{const c=after.map[id];const acceptable=candidates.filter(r=>r.admissible&&r.angles.includes(id));return {dimensionId:id,status:c.under?'COVERAGE_UNRESOLVED':before.map[id].under?'COVERAGE_RESOLVED_BY_BALANCING':'COVERAGE_SATISFACTORY',overrepresented:c.over,reason:c.under?(acceptable.length?'INSUFFICIENT_ADMISSIBLE_COVERAGE':'NO_ACCEPTABLE_CANDIDATE'):null,message:c.under?(acceptable.length?'Couverture insuffisante malgré les candidates admissibles disponibles.':'Couverture insuffisante faute de source suffisamment pertinente et étayée.'):before.map[id].under?'Sous-couverture résolue par rééquilibrage.':'Couverture satisfaisante selon les indicateurs disponibles.'};});
  const proposedEvidence=Object.assign({},clone(evidence),{proposals:[...proposals.values()],primaryEvidenceSha256:hash(evidence),portfolioPolicy:'DETERMINISTIC-PORTFOLIO-v1'});
  const updatedReview=Object.assign({},clone(review),{notADecision:true,statement:'Portefeuille proposé après rééquilibrage déterministe. La machine propose ; vous pouvez modifier chaque choix puis ratifier. Couverture indicative : les lignées de requête ne prouvent pas à elles seules la pertinence scientifique.',
    counts:Object.assign({},review.counts,{proposedIncluded:after.totalIncluded,proposedExcluded:rows.filter(r=>r.p&&r.p.proposed==='exclu').length}),coverageMap:after.map,
    possibleUndercoverage:statuses.filter(x=>x.status==='COVERAGE_UNRESOLVED'),possibleOvercoverage:statuses.filter(x=>x.overrepresented),
    evidenceTypeDiversity:after.diversity,balancing:{schema:'EvidenceForge.PortfolioBalancing',notADecision:true,policy,targetWeight:target,primaryEvidenceSha256:hash(evidence),before,after,statuses,considered,adjustments,
      sourceAngles:rows.map(r=>({sourceId:r.s.sourceId,angles:r.angles,basis:r.angleBasis})),additionalLlmCalls:0,additionalCostUsd:0},
    warnings:(review.warnings||[]).filter(w=>!['POSSIBLE_UNDERCOVERAGE','POSSIBLE_OVERCOVERAGE','POSSIBLE_REDUNDANCY','LOW_EVIDENCE_TYPE_DIVERSITY'].includes(w.code) && !(w.code==='GENERIC_METHOD_OUTSIDE_DOMAIN' && proposals.get(w.sourceId) && proposals.get(w.sourceId).proposed==='inclus'))});
  const finalRed=redundancyGroups(rows.filter(r=>r.p&&r.p.proposed==='inclus').map(r=>r.s),Object.assign({},REVIEW_DEFAULTS,review.parameters||{}));
  updatedReview.method=Object.assign({},review.method,{coverage:'Fractional multi-angle mass, independent source count and query-lineage fallback; explicit policy in balancing.policy. No forced inclusion.',balancing:'Deterministic admissibility, coverage gain, conservative direct-pair swaps; zero additional LLM calls.'});
  updatedReview.redundancyGroups=finalRed.groups; updatedReview.marginalValue=finalRed.marginal;
  return {evidence:proposedEvidence,review:updatedReview};
}
module.exports={balancePortfolio,POLICY};
