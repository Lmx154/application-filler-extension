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

// Navigation functionality
const navLinks = {
  resume: document.getElementById('nav-resume'),
  application: document.getElementById('nav-application'),
  ai: document.getElementById('nav-ai'),
  settings: document.getElementById('nav-settings')
};

const pages = {
  resume: document.getElementById('page-resume'),
  application: document.getElementById('page-application'),
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

// Event listener for the Refresh Data button
refreshDataButton.addEventListener('click', async () => {
  try {
    // In a real implementation, this would fetch data from storage or an API
    // For now, we'll just use the sample data
    
    // Show loading message
    applicationData.textContent = 'Loading application data...';
    
    // Simulate a delay to show loading state
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Update the display
    updateApplicationDataDisplay();
  } catch (error) {
    applicationData.textContent = `Error loading application data: ${error.message}`;
  }
});

// Event listener for the Copy All button
copyDataButton.addEventListener('click', () => {
  // Convert the data to a formatted string
  const dataString = Object.entries(currentApplicationData)
    .map(([key, value]) => {
      const formattedKey = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
      return `${formattedKey}: ${value}`;
    })
    .join('\n');
  
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
  // In a real implementation, this would clear data from storage
  currentApplicationData = {};
  updateApplicationDataDisplay();
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
  // Load theme preference
  const darkMode = localStorage.getItem('darkMode') === 'true';
  themeToggle.checked = darkMode;
  if (darkMode) {
    document.body.classList.add('dark-mode');
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

// Load settings and initialize API client on page load
loadSettings();
initializeAgentsAPI();

// Initialize application data display on page load
updateApplicationDataDisplay();