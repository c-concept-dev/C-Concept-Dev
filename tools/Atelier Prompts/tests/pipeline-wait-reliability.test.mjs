import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPilot, arbiterTurn } from './perf04-frontend-harness.helper.mjs';

function clock(h) {
  let expire;
  let cleared = 0;
  h.ctx.setTimeout = (fn, ms) => { assert.equal(ms, 180000); expire = fn; return 42; };
  h.ctx.clearTimeout = id => { assert.equal(id, 42); cleared++; };
  return { expire: () => expire(), cleared: () => cleared };
}
test('OPRIE : un réseau muet expire, conserve la demande et libère les commandes', async () => {
  const demande = 'bon voilà lis mes notes et fais un mail simple';
  const h = loadPilot({ demande, noFastEndpoint: true, deep: (_, { signal }) =>
    new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  const timer = clock(h);
  const running = h.pilot.oprieRunTurn('architecte');
  await Promise.resolve();
  timer.expire();
  assert.equal(await running, false);
  assert.equal(h.pilot.oprieState.running, false);
  assert.equal(h.el('#v11-demande').value, demande);
  assert.equal(h.spy.gate.at(-1).decision.state, 'technical');
  assert.equal(h.spy.executed.length, 0);
  assert.equal(timer.cleared(), 1);
});
test('OPRIE : le délai couvre aussi un corps HTTP qui ne se termine pas', async () => {
  const h = loadPilot({ noFastEndpoint: true });
  const timer = clock(h);
  let reading;
  const started = new Promise(resolve => { reading = resolve; });
  h.ctx.fetch = async (_, { signal }) => ({ ok: true, json: () => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('body aborted')));
    reading();
  }) });
  const running = h.pilot.oprieRunTurn('architecte');
  await started;
  timer.expire();
  assert.equal(await running, false);
  assert.equal(h.spy.gate.at(-1).decision.state, 'technical');
  assert.equal(timer.cleared(), 1);
});
test('OPRIE : un succès annule le minuteur et conserve la décision de l’autorité', async () => {
  const h = loadPilot({ noFastEndpoint: true, deep: () => arbiterTurn('operational_request_ready') });
  const timer = clock(h);
  assert.equal(await h.pilot.oprieRunTurn('architecte'), true);
  assert.equal(h.spy.executed[0].engine, 'architecte');
  assert.equal(timer.cleared(), 1);
});
test('OPRIE : une exception à l’entrée Architecte ne laisse pas le bandeau en analyse', async () => {
  const h = loadPilot({ noFastEndpoint: true });
  h.ctx.adpEnterArchitecte = async () => { throw new Error('entry failed'); };
  assert.equal(await h.pilot.oprieRunTurn('architecte'), false);
  assert.equal(h.spy.gate.at(-1).decision.state, 'technical');
  assert.equal(h.pilot.oprieState.running, false);
});
test('OPRIE : une erreur tardive du tour abandonné ne modifie pas le nouveau tour', async () => {
  const h = loadPilot({ noFastEndpoint: true });
  h.ctx.adpEnterArchitecte = async () => { h.pilot.oprieState.seq++; throw new Error('stale'); };
  assert.equal(await h.pilot.oprieRunTurn('architecte'), false);
  assert.notEqual(h.spy.gate.at(-1).decision.state, 'technical');
});
