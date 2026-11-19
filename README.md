# weer-viz

Visuele weer-app, puur statisch (HTML + CSS + vanilla JS, geen build, geen API-keys).

## Wat zit erin
- **Live hemel-achtergrond** — kleur en animatie (zon, sterren, wolken, regen, sneeuw, bliksem) volgen het actuele weer en dag/nacht
- **Nu** — temperatuur, gevoelstemperatuur, min/max
- **Tegels** — windkompas, luchtvochtigheid, UV-index, luchtkwaliteit (EAQI + PM2.5), luchtdruk, zonnestand-boog
- **48-uursgrafiek** — temperatuur, gevoelstemperatuur, neerslag (mm + kans), nachtbanden, hover-tooltip
- **7-dagen** — temperatuurbereik als kleurverloop + neerslag
- **Neerslagradar** — geanimeerde RainViewer-frames (verleden + nowcast) op Leaflet
- **Heatmap** — 7 dagen × 24 uur temperatuur
- Stad zoeken, geolocatie, laatste locatie onthouden, `?lat=..&lon=..&name=..` als URL-parameter

## Databronnen (allemaal gratis, zonder key)
| Bron | Gebruik |
|---|---|
| [Open-Meteo Forecast](https://open-meteo.com/en/docs) | actueel, uurlijks, dagelijks |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) | EAQI, PM2.5, PM10 |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | stad zoeken |
| [RainViewer](https://www.rainviewer.com/api.html) | radartegels |
| [BigDataCloud](https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api) | reverse geocoding bij "mijn locatie" |
| CARTO / OSM | donkere basiskaart |

## Draaien
```bash
npx serve .        # of: python3 -m http.server
```
Open `http://localhost:3000` (of `:8000`). Werkt ook direct op GitHub Pages.

## Integreren
Alles zit in `index.html`, `style.css` en `app.js` (ES module). Standaardlocatie = Antwerpen, aan te passen via `DEFAULT` bovenaan `app.js`.
Open-Meteo is gratis voor niet-commercieel gebruik; voor commercieel gebruik een API-plan nemen.
