/**
 * LLM 模型调用适配器
 * 支持: openai (兼容 OpenAI API 格式), stub (测试用)
 *
 * 所有适配器的 askQuestion 返回一个大写字母 A/B/C/D。
 * 调用方负责将字母映射为对应选项的 value。
 */

const VALID_LETTERS = ['A', 'B', 'C', 'D'];

/**
 * 严格解析模型返回的文本，只接受恰好一个大写/小写字母 A-D。
 * "A" / "a" → "A"
 * "A because ..." / "A." / "我选A" / "2" / "value=2" → 抛异常
 */
function parseLetter(raw) {
  if (typeof raw !== 'string') throw new Error(`Non-string response: ${raw}`);
  const trimmed = raw.trim();
  if (trimmed.length !== 1) throw new Error(`Response must be exactly one character, got: "${trimmed}"`);
  const upper = trimmed.toUpperCase();
  if (!VALID_LETTERS.includes(upper)) throw new Error(`Invalid letter "${trimmed}", expected one of A/B/C/D`);
  return upper;
}

/**
 * 将字母 A/B/C/D 映射为对应选项的 value（按选项顺序: A→第1项, B→第2项 …）
 */
function letterToValue(letter, question) {
  const idx = letter.charCodeAt(0) - 'A'.charCodeAt(0);
  if (idx < 0 || idx >= question.options.length) {
    throw new Error(`Letter ${letter} out of range: question only has ${question.options.length} options`);
  }
  return question.options[idx].value;
}

/**
 * Stub 模型 —— 用于本地验证流程，不调用真实 API
 * stubAnswers 存的是 value（数字），内部自动转为字母返回。
 * 未预设的题随机选一个字母。
 */
class StubAdapter {
  constructor(opts = {}) {
    this.stubAnswers = opts.stubAnswers || {};
    this.persona = opts.persona || 'random';
  }

  async askQuestion(question) {
    if (this.stubAnswers[question.id] !== undefined) {
      const targetValue = this.stubAnswers[question.id];
      const idx = question.options.findIndex(o => o.value === targetValue);
      if (idx === -1) throw new Error(`stubAnswers value ${targetValue} not found in options for ${question.id}`);
      return VALID_LETTERS[idx];
    }
    // 随机选一个字母
    const letters = VALID_LETTERS.slice(0, question.options.length);
    return letters[Math.floor(Math.random() * letters.length)];
  }
}

/**
 * OpenAI 兼容适配器 —— 支持 OpenAI / DeepSeek / 本地 vLLM 等
 * 返回大写字母 A/B/C/D
 */
class OpenAIAdapter {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.SBTI_API_KEY || process.env.OPENAI_API_KEY;
    this.baseUrl = opts.baseUrl || process.env.SBTI_BASE_URL || 'https://api.openai.com/v1';
    this.model = opts.model || process.env.SBTI_MODEL || 'gpt-4o-mini';
    this.temperature = opts.temperature ?? (process.env.SBTI_TEMPERATURE ? Number(process.env.SBTI_TEMPERATURE) : 0.3);
    this.systemPrompt = opts.systemPrompt || process.env.SBTI_SYSTEM_PROMPT || '';
  }

  async askQuestion(question) {
    const letters = VALID_LETTERS.slice(0, question.options.length);
    const optionLines = question.options
      .map((opt, i) => `  ${letters[i]}. ${opt.label}`)
      .join('\n');

    const userMsg = [
      '你正在参加一个娱乐向人格测试。请按你的默认倾向回答当前这一题。',
      `只输出一个大写字母（${letters.join('/')}），不要解释，不要加标点，不要复述题目。`,
      '',
      `题目: ${question.text}`,
      '',
      `选项:`,
      optionLines,
      '',
      `请只回复一个大写字母（${letters.join('/')}）：`
    ].join('\n');

    const messages = [];
    if (this.systemPrompt) {
      messages.push({ role: 'system', content: this.systemPrompt });
    }
    messages.push({ role: 'user', content: userMsg });

    const body = {
      model: this.model,
      messages,
      max_tokens: 4096  // 推理模型需要足够 token 空间
    };
    // 部分渠道（如 claude-opus）不支持 temperature 参数，会返回 400
    if (!this.model.startsWith('claude-opus')) {
      body.temperature = this.temperature;
    }

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`API error ${resp.status}: ${text}`);
    }

    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Empty API response');

    // 推理模型可能在 content 中包含 <think>...</think> 块，剥离后取最终答案
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!content) throw new Error('Empty response after stripping <think> block');

    return parseLetter(content);
  }
}

/**
 * 创建适配器的工厂函数
 */
function createAdapter(type, opts = {}) {
  switch (type) {
    case 'stub':
      return new StubAdapter(opts);
    case 'openai':
      return new OpenAIAdapter(opts);
    default:
      throw new Error(`Unknown adapter type: ${type}. Use "stub" or "openai".`);
  }
}

module.exports = { StubAdapter, OpenAIAdapter, createAdapter, parseLetter, letterToValue };
