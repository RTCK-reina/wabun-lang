#!/usr/bin/env node
// wabun CLI

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { compileSource, runSource } from '../src/index.js';

const HELP = `wabun-lang — 古文プログラミング言語

使用法:
  wabun run <file.wb>           ソースを実行する
  wabun compile <file.wb> [-o out.js]  JavaScriptへ変換する
  wabun ast <file.wb>           ASTをJSON出力する（デバッグ用）
  wabun compile-影詞 <file.kg> [-o out.frag]  影詞（GLSL fragment shader）へ変換する
  wabun repl                    対話モードで起動する
  wabun --help                  この案内を表示する
`;

// エラー位置（n:n）を抽出してソース該当行と矢印を整形する
function formatErrorWithContext(msg, source) {
  if (!source) return msg;
  const m = msg.match(/位置\s*(\d+):(\d+)/);
  if (!m) return msg;
  const line = parseInt(m[1], 10);
  const col = parseInt(m[2], 10);
  const lines = source.split('\n');
  const startLine = Math.max(1, line - 2);
  const endLine = Math.min(lines.length, line + 1);
  const ctx = [];
  ctx.push(msg);
  ctx.push('');
  const widthOfLineNum = String(endLine).length;
  for (let i = startLine; i <= endLine; i++) {
    const ln = String(i).padStart(widthOfLineNum, ' ');
    ctx.push(`  ${ln} | ${lines[i - 1] ?? ''}`);
    if (i === line) {
      // col は 1-indexed の文字数。全角文字幅は概ね2、半角1で近似
      const before = (lines[i - 1] ?? '').slice(0, col - 1);
      let visualCol = 0;
      for (const ch of before) visualCol += ch.codePointAt(0) > 0x7F ? 2 : 1;
      ctx.push(`  ${' '.repeat(widthOfLineNum)} | ${' '.repeat(visualCol)}^`);
    }
  }
  return ctx.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(HELP);
    return;
  }

  const cmd = args[0];

  if (cmd === 'repl') {
    await runRepl();
    return;
  }

  const file = args[1];

  if (!file) {
    console.error('ソースファイルを指定してください');
    process.exit(1);
  }

  const source = readFileSync(resolve(file), 'utf8');

  if (cmd === 'run') {
    const rl = readline.createInterface({ input, output });
    const baseAbs = resolve(file);
    const resolveSource = {
      resolve(p, fromAbs) {
        return resolve(dirname(fromAbs === '.' ? baseAbs : fromAbs), p);
      },
      read(absPath) {
        return readFileSync(absPath, 'utf8');
      },
    };
    try {
      await runSource(source, {
        writeLine: (s) => process.stdout.write(s + '\n'),
        readLine: async () => {
          const line = await rl.question('');
          return line;
        },
        resolveSource,
        basePath: baseAbs,
      });
    } catch (e) {
      console.error(formatErrorWithContext(e.message, source));
      process.exit(1);
    } finally {
      rl.close();
    }
    return;
  }

  if (cmd === 'compile') {
    const oIdx = args.indexOf('-o');
    const outFile = oIdx >= 0 ? args[oIdx + 1] : null;
    const js = compileSource(source);
    const fullJs = `// generated from ${basename(file)}\n` +
      `import { makeRuntime } from 'wabun-lang';\n` +
      `const __和__ = makeRuntime();\n` +
      `(async () => {\n${js}\n})();\n`;
    if (outFile) {
      writeFileSync(resolve(outFile), fullJs);
      console.log(`wrote ${outFile}`);
    } else {
      process.stdout.write(fullJs);
    }
    return;
  }

  if (cmd === 'ast') {
    const { tokenize } = await import('../src/lexer.js');
    const { parse } = await import('../src/parser.js');
    const tokens = tokenize(source);
    const ast = parse(tokens);
    console.log(JSON.stringify(ast, null, 2));
    return;
  }

  if (cmd === 'compile-影詞' || cmd === 'compile-kageshi') {
    const oIdx = args.indexOf('-o');
    const outFile = oIdx >= 0 ? args[oIdx + 1] : null;
    const { tokenize } = await import('../src/lexer.js');
    const { parse } = await import('../src/parser.js');
    const { compile: compileKageshi } = await import('../src/backends/kageshi.js');
    try {
      const tokens = tokenize(source);
      const ast = parse(tokens);
      const glsl = compileKageshi(ast);
      if (outFile) {
        writeFileSync(resolve(outFile), glsl);
        console.log(`wrote ${outFile}`);
      } else {
        process.stdout.write(glsl);
      }
    } catch (e) {
      console.error(formatErrorWithContext(e.message, source));
      process.exit(1);
    }
    return;
  }

  console.error(`未知のコマンド: ${cmd}`);
  process.stdout.write(HELP);
  process.exit(1);
}

async function runRepl() {
  process.stdout.write('wabun-lang REPL — 終ふるは Ctrl+D もしくは「やめ」と入力すべし\n');
  const rl = readline.createInterface({ input, output });
  let accumulated = '';
  let pendingBuf = '';
  const allOutputs = [];

  rl.setPrompt('> ');
  rl.prompt();

  let queue = Promise.resolve();
  rl.on('line', (rawLine) => {
    queue = queue.then(async () => {
      const line = rawLine;
      if (line.trim() === 'やめ' || line.trim() === 'exit') {
        rl.close();
        return;
      }
      pendingBuf += line + '\n';
      const opens = (pendingBuf.match(/(ならば|なる間|為して|受けて返す業|試みに)/g) || []).length;
      const closes = (pendingBuf.match(/(然らば終はり|繰り返し終はりぬ|業終はりぬ|試み終はりぬ)/g) || []).length;
      const depth = opens - closes;

      if (depth <= 0 && pendingBuf.trim().endsWith('。')) {
        const exec = accumulated + pendingBuf;
        const newOutputs = [];
        try {
          await runSource(exec, {
            writeLine: (s) => { newOutputs.push(s); },
            readLine: async () => '',
          });
          accumulated = exec;
          const fresh = newOutputs.slice(allOutputs.length);
          for (const s of fresh) process.stdout.write(s + '\n');
          allOutputs.push(...fresh);
        } catch (e) {
          process.stderr.write(formatErrorWithContext(e.message, pendingBuf) + '\n');
        }
        pendingBuf = '';
        rl.setPrompt('> ');
      } else {
        rl.setPrompt('… ');
      }
      rl.prompt();
    });
  });

  rl.on('close', () => {
    process.stdout.write('\n終はりぬ。\n');
  });

  // close まで待つ
  await new Promise((resolve) => rl.on('close', resolve));
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
