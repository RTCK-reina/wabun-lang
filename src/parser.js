// wabun-lang parser
// 手書き再帰下降パーサ

import { TOKEN } from './lexer.js';

export function parse(tokens) {
  const p = new Parser(tokens);
  return p.parseProgram();
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  isType(type, offset = 0) {
    const t = this.peek(offset);
    return t && t.type === type;
  }

  isKW(value, offset = 0) {
    const t = this.peek(offset);
    return t && t.type === TOKEN.KW && t.value === value;
  }

  isAnyKW(values, offset = 0) {
    const t = this.peek(offset);
    return t && t.type === TOKEN.KW && values.includes(t.value);
  }

  consume() {
    return this.tokens[this.pos++];
  }

  expectKW(value) {
    const t = this.peek();
    if (!this.isKW(value)) {
      throw this.err(`『${value}』を期待せしも『${this.describeToken(t)}』来たり`);
    }
    return this.consume();
  }

  expectType(type) {
    const t = this.peek();
    if (!this.isType(type)) {
      throw this.err(`『${this.typeJa(type)}』を期待せしも『${this.describeToken(t)}』来たり`);
    }
    return this.consume();
  }

  typeJa(type) {
    return ({
      NUM: '数値',
      STRING: '文字列',
      IDENT: '識別子',
      KW: 'キーワード',
      DOT: '句点',
      COMMA: '読点',
      ARRAY_OPEN: '〔',
      ARRAY_CLOSE: '〕',
      PAREN_OPEN: '（',
      PAREN_CLOSE: '）',
      COLON: '：',
      EOF: '文末',
    })[type] ?? type;
  }

  optional(type) {
    if (this.isType(type)) { this.consume(); return true; }
    return false;
  }

  optionalKW(value) {
    if (this.isKW(value)) { this.consume(); return true; }
    return false;
  }

  describeToken(t) {
    if (!t) return '文末';
    if (t.type === TOKEN.KW || t.type === TOKEN.IDENT || t.type === TOKEN.STRING) return String(t.value);
    if (t.type === TOKEN.NUM) return String(t.value);
    return this.typeJa(t.type);
  }

  err(msg) {
    const t = this.peek();
    const where = t ? `${t.line}:${t.col}` : '文末';
    return new Error(`構文解析誤り：${msg}（位置 ${where}）`);
  }

  parseProgram() {
    const body = [];
    while (!this.isType(TOKEN.EOF)) {
      body.push(this.parseStmt());
    }
    return { type: '全体', body };
  }

  // -------- 文 --------

  parseStmt() {
    // 関数定義の検出（先頭がない場合は IDENT と IDENT を受けて返す業を ... の形）
    if (this.isFuncDeclStart()) return this.parseFuncDecl();

    // 例外処理（先頭が「試みに」KW）
    if (this.isKW('試みに')) return this.parseTryCatch();

    // ループ・If の検出（先読みが必要）
    // ※ Return より先にチェックする（ifブロック中のreturnを外側のreturnと誤判定しないため）
    if (this.isRangeLoopStart()) return this.parseRangeLoop();
    if (this.isForEachStart()) return this.parseForEach();
    if (this.isWhileLoopStart()) return this.parseWhileLoop();
    if (this.isIfStart()) return this.parseIf();

    if (this.isReturnStart()) return this.parseReturn();
    if (this.isThrowStart()) return this.parseThrow();
    if (this.isImportStart()) return this.parseImport();

    // ArrayPush
    if (this.isArrayPushStart()) return this.parseArrayPush();

    // Assign（単純・索引・メンバー）
    if (this.isAssignStart()) return this.parseAssign();

    // Delete（索引・メンバー）
    if (this.isDeleteStart()) return this.parseDelete();

    // Input
    if (this.isInputStart()) return this.parseInput();

    // CallStmt
    if (this.isCallStmtStart()) return this.parseCallStmt();

    // VarDecl or Print（共に式から始まる）
    return this.parseExprBasedStmt();
  }

  // 先読み補助：トークン列の中から特定キーワードを探す
  // (until 「。」 まで)
  scanForKW(value, untilTypes = [TOKEN.DOT]) {
    let depth = 0;
    for (let k = 0; this.peek(k); k++) {
      const t = this.peek(k);
      if (t.type === TOKEN.EOF) return -1;
      if (t.type === TOKEN.ARRAY_OPEN || t.type === TOKEN.PAREN_OPEN) depth++;
      if (t.type === TOKEN.ARRAY_CLOSE || t.type === TOKEN.PAREN_CLOSE) {
        depth--;
        if (depth < 0) return -1; // 現在のスコープから抜けた
      }
      if (depth === 0 && t.type === TOKEN.KW && t.value === value) return k;
      if (depth === 0 && untilTypes.includes(t.type)) return -1;
    }
    return -1;
  }

  // 関数定義の開始判定：「受けて返す業を IDENT と云ふ。」を含むか、句点まで
  isFuncDeclStart() {
    return this.scanForKW('受けて') >= 0 && this.scanForKW('返す業') >= 0;
  }

  isReturnStart() {
    return this.scanForKW('返すなり') >= 0;
  }

  isThrowStart() {
    return this.scanForKW('投ぐ', [TOKEN.DOT]) >= 0;
  }

  isImportStart() {
    // 「STRING を 読み入れけり。」
    if (!this.isType(TOKEN.STRING)) return false;
    return this.scanForKW('読み入れけり', [TOKEN.DOT]) >= 0;
  }

  isRangeLoopStart() {
    // 「A より B まで IDENT を一つずつ 増しつつ/減じつつ」
    const moreFrom = this.scanForKW('より', [TOKEN.DOT]);
    if (moreFrom < 0) return false;
    const upto = this.scanForKW('まで', [TOKEN.DOT]);
    if (upto < 0) return false;
    return this.scanForKW('一つずつ', [TOKEN.DOT]) >= 0;
  }

  isForEachStart() {
    // 「IDENT の各々を IDENT と為して、」
    return this.scanForKW('各々', [TOKEN.DOT]) >= 0
        && this.scanForKW('為して', [TOKEN.DOT]) >= 0;
  }

  isWhileLoopStart() {
    // 「Expr なる間、」
    return this.scanForKW('なる間', [TOKEN.DOT]) >= 0;
  }

  isIfStart() {
    // 句点までに「ならば」がある、かつ「然らば終はり」がそのうち来る
    return this.scanForKW('ならば', [TOKEN.DOT]) >= 0;
  }

  isArrayPushStart() {
    // 「IDENT に Expr を加へけり。」 ← 末尾「加へけり」「加へけり」検出
    // 簡易：最初がIDENT、句点まで先読みして「加へ」+ KW(けり相当の出力ではなく) なし、ここでは「加へけり」を独立ワードに
    // 実装簡単化：仕様変更で配列追加は「IDENT に Expr を加ふ。」とする（命令形）
    if (!this.isType(TOKEN.IDENT)) return false;
    return this.scanForKWSequence(['に', '加ふ'], [TOKEN.DOT]);
  }

  isAssignStart() {
    // 「IDENT に Expr を改む。」または索引・メンバー版
    if (!this.isType(TOKEN.IDENT)) return false;
    return this.scanForKW('改む', [TOKEN.DOT]) >= 0;
  }

  isDeleteStart() {
    // 「IDENT の N 番目 を削る。」または「IDENT の「key」を削る。」
    if (!this.isType(TOKEN.IDENT)) return false;
    return this.scanForKW('削る', [TOKEN.DOT]) >= 0;
  }

  isInputStart() {
    // 「IDENT に問ひけり。」
    if (!this.isType(TOKEN.IDENT)) return false;
    return this.scanForKWSequence(['に', '問ひけり'], [TOKEN.DOT]);
  }

  isCallStmtStart() {
    // 「IDENT に ... を奉りけり。」
    // 直近の動詞が「奉りけり」であることを確かめる（演算動詞より前に出るか）
    if (!this.isType(TOKEN.IDENT)) return false;
    const next = this.peek(1);
    if (!next || next.type !== TOKEN.KW || next.value !== 'に') return false;
    return this.findCallTerminator('奉りけり', 2);
  }

  // 自身の Call の終端動詞が、他の演算動詞よりも先に深さ0で現れるか
  findCallTerminator(terminator, startK) {
    const NON_CALL = ['加へたる', '掛けたる', '引きたる', '割りたる', '割りたる余り', '継ぎたる', '改む', '削る', '云ふ', '為して', '加ふ', '問ひけり', 'ならば'];
    let depth = 0;
    for (let k = startK; this.peek(k); k++) {
      const t = this.peek(k);
      if (t.type === TOKEN.EOF) return false;
      if (t.type === TOKEN.ARRAY_OPEN || t.type === TOKEN.PAREN_OPEN) depth++;
      else if (t.type === TOKEN.ARRAY_CLOSE || t.type === TOKEN.PAREN_CLOSE) {
        depth--;
        if (depth < 0) return false;
      } else if (depth === 0) {
        if (t.type === TOKEN.DOT) return false;
        if (t.type === TOKEN.KW) {
          if (t.value === terminator) return true;
          if (NON_CALL.includes(t.value)) return false;
        }
      }
    }
    return false;
  }

  // KW列の存在を、句点まで検出
  scanForKWSequence(seq, untilTypes = [TOKEN.DOT]) {
    let idx = 0;
    let depth = 0;
    for (let k = 0; this.peek(k); k++) {
      const t = this.peek(k);
      if (t.type === TOKEN.EOF) return false;
      if (t.type === TOKEN.ARRAY_OPEN || t.type === TOKEN.PAREN_OPEN) depth++;
      if (t.type === TOKEN.ARRAY_CLOSE || t.type === TOKEN.PAREN_CLOSE) {
        depth--;
        if (depth < 0) return false;
      }
      if (depth === 0 && t.type === TOKEN.KW && t.value === seq[idx]) {
        idx++;
        if (idx === seq.length) return true;
      }
      if (depth === 0 && untilTypes.includes(t.type)) return false;
    }
    return false;
  }

  // -------- 各文の実装 --------

  parseFuncDecl() {
    // 「IDENT (と IDENT)* を 受けて返す業を IDENT と云ふ。」または「受けて返す業を IDENT と云ふ。」
    const params = [];
    if (this.isType(TOKEN.IDENT)) {
      // パラメータあり
      params.push(this.consume().value);
      while (this.isKW('と')) {
        this.consume();
        if (!this.isType(TOKEN.IDENT)) break;
        params.push(this.consume().value);
      }
      this.expectKW('を');
    }
    this.expectKW('受けて');
    this.expectKW('返す業');
    this.expectKW('を');
    const name = this.expectType(TOKEN.IDENT).value;
    this.expectKW('と');
    this.expectKW('云ふ');
    this.expectType(TOKEN.DOT);

    const body = [];
    while (!this.isKW('業終はりぬ') && !this.isType(TOKEN.EOF)) {
      body.push(this.parseStmt());
    }
    this.expectKW('業終はりぬ');
    this.expectType(TOKEN.DOT);
    return { type: '業宣言', name, params, body };
  }

  parseReturn() {
    const value = this.parseExpr();
    this.expectKW('を');
    this.expectKW('返すなり');
    this.expectType(TOKEN.DOT);
    return { type: '返却', value };
  }

  parseThrow() {
    const value = this.parseExpr();
    this.expectKW('を');
    this.expectKW('投ぐ');
    this.expectType(TOKEN.DOT);
    return { type: '投擲', value };
  }

  parseImport() {
    const path = this.expectType(TOKEN.STRING).value;
    this.expectKW('を');
    this.expectKW('読み入れけり');
    this.expectType(TOKEN.DOT);
    return { type: '読入', path };
  }

  parseTryCatch() {
    this.expectKW('試みに');
    this.optional(TOKEN.COMMA);
    const tryBody = this.parseBlock(['過つに', '試み終はりぬ']);
    let catchVar = null;
    let catchBody = null;
    if (this.isKW('過つに')) {
      this.consume();
      this.optional(TOKEN.COMMA);
      // 「e を以て」 で受け変数指定（任意）
      if (this.isType(TOKEN.IDENT)) {
        const save = this.pos;
        const name = this.consume().value;
        if (this.isKW('を以て')) {
          this.consume();
          catchVar = name;
          this.optional(TOKEN.COMMA);
        } else {
          this.pos = save;
        }
      }
      catchBody = this.parseBlock(['試み終はりぬ']);
    }
    this.expectKW('試み終はりぬ');
    this.expectType(TOKEN.DOT);
    return { type: '試捕', tryBody, catchVar, catchBody };
  }

  parseRangeLoop() {
    const from = this.parseExpr();
    this.expectKW('より');
    const to = this.parseExpr();
    this.expectKW('まで');
    const varName = this.expectType(TOKEN.IDENT).value;
    this.expectKW('を');
    this.expectKW('一つずつ');
    let direction;
    if (this.optionalKW('増しつつ')) direction = 'inc';
    else if (this.optionalKW('減じつつ')) direction = 'dec';
    else throw this.err('『増しつつ』もしくは『減じつつ』を期待す');
    this.optional(TOKEN.COMMA);
    const body = this.parseBlock(['繰り返し終はりぬ']);
    this.expectKW('繰り返し終はりぬ');
    this.expectType(TOKEN.DOT);
    return { type: '範囲反復', from, to, varName, direction, body };
  }

  parseForEach() {
    const arrayName = this.expectType(TOKEN.IDENT).value;
    this.expectKW('の');
    this.expectKW('各々');
    this.expectKW('を');
    const itemName = this.expectType(TOKEN.IDENT).value;
    this.expectKW('と');
    this.expectKW('為して');
    this.optional(TOKEN.COMMA);
    const body = this.parseBlock(['繰り返し終はりぬ']);
    this.expectKW('繰り返し終はりぬ');
    this.expectType(TOKEN.DOT);
    return { type: '各々反復', array: { type: '変数', name: arrayName }, varName: itemName, body };
  }

  parseWhileLoop() {
    const cond = this.parseExpr();
    this.expectKW('なる間');
    this.optional(TOKEN.COMMA);
    const body = this.parseBlock(['繰り返し終はりぬ']);
    this.expectKW('繰り返し終はりぬ');
    this.expectType(TOKEN.DOT);
    return { type: '条件反復', cond, body };
  }

  parseIf() {
    const cond = this.parseExpr();
    this.expectKW('ならば');
    this.optional(TOKEN.COMMA);
    const thenBody = this.parseBlock(['然らずして', '然らずば', '然らば終はり']);
    const elseifs = [];
    while (this.isKW('然らずして')) {
      this.consume();
      this.optional(TOKEN.COMMA);
      const eCond = this.parseExpr();
      this.expectKW('ならば');
      this.optional(TOKEN.COMMA);
      const eBody = this.parseBlock(['然らずして', '然らずば', '然らば終はり']);
      elseifs.push({ cond: eCond, body: eBody });
    }
    let elseBody = null;
    if (this.isKW('然らずば')) {
      this.consume();
      this.optional(TOKEN.COMMA);
      elseBody = this.parseBlock(['然らば終はり']);
    }
    this.expectKW('然らば終はり');
    this.expectType(TOKEN.DOT);
    return { type: '条件', cond, then: thenBody, elseifs, else: elseBody };
  }

  parseBlock(terminators) {
    const body = [];
    while (!this.isType(TOKEN.EOF)) {
      const t = this.peek();
      if (t.type === TOKEN.KW && terminators.includes(t.value)) break;
      body.push(this.parseStmt());
    }
    return body;
  }

  parseArrayPush() {
    const target = this.expectType(TOKEN.IDENT).value;
    this.expectKW('に');
    const value = this.parseExpr();
    this.expectKW('を');
    this.expectKW('加ふ');
    this.expectType(TOKEN.DOT);
    return { type: '末尾加', target: { type: '変数', name: target }, value };
  }

  parseAssign() {
    const targetName = this.expectType(TOKEN.IDENT).value;
    // 索引／メンバー代入：IDENT の N 番目 / IDENT の「key」
    if (this.isKW('の')) {
      this.consume(); // の
      // 文字列キー
      if (this.isType(TOKEN.STRING)) {
        const k = this.consume();
        this.expectKW('に');
        const value = this.parseExpr();
        this.expectKW('を');
        this.expectKW('改む');
        this.expectType(TOKEN.DOT);
        return {
          type: '鍵代入',
          target: { type: '変数', name: targetName },
          key: { type: '文字列直', value: k.value },
          value,
        };
      }
      // 番目
      const index = this.parsePrimary();
      this.expectKW('番目');
      this.expectKW('に');
      const value = this.parseExpr();
      this.expectKW('を');
      this.expectKW('改む');
      this.expectType(TOKEN.DOT);
      return {
        type: '索引代入',
        target: { type: '変数', name: targetName },
        index,
        value,
      };
    }
    // 単純代入
    this.expectKW('に');
    const value = this.parseExpr();
    this.expectKW('を');
    this.expectKW('改む');
    this.expectType(TOKEN.DOT);
    return { type: '代入', name: targetName, value };
  }

  parseDelete() {
    const targetName = this.expectType(TOKEN.IDENT).value;
    this.expectKW('の');
    if (this.isType(TOKEN.STRING)) {
      const k = this.consume();
      this.expectKW('を');
      this.expectKW('削る');
      this.expectType(TOKEN.DOT);
      return {
        type: '鍵削',
        target: { type: '変数', name: targetName },
        key: { type: '文字列直', value: k.value },
      };
    }
    const index = this.parsePrimary();
    this.expectKW('番目');
    this.expectKW('を');
    this.expectKW('削る');
    this.expectType(TOKEN.DOT);
    return {
      type: '索引削',
      target: { type: '変数', name: targetName },
      index,
    };
  }

  parseInput() {
    const name = this.expectType(TOKEN.IDENT).value;
    this.expectKW('に');
    this.expectKW('問ひけり');
    this.expectType(TOKEN.DOT);
    return { type: '入力', name };
  }

  parseCallStmt() {
    const funcName = this.expectType(TOKEN.IDENT).value;
    this.expectKW('に');
    const args = [];
    if (this.isKW('奉りけり')) {
      // 「IDENT に 奉りけり」
    } else if (this.isKW('を') && this.peek(1) && this.peek(1).type === TOKEN.KW && this.peek(1).value === '奉りけり') {
      this.consume(); // を
    } else {
      args.push(this.parseExpr());
      while (this.isKW('と')) {
        const next = this.peek(1);
        if (!next) break;
        if (next.type === TOKEN.KW && ['云ふ', '為して', '改む', '受けて'].includes(next.value)) break;
        this.consume();
        args.push(this.parseExpr());
      }
      this.expectKW('を');
    }
    this.expectKW('奉りけり');
    this.expectType(TOKEN.DOT);
    return { type: '呼文', func: funcName, args };
  }

  parseExprBasedStmt() {
    // VarDecl: 〈Expr〉を IDENT と云ふ。
    // Print:   〈Expr〉を 書きけり｜詠みけり 。
    const value = this.parseExpr();
    this.expectKW('を');
    if (this.isKW('書きけり') || this.isKW('詠みけり')) {
      this.consume();
      this.expectType(TOKEN.DOT);
      return { type: '出力', value };
    }
    if (this.isType(TOKEN.IDENT)) {
      const name = this.consume().value;
      this.expectKW('と');
      this.expectKW('云ふ');
      this.expectType(TOKEN.DOT);
      return { type: '変数宣言', name, value };
    }
    throw this.err('『を』の後に『書きけり』『詠みけり』もしくは『〈名〉と云ふ』を期待す');
  }

  // -------- 式 --------

  parseExpr() { return this.parseOr(); }

  parseOr() {
    let left = this.parseAnd();
    while (this.isType(TOKEN.COMMA) && this.peek(1) && this.peek(1).type === TOKEN.KW && this.peek(1).value === '或いは') {
      this.consume(); // ,
      this.consume(); // 或いは
      const right = this.parseAnd();
      left = { type: '二項', op: '||', left, right };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseComparison();
    while (this.isType(TOKEN.COMMA) && this.peek(1) && this.peek(1).type === TOKEN.KW && this.peek(1).value === '且つ') {
      this.consume(); // ,
      this.consume(); // 且つ
      const right = this.parseComparison();
      left = { type: '二項', op: '&&', left, right };
    }
    return left;
  }

  // 比較：  Arith （、）Arith （に|より） 比較動詞
  parseComparison() {
    const left = this.parseArith();
    // ピーク：  ',' 'Arith2'  'に|より'  '等し|大なり|...'
    const save = this.pos;
    // optional ,
    let consumedComma = false;
    if (this.isType(TOKEN.COMMA)) { this.consume(); consumedComma = true; }
    // 次が比較式の右辺になりうるか軽く判定
    // 続く構造：  Arith に|より <比較動詞>  なら成立
    const futurePos = this.pos;
    const t = this.peek();
    // 比較が始まらないと判断したらバックトラック
    // Try parse: Arith2 (に|より) <比較動詞>
    if (t && (t.type === TOKEN.NUM || t.type === TOKEN.STRING || t.type === TOKEN.IDENT
              || (t.type === TOKEN.KW && (t.value === '真' || t.value === '偽' || t.value === '無し' || t.value === '負の' || t.value === '非ず'))
              || t.type === TOKEN.ARRAY_OPEN
              || t.type === TOKEN.PAREN_OPEN
              || (t.type === TOKEN.KW && (t.value === '集ひ' || t.value === '録：')))) {
      // 試しに右辺をパース
      try {
        const right = this.parseArith();
        if (this.isKW('に')) {
          // に 等し / に 異なり / に 劣らず / に 勝らず
          const next = this.peek(1);
          if (next && next.type === TOKEN.KW && ['等し', '異なり', '劣らず', '勝らず'].includes(next.value)) {
            this.consume(); // に
            const opKW = this.consume().value;
            const opMap = { '等し': '===', '異なり': '!==', '劣らず': '>=', '勝らず': '<=' };
            return { type: '二項', op: opMap[opKW], left, right };
          }
        }
        if (this.isKW('より')) {
          const next = this.peek(1);
          if (next && next.type === TOKEN.KW && ['大なり', '小なり'].includes(next.value)) {
            this.consume(); // より
            const opKW = this.consume().value;
            const opMap = { '大なり': '>', '小なり': '<' };
            return { type: '二項', op: opMap[opKW], left, right };
          }
        }
      } catch (e) {
        // ignore, backtrack
      }
    }
    // 比較ではない → ロールバック
    this.pos = save;
    return left;
  }

  // 算術：左から順に加減乗除を評価。優先順位は同レベル左結合
  parseArith() {
    let left = this.parseUnary();
    while (true) {
      // パターン1: <left> に <right> を 加へたる   → +
      // パターン2: <left> に <right> を 掛けたる   → *
      // パターン3: <left> より <right> を 引きたる  → -
      // パターン4: <left> を <right> にて 割りたる余り → %
      // パターン5: <left> を <right> にて 割りたる   → /
      // パターン6: <left> に <right> を 継ぎたる    → 連結 (+ for strings)
      const save = this.pos;
      if (this.isKW('に')) {
        this.consume();
        try {
          const right = this.parseUnary();
          if (this.isKW('を')) {
            const next = this.peek(1);
            if (next && next.type === TOKEN.KW && ['加へたる', '掛けたる', '継ぎたる'].includes(next.value)) {
              this.consume(); // を
              const opKW = this.consume().value;
              const opMap = { '加へたる': '+', '掛けたる': '*', '継ぎたる': '+' };
              left = { type: '二項', op: opMap[opKW], left, right };
              continue;
            }
          }
        } catch (e) {}
        this.pos = save; break;
      } else if (this.isKW('より')) {
        this.consume();
        try {
          const right = this.parseUnary();
          if (this.isKW('を')) {
            const next = this.peek(1);
            if (next && next.type === TOKEN.KW && next.value === '引きたる') {
              this.consume(); // を
              this.consume(); // 引きたる
              left = { type: '二項', op: '-', left, right };
              continue;
            }
          }
        } catch (e) {}
        this.pos = save; break;
      } else if (this.isKW('を')) {
        // 「を 奉りたる/奉りけり」 は外側 Call の閉じ → 演算ではない
        const peek1 = this.peek(1);
        if (peek1 && peek1.type === TOKEN.KW && (peek1.value === '奉りたる' || peek1.value === '奉りけり')) {
          break;
        }
        this.consume();
        try {
          const right = this.parseUnary();
          if (this.isKW('にて')) {
            const next = this.peek(1);
            if (next && next.type === TOKEN.KW && (next.value === '割りたる余り' || next.value === '割りたる')) {
              this.consume(); // にて
              const opKW = this.consume().value;
              const op = opKW === '割りたる余り' ? '%' : '/';
              left = { type: '二項', op, left, right };
              continue;
            }
          }
        } catch (e) {}
        this.pos = save; break;
      }
      break;
    }
    return left;
  }

  parseUnary() {
    if (this.isKW('負の')) {
      this.consume();
      const v = this.parseUnary();
      return { type: '単項', op: '-', value: v };
    }
    if (this.isKW('非ず')) {
      // 「Expr に非ず」 はpostfix扱い
      throw this.err('『非ず』は式の末尾にのみ用ふ');
    }
    let expr = this.parsePostfix(this.parsePrimary());
    // 否定は postfix: 「Expr に非ず」
    if (this.isKW('に') && this.peek(1) && this.peek(1).type === TOKEN.KW && this.peek(1).value === '非ず') {
      this.consume(); // に
      this.consume(); // 非ず
      expr = { type: '単項', op: '!', value: expr };
    }
    return expr;
  }

  parsePostfix(expr) {
    while (true) {
      // 〜の n 番目  → Index
      // 〜の「キー」  → Member（レコード／文字列キーアクセス）
      // 〜の総数 / 〜の長さ → Length
      if (this.isKW('の')) {
        const next = this.peek(1);
        if (next && next.type === TOKEN.KW && next.value === '総数') {
          this.consume(); this.consume();
          expr = { type: '長', target: expr, kind: 'count' };
          continue;
        }
        if (next && next.type === TOKEN.KW && next.value === '長さ') {
          this.consume(); this.consume();
          expr = { type: '長', target: expr, kind: 'len' };
          continue;
        }
        // 文字列キーアクセス：〜の「キー」
        if (next && next.type === TOKEN.STRING) {
          this.consume(); // の
          const key = this.consume();
          expr = { type: '鍵', obj: expr, key: { type: '文字列直', value: key.value } };
          continue;
        }
        // インデックス：〜の N 番目
        const save = this.pos;
        this.consume(); // の
        try {
          const index = this.parsePrimary();
          if (this.isKW('番目')) {
            this.consume();
            expr = { type: '索引', array: expr, index };
            continue;
          }
        } catch (e) {}
        this.pos = save;
        break;
      }
      break;
    }
    return expr;
  }

  parseRecordEntry() {
    const key = this.parseExpr();
    this.expectKW('は');
    const value = this.parseExpr();
    return { key, value };
  }

  parsePrimary() {
    const t = this.peek();
    if (!t) throw this.err('式の途中にて文末に至る');

    if (t.type === TOKEN.NUM) { this.consume(); return { type: '数値直', value: t.value }; }
    if (t.type === TOKEN.STRING) { this.consume(); return { type: '文字列直', value: t.value }; }
    if (t.type === TOKEN.KW && t.value === '真') { this.consume(); return { type: '真偽直', value: true }; }
    if (t.type === TOKEN.KW && t.value === '偽') { this.consume(); return { type: '真偽直', value: false }; }
    if (t.type === TOKEN.KW && t.value === '無し') { this.consume(); return { type: '空直' }; }
    if (t.type === TOKEN.KW && t.value === '負の') {
      this.consume();
      const v = this.parsePrimary();
      return { type: '単項', op: '-', value: v };
    }

    if (t.type === TOKEN.IDENT) {
      // 関数呼び出し式： IDENT に args... を 奉りたる
      // ゼロ引数：       IDENT に を 奉りたる
      // 識別子参照：    IDENT
      const next = this.peek(1);
      if (next && next.type === TOKEN.KW && next.value === 'に') {
        // Call として parse 試行、失敗したら Var にロールバック
        const save = this.pos;
        try {
          const funcName = this.consume().value;
          this.expectKW('に');
          const args = [];
          if (this.isKW('奉りたる')) {
            // ゼロ引数 「IDENT に 奉りたる」
          } else if (this.isKW('を') && this.peek(1) && this.peek(1).type === TOKEN.KW && this.peek(1).value === '奉りたる') {
            this.consume(); // を
          } else {
            args.push(this.parseExpr());
            while (this.isKW('と')) {
              const n2 = this.peek(1);
              if (!n2) break;
              if (n2.type === TOKEN.KW && ['云ふ', '為して', '改む', '受けて'].includes(n2.value)) break;
              this.consume();
              args.push(this.parseExpr());
            }
            this.expectKW('を');
          }
          this.expectKW('奉りたる');
          return { type: '呼出', func: funcName, args };
        } catch (e) {
          this.pos = save;
          // fall through: Var として扱う
        }
      }
      // 単純変数参照
      this.consume();
      return { type: '変数', name: t.value };
    }

    if (t.type === TOKEN.PAREN_OPEN) {
      this.consume();
      const e = this.parseExpr();
      this.expectType(TOKEN.PAREN_CLOSE);
      return e;
    }

    if (t.type === TOKEN.ARRAY_OPEN) {
      this.consume();
      const elements = [];
      if (!this.isType(TOKEN.ARRAY_CLOSE)) {
        elements.push(this.parseExpr());
        while (this.isType(TOKEN.COMMA)) {
          this.consume();
          if (this.isType(TOKEN.ARRAY_CLOSE)) break;
          elements.push(this.parseExpr());
        }
      }
      this.expectType(TOKEN.ARRAY_CLOSE);
      return { type: '集合直', elements };
    }

    if (t.type === TOKEN.KW && t.value === '集ひ') {
      this.consume();
      this.expectType(TOKEN.COLON);
      const elements = [];
      if (!this.isKW('集ひ終はり')) {
        elements.push(this.parseExpr());
        while (this.isType(TOKEN.COMMA)) {
          this.consume();
          if (this.isKW('集ひ終はり')) break;
          elements.push(this.parseExpr());
        }
      }
      this.expectKW('集ひ終はり');
      return { type: '集合直', elements };
    }

    if (t.type === TOKEN.KW && t.value === '録：') {
      this.consume();
      const entries = [];
      if (!this.isKW('録終はり')) {
        entries.push(this.parseRecordEntry());
        while (this.isType(TOKEN.COMMA)) {
          this.consume();
          if (this.isKW('録終はり')) break;
          entries.push(this.parseRecordEntry());
        }
      }
      this.expectKW('録終はり');
      return { type: '録直', entries };
    }

    throw this.err(`式の中に思はぬ字句『${this.describeToken(t)}』あり`);
  }
}
