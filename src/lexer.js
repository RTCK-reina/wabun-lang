// wabun-lang lexer
// 古典日本語ベース言語のための字句解析器

const KANSUJI_DIGITS = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
const KANSUJI_SMALL_UNIT = { '十': 10, '百': 100, '千': 1000 };
const KANSUJI_BIG_UNIT = {
  '万': 10000,
  '億': 100000000,
  '兆': 1000000000000,
  '京': 10000000000000000, // ※ JS Number 精度限界に近づく ※
};

const KANSUJI_CHAR = new Set([
  ...Object.keys(KANSUJI_DIGITS),
  ...Object.keys(KANSUJI_SMALL_UNIT),
  ...Object.keys(KANSUJI_BIG_UNIT),
]);

export function parseKansuji(str) {
  if (/^[+-]?\d+(\.\d+)?$/.test(str)) return Number(str);
  // 中黒区切りの小数：「三・一四」 → 3.14
  if (str.includes('・')) {
    const [intPart, fracPart] = str.split('・');
    const intVal = parseKansujiInt(intPart);
    let fracVal = 0;
    let scale = 1;
    for (const ch of fracPart) {
      const d = KANSUJI_DIGITS[ch];
      if (d === undefined) return NaN;
      scale *= 10;
      fracVal = fracVal * 10 + d;
    }
    return intVal + fracVal / scale;
  }
  return parseKansujiInt(str);
}

function parseKansujiInt(str) {
  let totalBig = 0;
  let segment = 0;
  let current = 0;
  for (const ch of str) {
    if (KANSUJI_DIGITS[ch] !== undefined) {
      current = current * 10 + KANSUJI_DIGITS[ch];
      // 直前が数字だった場合は十進連結扱い（「一二三」=123）
    } else if (KANSUJI_SMALL_UNIT[ch] !== undefined) {
      segment += (current || 1) * KANSUJI_SMALL_UNIT[ch];
      current = 0;
    } else if (KANSUJI_BIG_UNIT[ch] !== undefined) {
      segment += current;
      totalBig += (segment || 1) * KANSUJI_BIG_UNIT[ch];
      segment = 0;
      current = 0;
    } else {
      return NaN;
    }
  }
  return totalBig + segment + current;
}

// キーワード（長い順に並べる ＝ 最長一致のため）
const KEYWORDS_RAW = [
  // ブロック終端（長い順）
  '繰り返し終はりぬ',
  '業終はりぬ',
  '然らば終はり',
  '然らずして',
  '然らずば',
  '然らば',
  '返すなり',
  '返す業',
  '受けて',
  'なる間',
  '増しつつ',
  '減じつつ',
  '為して',
  '一つずつ',
  '各々',
  '終はりぬ',
  '終はり',
  '云ふ',
  '改む',
  '削る',
  '試みに',
  '試み終はりぬ',
  '過つに',
  'を以て',
  '投ぐ',
  '加へたる',
  '引きたる',
  '掛けたる',
  '割りたる余り',
  '割りたる',
  '加ふ',
  '引く',
  '掛く',
  '割る',
  '余り',
  '等し',
  '異なり',
  '大なり',
  '小なり',
  '劣らず',
  '勝らず',
  '且つ',
  '或いは',
  '非ず',
  '書きけり',
  '詠みけり',
  '問ひけり',
  '読み入れけり',
  'ならば',
  '奉りたる',
  '奉りけり',
  '奉る',
  '番目',
  '総数',
  '継ぎたる',
  '長さ',
  '集ひ終はり',
  '集ひ',
  '録終はり',
  '録：',
  '真',
  '偽',
  '無し',
  '負の',
  'より',
  'まで',
  'にて',
  'の間',
  'を',
  'に',
  'と',
  'の',
  'は',
];

// 長い順にソート（先頭一致のとき長いものを優先）
const KEYWORDS = [...KEYWORDS_RAW].sort((a, b) => b.length - a.length);

export const TOKEN = {
  NUM: '数値',
  STRING: '文字列',
  IDENT: '識別子',
  KW: '予約',
  DOT: '句点',         // 。
  COMMA: '読点',       // 、
  ARRAY_OPEN: '集開',  // 〔
  ARRAY_CLOSE: '集閉', // 〕
  PAREN_OPEN: '括開',  // （ or (
  PAREN_CLOSE: '括閉', // ） or )
  COLON: '二点',       // ：
  EOF: '文末',
};

const PUNCT_MAP = {
  '。': TOKEN.DOT,
  '、': TOKEN.COMMA,
  '〔': TOKEN.ARRAY_OPEN,
  '〕': TOKEN.ARRAY_CLOSE,
  '（': TOKEN.PAREN_OPEN,
  '）': TOKEN.PAREN_CLOSE,
  '(': TOKEN.PAREN_OPEN,
  ')': TOKEN.PAREN_CLOSE,
  '：': TOKEN.COLON,
  ':': TOKEN.COLON,
};

const WHITESPACE = /\s|　/;

