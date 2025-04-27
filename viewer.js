// Import PDF.js as a module
import * as pdfjsLib from './pdf.mjs';
import AgentsAPI from './agents-api.js';

// Set the worker source to the worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs';

// Load environment variables from .env file
async function loadEnvVars() {
  try {
    const response = await fetch('.env');
    const text = await response.text();
    
    // Parse .env file content
    const envVars = {};
    text.split('\n').forEach(line => {
      // Skip empty lines and comments
      if (!line || line.startsWith('#')) return;
      
      const [key, value] = line.split('=');
      if (key && value) {
        envVars[key.trim()] = value.trim();
      }
    });
    
    return envVars;
  } catch (error) {
    console.error('Error loading .env file:', error);
    return {};
  }
}

// Initialize API client with environment variables
let agentsAPI = null;
let envVars = {};

// Store parsed resume and form data
let parsedResume = '';
let formData = null;

// Navigation functionality
const navLinks = {
  resume: document.getElementById('nav-resume'),
  application: document.getElementById('nav-application'),
  output: document.getElementById('nav-output'),
  ai: document.getElementById('nav-ai'),
  settings: document.getElementById('nav-settings')
};

const pages = {
  resume: document.getElementById('page-resume'),
  application: document.getElementById('page-application'),
  output: document.getElementById('page-output'),
  ai: document.getElementById('page-ai'),
  settings: document.getElementById('page-settings')
};

// Handle navigation clicks
Object.keys(navLinks).forEach(page => {
  navLinks[page].addEventListener('click', (e) => {
    e.preventDefault();
    switchToPage(page);
  });
});

function switchToPage(pageName) {
  // Update active navigation link
  Object.values(navLinks).forEach(link => link.classList.remove('active'));
  navLinks[pageName].classList.add('active');

  // Update visible page
  Object.values(pages).forEach(page => page.classList.remove('active'));
  pages[pageName].classList.add('active');
}

// Check URL parameters for direct navigation
function checkUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  const section = urlParams.get('section');
  
  if (section && navLinks[section]) {
    switchToPage(section);
    
    // If the section is application, check for extracted HTML
    if (section === 'application') {
      const extractedData = localStorage.getItem('extractedHTML');
      if (extractedData) {
        try {
          const parsedData = JSON.parse(extractedData);
          formData = parsedData;
          displayFormData(parsedData);
        } catch (error) {
          // Handle the case where the data might be old format raw HTML
          displayExtractedHTML(extractedData);
        }
      }
    }
  }
}

// PDF Processing functionality
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

    parsedResume = toMarkdown(fullText);
    out.textContent = parsedResume;
    
    // Store the parsed resume in localStorage
    localStorage.setItem('parsedResume', parsedResume);
    
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
  copyBtn.style.backgroundColor = 'var(--primary-color)';
  copyBtn.style.color = 'white';
  copyBtn.style.border = 'none';
  copyBtn.style.borderRadius = '4px';
  
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

// Output Page functionality
const outputSummary = document.getElementById('output-summary').querySelector('.summary-content');
const outputFields = document.getElementById('output-fields').querySelector('.fields-container');
const generateOutputButton = document.getElementById('generate-output');
const copyOutputButton = document.getElementById('copy-output');
const clearOutputButton = document.getElementById('clear-output');

// Variable to store the AI-generated output
let aiGeneratedOutput = null;

