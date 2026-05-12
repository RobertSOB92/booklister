# BookLister — Automatyczne opisy aukcji książek

Aplikacja webowa do generowania opisów ogłoszeń na OLX z okładek książek.

## Jak to działa

1. Wgraj zdjęcie okładki
2. OCR (Tesseract.js) rozpoznaje tekst
3. Google Books / Open Library wyszukują dane
4. LubimyCzytać.pl dostarcza polski opis (po wdrożeniu na CF Pages)
5. Skopiuj gotowy tekst do OLX

## Stack

- Pure HTML/CSS/JS — brak frameworków
- Tesseract.js — OCR w przeglądarce (WASM)
- Google Books API — dane bibliograficzne
- Open Library — fallback
- Cloudflare Pages Functions — proxy LubimyCzytać.pl

## Deployment

Wrzuć repozytorium na GitHub, podłącz do Cloudflare Pages.  
Brak konfiguracji build — publish directory: `/` (root).

## Lokalne uruchomienie

Otwórz `index.html` w przeglądarce (LubimyCzytać nie działa lokalnie — wymaga CF Pages).

## Niedawne Ulepszenia

### OCR — Lepsza Rozpoznawalność Tekstu
- **Łagodniejsze filtrowanie**: zmiana z 35% na 20% threshold znaków alfanumerycznych
  - Pozwala na rozpoznawanie tytułów z dwukropkami, numerami, itp.
- **Lepszy scoring tytułów**: zamiast wykładniczego — liniowy, z bonusami za popularne słowa
- **Rozpoznawanie imion autorów**: akceptuje mieszane case'i, 1-4 wyrazowe linie
- **Adaptacyjne preprocessingowanie**: zbalansowana jasność i kontrast dla różnych okładek

### Pobieranie Opisów — Niezawodność
- **Retry mechanism**: automatyczne ponowne próby (2x) dla Google Books i Open Library
- **Dłuższe timeout'y**: lepsze dla API międzynarodowych
- **Lepsze scrapowanie LubimyCzytać**: 5 strategii wyszukiwania opisu + retry + proper headers
- **Preferowanie opisu po polsku**: przy opisie po angielsku aplikacja automatycznie próbuje podmienić na polski (Wikipedia PL/LubimyCzytać/OL)
- **Lepsza obsługa błędów**: szczegółowe logowanie w konsoli (F12) dla diagnostyki

### Debugowanie

Otwórz DevTools (F12) i zobacz Console, aby śledzić przetwarzanie:
- `[OCR]` — informacje o rozpoznawaniu tekstu
- `[Books]` — informacje o wyszukiwaniu książek
- `[App]` — ogólne informacje o przetwarzaniu

## Znane Problemy i Rozwiązania

| Problem | Rozwiązanie |
|---------|-------------|
| OCR słabo rozpoznaje tekst | Spróbuj lepsze oświetlenie, inny kąt zdjęcia. Sprawdź Console dla "raw text" |
| Brak opisu książki | Upewnij się że jesteś na Cloudflare Pages. Lokalnie tylko Google Books/Open Library |
| Timeout'y | Czekaj — API mogą być powolne. Console pokaże szczegóły |
| Zły tytuł/autor | Możesz ręcznie edytować pola przed kopią |