function isIdentChar(ch) {
  // 識別子に使える文字：漢字・ひらがな・カタカナ・英数字・アンダースコア
  // ただし KANSUJI_CHAR と PUNCT と「」※ は除く
  if (!ch) return false;
  if (KANSUJI_CHAR.has(ch)) return false;
  if (PUNCT_MAP[ch]) return false;
  if (ch === '「' || ch === '」' || ch === '※') return false;
  if (ch === '（' || ch === '）' || ch === '(' || ch === ')') return false;
  if (WHITESPACE.test(ch)) return false;
  // unicode ranges
  const code = ch.codePointAt(0);
  // hiragana
  if (code >= 0x3040 && code <= 0x309F) return true;
  // katakana
  if (code >= 0x30A0 && code <= 0x30FF) return true;
  // CJK unified ideographs
  if (code >= 0x4E00 && code <= 0x9FFF) return true;
  // CJK extension A
  if (code >= 0x3400 && code <= 0x4DBF) return true;
  // 踊り字・繰り返し記号
  if (ch === '々' || ch === '〆' || ch === '〻') return true;
  // ASCII letters/digits/underscore
  if (/[A-Za-z0-9_]/.test(ch)) return true;
  return false;
}

export function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const N = source.length;

  function makePos() {
    return { line, col };
  }

  function advance(n = 1) {
    for (let k = 0; k < n; k++) {
      if (source[i] === '\n') { line++; col = 1; }
      else col++;
      i++;
    }
  }

  while (i < N) {
    const ch = source[i];

    // 空白
    if (WHITESPACE.test(ch)) { advance(); continue; }

    // コメント ※ ... ※ または ※ ... 行末
    if (ch === '※') {
      advance();
      while (i < N && source[i] !== '※' && source[i] !== '\n') advance();
      if (i < N && source[i] === '※') advance();
      continue;
    }

    // 句読点・括弧
    if (PUNCT_MAP[ch]) {
      tokens.push({ type: PUNCT_MAP[ch], value: ch, ...makePos() });
      advance();
      continue;
    }

    // 文字列リテラル 「...」
    if (ch === '「') {
      const start = makePos();
      advance();
      let buf = '';
      while (i < N && source[i] !== '」') {
        // エスケープは扱わない（シンプルに）
        buf += source[i];
        advance();
      }
      if (i >= N) {
        throw new Error(`字句解析誤り：閉じ鉤括弧『」』来たらず（位置 ${start.line}:${start.col}）`);
      }
      advance(); // skip 」
      tokens.push({ type: TOKEN.STRING, value: buf, ...start });
      continue;
    }

    // キーワード（最長一致） — 漢数字判定よりも先に試す
    let matched = null;
    for (const kw of KEYWORDS) {
      if (source.startsWith(kw, i)) { matched = kw; break; }
    }
    if (matched) {
      tokens.push({ type: TOKEN.KW, value: matched, ...makePos() });
      advance(matched.length);
      continue;
    }

    // 漢数字 / アラビア数字 / 中黒小数
    // ただし「四季」「五月」のように漢数字の続きが識別子文字なら識別子として扱う
    if (KANSUJI_CHAR.has(ch) || /[0-9]/.test(ch)) {
      const start = makePos();
      // 漢数字シーケンスの終端位置を先読み
      let scanEnd = i;
      while (scanEnd < N) {
        if (scanEnd > i) {
          let kwHere = false;
          for (const kw of KEYWORDS) {
            if (source.startsWith(kw, scanEnd)) { kwHere = true; break; }
          }
          if (kwHere) break;
        }
        const c = source[scanEnd];
        if (KANSUJI_CHAR.has(c) || /[0-9.・]/.test(c)) scanEnd++;
        else break;
      }
      // 続きが「KW以外の識別子文字」なら識別子として扱う
      const follow = source[scanEnd];
      let isIdentExt = false;
      if (follow && isIdentChar(follow)) {
        let kwAtFollow = false;
        for (const kw of KEYWORDS) {
          if (source.startsWith(kw, scanEnd)) { kwAtFollow = true; break; }
        }
        if (!kwAtFollow) isIdentExt = true;
      }
      if (!isIdentExt) {
        let raw = '';
        while (i < scanEnd) { raw += source[i]; advance(); }
        const val = parseKansuji(raw);
        if (Number.isNaN(val)) {
          throw new Error(`字句解析誤り：不正なる数「${raw}」（位置 ${start.line}:${start.col}）`);
        }
        tokens.push({ type: TOKEN.NUM, value: val, raw, ...start });
        continue;
      }
      // ↓ fall through to identifier reading
    }

    // 識別子（漢数字も内部に含めて読む）
    if (isIdentChar(ch) || KANSUJI_CHAR.has(ch)) {
      const start = makePos();
      let buf = '';
      while (i < N) {
        const c = source[i];
        if (!(isIdentChar(c) || KANSUJI_CHAR.has(c))) break;
        let stop = false;
        for (const kw of KEYWORDS) {
          if (source.startsWith(kw, i) && buf.length > 0) { stop = true; break; }
        }
        if (stop) break;
        buf += c;
        advance();
      }
      if (buf.length === 0) {
        throw new Error(`字句解析誤り：未知の文字「${ch}」（位置 ${start.line}:${start.col}）`);
      }
      tokens.push({ type: TOKEN.IDENT, value: buf, ...start });
      continue;
    }

    throw new Error(`字句解析誤り：未知の文字「${ch}」（位置 ${line}:${col}、U+${ch.codePointAt(0).toString(16).toUpperCase()}）`);
  }

  tokens.push({ type: TOKEN.EOF, value: null, line, col });
  return tokens;
}