// Function to generate the AI prompt based on form fields and resume
function generatePrompt() {
  // Get the resume data
  const resume = localStorage.getItem('parsedResume') || '';
  
  // Get the form data
  const extractedData = localStorage.getItem('extractedHTML');
  let forms = [];
  let autofillableFields = [];
  
  if (extractedData) {
    try {
      const parsedData = JSON.parse(extractedData);
      forms = parsedData.forms || [];
      autofillableFields = parsedData.autofillableFields || [];
      
      console.log("Form data detected:", {
        formCount: forms.length,
        autofillableFieldsCount: autofillableFields.length
      });
    } catch (error) {
      console.error('Error parsing form data:', error);
      return 'Error: Could not parse form data';
    }
  } else {
    return 'Error: No form data available. Please extract form data first.';
  }
  
  // Generate a prompt for the AI
  let prompt = `I need your help to fill out an application form using information from my resume. 

RESUME CONTENT:
${resume}

FORM FIELDS:
`;

  // Create a set to track field IDs we've already added to prevent duplicates
  const processedFieldIds = new Set();
  
  // First add all autofillable fields to the prompt
  if (autofillableFields.length > 0) {
    autofillableFields.forEach(field => {
      // Use name or ID as the field identifier, with fallbacks for dynamic JS forms
      let fieldIdentifier = field.name || field.id || '';
      
      // If the field has no ID/name but has a path, use a portion of the path as identifier
      if (!fieldIdentifier && field.path) {
        // Extract the last part of the path that might contain a useful identifier
        const pathParts = field.path.split('>');
        const lastPart = pathParts[pathParts.length - 1].trim();
        if (lastPart.includes('id=')) {
          fieldIdentifier = lastPart.match(/id=["']([^"']+)["']/)?.[1] || '';
        } else if (lastPart.includes('class=')) {
          fieldIdentifier = lastPart.match(/class=["']([^"']+)["']/)?.[1] || '';
        }
      }
      
      // If we still don't have an identifier, use something unique
      if (!fieldIdentifier) {
        fieldIdentifier = `field_${autofillableFields.indexOf(field)}`;
      }
      
      // Only add this field if we haven't processed it already
      if (!processedFieldIds.has(fieldIdentifier)) {
        processedFieldIds.add(fieldIdentifier);
        
        const fieldLabel = field.label || fieldIdentifier;
        prompt += `- ${fieldLabel} (Field ID/Name: "${fieldIdentifier}", Type: ${field.type})\n`;
      }
    });
  } else if (forms.length > 0) {
    // Fallback to listing all form fields if no autofillable fields were detected
    forms.forEach(form => {
      prompt += `Form: ${form.name || form.id}\n`;
      form.fields.forEach(field => {
        // Use name or ID as the field identifier, with fallbacks
        let fieldIdentifier = field.name || field.id || '';
        
        // If the field has no ID/name but has a path, use a portion of the path as identifier
        if (!fieldIdentifier && field.path) {
          // Extract the last part of the path that might contain a useful identifier
          const pathParts = field.path.split('>');
          const lastPart = pathParts[pathParts.length - 1].trim();
          if (lastPart.includes('id=')) {
            fieldIdentifier = lastPart.match(/id=["']([^"']+)["']/)?.[1] || '';
          } else if (lastPart.includes('class=')) {
            fieldIdentifier = lastPart.match(/class=["']([^"']+)["']/)?.[1] || '';
          }
        }
        
        // If we still don't have an identifier, use something unique
        if (!fieldIdentifier) {
          fieldIdentifier = `field_${forms.indexOf(form)}_${form.fields.indexOf(field)}`;
        }
        
        // Only add this field if we haven't processed it already
        if (!processedFieldIds.has(fieldIdentifier)) {
          processedFieldIds.add(fieldIdentifier);
          
          const fieldLabel = field.label || fieldIdentifier;
          prompt += `- ${fieldLabel} (Field ID/Name: "${fieldIdentifier}", Type: ${field.type})\n`;
        }
      });
    });
  } else {
    return 'Error: No form fields found. Please extract a form first.';
  }
  
  prompt += `\nPlease analyze the resume and provide values for these form fields based ONLY on information present in the resume. 
For each field, use EXACTLY the field ID/name I provided in the "Field ID/Name" as the key in your JSON response.
For example, if I have a field with Field ID/Name: "_systemfield_email" or "d727c1e4-3750-4506-88be-1180535fc608", use that exact value as the key in your JSON.

For each field, provide:
1. The exact field ID/name as the key
2. The suggested value based on the resume content
3. Your confidence level (High/Medium/Low) for this mapping

If a field has no corresponding information in the resume, mark it as "No information available" with Low confidence.
Do NOT make up or invent any information that is not explicitly in the resume.

This is a JavaScript-based form with dynamically generated field IDs, so it's CRITICAL that you use the exact field ID/name I provided.

IMPORTANT: Return ONLY a valid JSON object without any markdown formatting (no \`\`\` characters). Your entire response should be parseable as JSON.
Format your response exactly as follows:
{
  "fields": [
    {
      "id": "EXACT_FIELD_ID_OR_NAME",
      "value": "suggested value from resume",
      "confidence": "High/Medium/Low"
    },
    ...
  ],
  "summary": "A brief summary of how well the resume matches the form fields overall."
}`;

  return prompt;
}

