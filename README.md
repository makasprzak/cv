# CV - Maciej Kasprzak

A modern, minimalistic CV webpage powered by YAML data.

## Features

- Clean, monospaced design with teal/emerald color scheme
- Responsive layout optimized for desktop and mobile
- Print-friendly for PDF export
- Data-driven: all content stored in structured YAML format
- Smooth hover effects and rounded sections

## Viewing

Visit the live page at: [https://makasprzak.github.io/cv/](https://makasprzak.github.io/cv/)

Or view locally:
1. Clone the repository
2. Open `cv.html` in your browser (requires local server for YAML loading)
3. Run `python3 -m http.server 8000` and visit `http://localhost:8000/cv.html`

## Versions

- `cv.yaml` - Full detailed CV
- `cv_us.yaml` - US-focused version with condensed experience

## Exporting to PDF

Use your browser's Print to PDF function (`Cmd + P` on Mac) with "Background graphics" enabled.

## Technologies

- HTML5 + CSS3
- JavaScript (ES6+)
- [js-yaml](https://github.com/nodeca/js-yaml) for YAML parsing
