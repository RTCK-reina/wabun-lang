// 影詞（かげことば）バックエンド：和文 AST → GLSL ES 1.00 fragment shader

// GLSL 型
const T_FLOAT = 'float';
const T_VEC2 = 'vec2';
const T_VEC3 = 'vec3';
const T_VEC4 = 'vec4';
const T_BOOL = 'bool';
const T_VOID = 'void';

// 組み込み入力（GLSL ES 1.00 は ASCII 識別子のみ許容）
const BUILTIN_VARS = {
  uv: { type: T_VEC2, expr: 'uv()' },     // 補助関数で初期化
  時: { type: T_FLOAT, expr: 'u_time' },
  解像度: { type: T_VEC2, expr: 'u_resolution' },
};

// 和文識別子を GLSL で安全な ASCII 名に変換
function asciiIdent(name) {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return name;
  let result = '_w';
  for (const ch of name) {
    if (/[a-zA-Z0-9]/.test(ch)) result += ch;
    else result += '_' + ch.codePointAt(0).toString(16);
  }
  return result;
}

// 組み込み定数
const BUILTIN_CONSTS = {
  円周率: { type: T_FLOAT, expr: '3.141592653589793' },
  自然底: { type: T_FLOAT, expr: '2.718281828459045' },
};

// 組み込み業：和文名 → { glsl, returnType: (argTypes) => type }
const BUILTIN_FUNCS = {
  絶対値: { glsl: 'abs', ret: (a) => a },
  平方根: { glsl: 'sqrt', ret: (a) => a },
  切り捨て: { glsl: 'floor', ret: (a) => a },
  切り上げ: { glsl: 'ceil', ret: (a) => a },
  四捨五入: { glsl: 'floor', ret: (a) => a, transform: (args) => `(${args[0]} + 0.5)` }, // GLSL ES 1.00 に round が無いので近似
  最大: { glsl: 'max', ret: (a) => a },
  最小: { glsl: 'min', ret: (a) => a },
  冪: { glsl: 'pow', ret: (a) => a },
  自然対数: { glsl: 'log', ret: (a) => a },
  対数: { glsl: 'log', ret: (a) => a },
  正弦: { glsl: 'sin', ret: (a) => a },
  余弦: { glsl: 'cos', ret: (a) => a },
  正接: { glsl: 'tan', ret: (a) => a },
  混ぜ: { glsl: 'mix', ret: (a) => a },
  端: { glsl: 'clamp', ret: (a) => a },
  滑らか段: { glsl: 'smoothstep', ret: (a, b, c) => c },
  分数: { glsl: 'fract', ret: (a) => a },
  歩: { glsl: 'step', ret: (a, b) => b },
  長さ: { glsl: 'length', ret: () => T_FLOAT },
  正規化: { glsl: 'normalize', ret: (a) => a },
  内積: { glsl: 'dot', ret: () => T_FLOAT },
  外積: { glsl: 'cross', ret: () => T_VEC3 },
  距離: { glsl: 'distance', ret: () => T_FLOAT },
  反射: { glsl: 'reflect', ret: (a) => a },
};

// swizzle 鍵 → 成分
const SWIZZLE = {
  '横': 'x', '縦': 'y', '奥': 'z', '四': 'w',
  '赤': 'r', '緑': 'g', '青': 'b', '不透明': 'a',
};

class Env {
  constructor(parent = null) {
    this.scope = {};
    this.parent = parent;
  }
  get(name) {
    if (name in this.scope) return this.scope[name];
    if (this.parent) return this.parent.get(name);
    return null;
  }
  set(name, info) { this.scope[name] = info; }
  child() { return new Env(this); }
}

export function compile(ast) {
  // 業を集める
  const funcs = [];
  let mainFunc = null;
  for (const stmt of ast.body) {
    if (stmt.type === '業宣言') {
      if (stmt.name === '主') mainFunc = stmt;
      else funcs.push(stmt);
    } else {
      throw new Error('影詞翻訳誤り：最上位は業宣言のみ許す');
    }
  }
  if (!mainFunc) throw new Error('影詞翻訳誤り：業「主」を要す');
  if (mainFunc.params.length > 0) throw new Error('影詞翻訳誤り：業「主」は引数を取らず');

  // 補助業をまずコンパイル（型情報を貯めるため）
  const userFuncDecls = new Map(); // name -> { paramTypes, retType, code }
  for (const f of funcs) {
    const decl = compileFunc(f, userFuncDecls);
    userFuncDecls.set(f.name, decl);
  }
  const mainDecl = compileFunc(mainFunc, userFuncDecls);

  // 出力組み立て
  let out = '';
  out += 'precision highp float;\n\n';
  out += 'uniform vec2 u_resolution;\n';
  out += 'uniform float u_time;\n\n';
  out += 'vec2 uv() {\n  return gl_FragCoord.xy / u_resolution;\n}\n\n';
  for (const [name, decl] of userFuncDecls) {
    out += decl.code + '\n\n';
  }
  out += mainDecl.code + '\n\n';
  out += `void main() {\n  gl_FragColor = ${asciiIdent('主')}();\n}\n`;
  return out;
}

