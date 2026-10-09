import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../lib/compute/calculator.js';

test('decimal, percentage, weighted, population, vector and matrix calculations retain exact strings', () => {
  const calc = args => calculate(args).result;
  assert.equal(calc({ operation: 'expression', expression: '0.1 + 0.2' }), '0.3');
  assert.equal(calc({ operation: 'expression', expression: '1250 * (12.5 / 100)' }), '156.25');
  assert.equal(calc({ operation: 'expression', expression: '-2^2 + 2^3^2' }), '508');
  assert.equal(calc({ operation: 'sum', values: ['0.1', '0.2', '0.3'] }), '0.6');
  assert.equal(calc({ operation: 'product', values: ['1.5', '2', '3'] }), '9');
  assert.equal(calc({ operation: 'mean', values: ['1', '2', '3'] }), '2');
  assert.equal(calc({ operation: 'median', values: ['9', '1', '3', '5'] }), '4');
  assert.equal(calc({ operation: 'weighted_mean', values: ['80', '90'], weights: ['0.25', '0.75'] }), '87.5');
  assert.equal(calc({ operation: 'variance', values: ['1', '3'] }), '1');
  assert.equal(calc({ operation: 'stddev', values: ['1', '3'] }), '1');
  assert.equal(calc({ operation: 'dot', values: ['1', '2'], weights: ['3', '4'] }), '11');
  assert.deepEqual(calc({ operation: 'matrix_multiply', matrix: [['1', '2'], ['3', '4']], rightMatrix: [['5', '6'], ['7', '8']] }), [['19', '22'], ['43', '50']]);
  assert.equal(calc({ operation: 'bigint', operator: '+', left: '9007199254740993', right: '2' }), '9007199254740995');
  assert.equal(calc({ operation: 'bigint', operator: '/', left: '-7', right: '2' }), '-3');
});

test('calculator rejects code, excessive recursion/work, invalid numbers and unbounded powers', () => {
  for (const expression of ['process.env', 'fetch("x")', '1;2', '1/0', '2^1000', '2^0.5', '1e999', '('.repeat(40) + '1' + ')'.repeat(40), '9'.repeat(300), '2**3', '(1+2']) {
    assert.throws(() => calculate({ operation: 'expression', expression }));
  }
  assert.throws(() => calculate({ operation: 'sum', values: Array(257).fill('1') }));
  assert.throws(() => calculate({ operation: 'weighted_mean', values: ['1'], weights: ['0'] }));
  assert.throws(() => calculate({ operation: 'matrix_multiply', matrix: [['1', '2']], rightMatrix: [['1']] }));
});
