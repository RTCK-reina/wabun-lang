// wabun-lang public API

import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { compile } from './compiler.js';
import { makeRuntime, stringify } from './runtime.js';

export { tokenize, parse, compile, makeRuntime, stringify };

/**
 * ASTを辿って Import ノードを展開する（同期版）。
 * resolveSource: (path) => string で各 import の中身を取得する。
 * パスは現在のソースから見た相対パス。基底パスは resolveSource 側で解決する。
 */
export function expandImports(ast, resolveSource, loaded = new Set(), basePath = '.') {
  const newBody = [];
  for (const stmt of ast.body) {
    if (stmt.type === '読入') {
      const resolved = resolveSource.resolve ? resolveSource.resolve(stmt.path, basePath) : stmt.path;
      if (loaded.has(resolved)) continue;
      loaded.add(resolved);
      const childSrc = resolveSource.read ? resolveSource.read(resolved) : resolveSource(resolved);
      const childAst = parse(tokenize(childSrc));
      const childExpanded = expandImports(childAst, resolveSource, loaded, resolved);
      newBody.push(...childExpanded.body);
    } else {
      newBody.push(stmt);
    }
  }
  return { ...ast, body: newBody };
}

/**
 * ソースコードをコンパイルしてJSコード文字列を返す（imports 不可）
 */
export function compileSource(source) {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  // Import が含まれていればエラー
  for (const stmt of ast.body) {
    if (stmt.type === '読入') {
      throw new Error('実行時誤り：「読み入れけり」は CLI 経由でのみ用ふ（Webプレイグラウンド非対応）');
    }
  }
  return compile(ast);
}

/**
 * ソースコードを評価する。
 * options.writeLine と options.readLine でI/Oをカスタマイズ可能。
 * options.resolveSource を渡せば import 展開を行う。
 * 戻り値は最終出力配列（writeLineを渡さない場合）。
 */
export async function runSource(source, options = {}) {
  let jsCode;
  if (options.resolveSource) {
    const ast = parse(tokenize(source));
    const expanded = expandImports(ast, options.resolveSource, new Set(), options.basePath ?? '.');
    jsCode = compile(expanded);
  } else {
    jsCode = compileSource(source);
  }
  const runtime = makeRuntime(options);
  // 最上位の awaitを許可するため async IIFEで包む
  const wrapped = `(async (__和__) => {\n${jsCode}\n})`;
  // eslint-disable-next-line no-new-func
  const fn = new Function(`return ${wrapped};`)();
  await fn(runtime);
  return runtime.output;
}
