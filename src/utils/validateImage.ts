export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export const validateImage = (file: File): { isValid: boolean; error?: string } => {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { isValid: false, error: "Ten format obrazu nie jest obsługiwany." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { isValid: false, error: `Zdjęcie jest za duże. Maksymalny rozmiar pliku to ${MAX_FILE_SIZE_MB} MB.` };
  }

  return { isValid: true };
};