// Function to display the AI-generated output
function displayAIOutput(output) {
  let parsedOutput;
  
  try {
    // First try to parse as JSON
    if (typeof output === 'string') {
      // Check if the output is already in JSON format
      if (output.trim().startsWith('{') || output.trim().startsWith('[')) {
        try {
          parsedOutput = JSON.parse(output);
        } catch (error) {
          console.log("Failed initial JSON parse, trying to extract JSON from text");
          
          // Try to extract JSON from the response if it's embedded in text
          const jsonMatch = output.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsedOutput = JSON.parse(jsonMatch[0]);
            } catch (innerError) {
              console.error("Failed to extract JSON:", innerError);
              throw new Error("Could not parse response as JSON");
            }
          } else {
            throw new Error("No JSON object found in response");
          }
        }
      } else {
        // If it's not JSON, create a simple structure
        parsedOutput = {
          summary: "AI provided a non-JSON response. This may contain useful information but isn't in the expected format.",
          fields: [],
          rawResponse: output
        };
      }
    } else if (typeof output === 'object') {
      // Already an object, no parsing needed
      parsedOutput = output;
    } else {
      throw new Error(`Unexpected output type: ${typeof output}`);
    }
    
    aiGeneratedOutput = parsedOutput;
    
    // Get the prompt that was used
    const prompt = generatePrompt();
    
    // Calculate token usage
    const tokenUsage = displayTokenUsage(prompt, output);
    
    // Display the summary with token usage information
    outputSummary.innerHTML = `
      <div class="output-summary-content">
        <p>${parsedOutput.summary || "No summary available."}</p>
        
        <div class="token-usage">
          <h4>Token Usage Statistics</h4>
          <div class="token-stats">
            <div class="token-stat">
              <div class="token-label">Prompt Tokens:</div>
              <div class="token-value">${tokenUsage.promptTokens.toLocaleString()}</div>
            </div>
            <div class="token-stat">
              <div class="token-label">Response Tokens:</div>
              <div class="token-value">${tokenUsage.responseTokens.toLocaleString()}</div>
            </div>
            <div class="token-stat total-tokens">
              <div class="token-label">Total Tokens:</div>
              <div class="token-value">${tokenUsage.totalTokens.toLocaleString()}</div>
            </div>
          </div>
        </div>
        
        ${parsedOutput.rawResponse ? 
          `<div class="raw-response">
            <h3>Raw Response</h3>
            <pre>${parsedOutput.rawResponse}</pre>
           </div>` 
          : ''}
      </div>
    `;
    
    // Display the fields
    if (parsedOutput.fields && parsedOutput.fields.length > 0) {
      let fieldsHTML = `
        <table class="output-fields-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      parsedOutput.fields.forEach(field => {
        const confidenceClass = getConfidenceClass(field.confidence);
        fieldsHTML += `
          <tr class="${confidenceClass}">
            <td>${field.id}</td>
            <td>${field.value || '(Empty)'}</td>
            <td>${field.confidence}</td>
          </tr>
        `;
      });
      
      fieldsHTML += `
          </tbody>
        </table>
      `;
      
      outputFields.innerHTML = fieldsHTML;
    } else {
      if (parsedOutput.rawResponse) {
        outputFields.innerHTML = `
          <p>No structured fields were detected in the AI response.</p>
        `;
      } else {
        outputFields.textContent = 'No fields were mapped by the AI.';
      }
    }
    
    // Add some styling for the output
    const style = document.createElement('style');
    style.textContent = `
      .output-section {
        margin-bottom: 30px;
        padding: 15px;
        background-color: var(--secondary-background);
        border-radius: 5px;
      }
      
      .output-summary-content {
        line-height: 1.5;
      }
      
      .token-usage {
        margin-top: 20px;
        padding: 10px 15px;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 5px;
        border-left: 4px solid var(--primary-color);
      }
      
      .token-usage h4 {
        margin-top: 0;
        margin-bottom: 10px;
        color: var(--primary-color);
      }
      
      .token-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
      }
      
      .token-stat {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 5px 0;
      }
      
      .total-tokens {
        margin-top: 8px;
        font-weight: bold;
        border-top: 1px solid var(--border-color);
        padding-top: 8px;
      }
      
      .token-value {
        font-family: monospace;
        background: rgba(0, 0, 0, 0.07);
        padding: 2px 8px;
        border-radius: 4px;
      }
      
      .raw-response {
        margin-top: 15px;
        padding: 10px;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 5px;
      }
      
      .raw-response pre {
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 200px;
        overflow-y: auto;
      }
      
      .output-fields-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 15px;
      }
      
      .output-fields-table th,
      .output-fields-table td {
        text-align: left;
        padding: 10px;
        border-bottom: 1px solid var(--border-color);
      }
      
      .high-confidence {
        background-color: rgba(76, 175, 80, 0.1);
      }
      
      .medium-confidence {
        background-color: rgba(255, 193, 7, 0.1);
      }
      
      .low-confidence {
        background-color: rgba(244, 67, 54, 0.1);
      }
    `;
    document.head.appendChild(style);
    
    // Store the output in localStorage with token usage information
    localStorage.setItem('aiGeneratedOutput', JSON.stringify({
      timestamp: Date.now(),
      data: parsedOutput,
      tokenUsage: tokenUsage
    }));
    
  } catch (error) {
    console.error('Error parsing AI output:', error);
    outputSummary.textContent = 'Error parsing AI output. The response may not be in the expected format.';
    
    // Display the raw response for debugging
    outputFields.innerHTML = `
      <div class="error-message">
        <p>${error.message}</p>
        <h4>Raw Response:</h4>
        <pre style="white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto; padding: 10px; background-color: rgba(0, 0, 0, 0.05); border-radius: 5px;">${output}</pre>
      </div>
    `;
  }
}

// Function to get confidence class for styling
function getConfidenceClass(confidence) {
  const lowerConfidence = (confidence || '').toLowerCase();
  
  if (lowerConfidence === 'high') {
    return 'high-confidence';
  } else if (lowerConfidence === 'medium') {
    return 'medium-confidence';
  } else {
    return 'low-confidence';
  }
}

// Event listener for the Generate Output button
generateOutputButton.addEventListener('click', async () => {
  // Check if we have a resume and form data
  const resumeData = localStorage.getItem('parsedResume');
  const formDataStr = localStorage.getItem('extractedHTML');
  
  if (!resumeData) {
    outputSummary.textContent = 'No resume data available. Please upload a resume first.';
    return;
  }
  
  if (!formDataStr) {
    outputSummary.textContent = 'No form data available. Please extract a form first.';
    return;
  }
  
  // Show loading state
  outputSummary.textContent = 'Generating output...';
  outputFields.textContent = 'Please wait while the AI analyzes your resume and form fields...';
  
  try {
    // Generate the prompt
    const prompt = generatePrompt();
    
    if (prompt.startsWith('Error:')) {
      outputSummary.textContent = prompt;
      return;
    }
    
    // Check if we have the API client
    if (!agentsAPI) {
      // Initialize the API client
      const apiKey = localStorage.getItem('apiKey');
      const baseURL = localStorage.getItem('apiBaseUrl') || 'https://api.openai.com/v1';
      const model = localStorage.getItem('modelName') || 'gpt-4o';
      
      if (!apiKey) {
        outputSummary.textContent = 'API key not set. Please add your API key in the Settings tab.';
        return;
      }
      
      agentsAPI = new AgentsAPI(apiKey, baseURL, model);
    }
    
    // Send the prompt to the AI
    const response = await agentsAPI.sendMessage(prompt);
    
    // Display the AI output
    displayAIOutput(response);
  } catch (error) {
    console.error('Error generating output:', error);
    outputSummary.textContent = 'Error generating output. Please try again.';
    outputFields.textContent = error.message;
  }
});

// Event listener for the Copy Output button
copyOutputButton.addEventListener('click', () => {
  // Get the AI output
  const output = localStorage.getItem('aiGeneratedOutput');
  
  if (!output) {
    alert('No output to copy. Please generate output first.');
    return;
  }
  
  // Copy to clipboard
  navigator.clipboard.writeText(output).then(() => {
    const originalText = copyOutputButton.textContent;
    copyOutputButton.textContent = 'Copied!';
    setTimeout(() => {
      copyOutputButton.textContent = originalText;
    }, 2000);
  });
});

// Event listener for the Clear Output button
clearOutputButton.addEventListener('click', () => {
  // Clear the output
  localStorage.removeItem('aiGeneratedOutput');
  aiGeneratedOutput = null;
  
  // Reset the UI
  outputSummary.textContent = 'No summary available. Click "Generate Output" to analyze your resume and form fields.';
  outputFields.textContent = 'No mapped fields available. Click "Generate Output" to match resume data to form fields.';
});

// Check if we already have AI output on page load
function loadExistingOutput() {
  const output = localStorage.getItem('aiGeneratedOutput');
  
  if (output) {
    displayAIOutput(output);
  }
}

// Application Data functionality
const applicationData = document.getElementById('application-data');
const refreshDataButton = document.getElementById('refresh-data');
const copyDataButton = document.getElementById('copy-data');
const clearDataButton = document.getElementById('clear-data');

// Sample application data (for demo purposes)
let currentApplicationData = {
  "fullName": "John Doe",
  "email": "john.doe@example.com",
  "phone": "(123) 456-7890",
  "address": "123 Main St, Anytown, US 12345",
  "currentPosition": "Senior Software Developer",
  "yearsOfExperience": "8",
  "education": "Bachelor of Science in Computer Science",
  "skills": "JavaScript, React, Node.js, Python, SQL, Git"
};

// Function to update the application data display
function updateApplicationDataDisplay() {
  applicationData.innerHTML = '';
  
  if (Object.keys(currentApplicationData).length === 0) {
    applicationData.textContent = 'No application data available. Use the "Refresh Data" button to load data.';
    return;
  }
  
  // Create fields for each data point
  for (const [key, value] of Object.entries(currentApplicationData)) {
    const fieldDiv = document.createElement('div');
    fieldDiv.classList.add('data-field');
    
    const nameDiv = document.createElement('div');
    nameDiv.classList.add('field-name');
    
    // Convert camelCase to Title Case with spaces
    const formattedKey = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase());
    
    nameDiv.textContent = `${formattedKey}:`;
    
    const valueDiv = document.createElement('div');
    valueDiv.classList.add('field-value');
    valueDiv.textContent = value;
    
    fieldDiv.appendChild(nameDiv);
    fieldDiv.appendChild(valueDiv);
    applicationData.appendChild(fieldDiv);
  }
}

// Function to display extracted HTML (for backwards compatibility)
function displayExtractedHTML(html) {
  applicationData.innerHTML = '';
  
  // Create a container for the HTML data
  const htmlDataContainer = document.createElement('div');
  htmlDataContainer.classList.add('data-field');
  
  const nameDiv = document.createElement('div');
  nameDiv.classList.add('field-name');
  nameDiv.textContent = 'Extracted HTML:';
  
  const valueDiv = document.createElement('div');
  valueDiv.classList.add('field-value');
  
  // Create a pre element to preserve formatting
  const preElement = document.createElement('pre');
  preElement.style.whiteSpace = 'pre-wrap';
  preElement.style.wordBreak = 'break-word';
  preElement.style.maxHeight = '400px';
  preElement.style.overflow = 'auto';
  
  // Escape HTML to show as text
  preElement.textContent = html;
  
  valueDiv.appendChild(preElement);
  htmlDataContainer.appendChild(nameDiv);
  htmlDataContainer.appendChild(valueDiv);
  applicationData.appendChild(htmlDataContainer);
  
  // Update currentApplicationData
  currentApplicationData = { extractedHTML: html };
}

// Function to display structured form data
function displayFormData(data) {
  applicationData.innerHTML = '';
  currentApplicationData = data;
  
  // Add page information
  const pageUrl = localStorage.getItem('pageUrl');
  const pageTitle = localStorage.getItem('pageTitle');
  
  if (pageUrl || pageTitle) {
    const pageInfoContainer = document.createElement('div');
    pageInfoContainer.className = 'page-info';
    pageInfoContainer.innerHTML = `
      <h3>Page Information</h3>
      ${pageTitle ? `<div><strong>Title:</strong> ${pageTitle}</div>` : ''}
      ${pageUrl ? `<div><strong>URL:</strong> <a href="${pageUrl}" target="_blank">${pageUrl}</a></div>` : ''}
    `;
    applicationData.appendChild(pageInfoContainer);
  }
  
  // Add summary section
  const summaryContainer = document.createElement('div');
  summaryContainer.className = 'summary-container';
  summaryContainer.innerHTML = `
    <h3>Form Analysis Summary</h3>
    <div class="summary-stats">
      <div class="summary-stat">
        <div class="stat-value">${data.pageAnalysis.totalForms}</div>
        <div class="stat-label">Forms</div>
      </div>
      <div class="summary-stat">
        <div class="stat-value">${data.pageAnalysis.totalFields}</div>
        <div class="stat-label">Total Fields</div>
      </div>
      <div class="summary-stat">
        <div class="stat-value">${data.pageAnalysis.autofillableFieldsCount}</div>
        <div class="stat-label">Autofillable</div>
      </div>
      <div class="summary-stat">
        <div class="stat-value">${data.pageAnalysis.requiredFieldsCount}</div>
        <div class="stat-label">Required</div>
      </div>
    </div>
  `;
  applicationData.appendChild(summaryContainer);
  
  // Create autofillable fields section
  if (data.autofillableFields && data.autofillableFields.length > 0) {
    const autofillContainer = document.createElement('div');
    autofillContainer.className = 'autofill-container';
    
    const autofillHeader = document.createElement('h3');
    autofillHeader.textContent = 'Autofillable Fields';
    autofillContainer.appendChild(autofillHeader);
    
    // Create a table for autofillable fields
    const autofillTable = document.createElement('table');
    autofillTable.className = 'autofill-table';
    
    // Create table header
    const tableHead = document.createElement('thead');
    tableHead.innerHTML = `
      <tr>
        <th>Label</th>
        <th>Type</th>
        <th>Name/ID</th>
        <th>Required</th>
        <th>Autocomplete</th>
      </tr>
    `;
    autofillTable.appendChild(tableHead);
    
    // Create table body
    const tableBody = document.createElement('tbody');
    
    // Add each autofillable field to the table
    data.autofillableFields.forEach(field => {
      const row = document.createElement('tr');
      
      // Label cell
      const labelCell = document.createElement('td');
      labelCell.textContent = field.label || '(No label)';
      row.appendChild(labelCell);
      
      // Type cell
      const typeCell = document.createElement('td');
      typeCell.textContent = `${field.tagName} (${field.type})`;
      row.appendChild(typeCell);
      
      // Name/ID cell
      const nameIdCell = document.createElement('td');
      const nameId = field.name || field.id || '(None)';
      nameIdCell.textContent = nameId;
      row.appendChild(nameIdCell);
      
      // Required cell
      const requiredCell = document.createElement('td');
      requiredCell.textContent = field.required ? 'Yes' : 'No';
      row.appendChild(requiredCell);
      
      // Autocomplete cell
      const autocompleteCell = document.createElement('td');
      autocompleteCell.textContent = field.autocomplete || '(Auto-detected)';
      row.appendChild(autocompleteCell);
      
      tableBody.appendChild(row);
    });
    
    autofillTable.appendChild(tableBody);
    autofillContainer.appendChild(autofillTable);
    applicationData.appendChild(autofillContainer);
  }
  
  // Add detailed form sections
  if (data.forms && data.forms.length > 0) {
    const formsSection = document.createElement('div');
    formsSection.className = 'forms-section';
    formsSection.innerHTML = '<h3>Detailed Form Data</h3>';
    
    // Create accordion for each form
    data.forms.forEach((form, index) => {
      const formContainer = document.createElement('details');
      formContainer.className = 'form-container';
      
      // Make the first form open by default
      if (index === 0) {
        formContainer.setAttribute('open', '');
      }
      
      // Create form summary
      const formSummary = document.createElement('summary');
      formSummary.className = 'form-summary';
      formSummary.innerHTML = `
        <strong>Form: ${form.name || form.id || `Form ${index + 1}`}</strong>
        <span class="field-count">${form.fields.length} fields</span>
      `;
      formContainer.appendChild(formSummary);
      
      // Create form details
      const formDetails = document.createElement('div');
      formDetails.className = 'form-details';
      
      // Add form metadata
      if (form.action || form.method) {
        const formMeta = document.createElement('div');
        formMeta.className = 'form-metadata';
        formMeta.innerHTML = `
          ${form.action ? `<div><strong>Action:</strong> ${form.action}</div>` : ''}
          ${form.method ? `<div><strong>Method:</strong> ${form.method}</div>` : ''}
        `;
        formDetails.appendChild(formMeta);
      }
      
      // Create table for fields
      if (form.fields.length > 0) {
        const fieldsTable = document.createElement('table');
        fieldsTable.className = 'fields-table';
        
        // Add table header
        const tableHead = document.createElement('thead');
        tableHead.innerHTML = `
          <tr>
            <th>Label</th>
            <th>Type</th>
            <th>Name/ID</th>
            <th>Autofillable</th>
            <th>Required</th>
          </tr>
        `;
        fieldsTable.appendChild(tableHead);
        
        // Create table body
        const tableBody = document.createElement('tbody');
        
        // Add each field to the table
        form.fields.forEach(field => {
          const row = document.createElement('tr');
          
          // Label cell
          const labelCell = document.createElement('td');
          labelCell.textContent = field.label || '(No label)';
          row.appendChild(labelCell);
          
          // Type cell
          const typeCell = document.createElement('td');
          typeCell.textContent = `${field.tagName} (${field.type})`;
          row.appendChild(typeCell);
          
          // Name/ID cell
          const nameIdCell = document.createElement('td');
          const nameId = field.name || field.id || '(None)';
          nameIdCell.textContent = nameId;
          row.appendChild(nameIdCell);
          
          // Autofillable cell
          const autofillableCell = document.createElement('td');
          autofillableCell.textContent = field.autofillable ? 'Yes' : 'No';
          if (field.autofillable) {
            row.classList.add('autofillable-row');
          }
          row.appendChild(autofillableCell);
          
          // Required cell
          const requiredCell = document.createElement('td');
          requiredCell.textContent = field.required ? 'Yes' : 'No';
          if (field.required) {
            row.classList.add('required-row');
          }
          row.appendChild(requiredCell);
          
          tableBody.appendChild(row);
        });
        
        fieldsTable.appendChild(tableBody);
        formDetails.appendChild(fieldsTable);
      }
      
      formContainer.appendChild(formDetails);
      formsSection.appendChild(formContainer);
    });
    
    applicationData.appendChild(formsSection);
  }
  
  // Add some styling to the application data section
  const style = document.createElement('style');
  style.textContent = `
    .page-info {
      margin-bottom: 20px;
      padding: 10px;
      background-color: var(--secondary-background);
      border-radius: 5px;
    }
    
    .summary-container {
      margin-bottom: 20px;
    }
    
    .summary-stats {
      display: flex;
      justify-content: space-around;
      margin: 15px 0;
    }
    
    .summary-stat {
      text-align: center;
      padding: 10px;
      background-color: var(--secondary-background);
      border-radius: 5px;
      min-width: 80px;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: var(--primary-color);
    }
    
    .autofill-table, .fields-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
    }
    
    .autofill-table th, .autofill-table td, 
    .fields-table th, .fields-table td {
      text-align: left;
      padding: 8px;
      border-bottom: 1px solid var(--border-color);
    }
    
    .form-container {
      margin-bottom: 10px;
      border: 1px solid var(--border-color);
      border-radius: 5px;
    }
    
    .form-summary {
      padding: 10px;
      cursor: pointer;
      background-color: var(--secondary-background);
      display: flex;
      justify-content: space-between;
    }
    
    .form-details {
      padding: 10px;
    }
    
    .form-metadata {
      margin-bottom: 10px;
      padding: 10px;
      background-color: var(--secondary-background);
      border-radius: 5px;
    }
    
    .autofillable-row {
      background-color: rgba(66, 133, 244, 0.1);
    }
    
    .required-row {
      font-weight: 500;
    }
    
    .field-count {
      background-color: var(--primary-color);
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.8em;
    }
  `;
  
  document.head.appendChild(style);
}

// Event listener for the Refresh Data button
refreshDataButton.addEventListener('click', async () => {
  try {
    // Check if there's extracted data
    const extractedData = localStorage.getItem('extractedHTML');
    
    if (extractedData) {
      // Show loading message
      applicationData.textContent = 'Loading extracted data...';
      
      // Simulate a delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 500));
      
      try {
        // Try to parse as JSON (new format)
        const formData = JSON.parse(extractedData);
        displayFormData(formData);
      } catch (error) {
        // If parsing fails, treat as raw HTML (old format)
        displayExtractedHTML(extractedData);
      }
    } else {
      // Show loading message
      applicationData.textContent = 'Loading application data...';
      
      // Simulate a delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update the display with the sample data
      updateApplicationDataDisplay();
    }
  } catch (error) {
    applicationData.textContent = `Error loading application data: ${error.message}`;
  }
});

// Event listener for the Copy All button
copyDataButton.addEventListener('click', () => {
  let dataString;
  
  if (typeof currentApplicationData === 'object' && !currentApplicationData.extractedHTML) {
    // For structured data, create a readable format
    dataString = JSON.stringify(currentApplicationData, null, 2);
  } else if (currentApplicationData.extractedHTML) {
    // For raw HTML data
    dataString = currentApplicationData.extractedHTML;
  } else {
    // Fallback for old format
    dataString = Object.entries(currentApplicationData)
      .map(([key, value]) => {
        const formattedKey = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase());
        return `${formattedKey}: ${value}`;
      })
      .join('\n');
  }
  
  // Copy to clipboard
  navigator.clipboard.writeText(dataString).then(() => {
    const originalText = copyDataButton.textContent;
    copyDataButton.textContent = 'Copied!';
    setTimeout(() => {
      copyDataButton.textContent = originalText;
    }, 2000);
  });
});

// Event listener for the Clear Data button
clearDataButton.addEventListener('click', () => {
  // Clear extracted data from localStorage
  localStorage.removeItem('extractedHTML');
  localStorage.removeItem('pageUrl');
  localStorage.removeItem('pageTitle');
  
  // Clear current application data
  currentApplicationData = {};
  applicationData.innerHTML = 'No application data available. Use the "Refresh Data" button to load data.';
});

// AI Chat functionality
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const chatbox = document.getElementById('chatbox');

// Function to add a message to the chat
function addMessage(message, isUser = false) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('chat-message');
  messageElement.classList.add(isUser ? 'user-message' : 'ai-message');
  messageElement.textContent = message;
  
  chatbox.appendChild(messageElement);
  
  // Scroll to bottom of chat
  chatbox.scrollTop = chatbox.scrollHeight;
}

// Initialize the AgentsAPI client with environment variables from .env
async function initializeAgentsAPI() {
  envVars = await loadEnvVars();
  
  // First check if we have saved values in localStorage
  const apiKey = localStorage.getItem('apiKey') || envVars.OPENAI_API_KEY || '';
  const baseURL = localStorage.getItem('apiBaseUrl') || envVars.OPENAI_API_BASE || 'https://api.openai.com/v1';
  const model = localStorage.getItem('modelName') || envVars.MODEL_NAME || 'gpt-4o';
  
  // Update the settings form fields
  document.getElementById('api-key').value = apiKey;
  document.getElementById('api-base-url').value = baseURL;
  document.getElementById('model-name').value = model;
  
  if (apiKey) {
    agentsAPI = new AgentsAPI(apiKey, baseURL, model);
    addMessage('API client initialized successfully. Ready to chat!');
  } else {
    addMessage('Please add your API key in the Settings tab to use the chat functionality.');
  }
}

// Handle send button click
sendButton.addEventListener('click', async () => {
  const message = chatInput.value.trim();
  if (message) {
    addMessage(message, true);
    chatInput.value = '';
    
    if (agentsAPI) {
      // Show typing indicator
      const typingIndicator = document.createElement('div');
      typingIndicator.classList.add('chat-message', 'ai-message');
      typingIndicator.textContent = 'Thinking...';
      chatbox.appendChild(typingIndicator);
      
      // Make API call
      const response = await agentsAPI.sendMessage(message);
      
      // Remove typing indicator
      chatbox.removeChild(typingIndicator);
      
      // Display the response
      addMessage(response);
    } else {
      addMessage('API client not initialized. Please check your API key in Settings.');
    }
  }
});

// Handle enter key in chat input
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendButton.click();
  }
});

// Settings functionality
const themeToggle = document.getElementById('theme-toggle');
const apiKeyInput = document.getElementById('api-key');
const apiBaseUrlInput = document.getElementById('api-base-url');
const modelNameInput = document.getElementById('model-name');
const saveApiSettingsButton = document.getElementById('save-api-settings');
const apiStatusMessage = document.getElementById('api-status-message');

// Load saved settings
function loadSettings() {
  // Load theme preference - default to dark mode if not set
  const darkMode = localStorage.getItem('darkMode') !== 'false';
  themeToggle.checked = darkMode;
  if (darkMode) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  
  // Load API settings
  const apiKey = localStorage.getItem('apiKey') || '';
  const apiBaseUrl = localStorage.getItem('apiBaseUrl') || '';
  const modelName = localStorage.getItem('modelName') || '';
  
  if (apiKey) {
    apiKeyInput.value = apiKey;
  }
  
  if (apiBaseUrl) {
    apiBaseUrlInput.value = apiBaseUrl;
  }
  
  if (modelName) {
    modelNameInput.value = modelName;
  }
}

// Theme toggle
themeToggle.addEventListener('change', () => {
  if (themeToggle.checked) {
    document.body.classList.add('dark-mode');
    localStorage.setItem('darkMode', 'true');
  } else {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('darkMode', 'false');
  }
});

// Show status message
function showStatusMessage(message, isSuccess = true) {
  apiStatusMessage.textContent = message;
  apiStatusMessage.style.display = 'block';
  
  if (isSuccess) {
    apiStatusMessage.classList.add('status-success');
    apiStatusMessage.classList.remove('status-error');
  } else {
    apiStatusMessage.classList.add('status-error');
    apiStatusMessage.classList.remove('status-success');
  }
  
  // Hide the message after 3 seconds
  setTimeout(() => {
    apiStatusMessage.style.display = 'none';
  }, 3000);
}

// Save API Settings
saveApiSettingsButton.addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  const apiBaseUrl = apiBaseUrlInput.value.trim();
  const modelName = modelNameInput.value.trim();
  
  if (!apiKey) {
    showStatusMessage('Please enter a valid API key', false);
    return;
  }
  
  // Save to localStorage
  localStorage.setItem('apiKey', apiKey);
  
  if (apiBaseUrl) {
    localStorage.setItem('apiBaseUrl', apiBaseUrl);
  } else {
    localStorage.removeItem('apiBaseUrl');
  }
  
  if (modelName) {
    localStorage.setItem('modelName', modelName);
  } else {
    localStorage.removeItem('modelName');
  }
  
  // Update the API client with the new settings
  const baseUrl = apiBaseUrl || envVars.OPENAI_API_BASE || 'https://api.openai.com/v1';
  const model = modelName || envVars.MODEL_NAME || 'gpt-4o';
  
  agentsAPI = new AgentsAPI(apiKey, baseUrl, model);
  
  // Show success message
  showStatusMessage('API settings saved successfully!');
  
  // Add message to chat
  addMessage('API settings updated successfully!');
});

// Call the function to check URL parameters on page load
checkUrlParameters();

// Call initialization functions on page load
loadSettings();
initializeAgentsAPI();
loadExistingOutput();

// Initialize application data display on page load (if no extracted data)
if (!localStorage.getItem('extractedHTML')) {
  updateApplicationDataDisplay();
}

// Token counting utility functions
function countTokens(text) {
  // This is a simplified tokenization approach
  // It approximates OpenAI's tokenization by counting:
  // - Words (separated by spaces)
  // - Punctuation
  // - Special characters
  // More accurate tokenization would require the actual tokenizer used by the model
  
  if (!text) return 0;
  
  // Remove extra whitespace
  const cleanedText = text.trim().replace(/\s+/g, ' ');
  
  // Split by spaces to count words
  const words = cleanedText.split(/\s+/);
  
  // Count punctuation and special characters
  let specialCharCount = 0;
  const specialCharsRegex = /[!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]/g;
  const matches = cleanedText.match(specialCharsRegex);
  if (matches) {
    specialCharCount = matches.length;
  }
  
  // Estimate tokens (this is a rough approximation)
  // On average for English text, 1 token is approximately 4 characters
  const charCount = cleanedText.length;
  const estimatedTokens = Math.ceil(charCount / 4);
  
  return estimatedTokens;
}

// Function to display token usage information
function displayTokenUsage(prompt, response) {
  const promptTokens = countTokens(prompt);
  const responseTokens = countTokens(response);
  const totalTokens = promptTokens + responseTokens;
  
  return {
    promptTokens,
    responseTokens,
    totalTokens
  };
}