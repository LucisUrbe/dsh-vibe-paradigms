import { Decimal } from 'decimal.js';

// A private constructor keeps other plugins' Decimal configuration irrelevant.
const D = Decimal.clone({ precision: 256, rounding: Decimal.ROUND_HALF_EVEN, maxE: 1000, minE: -1000 });
export interface CalculateArgs {
  operation: 'expression' | 'sum' | 'product' | 'mean' | 'median' | 'min' | 'max' | 'variance' | 'stddev' | 'weighted_mean' | 'dot' | 'matrix_multiply' | 'bigint';
  expression?: string;
  values?: string[];
  weights?: string[];
  matrix?: string[][];
  rightMatrix?: string[][];
  left?: string;
  right?: string;
  operator?: '+' | '-' | '*' | '/' | '%';
}
function number(text: string): Decimal {
  if (typeof text !== 'string' || text.length > 160 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d{1,3})?$/i.test(text)) throw new Error('Use bounded decimal strings.');
  return bounded(new D(text));
}
function bounded(value: Decimal): Decimal {
  if (!value.isFinite() || (!value.isZero() && Math.abs(value.e) > 256)) throw new Error('Calculation exceeds numeric bounds or divides by zero.');
  return value;
}
function array(values?: string[]): Decimal[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 256) throw new Error('Use 1 to 256 decimal values.');
  return values.map(number);
}
function sum(values: Decimal[]): Decimal { return values.reduce((a, b) => bounded(a.plus(b)), new D(0)); }

// Numbers, arithmetic and parentheses only. No identifiers, calls or JavaScript.
function expression(source: string): Decimal {
  if (typeof source !== 'string' || !source.trim() || source.length > 2048) throw new Error('Expression must contain 1 to 2048 characters.');
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+\-*/^]|\S/gi) ?? [];
  if (tokens.length > 512) throw new Error('Too many expression tokens.');
  let at = 0;
  const parse = (minimum = 0, depth = 0): Decimal => {
    if (depth > 32) throw new Error('Expression nesting exceeds 32.');
    const token = tokens[at++];
    let value: Decimal;
    if (token === '+' || token === '-') { value = parse(3, depth + 1); if (token === '-') value = value.neg(); }
    else if (token === '(') { value = parse(0, depth + 1); if (tokens[at++] !== ')') throw new Error('Unbalanced parentheses.'); }
    else if (token !== undefined) value = number(token);
    else throw new Error('Missing operand.');
    while (at < tokens.length) {
      const operator = tokens[at]!;
      const precedence = operator === '+' || operator === '-' ? 1 : operator === '*' || operator === '/' ? 2 : operator === '^' ? 3 : 0;
      if (!precedence || precedence < minimum) break;
      at++;
      const right = parse(operator === '^' ? precedence : precedence + 1, depth + 1);
      if (operator === '^' && (!right.isInteger() || right.abs().gt(100))) throw new Error('Power exponent must be an integer from -100 to 100.');
      value = bounded(operator === '+' ? value.plus(right) : operator === '-' ? value.minus(right) : operator === '*' ? value.times(right) : operator === '/' ? value.div(right) : value.pow(right));
    }
    return value;
  };
  const value = parse();
  if (at !== tokens.length) throw new Error('Only numeric arithmetic and parentheses are accepted.');
  return value;
}
export function calculate(args: CalculateArgs): { result: string | string[][]; precision: number; rounding: string } {
  let result: string | string[][];
  if (args.operation === 'expression') result = expression(args.expression!).toString();
  else if (args.operation === 'bigint') {
    const integer = (text?: string) => {
      if (typeof text !== 'string' || !/^[+-]?\d{1,256}$/.test(text)) throw new Error('Use integer strings up to 256 digits.');
      return BigInt(text);
    };
    const a = integer(args.left), b = integer(args.right);
    if ((args.operator === '/' || args.operator === '%') && b === 0n) throw new Error('Division by zero.');
    const value = args.operator === '+' ? a + b : args.operator === '-' ? a - b : args.operator === '*' ? a * b : args.operator === '/' ? a / b : args.operator === '%' ? a % b : undefined;
    if (value === undefined) throw new Error('Unknown integer operator.');
    result = value.toString();
    if (result.length > 513) throw new Error('Integer result exceeds bounds.');
    return { result, precision: 0, rounding: 'Exact integers; division truncates toward zero.' };
  } else if (args.operation === 'matrix_multiply') {
    const matrix = (input?: string[][]) => {
      if (!Array.isArray(input) || input.length < 1 || input.length > 16 || !Array.isArray(input[0]) || input[0].length < 1 || input[0].length > 16) throw new Error('Use nonempty matrices up to 16 by 16.');
      const width = input[0].length;
      if (input.some(row => !Array.isArray(row) || row.length !== width)) throw new Error('Matrix rows must have equal width.');
      return input.map(row => row.map(number));
    };
    const a = matrix(args.matrix), b = matrix(args.rightMatrix);
    if (a[0]!.length !== b.length) throw new Error('Matrix dimensions do not match.');
    result = a.map(row => b[0]!.map((_, col) => sum(row.map((value, i) => bounded(value.times(b[i]![col]!)))).toString()));
  } else {
    const values = array(args.values);
    let value: Decimal;
    switch (args.operation) {
      case 'sum': value = sum(values); break;
      case 'product': value = values.reduce((a, b) => bounded(a.times(b)), new D(1)); break;
      case 'mean': value = sum(values).div(values.length); break;
      case 'min': value = D.min(...values); break;
      case 'max': value = D.max(...values); break;
      case 'median': {
        const sorted = [...values].sort((a, b) => a.cmp(b)), middle = Math.floor(sorted.length / 2);
        value = sorted.length % 2 ? sorted[middle]! : sorted[middle - 1]!.plus(sorted[middle]!).div(2); break;
      }
      case 'variance': case 'stddev': {
        const mean = sum(values).div(values.length);
        value = sum(values.map(x => bounded(x.minus(mean).pow(2)))).div(values.length);
        if (args.operation === 'stddev') value = value.sqrt(); break;
      }
      case 'dot': case 'weighted_mean': {
        const weights = array(args.weights);
        if (weights.length !== values.length) throw new Error('Values and weights must have the same length.');
        value = sum(values.map((x, i) => bounded(x.times(weights[i]!))));
        if (args.operation === 'weighted_mean') {
          if (weights.some(x => x.isNegative()) || sum(weights).isZero()) throw new Error('Weights must be nonnegative with a positive total.');
          value = value.div(sum(weights));
        }
        break;
      }
      default: throw new Error('Unknown calculation operation.');
    }
    result = bounded(value).toString();
  }
  return { result, precision: 256, rounding: '256 significant decimal digits, half-even; variance and stddev use population statistics.' };
}
