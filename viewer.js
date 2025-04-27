/**
 * viewer.js
 * Main entry point for the PDF viewer application
 */

import * as ViewerCore from './viewer-core.js';
import { showStatusMessage, addCopyButton } from './viewer-styles.js';
import { generatePrompt } from './prompt-generator.js';
import AgentsAPI, { AIProviderFactory } from './agents-api.js';

// DOM Elements
const input = document.getElementById('fileInput');
const out = document.getElementById('output');
const outputSummary = document.getElementById('output-summary').querySelector('.summary-content');
const outputFields = document.getElementById('output-fields').querySelector('.fields-container');
const applicationData = document.getElementById('application-data');
const chatbox = document.getElementById('chatbox');
const apiStatusMessage = document.getElementById('api-status-message');

// Control buttons
const generateOutputButton = document.getElementById('generate-output');
const copyOutputButton = document.getElementById('copy-output');
const clearOutputButton = document.getElementById('clear-output');
const refreshDataButton = document.getElementById('refresh-data');
const copyDataButton = document.getElementById('copy-data');
const clearDataButton = document.getElementById('clear-data');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const saveApiSettingsButton = document.getElementById('save-api-settings');
const themeToggle = document.getElementById('theme-toggle');
const apiProviderSelect = document.getElementById('api-provider');
const ollamaModelSelector = document.getElementById('ollama-model-selector');
const refreshOllamaModelsButton = document.getElementById('refresh-ollama-models');

// Global variables for Ollama models
let ollamaModels = [];
let ollamaInstance = null;

// Initialize the viewer
async function initViewer() {
  // Initialize Navigation
  ViewerCore.initNavigation();
  
  // Initialize PDF processing
  ViewerCore.initPdfProcessing(input, out);
  
  // Initialize settings
  const { themeToggle } = ViewerCore.loadThemeSettings();
  
  // Initialize API client
  const apiInitialized = await initializeAIProvider();
  if (apiInitialized) {
    addMessage('API client initialized successfully. Ready to chat!');
  } else {
    addMessage('Please add your API key in the Settings tab to use the chat functionality.');
  }
  
  // Check for existing output
  loadExistingOutput();
  
  // Initialize application data display if no extracted data
  if (!localStorage.getItem('extractedHTML')) {
    ViewerCore.updateApplicationDataDisplay(applicationData);
  }
  
  // Setup event listeners
  setupEventListeners();
}

// Initialize AI provider from settings
async function initializeAIProvider() {
  // Load environment variables
  const loadedEnvVars = await ViewerCore.loadEnvVars();
  
  // Check for saved provider in localStorage
  const providerType = localStorage.getItem('apiProvider') || 'Ollama'; // Default to Ollama
  
  // Set the selected provider in the dropdown
  if (apiProviderSelect) {
    apiProviderSelect.value = providerType;
  }
  
  // Get provider defaults for the selected provider
  const defaults = AIProviderFactory.getProviderDefaults(providerType);
  
  // Load settings from localStorage with fallbacks to defaults
  const apiKey = localStorage.getItem('apiKey') || loadedEnvVars.OPENAI_API_KEY || '';
  const baseURL = localStorage.getItem('apiBaseUrl') || loadedEnvVars.OPENAI_API_BASE || defaults.baseURL;
  const model = localStorage.getItem('modelName') || loadedEnvVars.MODEL_NAME || defaults.defaultModel;
  
  // Update the settings form fields
  document.getElementById('api-key').value = apiKey;
  document.getElementById('api-base-url').value = baseURL;
  document.getElementById('model-name').value = model;
  
  // Show/hide Ollama model selector based on the selected provider
  toggleOllamaModelSelector(providerType === 'Ollama');
  
  // If Ollama is selected, fetch available models
  if (providerType === 'Ollama') {
    initializeOllamaModels(baseURL);
  }
  
  if (apiKey || providerType === 'Ollama' || providerType === 'LMStudio') {
    const api = new AgentsAPI(apiKey, baseURL, model, providerType);
    ViewerCore.setAgentsAPI(api);
    return true;
  } else {
    return false;
  }
}

// Fetch and populate Ollama models
async function initializeOllamaModels(baseURL) {
  try {
    // Clear the model selector
    ollamaModelSelector.innerHTML = '<option value="">Loading models...</option>';
    
    // Get the base URL - default to localhost if not specified
    const ollamaBaseUrl = baseURL || 'http://127.0.0.1:11434';
    
    // Create a temporary Ollama instance to fetch models
    ollamaInstance = new AgentsAPI('', ollamaBaseUrl, 'llama3', 'Ollama');
    
    // Use the provider directly
    const provider = ollamaInstance.provider;
    
    // Fetch available models
    const models = await provider.listModels();
    ollamaModels = models;
    
    // Populate the model selector
    updateOllamaModelSelector(models);
    
    // Select the current model if it exists
    const currentModel = document.getElementById('model-name').value;
    if (currentModel) {
      const modelExists = models.some(model => model.name === currentModel);
      if (modelExists) {
        ollamaModelSelector.value = currentModel;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error fetching Ollama models:', error);
    ollamaModelSelector.innerHTML = '<option value="">Failed to load models</option>';
    return false;
  }
}

// Update the Ollama model selector with available models
function updateOllamaModelSelector(models) {
  // Clear existing options
  ollamaModelSelector.innerHTML = '';
  
  if (!models || models.length === 0) {
    ollamaModelSelector.innerHTML = '<option value="">No models found</option>';
    return;
  }
  
  // Sort models alphabetically
  models.sort((a, b) => a.name.localeCompare(b.name));
  
  // Add each model as an option
  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model.name;
    option.textContent = model.name;
    ollamaModelSelector.appendChild(option);
  });
}

