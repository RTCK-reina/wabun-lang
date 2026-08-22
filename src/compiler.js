// wabun-lang compiler: AST → JavaScript

import { BUILTIN_NAMES } from './builtins.js';

const BUILTIN_SET = new Set(BUILTIN_NAMES);

export function compile(ast) {
  const ctx = { indent: 0 };
  const body = ast.body.map(s => emitStmt(s, ctx)).join('');
  return body;
}

function pad(ctx) { return '  '.repeat(ctx.indent); }

function ident(name) {
  // 日本語識別子はES2015+で有効だが衝突回避のため接頭辞を付与
  return '_和_' + name;
}

function emitStmt(s, ctx) {
  switch (s.type) {
    case '変数宣言':
      return `${pad(ctx)}let ${ident(s.name)} = ${emitExpr(s.value)};\n`;
    case '代入':
      return `${pad(ctx)}${ident(s.name)} = ${emitExpr(s.value)};\n`;
    case '出力':
      return `${pad(ctx)}__和__.print(${emitExpr(s.value)});\n`;
    case '入力':
      return `${pad(ctx)}let ${ident(s.name)} = await __和__.input();\n`;
    case '条件': {
      let out = `${pad(ctx)}if (__和__.truthy(${emitExpr(s.cond)})) {\n`;
      out += emitBlock(s.then, ctx);
      for (const ei of s.elseifs) {
        out += `${pad(ctx)}} else if (__和__.truthy(${emitExpr(ei.cond)})) {\n`;
        out += emitBlock(ei.body, ctx);
      }
      if (s.else) {
        out += `${pad(ctx)}} else {\n`;
        out += emitBlock(s.else, ctx);
      }
      out += `${pad(ctx)}}\n`;
      return out;
    }
    case '範囲反復': {
      const v = ident(s.varName);
      const cmp = s.direction === 'inc' ? '<=' : '>=';
      const step = s.direction === 'inc' ? '++' : '--';
      let out = `${pad(ctx)}for (let ${v} = ${emitExpr(s.from)}; ${v} ${cmp} ${emitExpr(s.to)}; ${v}${step}) {\n`;
      out += emitBlock(s.body, ctx);
      out += `${pad(ctx)}}\n`;
      return out;
    }
    case '条件反復': {
      let out = `${pad(ctx)}while (__和__.truthy(${emitExpr(s.cond)})) {\n`;
      out += emitBlock(s.body, ctx);
      out += `${pad(ctx)}}\n`;
      return out;
    }
    case '各々反復': {
      const v = ident(s.varName);
      let out = `${pad(ctx)}for (const ${v} of (${emitExpr(s.array)})) {\n`;
      out += emitBlock(s.body, ctx);
      out += `${pad(ctx)}}\n`;
      return out;
    }
    case '業宣言': {
      const params = s.params.map(p => ident(p)).join(', ');
      let out = `${pad(ctx)}async function ${ident(s.name)}(${params}) {\n`;
      out += emitBlock(s.body, ctx);
      out += `${pad(ctx)}}\n`;
      return out;
    }
    case '返却':
      return `${pad(ctx)}return ${emitExpr(s.value)};\n`;
    case '投擲':
      return `${pad(ctx)}throw ${emitExpr(s.value)};\n`;
    case '試捕': {
      let out = `${pad(ctx)}try {\n`;
      out += emitBlock(s.tryBody, ctx);
      const catchName = s.catchVar ? ident(s.catchVar) : '_和_過ち';
      out += `${pad(ctx)}} catch (${catchName}) {\n`;
      if (s.catchBody) out += emitBlock(s.catchBody, ctx);
      out += `${pad(ctx)}}\n`;
      return out;
    }
    case '呼文': {
      const args = s.args.map(emitExpr).join(', ');
      const callee = BUILTIN_SET.has(s.func)
        ? `__和__.builtins[${JSON.stringify(s.func)}]`
        : ident(s.func);
      return `${pad(ctx)}await ${callee}(${args});\n`;
    }
    case '末尾加':
      return `${pad(ctx)}(${emitExpr(s.target)}).push(${emitExpr(s.value)});\n`;
    case '索引代入':
      return `${pad(ctx)}__和__.indexSet(${emitExpr(s.target)}, ${emitExpr(s.index)}, ${emitExpr(s.value)});\n`;
    case '鍵代入':
      return `${pad(ctx)}__和__.memberSet(${emitExpr(s.target)}, ${emitExpr(s.key)}, ${emitExpr(s.value)});\n`;
    case '索引削':
      return `${pad(ctx)}__和__.indexDel(${emitExpr(s.target)}, ${emitExpr(s.index)});\n`;
    case '鍵削':
      return `${pad(ctx)}__和__.memberDel(${emitExpr(s.target)}, ${emitExpr(s.key)});\n`;
    default:
      throw new Error(`compiler: unknown statement ${s.type}`);
  }
}

function emitBlock(body, ctx) {
  ctx.indent++;
  const out = body.map(s => emitStmt(s, ctx)).join('');
  ctx.indent--;
  return out;
}

function emitExpr(e) {
  switch (e.type) {
    case '数値直': return JSON.stringify(e.value);
    case '文字列直': return JSON.stringify(e.value);
    case '真偽直': return e.value ? 'true' : 'false';
    case '空直': return 'null';
    case '変数':
      if (BUILTIN_SET.has(e.name)) return `__和__.builtins[${JSON.stringify(e.name)}]`;
      return ident(e.name);
    case '単項':
      return `(${e.op}${e.op === '!' ? '__和__.truthy(' + emitExpr(e.value) + ')' : '(' + emitExpr(e.value) + ')'})`;
    case '二項': {
      const L = emitExpr(e.left);
      const R = emitExpr(e.right);
      // 文字列連結兼加算は __和__.add を介する
      if (e.op === '+') return `__和__.add(${L}, ${R})`;
      if (e.op === '&&') return `(__和__.truthy(${L}) && __和__.truthy(${R}))`;
      if (e.op === '||') return `(__和__.truthy(${L}) || __和__.truthy(${R}))`;
      return `((${L}) ${e.op} (${R}))`;
    }
    case '呼出': {
      const args = e.args.map(emitExpr).join(', ');
      const callee = BUILTIN_SET.has(e.func)
        ? `__和__.builtins[${JSON.stringify(e.func)}]`
        : ident(e.func);
      return `(await ${callee}(${args}))`;
    }
    case '集合直':
      return `[${e.elements.map(emitExpr).join(', ')}]`;
    case '録直':
      return `({${e.entries.map(en => `[${emitExpr(en.key)}]: ${emitExpr(en.value)}`).join(', ')}})`;
    case '索引':
      // 1-indexed
      return `__和__.index(${emitExpr(e.array)}, ${emitExpr(e.index)})`;
    case '鍵':
      return `__和__.member(${emitExpr(e.obj)}, ${emitExpr(e.key)})`;
    case '長':
      if (e.kind === 'count') return `(${emitExpr(e.target)}).length`;
      if (e.kind === 'len') return `__和__.strlen(${emitExpr(e.target)})`;
      return `(${emitExpr(e.target)}).length`;
    default:
      throw new Error(`compiler: unknown expression ${e.type}`);
  }
}
