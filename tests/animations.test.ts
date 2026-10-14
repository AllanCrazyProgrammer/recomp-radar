import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  interpolateCounter,
  resolveMotionPreference,
  staggerStyle,
} from '../lib/animations.ts';

test('staggerStyle caps stagger index to prevent excessive delays in large lists', () => {
  assert.deepEqual(staggerStyle(0), {'--stagger-index': 0});
  assert.deepEqual(staggerStyle(5), {'--stagger-index': 5});
  assert.deepEqual(staggerStyle(25), {'--stagger-index': 12});
  assert.deepEqual(staggerStyle(10, 6), {'--stagger-index': 6});
  assert.deepEqual(staggerStyle(-3), {'--stagger-index': 0});
});

test('interpolateCounter eases numeric transitions and clamps bounds', () => {
  assert.equal(interpolateCounter(0, 100, 0), 0);
  assert.equal(interpolateCounter(0, 100, 1), 100);
  assert.equal(interpolateCounter(0, 100, 2), 100);
  assert.equal(interpolateCounter(10, 20, -1), 10);
  const mid = interpolateCounter(0, 100, 0.5);
  assert.ok(mid > 50 && mid < 100);
});

test('resolveMotionPreference respects explicit storage and system reduced-motion fallback', () => {
  assert.equal(resolveMotionPreference(null, false), true);
  assert.equal(resolveMotionPreference(null, true), false);
  assert.equal(resolveMotionPreference('off', false), false);
  assert.equal(resolveMotionPreference('on', true), true);
});

test('animations stylesheet includes radar keyframes, responsive rules and reduced-motion accessibility', () => {
  const css = readFileSync(
    new URL('../app/animations.css', import.meta.url),
    'utf8',
  );
  for (const token of [
    '@keyframes radar-sweep',
    '@keyframes radar-ring-expand',
    '@keyframes radar-blip-pulse',
    '@keyframes view-enter',
    '@keyframes stagger-fade-in',
    '@keyframes scan-runner',
    '@media (max-width: 800px)',
    '@media (max-width: 560px)',
    'prefers-reduced-motion: reduce',
    'html[data-motion="off"]',
  ]) {
    assert.ok(css.includes(token), `Missing animation CSS rule: ${token}`);
  }
});