// Show or hide the Ollama model selector
function toggleOllamaModelSelector(show) {
  const container = document.getElementById('ollama-model-selector-container');
  if (container) {
    container.style.display = show ? 'flex' : 'none';
  }
}

// Setup all event listeners
function setupEventListeners() {
  // Output Page Buttons
  generateOutputButton.addEventListener('click', handleGenerateOutput);
  copyOutputButton.addEventListener('click', handleCopyOutput);
  clearOutputButton.addEventListener('click', handleClearOutput);
  
  // Application Data Buttons
  refreshDataButton.addEventListener('click', handleRefreshData);
  copyDataButton.addEventListener('click', handleCopyData);
  clearDataButton.addEventListener('click', handleClearData);
  
  // AI Chat
  sendButton.addEventListener('click', handleSendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendButton.click();
    }
  });
  
  // Settings
  themeToggle.addEventListener('change', handleThemeToggle);
  saveApiSettingsButton.addEventListener('click', handleSaveApiSettings);
  
  // Provider selection change handler
  apiProviderSelect.addEventListener('change', handleProviderChange);
  
  // Ollama model selection
  ollamaModelSelector.addEventListener('change', handleOllamaModelChange);
  refreshOllamaModelsButton.addEventListener('click', handleRefreshOllamaModels);
}

// Handle provider change and update defaults
function handleProviderChange() {
  const selectedProvider = apiProviderSelect.value;
  const defaults = AIProviderFactory.getProviderDefaults(selectedProvider);
  
  // Only update URL and model if they match the defaults for the previous provider
  // This prevents overwriting custom settings when switching providers
  const currentBaseUrl = document.getElementById('api-base-url').value;
  const currentModel = document.getElementById('model-name').value;
  
  // Get previously selected provider
  const previousProvider = localStorage.getItem('apiProvider') || 'OpenAI';
  const previousDefaults = AIProviderFactory.getProviderDefaults(previousProvider);
  
  // Only update if they match the defaults (user hasn't customized them)
  if (currentBaseUrl === previousDefaults.baseURL) {
    document.getElementById('api-base-url').value = defaults.baseURL;
  }
  
  if (currentModel === previousDefaults.defaultModel) {
    document.getElementById('model-name').value = defaults.defaultModel;
  }
  
  // Show/hide Ollama model selector based on the selected provider
  toggleOllamaModelSelector(selectedProvider === 'Ollama');
  
  // If Ollama is selected, fetch available models
  if (selectedProvider === 'Ollama') {
    const baseURL = document.getElementById('api-base-url').value;
    initializeOllamaModels(baseURL);
  }
}

// Handle Ollama model selection change
function handleOllamaModelChange() {
  const selectedModel = ollamaModelSelector.value;
  if (selectedModel) {
    document.getElementById('model-name').value = selectedModel;
  }
}

// Handle refresh Ollama models button click
function handleRefreshOllamaModels() {
  const baseURL = document.getElementById('api-base-url').value;
  initializeOllamaModels(baseURL);
}

// Output Page Event Handlers
async function handleGenerateOutput() {
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
    if (!ViewerCore.getAgentsAPI()) {
      // Initialize the API client
      await initializeAIProvider();
      
      if (!ViewerCore.getAgentsAPI()) {
        outputSummary.textContent = 'API key not set. Please add your API key in the Settings tab.';
        return;
      }
    }
    
    // Send the prompt to the AI
    const response = await ViewerCore.getAgentsAPI().sendMessage(prompt);
    
    // Display the AI output
    ViewerCore.displayAIOutput(response, outputSummary, outputFields);
  } catch (error) {
    console.error('Error generating output:', error);
    outputSummary.textContent = 'Error generating output. Please try again.';
    outputFields.textContent = error.message;
  }
}

function handleCopyOutput() {
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
}

function handleClearOutput() {
  // Clear the output
  localStorage.removeItem('aiGeneratedOutput');
  ViewerCore.aiGeneratedOutput = null;
  
  // Reset the UI
  outputSummary.textContent = 'No summary available. Click "Generate Output" to analyze your resume and form fields.';
  outputFields.textContent = 'No mapped fields available. Click "Generate Output" to match resume data to form fields.';
}

