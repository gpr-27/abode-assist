#!/bin/bash
# Builds docs/TDD.pdf from docs/TDD.md (marked → HTML with print styles → headless Chrome).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${1:-docs}
body=$(npx --yes marked@15.0.12 --gfm -i docs/TDD.md)
cat > "$OUT/TDD.html" <<HTML
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Abode Assist — Technical Design Document</title>
<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@300;400&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 16mm 15mm 16mm 15mm; }
body { font-family: 'Hanken Grotesk', system-ui, sans-serif; color: #1a1d1f; font-size: 10pt; line-height: 1.5; }
h1 { font-family: Spectral, Georgia, serif; font-weight: 300; font-size: 25pt; margin: 0 0 4pt; letter-spacing: -0.01em; }
h2 { font-family: Spectral, Georgia, serif; font-weight: 400; font-size: 16pt; margin: 18pt 0 6pt; color: #2b3a67; break-after: avoid; }
h3 { font-size: 11pt; margin: 12pt 0 4pt; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
a { color: #2b3a67; }
code { font-size: 8.6pt; background: #f3f4f1; padding: 0 3px; border-radius: 3px; }
pre { background: #f3f4f1; padding: 8pt 10pt; border-radius: 6px; font-size: 7.8pt; line-height: 1.35; overflow: hidden; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; padding: 0; font-size: inherit; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 8.8pt; break-inside: auto; }
th, td { border-bottom: 1px solid #e4e5e2; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { color: #64686c; font-weight: 500; }
tr { break-inside: avoid; }
hr { border: 0; border-top: 1px solid #e4e5e2; margin: 14pt 0; }
img { max-width: 100%; border: 1px solid #e4e5e2; border-radius: 6px; }
.shots { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; }
.shots figure { margin: 0; break-inside: avoid; }
.shots figcaption { font-size: 8pt; color: #64686c; margin-top: 2pt; }
.phones { grid-template-columns: 1fr 1fr 1fr; }
</style></head><body>
$body
</body></html>
HTML
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer \
  --run-all-compositor-stages-before-draw --virtual-time-budget=8000 \
  --print-to-pdf="$OUT/TDD.pdf" "file://$PWD/$OUT/TDD.html" 2>/dev/null
echo "wrote $OUT/TDD.pdf"
