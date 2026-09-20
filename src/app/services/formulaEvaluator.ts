export type FormulaError =
  | { kind: 'unbound'; ref: string }
  | { kind: 'syntax'; message: string }
  | { kind: 'cycle'; refs: string[] };

export function isFormulaError(v: unknown): v is FormulaError {
  return typeof v === 'object' && v !== null && 'kind' in v;
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type Token =
  | { type: 'number'; value: number }
  | { type: 'ref'; value: string }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

function tokenize(expression: string): Token[] | FormulaError {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expression.length) {
    const ch = expression[i] ?? '';

    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i++;
      continue;
    }

    if (ch === '@' && expression[i + 1] === '{') {
      const end = expression.indexOf('}', i + 2);
      if (end === -1) {
        return { kind: 'syntax', message: 'Unterminated @{reference}' };
      }
      tokens.push({ type: 'ref', value: expression.slice(i + 2, end) });
      i = end + 1;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(expression[i + 1] ?? ''))) {
      let num = '';
      let hasDot = false;
      while (i < expression.length) {
        const c = expression[i]!;
        if (/[0-9]/.test(c)) {
          num += c;
          i++;
        } else if (c === '.' && !hasDot) {
          hasDot = true;
          num += c;
          i++;
        } else {
          break;
        }
      }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < expression.length) {
        const current = expression[i] ?? '';
        if (!/[a-zA-Z0-9_]/.test(current)) break;
        ident += current;
        i++;
      }
      tokens.push({ type: 'ident', value: ident });
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma' }); i++; continue; }

    return { kind: 'syntax', message: `Unexpected character: ${ch}` };
  }

  return tokens;
}

// ─── Whitelisted functions ────────────────────────────────────────────────────

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
};

// ─── Parser ───────────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;

  constructor(
    private tokens: Token[],
    private vars: Record<string, number>,
  ) {}

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  consume(): Token {
    const token = this.tokens[this.pos];
    if (!token) throw new Error('Internal: consume() called past end of token stream');
    this.pos++;
    return token;
  }

  parse(): number | FormulaError {
    const result = this.parseExpression();
    if (isFormulaError(result)) return result;
    if (this.pos < this.tokens.length) {
      return { kind: 'syntax', message: `Unexpected token after expression` };
    }
    return result;
  }

  // Handles + and -
  private parseExpression(): number | FormulaError {
    let left = this.parseTerm();
    if (isFormulaError(left)) return left;

    while (
      this.peek()?.type === 'op' &&
      ((this.peek() as { type: 'op'; value: string }).value === '+' ||
        (this.peek() as { type: 'op'; value: string }).value === '-')
    ) {
      const op = (this.consume() as { type: 'op'; value: string }).value;
      const right = this.parseTerm();
      if (isFormulaError(right)) return right;
      left = op === '+' ? left + right : left - right;
    }

    return left;
  }

  // Handles * and /
  private parseTerm(): number | FormulaError {
    let left = this.parseFactor();
    if (isFormulaError(left)) return left;

    while (
      this.peek()?.type === 'op' &&
      ((this.peek() as { type: 'op'; value: string }).value === '*' ||
        (this.peek() as { type: 'op'; value: string }).value === '/')
    ) {
      const op = (this.consume() as { type: 'op'; value: string }).value;
      const right = this.parseFactor();
      if (isFormulaError(right)) return right;
      if (op === '/') {
        if (right === 0) return { kind: 'syntax', message: 'Division by zero' };
        left = left / right;
      } else {
        left = left * right;
      }
    }

    return left;
  }

  // Handles atoms: numbers, @{refs}, function calls, grouped exprs, unary minus
  private parseFactor(): number | FormulaError {
    const token = this.peek();
    if (!token) return { kind: 'syntax', message: 'Unexpected end of expression' };

    // Unary minus
    if (token.type === 'op' && token.value === '-') {
      this.consume();
      const inner = this.parseFactor();
      if (isFormulaError(inner)) return inner;
      return -inner;
    }

    // Parenthesised expression
    if (token.type === 'lparen') {
      this.consume();
      const inner = this.parseExpression();
      if (isFormulaError(inner)) return inner;
      const closing = this.peek();
      if (!closing || closing.type !== 'rparen') {
        return { kind: 'syntax', message: 'Expected closing parenthesis' };
      }
      this.consume();
      return inner;
    }

    // Number literal
    if (token.type === 'number') {
      this.consume();
      return token.value;
    }

    // Variable reference @{name}
    if (token.type === 'ref') {
      this.consume();
      const name = token.value;
      if (!(name in this.vars)) {
        return { kind: 'unbound', ref: name };
      }
      return this.vars[name]!;
    }

    // Function call or bare identifier
    if (token.type === 'ident') {
      this.consume();
      const name = token.value;
      const fn = FUNCTIONS[name];
      if (!fn) {
        return { kind: 'syntax', message: `Unknown function: ${name}` };
      }

      const lparen = this.peek();
      if (!lparen || lparen.type !== 'lparen') {
        return { kind: 'syntax', message: `Expected '(' after function name ${name}` };
      }
      this.consume();

      const args: number[] = [];
      if (this.peek()?.type !== 'rparen') {
        const first = this.parseExpression();
        if (isFormulaError(first)) return first;
        args.push(first);

        while (this.peek()?.type === 'comma') {
          this.consume();
          const arg = this.parseExpression();
          if (isFormulaError(arg)) return arg;
          args.push(arg);
        }
      }

      const rparen = this.peek();
      if (!rparen || rparen.type !== 'rparen') {
        return { kind: 'syntax', message: `Expected ')' after arguments to ${name}` };
      }
      this.consume();

      return fn(...args);
    }

    return { kind: 'syntax', message: `Unexpected token: ${JSON.stringify(token)}` };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function evaluateFormula(
  expression: string,
  vars: Record<string, number>,
): number | FormulaError {
  const tokens = tokenize(expression);
  if (isFormulaError(tokens)) return tokens;
  return new Parser(tokens, vars).parse();
}
