# etcado.github.io

this is my portfolio

## Neue Projekte hinzufügen

1. Bild in den Ordner hochladen (z.B. `images/mein-projekt.jpg`).
2. In `projects.js` einen Eintrag ergänzen:

```js
{
    src: "images/mein-projekt.jpg",
    title: "Mein Projekt",
    year: 2025,
    text: "Kurzer Text, der beim Hovern über dem Titel erscheint",
    tags: ["Video"], // oder "KI" / "Foto"
    description: "Längerer Text, der beim Klick auf die Kachel erscheint",
    link: "https://vimeo.com/..." // optional
},
```

Der Text über dich steht in `index.html` im Bereich `<div class="about">`.
Grösse des Rasters und Stärke der Lupe lassen sich oben in `main.js` einstellen.

## Nach einem Update

Wenn du `main.js`, `style.css` oder `projects.js` änderst, erhöhe in `index.html` die Versionsnummer (`?v=4` → `?v=5`).
So laden alle Browser sofort die neue Version statt einer alten aus dem Cache.
