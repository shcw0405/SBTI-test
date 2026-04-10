#!/usr/bin/env node
/**
 * SBTI 模型测试 CLI Runner
 *
 * 用法:
 *   node cli/run_sbti_model.js                    # stub 模式（随机）
 *   node cli/run_sbti_model.js --adapter=openai   # 调用 OpenAI 兼容 API
 *   node cli/run_sbti_model.js --test-drunk       # stub 模式，强制触发 DRUNK
 *   node cli/run_sbti_model.js --test-no-drink    # stub 模式，drink_gate_q1≠3
 *
 * 环境变量:
 *   SBTI_API_KEY       API 密钥
 *   SBTI_BASE_URL      API 地址 (默认 https://api.openai.com/v1)
 *   SBTI_MODEL         模型名 (默认 gpt-4o-mini)
 *   SBTI_TEMPERATURE   温度 (默认 0.3)
 *   SBTI_SYSTEM_PROMPT 额外系统提示词
 *   SBTI_MAX_RETRIES   最大重试次数 (默认 3)
 *   SBTI_SEED          随机种子 (仅影响题目顺序，非 LLM)
 */

const { questions, specialQuestions } = require('./sbti_data');
const { computeResult } = require('./sbti_scoring');
const { createAdapter, parseLetter, letterToValue } = require('./model_adapter');

// ─── 参数解析 ───
const args = process.argv.slice(2);
const flags = {};
args.forEach(a => {
  const m = a.match(/^--(\w[\w-]*)(?:=(.*))?$/);
  if (m) flags[m[1]] = m[2] ?? true;
});

const adapterType = flags.adapter || 'stub';
const maxRetries = Number(flags['max-retries'] || process.env.SBTI_MAX_RETRIES || 3);
const testDrunk = flags['test-drunk'] === true;
const testNoDrink = flags['test-no-drink'] === true;
const seedStr = flags.seed || process.env.SBTI_SEED || '';

// ─── 简易伪随机（仅 shuffle 用，不影响模型） ───
let _rngState = seedStr ? hashSeed(seedStr) : (Date.now() ^ 0xDEADBEEF);
function hashSeed(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h || 1;
}
function pseudoRandom() {
  _rngState = (_rngState * 1664525 + 1013904223) & 0x7FFFFFFF;
  return _rngState / 0x7FFFFFFF;
}
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(pseudoRandom() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── 生成题目顺序（与 index.html startTest 一致） ───
function buildQuestionOrder() {
  const shuffledRegular = shuffle(questions);
  const insertIndex = Math.floor(pseudoRandom() * shuffledRegular.length) + 1;
  return [
    ...shuffledRegular.slice(0, insertIndex),
    specialQuestions[0], // drink_gate_q1
    ...shuffledRegular.slice(insertIndex)
  ];
}

// ─── 带重试的单题调用（适配器返回字母，本地映射为 value） ───
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function askWithRetry(adapter, question, retries) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await adapter.askQuestion(question);
      // parseLetter 严格校验：只接受单个字母 A/B/C/D（小写自动转大写）
      const letter = parseLetter(String(raw));
      const value = letterToValue(letter, question);
      return { letter, value };
    } catch (err) {
      if (attempt === retries) {
        throw new Error(`Question ${question.id} failed after ${retries + 1} attempts: ${err.message}`);
      }
      const delay = Math.min(2000 * (attempt + 1), 10000);
      process.stderr.write(`  ⚠ Retry ${attempt + 1}/${retries} (wait ${delay}ms): ${err.message}\n`);
      await sleep(delay);
    }
  }
}

