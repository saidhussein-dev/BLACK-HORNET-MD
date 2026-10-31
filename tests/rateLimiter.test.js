const test = require('node:test');
const assert = require('node:assert/strict');
const { SlidingWindowLimiter, Cooldown } = require('../src/blueteam/rateLimiter');

test('sliding window limiter allows up to maxEvents, then trips', () => {
  const limiter = new SlidingWindowLimiter(1000, 3);
  assert.equal(limiter.hit('a'), false);
  assert.equal(limiter.hit('a'), false);
  assert.equal(limiter.hit('a'), false);
  assert.equal(limiter.hit('a'), true); // 4th event in window exceeds max of 3
});

test('sliding window limiter keys are independent', () => {
  const limiter = new SlidingWindowLimiter(1000, 1);
  assert.equal(limiter.hit('x'), false);
  assert.equal(limiter.hit('y'), false); // different key, own budget
});

test('sliding window limiter expires old events', async () => {
  const limiter = new SlidingWindowLimiter(50, 1);
  assert.equal(limiter.hit('k'), false);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(limiter.hit('k'), false); // old event expired out of the window
});

test('cooldown blocks rapid repeats and allows after expiry', async () => {
  const cd = new Cooldown(50);
  assert.equal(cd.check('u'), false); // first call: not on cooldown
  assert.equal(cd.check('u'), true);  // immediate repeat: on cooldown
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(cd.check('u'), false); // expired: allowed again
});
