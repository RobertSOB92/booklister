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
