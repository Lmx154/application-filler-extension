// Import PDF.js as a module
import * as pdfjsLib from './pdf.mjs';

// Set the worker source to the worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs';

const input = document.getElementById('fileInput');
const out = document.getElementById('output');
const openViewerButton = document.getElementById('openViewer');
const extractDataButton = document.getElementById('extractData');

// Handle the "Open Full-Page Viewer" button click
openViewerButton.addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("viewer.html")
  });
});

// Handle the "Extract HTML Data" button click
extractDataButton.addEventListener('click', async () => {
  // Get current active tab
  try {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tabs || tabs.length === 0) {
      console.error("No active tab found");
      return;
    }

    const activeTab = tabs[0];
    
    // Instead of trying to message a possibly non-existent content script,
    // directly inject and execute the script to extract HTML
    chrome.scripting.executeScript({
      target: {tabId: activeTab.id},
      func: () => {
        return document.documentElement.outerHTML;
      }
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.error("Script injection error:", chrome.runtime.lastError);
        return;
      }

      if (results && results[0] && results[0].result) {
        // Store the HTML in localStorage
        localStorage.setItem('extractedHTML', results[0].result);
        
        // Open the viewer page to display the data
        chrome.tabs.create({
          url: chrome.runtime.getURL("viewer.html?section=application")
        });
      } else {
        console.error("Failed to extract HTML");
      }
    });
  } catch (error) {
    console.error("Error extracting HTML:", error);
  }
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
