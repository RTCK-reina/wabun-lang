// wabun-lang スナップショットテスト
// すべてのサンプルプログラムを実行して期待出力と比較する

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSource } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(__dirname, '../examples');

// import 解決用（examples/ 内の相対パスを解決）
const resolveSource = {
  resolve(p, fromAbs) {
    return resolve(dirname(fromAbs), p);
  },
  read(absPath) {
    return readFileSync(absPath, 'utf8');
  },
};

const EXPECTED = {
  'hello.wb': ['世界'],
  'arithmetic.wb': ['7', '12', '-1', '3.3333333333333335', '1'],
  'conditional.wb': ['大なり', '五なり'],
  'factorial.wb': ['120', '3628800'],
  'fizzbuzz.wb': ['1', '2', 'Fizz', '4', 'Buzz', 'Fizz', '7', '8', 'Fizz', 'Buzz', '11', 'Fizz', '13', '14', 'FizzBuzz'],
  'fibonacci.wb': ['0', '1', '1', '2', '3', '5', '8', '13', '21', '34', '55'],
  'array.wb': ['〔1、2、3、4、5〕', '5', '3', '〔春、夏、秋、冬〕', '春', '夏', '秋', '冬', '〔1、2、3、4、5、6〕'],
  'loop.wb': ['1', '2', '3', '4', '5', '0', '1', '2'],
  'poem.wb': ['古池や蛙飛び込む水の音', '閑さや岩にしみ入る蝉の声', '夏草や兵どもが夢の跡', 'ーーー', '総数：3'],
  'paren.wb': ['35', '23', '10'],
  'record.wb': [
    '録：「名」は太郎、「年」は20、「身長」は170、録終はり',
    '太郎', '20', '170',
    '春月：3', '夏月：6', '秋月：9', '冬月：12',
  ],
  'builtins.wb': [
    '7', '4', '9', '1024',
    '東海道', 'とへほにはろい', '〔1、1、3、4、5、9〕',
    '松・竹・梅', '42', '12345', '録',
  ],
  'mutate.wb': [
    '〔1、2、30、4、5〕',
    '〔2、30、4、5〕',
    '録：「名」は太郎、「年」は21、「住所」は東京、録終はり',
    '録：「名」は太郎、「年」は21、録終はり',
  ],
  'try.wb': [
    '捕まへたり：危ない事よ',
    '次の処理',
    '内：内側の過ち',
    '外：外へ伝へむ',
  ],
  'highorder.wb': ['〔2、4、6、8、10〕', '〔2、4、6〕', '15', '真', '偽'],
  'utility.wb': [
    'ほのか', '真', '真', '3', 'zbczbc', 'HELLO', 'world',
    '〔1、2、3、4〕', '4', '〔1、2、3〕', '真',
    '〔a、b、c〕', '〔1、2、3〕',
  ],
  'bigint.wb': ['1000000000000', '5000000000000', '1000200000000', '10000000000000000'],
  'import.wb': ['10', '15'],
};

let pass = 0, fail = 0;
const failures = [];

for (const [file, expected] of Object.entries(EXPECTED)) {
  const path = resolve(examplesDir, file);
  let source;
  try { source = readFileSync(path, 'utf8'); }
  catch (e) { fail++; failures.push(`${file}: read error: ${e.message}`); continue; }

  const buf = [];
  try {
    await runSource(source, {
      writeLine: (s) => buf.push(s),
      resolveSource,
      basePath: path,
    });
  } catch (e) {
    fail++;
    failures.push(`${file}: runtime error: ${e.message}`);
    continue;
  }

  const ok = buf.length === expected.length && buf.every((v, i) => v === expected[i]);
  if (ok) {
    pass++;
    console.log(`✓ ${file}`);
  } else {
    fail++;
    failures.push(`${file}:\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(buf)}`);
    console.log(`✗ ${file}`);
  }
}

console.log(`\n${pass} pass, ${fail} fail`);

// 入力を含むサンプル（自動実行に向かない）はパース可能性のみ確認
const PARSE_ONLY = ['guess.wb', 'janken.wb', 'quiz.wb'];
const { tokenize, parse, compile } = await import('../src/index.js');
let parsePass = 0, parseFail = 0;
for (const file of PARSE_ONLY) {
  try {
    const src = readFileSync(resolve(examplesDir, file), 'utf8');
    const tokens = tokenize(src);
    const ast = parse(tokens);
    compile(ast);
    parsePass++;
    console.log(`✓ (parse-only) ${file}`);
  } catch (e) {
    parseFail++;
    console.log(`✗ (parse-only) ${file}: ${e.message}`);
  }
}
console.log(`(parse-only) ${parsePass} pass, ${parseFail} fail`);

// 影詞（GLSL）バックエンド試験
const KAGESHI_FILES = ['虹.kg', '波.kg', '円.kg'];
const { compile: kageshiCompile } = await import('../src/backends/kageshi.js');
let kgPass = 0, kgFail = 0;
for (const file of KAGESHI_FILES) {
  try {
    const src = readFileSync(resolve(examplesDir, 'shaders', file), 'utf8');
    const tokens = tokenize(src);
    const ast = parse(tokens);
    const glsl = kageshiCompile(ast);
    if (!glsl.includes('void main()') || !glsl.includes('gl_FragColor')) {
      throw new Error('GLSL 出力に main() か gl_FragColor が無し');
    }
    kgPass++;
    console.log(`✓ (影詞) ${file}`);
  } catch (e) {
    kgFail++;
    console.log(`✗ (影詞) ${file}: ${e.message}`);
  }
}
console.log(`(影詞) ${kgPass} pass, ${kgFail} fail`);

if (fail > 0 || parseFail > 0 || kgFail > 0) {
  console.log('\n--- failures ---');
  for (const f of failures) console.log(f);
  process.exit(1);
}
