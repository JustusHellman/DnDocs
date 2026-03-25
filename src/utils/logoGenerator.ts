import { GoogleGenAI } from "@google/genai";

export async function generateFavicon() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: 'A minimalist, elegant circular logo for a fantasy world-building app. It should feature a stylized quill pen and a compass rose or a small mountain peak, using a color palette of amber, stone gray, and deep charcoal. The design should be clean and suitable for a small browser favicon.',
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K"
        },
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.error('Error generating favicon:', error);
  }
  return null;
}
