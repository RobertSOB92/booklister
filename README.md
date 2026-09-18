# AI Book Scanner

Kompletna aplikacja webowa PWA do rozpoznawania książek na podstawie zdjęć okładek przy użyciu AI (Google Gemini).

## Funkcjonalności

- **Przetwarzanie zdjęć okładek**: Dodawanie do 10 zdjęć jednocześnie z galerii lub aparatu.
- **AI OCR i rozpoznawanie**: Google Gemini odczytuje tekst z okładki, rozpoznaje książkę i generuje opis po polsku.
- **Model BYOK (Bring Your Own Key)**: Użytkownik podaje własny klucz API, zapewniając pełną prywatność i kontrolę kosztów.
- **Tryb PWA (Progressive Web App)**: Aplikację można zainstalować na telefonie lub komputerze. Działa jak natywna aplikacja.
- **Kopiowanie wyników**: Szybkie kopiowanie tytułu, autora i opisu wraz z własnym prefixem.
- **Integracja z Google Search**: Jednym kliknięciem wyszukuj książkę w preferowanych serwisach (np. lubimyczytac.pl, empik.com).
- **Zapis lokalny**: Klucz API i ustawienia są zapisywane w pełni lokalnie w przeglądarce i nie są wysyłane na żaden serwer.

## Wymagania

- Przeglądarka internetowa obsługująca nowoczesne standardy (np. Chrome, Safari, Firefox).
- Dostęp do Internetu.
- Ważny klucz **Google Gemini API** (wymagany do analizy okładek).

## Jak zdobyć klucz Gemini API

1. Przejdź na stronę [Google AI Studio](https://aistudio.google.com/).
2. Zaloguj się kontem Google.
3. Wybierz opcję "Get API key" z menu.
4. Kliknij "Create API key" w nowym projekcie.
5. Skopiuj wygenerowany klucz.

## Instalacja i uruchomienie

### Uruchomienie lokalne (dla programistów)

1. Sklonuj repozytorium:
   ```bash
   git clone https://github.com/RobertSOB92/AI_book_scanner_public.git
   cd AI_book_scanner_public
   ```

2. Zainstaluj zależności:
   ```bash
   npm install
   ```

3. Uruchom serwer deweloperski:
   ```bash
   npm run dev
   ```

4. Otwórz adres `http://localhost:5173` w przeglądarce.

### Testowanie

Aplikacja zawiera testy jednostkowe. Aby je uruchomić, użyj polecenia:
```bash
npm run test
```

### Budowanie produkcyjne

Aby zbudować aplikację gotową do wdrożenia:
```bash
npm run build
```
Zbudowane pliki znajdą się w folderze `dist/`.

## Konfiguracja (Model BYOK)

1. Po uruchomieniu aplikacji przejdź do zakładki **Ustawienia**.
2. Wklej wygenerowany klucz Gemini API.
3. (Opcjonalnie) Ustaw swój prefix (np. `#Polecajka`) oraz preferowane domeny wyszukiwania (domyślnie `lubimyczytac.pl, empik.com`).
4. Zapisz ustawienia. Od tej pory możesz skanować okładki na stronie głównej.

## Bezpieczeństwo i prywatność

- Aplikacja działa wyłącznie w modelu **Bring Your Own Key**. Nie posiada wbudowanego trybu demo ani klucza zapasowego.
- Twój klucz API jest przechowywany lokalnie w pamięci przeglądarki (Local Storage).
- Aplikacja **nie posiada backendu**. Klucz API nie jest wysyłany na żaden obcy serwer – połączenie nawiązywane jest bezpośrednio między Twoją przeglądarką a serwerami Google (Google Gemini API).
- Z uwagi na zapis klucza w przeglądarce, **nie należy używać aplikacji na publicznych i współdzielonych komputerach**.
- W każdej chwili możesz całkowicie usunąć swój klucz z pamięci przeglądarki w zakładce Ustawienia.

## PWA (Zainstaluj jako aplikację)

Aplikacja jest przystosowana jako PWA, co oznacza, że możesz ją zainstalować:
- **Android (Chrome)**: Otwórz aplikację, wejdź w menu przeglądarki i wybierz "Zainstaluj aplikację".
- **iOS (Safari)**: Otwórz aplikację, wybierz przycisk udostępniania i kliknij "Do ekranu początkowego" (Add to Home Screen).
- **Desktop (Chrome/Edge)**: Na pasku adresu pojawi się ikona instalacji aplikacji.

## Ograniczenia i uwagi

- Aplikacja służy wyłącznie do analizowania **zdjęć okładek**. Nie skanuje i nie analizuje treści wewnątrz książki.
- Ponieważ rozpoznawanie odbywa się w pełni po stronie AI, jego jakość zależy od modelu (domyślnie `gemini-2.5-flash`). Model może rzadko pomylić drobne fragmenty tekstu lub "zhalucynować" autora na niewyraźnym zdjęciu. Warto zweryfikować poprawność wygenerowanego opisu przed jego skopiowaniem.
- Limity zapytań wynikają bezpośrednio z używanego klucza w Google AI Studio. W planie darmowym (Free Tier) mogą występować ograniczenia ilości na minutę (RPM). W takim wypadku spróbuj ponowić po chwili (używając przycisku "Ponów").
