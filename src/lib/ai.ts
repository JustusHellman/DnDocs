/**
 * DEV ONLY – Gemini image generation.
 *
 * This module is only imported behind `import.meta.env.DEV` checks, so neither the
 * `@google/genai` SDK nor your API key end up in the public production bundle.
 * (Shipping an API key to the browser lets anyone who opens the site use it.)
 */
import { GoogleGenAI } from '@google/genai';
import { compressImage } from './media';

function client() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey) throw new Error('Set GEMINI_API_KEY in .env.local to use AI image generation.');
  return new GoogleGenAI({ apiKey });
}

export async function generateImage(prompt: string, aspectRatio: '1:1' | '16:9' = '1:1'): Promise<string> {
  try {
    const response = await client().models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio } },
    });
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) return compressImage(`data:image/png;base64,${part.inlineData.data}`, 1280);
    }
    throw new Error('The model returned no image.');
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (/429|quota|exhausted/i.test(msg)) throw new Error('Quota exceeded for image generation – try again later.');
    throw err;
  }
}
