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
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      if (resp.status === 401) throw new Error('API key invalid or expired. Check Settings.');
      if (resp.status === 429) throw new Error('Rate limit reached. Wait a moment and try again.');
      if (resp.status === 529) throw new Error('Claude is overloaded. Try again in a few seconds.');
      if (resp.status === 413) throw new Error('Request too large. Try fewer/smaller photos.');
      throw new Error(`API error ${resp.status}: ${body.slice(0, 200)}`);
    }
    return resp.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out after 90s');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
