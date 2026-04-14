import { resizeImage, fileToBase64 } from './imageUtils';
import { extractInvoiceItemsLocally } from './pdfParser';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ── Robust extraction prompt ──────────────────────────────────────────
// Handles all invoice formats: Wholesale Solutions (CODE - Desc), VTNZ,
// TWS Wholesale, Shishaland, NZ Craft Brewing, Bevie Handcraft,
// Hempstore, Chartbella, ALT NZ, and unknown formats.
const EXTRACTION_SYSTEM = `You are a structured data extraction engine for stock management.
Extract ALL product line items from the uploaded invoice. Return ONLY valid JSON, no explanations.`;

const EXTRACTION_PROMPT = `You are extracting structured data from a supplier invoice for a stock management system.

Your goal is to identify ALL product line items from the uploaded invoice and return clean, structured JSON.

CONTEXT:
Invoices come from multiple suppliers and formats:
- Some include product codes (numeric like "225127" or alphanumeric like "SOLO-PKIT-M2810" or "SP476")
- Some only include descriptions
- Layouts vary (columns, spacing, multi-line rows)
- Images may be rotated, skewed, or imperfect
- Items often appear as "CODE - Product Name" (e.g. "225127 - Booty Cleanser") — separate the code from the name

WHAT TO EXTRACT (per line item):
- supplierCode: the supplier's product/item code if present, else empty string. Codes are usually uppercase, alphanumeric, may include dashes.
- description: full clean product name with proper spacing between words
- quantity: the ordered/delivered quantity as a number
- unitPrice: unit price if visible, else null
- total: line total if visible, else null

RULES:
1. A valid line item MUST have a description AND a quantity
2. IGNORE: subtotals, GST/VAT lines, shipping/freight, invoice metadata (numbers, dates, addresses)
3. Merge multi-line descriptions into one item
4. Handle OCR artifacts: "O" as "0", "l"/"I" as "1" when in numeric context
5. Quantities must be numeric — convert "2.00" to 2
6. If the same product code appears multiple times (e.g. same item listed 3 times with qty 1 each), include EACH line separately — do not merge them

OUTPUT FORMAT — return ONLY this JSON, nothing else:
{"items":[{"supplierCode":"STRING OR EMPTY","description":"STRING","quantity":NUMBER,"unitPrice":NUMBER_OR_NULL,"total":NUMBER_OR_NULL}]}

IMPORTANT: Be conservative — only extract real product rows. If unsure, include item but set unknown fields to null. Do NOT guess.`;

// ── Parse Claude response into normalized items ──────────────────────
function parseClaudeResponse(text) {
  const stripped = text.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();

  // Try { "items": [...] } format first
  const braceStart = stripped.indexOf('{');
  const braceEnd = stripped.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    try {
      const obj = JSON.parse(stripped.slice(braceStart, braceEnd + 1));
      if (Array.isArray(obj.items)) return obj.items;
    } catch { /* fall through */ }
  }

  // Fallback: try bare [...] array
  const arrStart = stripped.indexOf('[');
  const arrEnd = stripped.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    try { return JSON.parse(stripped.slice(arrStart, arrEnd + 1)); } catch { /* fall through */ }
  }

  throw new Error('Could not parse invoice data from AI response');
}

// ── Normalize extracted items to internal format ─────────────────────
function normalizeItems(rawItems) {
  return rawItems
    .filter(item => {
      const desc = (item.description || item.invoiceName || item.name || '').trim();
      const qty = Number(item.quantity ?? item.qtyExpected ?? 0);
      return desc.length >= 2 && qty > 0;
    })
    .map(item => ({
      id: uid(),
      invoiceName: (item.description || item.invoiceName || item.name || '').trim(),
      supplierCode: (item.supplierCode || '').trim(),
      qtyExpected: Number(item.quantity ?? item.qtyExpected) || 1,
      unitPrice: item.unitPrice != null ? Number(item.unitPrice) : null,
      lineTotal: item.total != null ? Number(item.total) : null,
      pageNumber: item.pageNumber || 1,
      qtyReceived: Number(item.quantity ?? item.qtyExpected) || 1,
      status: 'pending',
      damageNote: '',
      swappedForCode: null,
      isBonus: false,
    }));
}

