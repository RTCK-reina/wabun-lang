// wabun-lang runtime
// __和__ オブジェクトをJS環境に注入して使用する。

import { makeBuiltins } from './builtins.js';

export function makeRuntime({ env = 'node', writeLine, readLine } = {}) {
  const out = [];
  return {
    env,
    output: out,
    builtins: makeBuiltins(),
    print(v) {
      const s = stringify(v);
      if (writeLine) writeLine(s);
      else out.push(s);
    },
    async input() {
      if (readLine) return await readLine();
      return '';
    },
    truthy(v) {
      if (v === null || v === undefined) return false;
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'string') return v.length > 0;
      if (Array.isArray(v)) return v.length > 0;
      return Boolean(v);
    },
    add(a, b) {
      if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
      if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
      return a + b;
    },
    index(arr, n) {
      // 1-indexed
      if (typeof arr === 'string') return [...arr][n - 1] ?? null;
      if (Array.isArray(arr)) return arr[n - 1] ?? null;
      throw new Error('実行時誤り：「番目」は配列か文字列にのみ用ふ');
    },
    member(obj, key) {
      if (obj === null || obj === undefined) return null;
      if (typeof obj !== 'object') throw new Error('実行時誤り：「の」によるキー参照は録（レコード）にのみ用ふ');
      return obj[key] ?? null;
    },
    indexSet(arr, n, value) {
      if (!Array.isArray(arr)) throw new Error('実行時誤り：「番目に…を改む」は配列にのみ用ふ');
      arr[n - 1] = value;
    },
    memberSet(obj, key, value) {
      if (obj === null || typeof obj !== 'object') throw new Error('実行時誤り：「の…に改む」は録にのみ用ふ');
      obj[key] = value;
    },
    indexDel(arr, n) {
      if (!Array.isArray(arr)) throw new Error('実行時誤り：「番目を削る」は配列にのみ用ふ');
      arr.splice(n - 1, 1);
    },
    memberDel(obj, key) {
      if (obj === null || typeof obj !== 'object') throw new Error('実行時誤り：「の…を削る」は録にのみ用ふ');
      delete obj[key];
    },
    strlen(s) {
      if (typeof s !== 'string') throw new Error('実行時誤り：「長さ」は文字列にのみ用ふ');
      return [...s].length;
    },
  };
}

export function stringify(v) {
  if (v === null || v === undefined) return '無し';
  if (typeof v === 'boolean') return v ? '真' : '偽';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return '〔' + v.map(stringify).join('、') + '〕';
  if (typeof v === 'object') {
    const ents = Object.entries(v).map(([k, val]) => `「${k}」は${stringify(val)}`);
    return '録：' + ents.join('、') + '、録終はり';
  }
  return String(v);
}
