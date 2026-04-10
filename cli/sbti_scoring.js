/**
 * SBTI 评分模块 —— 与 index.html 中 computeResult 逻辑完全一致
 */

const {
  dimensionMeta, questions, dimensionOrder,
  NORMAL_TYPES, TYPE_LIBRARY, DRUNK_TRIGGER_QUESTION_ID
} = require('./sbti_data');

function sumToLevel(score) {
  if (score <= 3) return 'L';
  if (score === 4) return 'M';
  return 'H';
}

function levelNum(level) {
  return { L: 1, M: 2, H: 3 }[level];
}

function parsePattern(pattern) {
  return pattern.replace(/-/g, '').split('');
}

function getDrunkTriggered(answers) {
  return answers[DRUNK_TRIGGER_QUESTION_ID] === 2;
}

function computeResult(answers) {
  // 1. 计算原始分数 —— 只对 30 道常规题
  const rawScores = {};
  Object.keys(dimensionMeta).forEach(dim => { rawScores[dim] = 0; });
  questions.forEach(q => {
    rawScores[q.dim] += Number(answers[q.id] || 0);
  });

  // 2. 每维度判等级
  const levels = {};
  Object.entries(rawScores).forEach(([dim, score]) => {
    levels[dim] = sumToLevel(score);
  });

  // 3. 距离匹配
  const userVector = dimensionOrder.map(dim => levelNum(levels[dim]));
  const ranked = NORMAL_TYPES.map(type => {
    const vector = parsePattern(type.pattern).map(levelNum);
    let distance = 0;
    let exact = 0;
    for (let i = 0; i < vector.length; i++) {
      const diff = Math.abs(userVector[i] - vector[i]);
      distance += diff;
      if (diff === 0) exact += 1;
    }
    const similarity = Math.max(0, Math.round((1 - distance / 30) * 100));
    return { ...type, ...TYPE_LIBRARY[type.code], distance, exact, similarity };
  }).sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (b.exact !== a.exact) return b.exact - a.exact;
    return b.similarity - a.similarity;
  });

  // 4. 最终人格判定
  const bestNormal = ranked[0];
  const drunkTriggered = getDrunkTriggered(answers);

  let finalType;
  let modeKicker = '你的主类型';
  let badge = `匹配度 ${bestNormal.similarity}% · 精准命中 ${bestNormal.exact}/15 维`;
  let sub = '维度命中度较高，当前结果可视为你的第一人格画像。';
  let special = false;
  let secondaryType = null;

  if (drunkTriggered) {
    finalType = TYPE_LIBRARY.DRUNK;
    secondaryType = bestNormal;
    modeKicker = '隐藏人格已激活';
    badge = '匹配度 100% · 酒精异常因子已接管';
    sub = '乙醇亲和性过强，系统已直接跳过常规人格审判。';
    special = true;
  } else if (bestNormal.similarity < 60) {
    finalType = TYPE_LIBRARY.HHHH;
    modeKicker = '系统强制兜底';
    badge = `标准人格库最高匹配仅 ${bestNormal.similarity}%`;
    sub = '标准人格库对你的脑回路集体罢工了，于是系统把你强制分配给了 HHHH。';
    special = true;
  } else {
    finalType = bestNormal;
  }

  return {
    rawScores, levels, ranked, bestNormal,
    finalType, modeKicker, badge, sub, special, secondaryType
  };
}

module.exports = { sumToLevel, levelNum, parsePattern, getDrunkTriggered, computeResult };
