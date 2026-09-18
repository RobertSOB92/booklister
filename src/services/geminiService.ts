import { GoogleGenerativeAI } from "@google/generative-ai";
import type { BookResult } from "../types/book";
import type { IdentifyBookRequest } from "../types/gemini";
import { validateGeminiResponse } from "../utils/validateGeminiResponse";

async function fileToGenerativePart(file: File) {
  const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (result) {
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
  
  const base64EncodedData = await base64EncodedDataPromise;
  
  return {
    inlineData: {
      data: base64EncodedData,
      mimeType: file.type
    },
  };
}

export const identifyBookFromImage = async (request: IdentifyBookRequest): Promise<BookResult> => {
  const { apiKey, image, allowedDomains } = request;
  
  if (!apiKey) {
    throw new Error("Dodaj klucz Gemini API w ustawieniach.");
  }

  const cleanApiKey = apiKey.replace(/[\s\r\n]+/g, '').trim();

  try {
    const genAI = new GoogleGenerativeAI(cleanApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const imageParts = await fileToGenerativePart(image);

    const prompt = `You are analyzing a photo of a book cover.

Perform all of the following tasks:
1. Read all visible text from the book cover.
2. Identify the most likely book title.
3. Identify the most likely author.
4. Find or infer the most likely matching book.
5. Prepare a concise but useful description of the book in Polish.
6. Use the preferred domains when looking for information, if possible.

Preferred domains:
${allowedDomains.join(", ")}

Return ONLY valid JSON.
Do not use Markdown.
Do not wrap the response in code fences.
Do not add comments before or after the JSON.

Required JSON format:
{
  "title": "string",
  "author": "string",
  "description": "string in Polish",
  "sourceUrl": "string"
}

If the book cannot be identified with confidence, return the most likely result and do not invent excessive details.`;

    const result = await model.generateContent([prompt, imageParts]);
    const response = await result.response;
    const text = response.text();
    
    const validation = validateGeminiResponse(text);
    if (!validation.isValid || !validation.data) {
      throw new Error(validation.error || "Nie udało się przeanalizować okładki.");
    }
    
    return validation.data;
  } catch (error: any) {
    console.error("Gemini Error:", error);
    if (error.message && error.message.toLowerCase().includes("api key not valid")) {
       throw new Error("Klucz Gemini API jest nieprawidłowy lub wygasł.");
    }
    if (error.message && error.message.includes("503")) {
      throw new Error("Serwery Google są obecnie przeciążone (błąd 503). Użyj przycisku 'Ponów' za chwilę.");
    }
    if (error.message && error.message.includes("Dodaj klucz")) {
      throw error;
    }
    throw new Error(error.message || "Błąd podczas komunikacji z Gemini API.");
  }
};

export const verifyGeminiKey = async (apiKey: string): Promise<{ isValid: boolean, error?: string, modelUsed?: string }> => {
    try {
        const cleanApiKey = apiKey.replace(/[\s\r\n]+/g, '').trim();
        const genAI = new GoogleGenerativeAI(cleanApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
        // Send a minimal request to verify the key
        await model.generateContent("Test connection. Reply with 'OK'.");
        return { isValid: true, modelUsed: "gemini-3.6-flash" };
    } catch (error: any) {
        console.error("verifyGeminiKey Error:", error);
        return { 
            isValid: false, 
            error: error.message || "Wystąpił nieznany błąd podczas weryfikacji klucza." 
        };
    }
}
