/**
 * A tiny, safe arithmetic expression evaluator for derived-stat formulas.
 *
 * Grammar (recursive descent):
 *   expr    := term (('+' | '-') term)*
 *   term    := factor (('*' | '/') factor)*
 *   factor  := NUMBER | IDENT | '(' expr ')' | '-' factor
 *
 * Identifiers resolve against a tally record (missing keys → 0). Division by zero and any
 * non-finite result yields 0, which is the sane default for rate stats before any data exists.
 * No `eval`, no function calls, no property access — only arithmetic over known tallies.
 */

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ kind: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i]!)) num += input[i++];
      tokens.push({ kind: 'num', value: Number(num) });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i]!)) ident += input[i++];
      tokens.push({ kind: 'ident', value: ident });
      continue;
    }
    throw new Error(`Unexpected character "${ch}" in expression "${input}"`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly vars: Readonly<Record<string, number>>,
  ) {}

  parse(): number {
    const value = this.expr();
    if (this.pos !== this.tokens.length) {
      throw new Error('Unexpected trailing tokens in expression');
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private expr(): number {
    let value = this.term();
    let tok = this.peek();
    while (tok?.kind === 'op' && (tok.value === '+' || tok.value === '-')) {
      this.pos++;
      const rhs = this.term();
      value = tok.value === '+' ? value + rhs : value - rhs;
      tok = this.peek();
    }
    return value;
  }

  private term(): number {
    let value = this.factor();
    let tok = this.peek();
    while (tok?.kind === 'op' && (tok.value === '*' || tok.value === '/')) {
      this.pos++;
      const rhs = this.factor();
      value = tok.value === '*' ? value * rhs : rhs === 0 ? 0 : value / rhs;
      tok = this.peek();
    }
    return value;
  }

  private factor(): number {
    const tok = this.peek();
    if (!tok) throw new Error('Unexpected end of expression');
    if (tok.kind === 'op' && tok.value === '-') {
      this.pos++;
      return -this.factor();
    }
    if (tok.kind === 'num') {
      this.pos++;
      return tok.value;
    }
    if (tok.kind === 'ident') {
      this.pos++;
      return this.vars[tok.value] ?? 0;
    }
    if (tok.kind === 'lparen') {
      this.pos++;
      const value = this.expr();
      const close = this.peek();
      if (close?.kind !== 'rparen') throw new Error('Missing closing parenthesis');
      this.pos++;
      return value;
    }
    throw new Error('Unexpected token in expression');
  }
}

/** Evaluate `expr` against `vars`. Non-finite results collapse to 0. */
export function evaluateExpression(expr: string, vars: Readonly<Record<string, number>>): number {
  const result = new Parser(tokenize(expr), vars).parse();
  return Number.isFinite(result) ? result : 0;
}