// Application Data Event Handlers
async function handleRefreshData() {
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
        ViewerCore.displayFormData(formData, applicationData);
      } catch (error) {
        // If parsing fails, treat as raw HTML (old format)
        ViewerCore.displayExtractedHTML(extractedData, applicationData);
      }
    } else {
      // Show loading message
      applicationData.textContent = 'Loading application data...';
      
      // Simulate a delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update the display with the sample data
      ViewerCore.updateApplicationDataDisplay(applicationData);
    }
  } catch (error) {
    applicationData.textContent = `Error loading application data: ${error.message}`;
  }
}

function handleCopyData() {
  let dataString;
  
  if (typeof ViewerCore.currentApplicationData === 'object' && !ViewerCore.currentApplicationData.extractedHTML) {
    // For structured data, create a readable format
    dataString = JSON.stringify(ViewerCore.currentApplicationData, null, 2);
  } else if (ViewerCore.currentApplicationData.extractedHTML) {
    // For raw HTML data
    dataString = ViewerCore.currentApplicationData.extractedHTML;
  } else {
    // Fallback for old format
    dataString = Object.entries(ViewerCore.currentApplicationData)
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
}

function handleClearData() {
  // Clear extracted data from localStorage
  localStorage.removeItem('extractedHTML');
  localStorage.removeItem('pageUrl');
  localStorage.removeItem('pageTitle');
  
  // Clear current application data
  ViewerCore.currentApplicationData = {};
  applicationData.innerHTML = 'No application data available. Use the "Refresh Data" button to load data.';
}

// AI Chat Event Handlers
function addMessage(message, isUser = false) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('chat-message');
  messageElement.classList.add(isUser ? 'user-message' : 'ai-message');
  messageElement.textContent = message;
  
  chatbox.appendChild(messageElement);
  
  // Scroll to bottom of chat
  chatbox.scrollTop = chatbox.scrollHeight;
}

async function handleSendMessage() {
  const message = chatInput.value.trim();
  if (message) {
    addMessage(message, true);
    chatInput.value = '';
    
    if (ViewerCore.getAgentsAPI()) {
      // Show typing indicator
      const typingIndicator = document.createElement('div');
      typingIndicator.classList.add('chat-message', 'ai-message');
      typingIndicator.textContent = 'Thinking...';
      chatbox.appendChild(typingIndicator);
      
      // Make API call
      const response = await ViewerCore.getAgentsAPI().sendMessage(message);
      
      // Remove typing indicator
      chatbox.removeChild(typingIndicator);
      
      // Display the response
      addMessage(response);
    } else {
      addMessage('API client not initialized. Please check your API key in Settings.');
    }
  }
}

// Settings Event Handlers
function handleThemeToggle() {
  if (themeToggle.checked) {
    document.body.classList.add('dark-mode');
    localStorage.setItem('darkMode', 'true');
  } else {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('darkMode', 'false');
  }
}

function handleSaveApiSettings() {
  const apiKey = document.getElementById('api-key').value.trim();
  const apiBaseUrl = document.getElementById('api-base-url').value.trim();
  const modelName = document.getElementById('model-name').value.trim();
  const providerType = document.getElementById('api-provider').value;
  
  // For Ollama and LMStudio, API key is optional
  if (!apiKey && providerType !== 'Ollama' && providerType !== 'LMStudio') {
    showStatusMessage('Please enter a valid API key', false, apiStatusMessage);
    return;
  }
  
  // Save to localStorage
  localStorage.setItem('apiProvider', providerType);
  
  // Only save API key if provided (to avoid overwriting existing key)
  if (apiKey) {
    localStorage.setItem('apiKey', apiKey);
  }
  
  if (apiBaseUrl) {
    localStorage.setItem('apiBaseUrl', apiBaseUrl);
  } else {
    const defaults = AIProviderFactory.getProviderDefaults(providerType);
    localStorage.setItem('apiBaseUrl', defaults.baseURL);
  }
  
  if (modelName) {
    localStorage.setItem('modelName', modelName);
  } else {
    const defaults = AIProviderFactory.getProviderDefaults(providerType);
    localStorage.setItem('modelName', defaults.defaultModel);
  }
  
  // Update the API client with the new settings
  const providerDefaults = AIProviderFactory.getProviderDefaults(providerType);
  const baseUrl = apiBaseUrl || ViewerCore.envVars.OPENAI_API_BASE || providerDefaults.baseURL;
  const model = modelName || ViewerCore.envVars.MODEL_NAME || providerDefaults.defaultModel;
  
  ViewerCore.setAgentsAPI(new AgentsAPI(apiKey, baseUrl, model, providerType));
  
  // Show success message
  showStatusMessage('API settings saved successfully!', true, apiStatusMessage);
  
  // Add message to chat
  addMessage('API settings updated successfully!');
}

// Check if we already have AI output on page load
function loadExistingOutput() {
  const output = localStorage.getItem('aiGeneratedOutput');
  
  if (output) {
    try {
      ViewerCore.displayAIOutput(JSON.parse(output).data, outputSummary, outputFields);
    } catch (error) {
      console.error('Error loading existing output:', error);
    }
  }
}

// Initialize the viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', initViewer);