import { prepareForAi } from './image-check.js';

const PROVIDER = (
  process.env.AI_PROVIDER ||
  (process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'mock')
).toLowerCase();
const MODEL =
  process.env.AI_MODEL ||
  (PROVIDER === 'mock'
    ? 'mock'
    : PROVIDER === 'ollama'
      ? 'qwen2.5vl:7b'
      : PROVIDER === 'deepseek'
        ? 'deepseek-flash'
        : 'gpt-4.1-mini');
const AUTO_PUBLISH = process.env.AI_AUTO_PUBLISH === 'true';

const SYSTEM_PROMPT = `Ты модератор городского архива граффити и стрит-арта.
Оцени фотографию и текст заявки. Верни строго JSON без markdown:
{
  "isGraffiti": true/false,
  "nsfw": true/false,
  "violence": true/false,
  "extremism": true/false,
  "personalData": true/false,
  "textSafe": true/false,
  "quality": "good" | "blurry" | "dark" | "bad",
  "isScreenshot": true/false,
  "hasWatermark": true/false,
  "likelyRepost": true/false,
  "sameAsReference": true/false/null,
  "confidence": число от 0 до 1,
  "labels": ["mural", "graffiti", "stencil", "sticker", "text"],
  "summary": "краткое объяснение по-русски, до 160 символов"
}
Правила:
- isGraffiti: на фото действительно граффити, мурал, трафарет, стикер или надпись на стене, а не еда, селфи, документ или интерьер.
- personalData: видны документы, номера, лица крупным планом или иные персональные данные.
- extremism: запрещённая символика, призывы к насилию, экстремизм.
- textSafe: текст заявки не содержит оскорблений, спама, рекламы и угроз.
- quality: оцени, можно ли разглядеть работу.
- isScreenshot / hasWatermark / likelyRepost: признаки того, что фото сделано с экрана, взято из чужого источника или является репостом.
- sameAsReference: если передано второе изображение — это та же работа с другого ракурса/освещения? Если второе изображение не передано — null.
- confidence: твоя уверенность в ответе.
Не придумывай факты. Если не уверен — ставь меньшую confidence.`;

function normalizeVerdict(raw, fallbackSummary = '') {
  const value = raw && typeof raw === 'object' ? raw : {};
  const confidence = Number(value.confidence);
  const quality = ['good', 'blurry', 'dark', 'bad'].includes(value.quality)
    ? value.quality
    : 'blurry';
  return {
    isGraffiti: Boolean(value.isGraffiti),
    nsfw: Boolean(value.nsfw),
    violence: Boolean(value.violence),
    extremism: Boolean(value.extremism),
    personalData: Boolean(value.personalData),
    textSafe: value.textSafe !== false,
    quality,
    isScreenshot: Boolean(value.isScreenshot),
    hasWatermark: Boolean(value.hasWatermark),
    likelyRepost: Boolean(value.likelyRepost),
    sameAsReference:
      value.sameAsReference === true ? true : value.sameAsReference === false ? false : null,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    labels: Array.isArray(value.labels)
      ? value.labels.map((label) => String(label).slice(0, 40)).slice(0, 8)
      : [],
    summary: String(value.summary || fallbackSummary || '').slice(0, 240),
  };
}

function decisionFor(verdict) {
  if (
    verdict.nsfw ||
    verdict.violence ||
    verdict.extremism ||
    verdict.personalData ||
    !verdict.textSafe ||
    verdict.quality === 'bad' ||
    verdict.isScreenshot ||
    verdict.hasWatermark ||
    verdict.likelyRepost ||
    verdict.sameAsReference === true
  ) {
    return 'review';
  }
  if (!verdict.isGraffiti && verdict.confidence >= 0.8) return 'reject';
  if (verdict.isGraffiti && verdict.quality === 'good' && verdict.confidence >= 0.9) {
    return 'publish';
  }
  return 'review';
}

function mockResult() {
  const verdict = normalizeVerdict({
    isGraffiti: true,
    nsfw: false,
    violence: false,
    extremism: false,
    personalData: false,
    textSafe: true,
    quality: 'good',
    confidence: 0.72,
    labels: ['mock'],
    summary: 'Mock-проверка: фото получено, нужна проверка человеком',
  });
  return {
    provider: 'mock',
    model: 'mock',
    verdict,
    confidence: verdict.confidence,
    summary: verdict.summary,
    decision: 'review',
  };
}

