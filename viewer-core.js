/**
 * viewer-core.js
 * Core functionality for the PDF viewer and application form handler
 */

import * as pdfjsLib from './pdf.mjs';
import AgentsAPI, { AIProviderFactory } from './agents-api.js';
import { addCopyButton, showStatusMessage, getConfidenceClass, addOutputStyles, addApplicationDataStyles } from './viewer-styles.js';
import { generatePrompt, calculateTokenUsage } from './prompt-generator.js';

// Set the worker source to the worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs';

// Shared state - using a writable object to store agentsAPI
const state = {
  agentsAPI: null
};

// Export accessor functions to get/set agentsAPI
export const getAgentsAPI = () => state.agentsAPI;
export const setAgentsAPI = (api) => { state.agentsAPI = api; };

// Other exports
export let envVars = {};
export let parsedResume = '';
export let formData = null;
export let aiGeneratedOutput = null;
export let currentApplicationData = {
  "fullName": "John Doe",
  "email": "john.doe@example.com",
  "phone": "(123) 456-7890",
  "address": "123 Main St, Anytown, US 12345",
  "currentPosition": "Senior Software Developer",
  "yearsOfExperience": "8",
  "education": "Bachelor of Science in Computer Science",
  "skills": "JavaScript, React, Node.js, Python, SQL, Git"
};

/**
 * Load environment variables from .env file
 * @returns {Promise<Object>} The loaded environment variables
 */
export async function loadEnvVars() {
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

/**
 * Initialize the navigation system
 */
export function initNavigation() {
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
      switchToPage(page, navLinks, pages);
    });
  });
  
  // Check URL parameters for direct navigation
  checkUrlParameters(navLinks, pages);
}

/**
 * Switch to a specific page
 * @param {string} pageName - Name of the page to switch to
 * @param {Object} navLinks - Object containing navigation links
 * @param {Object} pages - Object containing page elements
 */
export function switchToPage(pageName, navLinks, pages) {
  // Update active navigation link
  Object.values(navLinks).forEach(link => link.classList.remove('active'));
  navLinks[pageName].classList.add('active');

  // Update visible page
  Object.values(pages).forEach(page => page.classList.remove('active'));
  pages[pageName].classList.add('active');
}

/**
 * Check URL parameters for direct navigation
 * @param {Object} navLinks - Object containing navigation links
 * @param {Object} pages - Object containing page elements
 */
export function checkUrlParameters(navLinks, pages) {
  const urlParams = new URLSearchParams(window.location.search);
  const section = urlParams.get('section');
  
  if (section && navLinks[section]) {
    switchToPage(section, navLinks, pages);
    
    // If the section is application, check for extracted HTML
    if (section === 'application') {
      const extractedData = localStorage.getItem('extractedHTML');
      if (extractedData) {
        const applicationContainer = document.getElementById('application-data');
        try {
          const parsedData = JSON.parse(extractedData);
          formData = parsedData;
          displayFormData(parsedData, applicationContainer);
        } catch (error) {
          // Handle the case where the data might be old format raw HTML
          displayExtractedHTML(extractedData, applicationContainer);
        }
      }
    }
  }
}

/**
 * Initialize the PDF processing functionality
 * @param {HTMLElement} inputElement - The file input element
 * @param {HTMLElement} outputElement - The output element
 */
export function initPdfProcessing(inputElement, outputElement) {
  inputElement.addEventListener('change', async () => {
    const file = inputElement.files[0];
    if (!file || file.type !== 'application/pdf') {
      outputElement.textContent = 'Please select a PDF file.';
      return;
    }
  
    outputElement.textContent = 'Parsing…';
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
      outputElement.textContent = parsedResume;
      
      // Store the parsed resume in localStorage
      localStorage.setItem('parsedResume', parsedResume);
      
      // Add copy button
      addCopyButton(outputElement);
    } catch (error) {
      outputElement.textContent = `Error parsing PDF: ${error.message}`;
    }
  });
}

/**
 * Convert plain text to markdown format
 * @param {string} text - The text to convert
 * @returns {string} The markdown formatted text
 */
export function toMarkdown(text) {
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

/**
 * Display AI-generated output
 * @param {string|Object} output - The AI output to display
 * @param {HTMLElement} summaryElement - Element to display the summary
 * @param {HTMLElement} fieldsElement - Element to display the fields
 */
export function displayAIOutput(output, summaryElement, fieldsElement) {
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
    const tokenUsage = calculateTokenUsage(prompt, output);
    
    // Display the summary with token usage information
    summaryElement.innerHTML = `
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
      
      fieldsElement.innerHTML = fieldsHTML;
    } else {
      if (parsedOutput.rawResponse) {
        fieldsElement.innerHTML = `
          <p>No structured fields were detected in the AI response.</p>
        `;
      } else {
        fieldsElement.textContent = 'No fields were mapped by the AI.';
      }
    }
    
    // Add styling
    addOutputStyles();
    
    // Store the output in localStorage with token usage information
    localStorage.setItem('aiGeneratedOutput', JSON.stringify({
      timestamp: Date.now(),
      data: parsedOutput,
      tokenUsage: tokenUsage
    }));
    
  } catch (error) {
    console.error('Error parsing AI output:', error);
    summaryElement.textContent = 'Error parsing AI output. The response may not be in the expected format.';
    
    // Display the raw response for debugging
    fieldsElement.innerHTML = `
      <div class="error-message">
        <p>${error.message}</p>
        <h4>Raw Response:</h4>
        <pre style="white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto; padding: 10px; background-color: rgba(0, 0, 0, 0.05); border-radius: 5px;">${output}</pre>
      </div>
    `;
  }
}

/**
 * Display extracted HTML (for backwards compatibility)
 * @param {string} html - The extracted HTML to display
 * @param {HTMLElement} containerElement - Container element to display the HTML
 */
export function displayExtractedHTML(html, containerElement) {
  containerElement.innerHTML = '';
  
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
  containerElement.appendChild(htmlDataContainer);
  
  // Update currentApplicationData
  currentApplicationData = { extractedHTML: html };
}

/**
 * Display structured form data
 * @param {Object} data - The form data to display
 * @param {HTMLElement} containerElement - Container element to display the form data
 */
export function displayFormData(data, containerElement) {
  containerElement.innerHTML = '';
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
    containerElement.appendChild(pageInfoContainer);
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
  containerElement.appendChild(summaryContainer);
  
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
    containerElement.appendChild(autofillContainer);
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
    
    containerElement.appendChild(formsSection);
  }
  
  // Add styling
  addApplicationDataStyles();
}

/**
 * Update the application data display
 * @param {HTMLElement} containerElement - Container to render the data in
 */
export function updateApplicationDataDisplay(containerElement) {
  containerElement.innerHTML = '';
  
  if (Object.keys(currentApplicationData).length === 0) {
    containerElement.textContent = 'No application data available. Use the "Refresh Data" button to load data.';
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
    containerElement.appendChild(fieldDiv);
  }
}

/**
 * Initialize the AgentsAPI client with environment variables
 */
export async function initializeAgentsAPI() {
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
    setAgentsAPI(new AgentsAPI(apiKey, baseURL, model));
    return true;
  } else {
    return false;
  }
}

/**
 * Load theme settings
 */
export function loadThemeSettings() {
  // Load theme preference - default to dark mode if not set
  const darkMode = localStorage.getItem('darkMode') !== 'false';
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.checked = darkMode;
  if (darkMode) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  
  return { darkMode, themeToggle };
}