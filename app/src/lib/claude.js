export async function callClaude(apiKey, messages, systemPrompt, maxTokens = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, system: systemPrompt, messages }),
      signal: controller.signal,
    });
    if (!resp.ok) { const e = await resp.text(); throw new Error(`API ${resp.status}: ${e}`); }
    return resp.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out after 90s');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
