import type { BookResult } from "./book";

export type IdentifyBookRequest = {
  apiKey: string;
  image: File;
  allowedDomains: string[];
};

export interface GeminiService {
  identifyBookFromImage(request: IdentifyBookRequest): Promise<BookResult>;
}