function compileFunc(funcStmt, userFuncDecls) {
  const paramTypes = funcStmt.params.map(() => T_FLOAT);
  const env = new Env();
  for (let i = 0; i < funcStmt.params.length; i++) {
    env.set(funcStmt.params[i], { type: paramTypes[i], expr: asciiIdent(funcStmt.params[i]) });
  }
  const lines = [];
  let retType = T_VOID;
  for (const stmt of funcStmt.body) {
    const r = compileStmt(stmt, env, userFuncDecls);
    if (r.code) lines.push(r.code);
    if (r.retType) retType = r.retType;
  }
  if (retType === T_VOID) {
    retType = funcStmt.name === '主' ? T_VEC4 : T_VOID;
  }
  const params = funcStmt.params.map((p, i) => `${paramTypes[i]} ${asciiIdent(p)}`).join(', ');
  const indent = (s) => s.split('\n').map(l => '  ' + l).join('\n');
  const body = lines.map(indent).join('\n');
  const code = `${retType} ${asciiIdent(funcStmt.name)}(${params}) {\n${body}\n}`;
  return { paramTypes, retType, code };
}

function compileStmt(stmt, env, userFuncDecls) {
  switch (stmt.type) {
    case '変数宣言': {
      const e = compileExpr(stmt.value, env, userFuncDecls);
      const id = asciiIdent(stmt.name);
      env.set(stmt.name, { type: e.type, expr: id });
      return { code: `${e.type} ${id} = ${e.expr};` };
    }
    case '代入': {
      const info = env.get(stmt.name);
      if (!info) throw new Error(`影詞翻訳誤り：未宣言の変数 「${stmt.name}」`);
      const e = compileExpr(stmt.value, env, userFuncDecls);
      return { code: `${asciiIdent(stmt.name)} = ${e.expr};` };
    }
    case '返却': {
      const e = compileExpr(stmt.value, env, userFuncDecls);
      return { code: `return ${e.expr};`, retType: e.type };
    }
    case '条件': {
      const cond = compileExpr(stmt.cond, env, userFuncDecls);
      let out = `if (${cond.expr}) {\n`;
      const thenLines = [];
      let retT = null;
      for (const s of stmt.then) {
        const r = compileStmt(s, env.child(), userFuncDecls);
        if (r.code) thenLines.push('  ' + r.code);
        if (r.retType) retT = r.retType;
      }
      out += thenLines.join('\n') + '\n}';
      for (const ei of stmt.elseifs) {
        const eiCond = compileExpr(ei.cond, env, userFuncDecls);
        out += ` else if (${eiCond.expr}) {\n`;
        const eiLines = [];
        for (const s of ei.body) {
          const r = compileStmt(s, env.child(), userFuncDecls);
          if (r.code) eiLines.push('  ' + r.code);
          if (r.retType) retT = r.retType;
        }
        out += eiLines.join('\n') + '\n}';
      }
      if (stmt.else) {
        out += ' else {\n';
        const elseLines = [];
        for (const s of stmt.else) {
          const r = compileStmt(s, env.child(), userFuncDecls);
          if (r.code) elseLines.push('  ' + r.code);
          if (r.retType) retT = r.retType;
        }
        out += elseLines.join('\n') + '\n}';
      }
      return { code: out, retType: retT };
    }
    case '範囲反復': {
      // N は数値リテラルのみ許可
      if (stmt.from.type !== '数値直' || stmt.to.type !== '数値直') {
        throw new Error('影詞翻訳誤り：範囲反復は数値リテラルの上下限のみ許す');
      }
      const from = stmt.from.value;
      const to = stmt.to.value;
      const cmp = stmt.direction === 'inc' ? '<=' : '>=';
      const step = stmt.direction === 'inc' ? '++' : '--';
      const childEnv = env.child();
      const vId = asciiIdent(stmt.varName);
      childEnv.set(stmt.varName, { type: T_FLOAT, expr: vId });
      const lines = [];
      for (const s of stmt.body) {
        const r = compileStmt(s, childEnv, userFuncDecls);
        if (r.code) lines.push('  ' + r.code);
      }
      return {
        code: `for (int ${vId} = ${from}; ${vId} ${cmp} ${to}; ${vId}${step}) {\n${lines.join('\n')}\n}`,
      };
    }
    default:
      throw new Error(`影詞翻訳誤り：未対応の文「${stmt.type}」`);
  }
}