function parseJsonContent(content) {
  const text = String(content || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  return JSON.parse(text);
}

async function openAiCompatibleResult({ provider, baseUrl, apiKey, missingKey, input }) {
  if (!apiKey) {
    return {
      provider,
      model: MODEL,
      verdict: normalizeVerdict({}, `${missingKey} не задан`),
      confidence: 0,
      summary: `${missingKey} не задан — заявка останется на ручной проверке`,
      decision: 'review',
      error: true,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS || 25000));
  try {
    const imageBuffer = await prepareForAi(input.buffer);
    const userContent = [
      {
        type: 'text',
        text: `Адрес заявки: ${input.address}\nОписание: ${input.description || 'нет'}`,
      },
      {
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`, detail: 'low' },
      },
    ];
    if (input.reference?.buffer) {
      const referenceBuffer = await prepareForAi(input.reference.buffer);
      userContent.push(
        {
          type: 'text',
          text: 'Второе изображение — уже опубликованная работа по этому же адресу. Сравни: это та же работа с другого ракурса?',
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${referenceBuffer.toString('base64')}`,
            detail: 'low',
          },
        },
      );
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 450,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `HTTP ${response.status}`);
    }
    const raw = parseJsonContent(data?.choices?.[0]?.message?.content);
    const verdict = normalizeVerdict(raw);
    return {
      provider,
      model: MODEL,
      verdict,
      confidence: verdict.confidence,
      summary: verdict.summary,
      decision: decisionFor(verdict),
    };
  } catch (error) {
    return {
      provider,
      model: MODEL,
      verdict: normalizeVerdict({}, 'Ошибка AI-проверки'),
      confidence: 0,
      summary: `AI-проверка не удалась: ${error.message}`.slice(0, 240),
      decision: 'review',
      error: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

function openAiResult(input) {
  return openAiCompatibleResult({
    provider: 'openai',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    missingKey: 'OPENAI_API_KEY',
    input,
  });
}

function deepseekResult(input) {
  return openAiCompatibleResult({
    provider: 'deepseek',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
    missingKey: 'DEEPSEEK_API_KEY',
    input,
  });
}

async function ollamaResult(input) {
  const baseUrl = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS || 60000));
  try {
    const imageBuffer = await prepareForAi(input.buffer);
    const images = [imageBuffer.toString('base64')];
    let userText = `Адрес заявки: ${input.address}\nОписание: ${input.description || 'нет'}`;
    if (input.reference?.buffer) {
      const referenceBuffer = await prepareForAi(input.reference.buffer);
      images.push(referenceBuffer.toString('base64'));
      userText += '\nВторое изображение — существующая работа по этому адресу. Сравни ракурс и определи sameAsReference.';
    }
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userText, images },
        ],
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    const raw = parseJsonContent(data?.message?.content);
    const verdict = normalizeVerdict(raw);
    return {
      provider: 'ollama',
      model: MODEL,
      verdict,
      confidence: verdict.confidence,
      summary: verdict.summary,
      decision: decisionFor(verdict),
    };
  } catch (error) {
    return {
      provider: 'ollama',
      model: MODEL,
      verdict: normalizeVerdict({}, 'Ошибка локальной AI-проверки'),
      confidence: 0,
      summary: `AI-проверка не удалась: ${error.message}`.slice(0, 240),
      decision: 'review',
      error: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function moderateImage(input) {
  if (PROVIDER === 'mock') return mockResult();
  if (PROVIDER === 'openai') return openAiResult(input);
  if (PROVIDER === 'deepseek') return deepseekResult(input);
  if (PROVIDER === 'ollama') return ollamaResult(input);
  return {
    ...mockResult(),
    summary: `Неизвестный AI_PROVIDER=${PROVIDER}, работает mock`,
  };
}

export function canAutoPublish(result) {
  return AUTO_PUBLISH && result.decision === 'publish';
}

export const aiConfig = { provider: PROVIDER, model: MODEL, autoPublish: AUTO_PUBLISH };