// ─── 主流程 ───
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   SBTI 人格测试 · CLI Model Runner   ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Adapter: ${adapterType} | Max retries: ${maxRetries}`);
  if (seedStr) console.log(`Seed: ${seedStr}`);
  console.log();

  // 创建适配器
  let adapterOpts = {};
  if (adapterType === 'stub' && (testDrunk || testNoDrink)) {
    const stubAnswers = {};
    // 对常规题全选 value=2 以获得中间结果
    questions.forEach(q => { stubAnswers[q.id] = 2; });
    if (testDrunk) {
      stubAnswers['drink_gate_q1'] = 3;
      stubAnswers['drink_gate_q2'] = 2;
    } else if (testNoDrink) {
      stubAnswers['drink_gate_q1'] = 1; // 不选饮酒
    }
    adapterOpts.stubAnswers = stubAnswers;
  }
  const adapter = createAdapter(adapterType, adapterOpts);

  // 生成题目顺序
  const questionOrder = buildQuestionOrder();
  const answers = {};

  console.log(`初始题目数: ${questionOrder.length} (30 常规 + 1 特殊)`);
  console.log('─'.repeat(50));

  // 逐题执行
  let totalQuestions = questionOrder.length;
  let drinkGateQ2Inserted = false;

  for (let i = 0; i < totalQuestions; i++) {
    const q = questionOrder[i];
    const optStr = q.options.map(o => `${o.value}:${o.label}`).join(' | ');
    process.stdout.write(`[${i + 1}/${totalQuestions}] ${q.id} — ${q.text.substring(0, 40)}...  `);

    const { letter, value } = await askWithRetry(adapter, q, maxRetries);
    answers[q.id] = value;
    console.log(`→ ${letter} (value=${value})`);

    // 动态插入 drink_gate_q2
    if (q.id === 'drink_gate_q1' && value === 3 && !drinkGateQ2Inserted) {
      questionOrder.splice(i + 1, 0, specialQuestions[1]);
      totalQuestions = questionOrder.length;
      drinkGateQ2Inserted = true;
      console.log('  ★ 检测到饮酒选项 → 插入 drink_gate_q2');
    }
  }

  console.log('─'.repeat(50));
  console.log(`答题完成，共 ${totalQuestions} 题\n`);

  // 计算结果
  const result = computeResult(answers);

  // 输出结构化结果
  const output = {
    answers,
    rawScores: result.rawScores,
    levels: result.levels,
    bestNormal: {
      code: result.bestNormal.code,
      cn: result.bestNormal.cn,
      similarity: result.bestNormal.similarity,
      exact: result.bestNormal.exact,
      distance: result.bestNormal.distance
    },
    finalType: {
      code: result.finalType.code,
      cn: result.finalType.cn
    },
    modeKicker: result.modeKicker,
    badge: result.badge,
    sub: result.sub,
    special: result.special,
    drunkTriggered: answers['drink_gate_q2'] === 2,
    secondaryType: result.secondaryType ? {
      code: result.secondaryType.code,
      cn: result.secondaryType.cn,
      similarity: result.secondaryType.similarity
    } : null,
    rankedTop5: result.ranked.slice(0, 5).map(t => ({
      code: t.code, cn: t.cn,
      similarity: t.similarity, exact: t.exact, distance: t.distance
    }))
  };

  console.log('═'.repeat(50));
  console.log('  最终结果');
  console.log('═'.repeat(50));
  console.log(`  人格类型: ${output.finalType.code}（${output.finalType.cn}）`);
  console.log(`  ${output.modeKicker}`);
  console.log(`  ${output.badge}`);
  console.log(`  ${output.sub}`);
  if (output.special) console.log(`  ★ 触发特殊人格`);
  if (output.drunkTriggered) console.log(`  ★ DRUNK 分支已激活`);
  if (output.secondaryType) {
    console.log(`  次选类型: ${output.secondaryType.code}（${output.secondaryType.cn}）匹配 ${output.secondaryType.similarity}%`);
  }
  console.log();
  console.log('  维度评分:');
  const { dimensionMeta } = require('./sbti_data');
  const { dimensionOrder } = require('./sbti_data');
  dimensionOrder.forEach(dim => {
    console.log(`    ${dimensionMeta[dim].name}: ${output.rawScores[dim]} → ${output.levels[dim]}`);
  });
  console.log();
  console.log('  Top 5 匹配:');
  output.rankedTop5.forEach((t, i) => {
    console.log(`    ${i + 1}. ${t.code}（${t.cn}）sim=${t.similarity}% exact=${t.exact}/15 dist=${t.distance}`);
  });
  console.log();
  console.log('  完整 JSON:');
  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
