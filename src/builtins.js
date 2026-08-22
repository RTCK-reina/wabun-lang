// wabun-lang ビルトイン関数群
// 利用形：「絶対値 に 値 を奉りたる」「最大 に 三 と 五 を奉りたる」など

import { parseKansuji } from './lexer.js';

export const BUILTIN_NAMES = [
  // 数値
  '絶対値', '平方根', '切り捨て', '切り上げ', '四捨五入',
  '最大', '最小', '冪', '対数', '自然対数', '正弦', '余弦', '正接',
  // 数学定数
  '円周率', '自然底',
  // 乱数
  '乱数', '乱整数',
  // 文字列・配列
  '部分', '逆順', '並べ替へ', '降順', '含む', '結ぶ', '分かつ',
  // 高階関数
  '写し替へ', '選び出し', '束ね', '巡らす', '一切', '孰れか',
  // 文字列ユーティリティ
  '整ふ', '冒頭', '末尾', '探す', '大文字化', '小文字化', '置換',
  // 配列ユーティリティ
  '末尾追加', '末尾除去', '先頭除去', '先頭追加', '空',
  // レコードユーティリティ
  '鍵列挙', '値列挙',
  // 日付・時刻
  '今', '日付', '時刻',
  // 変換
  '数値化', '文字列化', '型',
];

export function makeBuiltins() {
  return {
    // 数値
    '絶対値': (n) => Math.abs(n),
    '平方根': (n) => Math.sqrt(n),
    '切り捨て': (n) => Math.floor(n),
    '切り上げ': (n) => Math.ceil(n),
    '四捨五入': (n) => Math.round(n),
    '最大': (...xs) => xs.length === 1 && Array.isArray(xs[0]) ? Math.max(...xs[0]) : Math.max(...xs),
    '最小': (...xs) => xs.length === 1 && Array.isArray(xs[0]) ? Math.min(...xs[0]) : Math.min(...xs),
    '冪': (a, b) => Math.pow(a, b),
    '対数': (n, base) => base === undefined ? Math.log10(n) : Math.log(n) / Math.log(base),
    '自然対数': (n) => Math.log(n),
    '正弦': (n) => Math.sin(n),
    '余弦': (n) => Math.cos(n),
    '正接': (n) => Math.tan(n),

    // 数学定数
    '円周率': Math.PI,
    '自然底': Math.E,

    // 乱数
    '乱数': () => Math.random(),
    '乱整数': (max) => Math.floor(Math.random() * max),

    // 文字列・配列
    '部分': (s, start, end) => {
      const arr = [...String(s)];
      const e = end === undefined ? arr.length : end;
      return arr.slice(start - 1, e).join('');
    },
    '逆順': (v) => {
      if (Array.isArray(v)) return [...v].reverse();
      return [...String(v)].reverse().join('');
    },
    '並べ替へ': (arr) => {
      if (!Array.isArray(arr)) throw new Error('実行時誤り：「並べ替へ」は配列にのみ用ふ');
      return [...arr].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    },
    '降順': (arr) => {
      if (!Array.isArray(arr)) throw new Error('実行時誤り：「降順」は配列にのみ用ふ');
      return [...arr].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
    },
    '含む': (haystack, needle) => {
      if (Array.isArray(haystack)) return haystack.includes(needle);
      return String(haystack).includes(String(needle));
    },
    '結ぶ': (arr, sep) => {
      if (!Array.isArray(arr)) throw new Error('実行時誤り：「結ぶ」は配列にのみ用ふ');
      return arr.map((x) => (typeof x === 'string' ? x : String(x))).join(sep ?? '');
    },
    '分かつ': (s, sep) => String(s).split(sep ?? ''),

    // 高階関数（async対応：ユーザ定義関数は async function なので await が必須）
    '写し替へ': async (arr, fn) => {
      if (!Array.isArray(arr)) throw new Error('実行時誤り：「写し替へ」は配列にのみ用ふ');
      const out = [];
      for (const x of arr) out.push(await fn(x));
      return out;
    },
    '選び出し': async (arr, fn) => {
      if (!Array.isArray(arr)) throw new Error('実行時誤り：「選び出し」は配列にのみ用ふ');
      const out = [];
      for (const x of arr) if (await fn(x)) out.push(x);
      return out;
    },
    '束ね': async (arr, fn, init) => {
      if (!Array.isArray(arr)) throw new Error('実行時誤り：「束ね」は配列にのみ用ふ');
      let acc = init;
      for (const x of arr) acc = await fn(acc, x);
      return acc;
    },
    '巡らす': async (arr, fn) => {
      if (!Array.isArray(arr)) throw new Error('実行時誤り：「巡らす」は配列にのみ用ふ');
      for (const x of arr) await fn(x);
    },
    '一切': async (arr, fn) => {
      if (!Array.isArray(arr)) throw new Error('実行時誤り：「一切」は配列にのみ用ふ');
      for (const x of arr) if (!(await fn(x))) return false;
      return true;
    },
    '孰れか': async (arr, fn) => {
      if (!Array.isArray(arr)) throw new Error('実行時誤り：「孰れか」は配列にのみ用ふ');
      for (const x of arr) if (await fn(x)) return true;
      return false;
    },

    // 文字列ユーティリティ
    '整ふ': (s) => String(s).trim(),
    '冒頭': (s, prefix) => String(s).startsWith(String(prefix)),
    '末尾': (s, suffix) => String(s).endsWith(String(suffix)),
    '探す': (haystack, needle) => {
      const idx = String(haystack).indexOf(String(needle));
      return idx < 0 ? 0 : idx + 1; // 1-indexed、見つからなければ 0
    },
    '大文字化': (s) => String(s).toUpperCase(),
    '小文字化': (s) => String(s).toLowerCase(),
    '置換': (s, from, to) => String(s).split(String(from)).join(String(to)),

    // 配列ユーティリティ
    '末尾追加': (arr, v) => { arr.push(v); return arr; },
    '末尾除去': (arr) => arr.pop() ?? null,
    '先頭除去': (arr) => arr.shift() ?? null,
    '先頭追加': (arr, v) => { arr.unshift(v); return arr; },
    '空': (v) => {
      if (v === null || v === undefined) return true;
      if (Array.isArray(v)) return v.length === 0;
      if (typeof v === 'string') return v.length === 0;
      if (typeof v === 'object') return Object.keys(v).length === 0;
      return false;
    },

    // レコードユーティリティ
    '鍵列挙': (obj) => {
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('実行時誤り：「鍵列挙」は録にのみ用ふ');
      }
      return Object.keys(obj);
    },
    '値列挙': (obj) => {
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('実行時誤り：「値列挙」は録にのみ用ふ');
      }
      return Object.values(obj);
    },

    // 日付・時刻
    '今': () => Date.now(),
    '日付': () => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}/${m}/${day}`;
    },
    '時刻': () => {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      return `${h}:${m}:${s}`;
    },

    // 変換
    '数値化': (s) => {
      const str = String(s).trim();
      const n = Number(str);
      if (!Number.isNaN(n)) return n;
      const k = parseKansuji(str);
      return k;
    },
    '文字列化': (v) => {
      if (v === null || v === undefined) return '無し';
      if (typeof v === 'boolean') return v ? '真' : '偽';
      return String(v);
    },
    '型': (v) => {
      if (v === null || v === undefined) return '空';
      if (typeof v === 'boolean') return '真偽';
      if (typeof v === 'number') return '数';
      if (typeof v === 'string') return '文字列';
      if (Array.isArray(v)) return '集';
      if (typeof v === 'object') return '録';
      if (typeof v === 'function') return '業';
      return '不明';
    },
  };
}
