/**
 * Cloudflare AI Worker — OCR via Llama 3.2 Vision model
 * Runs server-side, accurate book cover text recognition
 *
 * Usage: POST /api/ocr with multipart form-data
 *   - image: File (JPG, PNG, WEBP)
 * 
 * Returns:
 *   {
 *     rawText: string (full OCR output),
 *     title: string,
 *     author: string
 *   }
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const imageFile = formData.get('image');

    if (!imageFile) {
      return Response.json(
        { error: 'No image provided' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Convert file to base64 (chunked to avoid call stack limits)
    const buffer = await imageFile.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const mimeType = imageFile.type || 'image/jpeg';

    // Call Cloudflare AI OCR model (using Llama 3.2 Vision)
    const response = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
      messages: [
        {
          role: 'user',
          content: `Analyze this book cover image and extract all visible text:

1. List every word/text you can read on the cover
2. Identify the book title (usually the largest text)
3. Identify the author name
4. Include any subtitle, publisher, year if visible

Respond in this exact format:
TEXT FOUND ON COVER:
[all text found]

LIKELY TITLE: [main title]
LIKELY AUTHOR: [author name]`,
        },
      ],
      image: `data:${mimeType};base64,${base64}`,
    });

    // Parse AI response
    const aiText = typeof response?.result === 'string'
      ? response.result
      : (response?.result?.[0]?.content || '');
    
    const rawText = extractTextSection(aiText);
    const { title, author } = parseAiResponse(aiText, rawText);

    console.log('[OCR Worker] Response:', { title, author, rawTextLen: rawText.length });

    return Response.json(
      {
        rawText,
        title: title.trim().slice(0, 150),
        author: author.trim().slice(0, 100),
      },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (err) {
    console.error('[OCR Worker] Error:', err);
    return Response.json(
      { error: err.message || 'OCR processing failed' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}

function extractTextSection(aiText) {
  const match = aiText.match(/TEXT FOUND ON COVER:\s*([\s\S]*?)(?:LIKELY TITLE:|$)/i);
  return (match?.[1] || aiText).trim();
}

function parseAiResponse(aiText, rawText) {
  let title = '';
  let author = '';

  const titleMatch = aiText.match(/LIKELY TITLE:\s*([^\n]+)/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  const authorMatch = aiText.match(/LIKELY AUTHOR:\s*([^\n]+)/i);
  if (authorMatch) {
    author = authorMatch[1].trim();
  }

  if (!title && rawText) {
    const lines = rawText.split(/\n/).filter(l => l.trim().length > 3);
    title = lines[0] || '';
  }

  if (!author && rawText) {
    const lines = rawText.split(/\n/).filter(l => l.trim().length > 3);
    author = lines[1] || '';
  }

  return { title, author };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// CORS preflight
export async function onRequestOptions(context) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
