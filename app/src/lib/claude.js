import { resizeImage, fileToBase64 } from './imageUtils';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Extract invoice line items from one or more files (PDFs and/or images).
// Returns [{ id, invoiceName, supplierCode, qtyExpected, pageNumber }]
export async function extractInvoiceItems(apiKey, files) {
  const content = [];
  for (const f of files) {
    const isPdf = f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      const b64 = await fileToBase64(f);
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
    } else {
      const b64 = await resizeImage(f);
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
    }
  }

  content.push({
    type: 'text',
    text: `Extract ALL line items from this delivery invoice/docket.
Items often appear as "CODE - Product Name" (e.g. "225127 - Booty Cleanser") — separate the supplier code from the product name.
Return ONLY a JSON array (no markdown, no explanation):
[{"invoiceName":"clean product name only","supplierCode":"supplier item code or empty string","qtyExpected":quantity as number,"pageNumber":page number or 1}]
Include EVERY line item. Preserve original order.`,
  });

  const data = await callClaude(apiKey, [{ role: 'user', content }],
    'You are a delivery reconciliation assistant. Extract all line items from the invoice. Return only valid JSON.');

  const text = data.content.map(c => c.text || '').join('');
  const stripped = text.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
  const s = stripped.indexOf('[');
  const e = stripped.lastIndexOf(']');
  let items;
  try {
    items = s >= 0 && e > s ? JSON.parse(stripped.slice(s, e + 1)) : JSON.parse(stripped);
  } catch {
    throw new Error('Could not parse invoice data from AI response');
  }

  return items.map(item => ({
    id: uid(),
    invoiceName: (item.invoiceName || item.name || '').trim(),
    supplierCode: (item.supplierCode || '').trim(),
    qtyExpected: Number(item.qtyExpected) || 1,
    pageNumber: item.pageNumber || 1,
    qtyReceived: Number(item.qtyExpected) || 1,
    status: 'pending',
    damageNote: '',
    swappedForCode: null,
    isBonus: false,
  }));
}

export async function extractInvoiceItemsWithRetry(apiKey, files, onRetry) {
  try {
    return await extractInvoiceItems(apiKey, files);
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('overloaded') || msg.includes('529')) {
      onRetry?.();
      await new Promise(r => setTimeout(r, 3000));
      return await extractInvoiceItems(apiKey, files);
    }
    throw err;
  }
}

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
      body: JSON.stringify({ model: 'claude-sonnet-4-5-20251022', max_tokens: maxTokens, system: systemPrompt, messages }),
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
