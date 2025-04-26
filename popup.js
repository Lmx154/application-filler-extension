// Tell pdf.js where its worker lives:
pdfjsLib.GlobalWorkerOptions.workerSrc = browser.runtime.getURL('pdf.worker.min.js');

const input = document.getElementById('fileInput');
const out   = document.getElementById('output');

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
    const strings = content.items.map(item => item.str);
    fullText += strings.join(' ') + '\n';
  }

  out.textContent = toMarkdown(fullText);
});

// super-simple text → Markdown
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
