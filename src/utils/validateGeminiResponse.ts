import type { BookResult } from "../types/book";

export const validateGeminiResponse = (text: string): { isValid: boolean; data?: BookResult; error?: string } => {
  try {
    // 1. Remove markdown tags and code fences if any
    let cleanedText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    // Sometimes Gemini might include conversational text. 
    // Try to extract just the JSON part between { and }
    const startIndex = cleanedText.indexOf('{');
    const endIndex = cleanedText.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1) {
       return { isValid: false, error: "Odpowiedź AI nie zawiera obiektu JSON." };
    }
    
    cleanedText = cleanedText.substring(startIndex, endIndex + 1);
    
    const parsed = JSON.parse(cleanedText);
    
    // 6. Validate fields
    if (!parsed.title || typeof parsed.title !== 'string' || parsed.title.trim() === '') {
      return { isValid: false, error: "Brak tytułu w odpowiedzi." };
    }
    
    if (!parsed.author || typeof parsed.author !== 'string' || parsed.author.trim() === '') {
      return { isValid: false, error: "Brak autora w odpowiedzi." };
    }
    
    const bookResult: BookResult = {
      title: parsed.title.trim(),
      author: parsed.author.trim(),
      description: typeof parsed.description === 'string' ? parsed.description.trim() : "",
      sourceUrl: typeof parsed.sourceUrl === 'string' ? parsed.sourceUrl.trim() : "",
    };
    
    return { isValid: true, data: bookResult };
  } catch (error) {
    return { isValid: false, error: "Odpowiedź AI miała nieprawidłowy format JSON. Spróbuj ponownie." };
  }
};