function compileExpr(e, env, userFuncDecls) {
  switch (e.type) {
    case '数値直':
      return { type: T_FLOAT, expr: formatFloat(e.value) };
    case '真偽直':
      return { type: T_BOOL, expr: e.value ? 'true' : 'false' };
    case '変数': {
      if (e.name in BUILTIN_VARS) return BUILTIN_VARS[e.name];
      if (e.name in BUILTIN_CONSTS) return BUILTIN_CONSTS[e.name];
      const info = env.get(e.name);
      if (!info) throw new Error(`影詞翻訳誤り：未宣言の変数 「${e.name}」`);
      return info;
    }
    case '集合直': {
      const elems = e.elements.map(el => compileExpr(el, env, userFuncDecls));
      const n = elems.length;
      if (n < 2 || n > 4) throw new Error('影詞翻訳誤り：vec は 2〜4 要素のみ');
      const ty = [T_VEC2, T_VEC3, T_VEC4][n - 2];
      const args = elems.map(el => el.expr).join(', ');
      return { type: ty, expr: `${ty}(${args})` };
    }
    case '単項': {
      const v = compileExpr(e.value, env, userFuncDecls);
      if (e.op === '!') return { type: T_BOOL, expr: `(!${v.expr})` };
      return { type: v.type, expr: `(-${v.expr})` };
    }
    case '二項': {
      const L = compileExpr(e.left, env, userFuncDecls);
      const R = compileExpr(e.right, env, userFuncDecls);
      let op = e.op;
      let resultType = unifyType(L.type, R.type);
      if (['===', '!==', '>', '<', '>=', '<='].includes(op)) {
        if (op === '===') op = '==';
        if (op === '!==') op = '!=';
        return { type: T_BOOL, expr: `(${L.expr} ${op} ${R.expr})` };
      }
      if (op === '&&' || op === '||') {
        return { type: T_BOOL, expr: `(${L.expr} ${op} ${R.expr})` };
      }
      return { type: resultType, expr: `(${L.expr} ${op} ${R.expr})` };
    }
    case '呼出': {
      const args = e.args.map(a => compileExpr(a, env, userFuncDecls));
      const argTypes = args.map(a => a.type);
      const argExprs = args.map(a => a.expr);
      // 組み込み業？
      if (e.func in BUILTIN_FUNCS) {
        const def = BUILTIN_FUNCS[e.func];
        const ret = def.ret(...argTypes);
        const expr = def.transform
          ? `${def.glsl}(${def.transform(argExprs)})`
          : `${def.glsl}(${argExprs.join(', ')})`;
        return { type: ret, expr };
      }
      // ユーザ定義業？
      if (userFuncDecls.has(e.func)) {
        const decl = userFuncDecls.get(e.func);
        return { type: decl.retType, expr: `${asciiIdent(e.func)}(${argExprs.join(', ')})` };
      }
      throw new Error(`影詞翻訳誤り：未定義の業 「${e.func}」`);
    }
    case '鍵': {
      // swizzling: v の「赤」 → v.r
      const obj = compileExpr(e.obj, env, userFuncDecls);
      if (e.key.type !== '文字列直') throw new Error('影詞翻訳誤り：鍵は文字列直書のみ');
      const k = e.key.value;
      if (!(k in SWIZZLE)) throw new Error(`影詞翻訳誤り：未対応の成分 「${k}」`);
      return { type: T_FLOAT, expr: `${obj.expr}.${SWIZZLE[k]}` };
    }
    case '索引': {
      // vec の N 番目（1-indexed）→ vec[N-1]
      const arr = compileExpr(e.array, env, userFuncDecls);
      let glIdx;
      if (e.index.type === '数値直') {
        glIdx = String(Math.floor(e.index.value) - 1);
      } else {
        const idx = compileExpr(e.index, env, userFuncDecls);
        glIdx = `int(${idx.expr}) - 1`;
      }
      // 結果型は vec の成分なので float
      return { type: T_FLOAT, expr: `${arr.expr}[${glIdx}]` };
    }
    case '長': {
      // length 業のみサポート（配列長は GLSL に対応物なし）
      throw new Error('影詞翻訳誤り：「長さ／総数」は影詞では未対応（vec の成分は固定数なり）');
    }
    default:
      throw new Error(`影詞翻訳誤り：未対応の式「${e.type}」`);
  }
}

function unifyType(a, b) {
  if (a === b) return a;
  // vec と float の混在 → vec
  if (a === T_FLOAT) return b;
  if (b === T_FLOAT) return a;
  // vec 同士で型が違う場合はエラー（簡素化のため、最小プロト）
  throw new Error(`影詞翻訳誤り：型不一致 ${a} vs ${b}`);
}

function formatFloat(n) {
  // GLSL は 1.0 と書かないと整数扱いになる
  if (Number.isInteger(n)) return `${n}.0`;
  return String(n);
}