// ── Main extraction ──────────────────────────────────────────────────
// PDFs: always use local text extraction (free, instant, no API cost)
// TXT files + pasted text: sent to Claude as raw text
// Photos/images: use Claude API (needs OCR capability)
export async function extractInvoiceItems(apiKey, files, pasteText = '') {
  const pdfs = [], images = [], txts = [];
  for (const f of files) {
    const name = f.name.toLowerCase();
    if (f.type.includes('pdf') || name.endsWith('.pdf')) {
      pdfs.push(f);
    } else if (name.endsWith('.txt') || f.type === 'text/plain') {
      txts.push(f);
    } else {
      images.push(f);
    }
  }

  let items = [];

  // ── PDFs: local extraction (no API cost) ──
  for (const pdf of pdfs) {
    const local = await extractInvoiceItemsLocally(pdf);
    if (local?.length) {
      items.push(...local.map(item => ({
        id: uid(),
        invoiceName: splitCamelCase(item.invoiceName),
        supplierCode: item.supplierCode || '',
        qtyExpected: item.qtyExpected,
        unitPrice: item.unitPrice ?? null,
        lineTotal: item.lineTotal ?? null,
        pageNumber: item.pageNumber,
        qtyReceived: item.qtyExpected,
        status: 'pending',
        damageNote: '',
        swappedForCode: null,
        isBonus: false,
      })));
    }
  }

  // ── TXT files + pasted text: send raw text to Claude ──
  const textChunks = [];
  for (const f of txts) {
    const text = await f.text();
    textChunks.push(`--- FILE: ${f.name} ---\n${text}`);
  }
  if (pasteText.trim()) {
    textChunks.push(pasteText.trim());
  }
  if (textChunks.length > 0) {
    if (!apiKey) throw new Error('Text invoices require an API key. Add your key in Settings.');
    const combined = textChunks.join('\n\n');
    const content = [{ type: 'text', text: combined + '\n\n' + EXTRACTION_PROMPT }];
    const data = await callClaude(apiKey, [{ role: 'user', content }], EXTRACTION_SYSTEM);
    const responseText = data.content.map(c => c.text || '').join('');
    const rawItems = parseClaudeResponse(responseText);
    items.push(...normalizeItems(rawItems));
  }

  // ── Images: use Claude API for OCR ──
  if (images.length > 0 && apiKey) {
    const content = [];
    for (const f of images) {
      const b64 = await resizeImage(f);
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
    }
    // Also include any PDFs that failed local extraction
    for (const f of pdfs) {
      if (!items.some(i => i.pageNumber)) {
        const b64 = await fileToBase64(f);
        content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
      }
    }
    content.push({ type: 'text', text: EXTRACTION_PROMPT });

    const data = await callClaude(apiKey, [{ role: 'user', content }], EXTRACTION_SYSTEM);
    const text = data.content.map(c => c.text || '').join('');
    const rawItems = parseClaudeResponse(text);
    items.push(...normalizeItems(rawItems));
  }

  if (items.length === 0 && images.length > 0 && !apiKey) {
    throw new Error('Photo invoices require an API key for OCR. Upload a PDF instead, or add your API key in Settings.');
  }

  if (items.length === 0) {
    throw new Error('No line items found. The PDF may be scanned/image-based — try uploading a photo and adding an API key.');
  }

  return items;
}

// Split CamelCase / concatenated words (for local extraction fallback):
// "BootyCleanser" → "Booty Cleanser", "WetStuffGold100Ml" → "Wet Stuff Gold 100 Ml"
function splitCamelCase(s) {
  if (!s) return s;
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\d)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function extractInvoiceItemsWithRetry(apiKey, files, onRetry, pasteText = '') {
  try {
    return await extractInvoiceItems(apiKey, files, pasteText);
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('overloaded') || msg.includes('529')) {
      onRetry?.();
      await new Promise(r => setTimeout(r, 3000));
      return await extractInvoiceItems(apiKey, files, pasteText);
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
      body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: maxTokens, system: systemPrompt, messages }),
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
