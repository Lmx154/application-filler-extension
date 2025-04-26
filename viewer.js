// Import PDF.js as a module
import * as pdfjsLib from './pdf.mjs';

// Set the worker source to the worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs';

const input = document.getElementById('fileInput');
const out = document.getElementById('output');

input.addEventListener('change', async () => {
  const file = input.files[0];
  if (!file || file.type !== 'application/pdf') {
    out.textContent = 'Please select a PDF file.';
    return;
  }

  out.textContent = 'Parsing…';
  const buf = await file.arrayBuffer();
  
  try {
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }

    out.textContent = toMarkdown(fullText);
    
    // Add copy button
    addCopyButton();
  } catch (error) {
    out.textContent = `Error parsing PDF: ${error.message}`;
  }
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

function addCopyButton() {
  // Remove any existing copy button
  const existingBtn = document.getElementById('copyBtn');
  if (existingBtn) {
    existingBtn.remove();
  }
  
  // Create copy button
  const copyBtn = document.createElement('button');
  copyBtn.id = 'copyBtn';
  copyBtn.textContent = 'Copy to Clipboard';
  copyBtn.style.marginTop = '10px';
  copyBtn.style.padding = '8px 16px';
  copyBtn.style.cursor = 'pointer';
  
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(out.textContent).then(() => {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 2000);
    });
  });
  
  // Insert before output
  out.parentNode.insertBefore(copyBtn, out.nextSibling);
}