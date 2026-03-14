import { GoogleGenAI } from "@google/genai";

const getAI = () => {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

export const generateChatResponse = async (prompt: string, history: { role: string, parts: { text: string }[] }[] = []) => {
  const ai = getAI();
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: history.length > 0 ? history.concat([{ role: 'user', parts: [{ text: prompt }] }]) : prompt,
  });
  const response = await model;
  return response.text;
};

export const generateImage = async (prompt: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [{ text: prompt }],
  });
  
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
};

export const explainCode = async (code: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Explain this code in detail and suggest improvements:\n\n\`\`\`\n${code}\n\`\`\``,
  });
  return response.text;
};
