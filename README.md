# BookLister — Automatyczne opisy aukcji książek

Aplikacja webowa do generowania opisów ogłoszeń na OLX z okładek książek.

## Jak to działa

1. Wgraj zdjęcie okładki
2. OCR (Cloudflare AI) rozpoznaje tekst
3. Google Books / Open Library wyszukują dane
4. LubimyCzytać.pl dostarcza polski opis (po wdrożeniu na CF Pages)
5. Skopiuj gotowy tekst do OLX

## Stack

- Pure HTML/CSS/JS — brak frameworków
- Cloudflare AI Workers — OCR/vision (LLaVA)
- Google Books API — dane bibliograficzne
- Open Library — fallback
- Cloudflare Pages Functions — proxy LubimyCzytać.pl

## Deployment

Wrzuć repozytorium na GitHub, podłącz do Cloudflare Pages.  
Brak konfiguracji build — publish directory: `/` (root).

**Wymagane dla OCR (Cloudflare AI):**
1. W Cloudflare Dashboard → Pages → Twój projekt → Settings → Functions → Bindings
2. Dodaj binding typu **AI** o nazwie **AI**
3. Upewnij się, że Workers AI jest włączone dla konta (free tier wystarcza)

## Lokalne uruchomienie

Otwórz `index.html` w przeglądarce.  
Uwaga: OCR przez `/api/ocr` działa tylko po wdrożeniu na Cloudflare Pages.

## Niedawne Ulepszenia

### OCR — Lepsza Rozpoznawalność Tekstu
- **Łagodniejsze filtrowanie**: zmiana z 35% na 20% threshold znaków alfanumerycznych
  - Pozwala na rozpoznawanie tytułów z dwukropkami, numerami, itp.
- **Lepszy scoring tytułów**: zamiast wykładniczego — liniowy, z bonusami za popularne słowa
- **Rozpoznawanie imion autorów**: akceptuje mieszane case'i, 1-4 wyrazowe linie
- **Adaptacyjne preprocessingowanie**: zbalansowana jasność i kontrast dla różnych okładek
- **ISBN-first**: jeśli OCR wykryje poprawny ISBN-10/13, wyszukiwanie zaczyna od ISBN (najwyższa trafność)
- **Tryb kandydatów**: aplikacja pokazuje kilka dopasowań książki, które możesz ręcznie przełączyć jednym kliknięciem
- **Cloudflare AI OCR**: rozpoznawanie tekstu okładki po stronie serwera (lepsza jakość)

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
| OCR nie działa lokalnie | To normalne — OCR używa `/api/ocr` w Cloudflare Pages |
| Timeout'y | Czekaj — API mogą być powolne. Console pokaże szczegóły |
| Zły tytuł/autor | Możesz ręcznie edytować pola przed kopią |
