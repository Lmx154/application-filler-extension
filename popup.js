// Import PDF.js as a module
import * as pdfjsLib from './pdf.mjs';

// Set the worker source to the worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs';

const input = document.getElementById('fileInput');
const out = document.getElementById('output');
const openViewerButton = document.getElementById('openViewer');

// Handle the "Open Full-Page Viewer" button click
openViewerButton.addEventListener('click', () => {
  browser.tabs.create({
    url: browser.runtime.getURL("viewer.html")
  });
});

input.addEventListener('change', async () => {
  const file = input.files[0];
  if (!file || file.type !== 'application/pdf') {
    out.textContent = 'Please select a PDF file.';
    return;
  }

  out.textContent = 'Parsing…';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n';
  }

  out.textContent = toMarkdown(fullText);
});

function toMarkdown(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l)
    .map(l => {
      if (/^[-•*]\s*/.test(l)) {
        return '- ' + l.replace(/^[-•*]\s*/, '');
      }
      if (l === l.toUpperCase() && l.length < 50) {
        return '## ' + l;
      }
      return l;
    })
    .join('\n\n');
}
