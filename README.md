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
    tags: ["Video"] // oder "KI" / "Foto"
},
```

Der Text über dich steht in `index.html` im Bereich `<div class="about">`.
Grösse des Rasters und Stärke der Lupe lassen sich oben in `main.js` einstellen.
