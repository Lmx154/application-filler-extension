/**
 * viewer.js
 * Main entry point for the PDF viewer application
 */

import * as ViewerCore from './viewer-core.js';
import { showStatusMessage, addCopyButton } from './viewer-styles.js';
import { generatePrompt } from './prompt-generator.js';
import AgentsAPI, { AIProviderFactory } from './agents-api.js';
import settingsManager from './settings-manager.js';

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
  
  // Load Agentic Workflow setting
  loadAgenticWorkflowSetting();
  
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
  if (!settingsManager.getSetting('extractedHTML')) {
    ViewerCore.updateApplicationDataDisplay(applicationData);
  }
  
  // Setup event listeners
  setupEventListeners();
  
  // Add directory selector for resume
  setupResumeDirectorySelector();
  
  // Try to load last used resume if directory is set
  tryLoadLastResume();
}

// Load Agentic Workflow setting from settings manager
function loadAgenticWorkflowSetting() {
  const agenticEnabled = settingsManager.getSetting('agenticWorkflow', true);
  const agenticToggle = document.getElementById('agentic-workflow-toggle');
  
  if (agenticToggle) {
    agenticToggle.checked = agenticEnabled;
  }
}

// Initialize AI provider from settings
async function initializeAIProvider() {
  // Get settings from settings manager
  const providerType = settingsManager.getSetting('apiProvider', 'Ollama');
  
  // Set the selected provider in the dropdown
  if (apiProviderSelect) {
    apiProviderSelect.value = providerType;
  }
  
  // Get provider defaults for the selected provider
  const defaults = AIProviderFactory.getProviderDefaults(providerType);
  
  // Load settings from settings manager with fallbacks to defaults
  const apiKey = settingsManager.getSetting('apiKey', '');
  const baseURL = settingsManager.getSetting('apiBaseUrl', defaults.baseURL);
  const model = settingsManager.getSetting('modelName', defaults.defaultModel);
  
  // Update the settings form fields
  document.getElementById('api-key').value = apiKey;
  document.getElementById('api-base-url').value = baseURL;
  document.getElementById('model-name').value = model;
  
  // Set temperature if it exists
  const temperatureSlider = document.getElementById('temperature-setting');
  if (temperatureSlider) {
    temperatureSlider.value = settingsManager.getSetting('modelTemperature', 0.7);
    const temperatureValueDisplay = document.getElementById('temperature-value');
    if (temperatureValueDisplay) {
      temperatureValueDisplay.textContent = temperatureSlider.value;
    }
  }
  
  // Show/hide Ollama model selector based on the selected provider
  toggleOllamaModelSelector(providerType === 'Ollama');
  
  // Show/hide ENV fields based on the provider
  toggleENVFields(providerType === 'ENV');
  
  // If Ollama is selected, fetch available models
  if (providerType === 'Ollama') {
    initializeOllamaModels(baseURL);
  }
  
  // Initialize API client based on provider type
  if (apiKey || providerType === 'Ollama' || providerType === 'LMStudio' || providerType === 'ENV') {
    const api = new AgentsAPI(apiKey, baseURL, model, providerType);
    ViewerCore.setAgentsAPI(api);
    return true;
  } else {
    return false;
  }
}

/**
 * Show or hide Ollama-specific UI elements based on provider selection
 * @param {boolean} show - Whether to show Ollama-specific elements
 */
function toggleOllamaModelSelector(show) {
  const modelSelectorContainer = document.getElementById('ollama-model-selector-container');
  const temperatureContainer = document.getElementById('temperature-control-container');
  
  if (modelSelectorContainer) {
    modelSelectorContainer.style.display = show ? 'flex' : 'none';
  }
  
  if (temperatureContainer) {
    temperatureContainer.style.display = show ? 'flex' : 'none';
  }
}

/**
 * Show or hide ENV-specific UI elements and add explanation
 * @param {boolean} show - Whether to show ENV-specific elements
 */
function toggleENVFields(show) {
  const apiKeyField = document.getElementById('api-key');
  const apiBaseUrlField = document.getElementById('api-base-url');
  const modelNameField = document.getElementById('model-name');
  
  // Create or get ENV info message
  let envInfoDiv = document.getElementById('env-info-message');
  if (!envInfoDiv && show) {
    envInfoDiv = document.createElement('div');
    envInfoDiv.id = 'env-info-message';
    envInfoDiv.style.margin = '10px 0';
    envInfoDiv.style.padding = '10px';
    envInfoDiv.style.backgroundColor = '#e0f7fa';
    envInfoDiv.style.border = '1px solid #00838f';
    envInfoDiv.style.borderRadius = '4px';
    
    // Add the info text
    envInfoDiv.innerHTML = 'Settings will be loaded from the <code>.env</code> file in your project root.<br>' +
      'Required variables: <code>OPENAI_API_KEY</code>, <code>OPENAI_API_BASE</code> (optional), <code>MODEL_NAME</code> (optional)';
    
    // Insert after the API key field row
    const apiKeyRow = apiKeyField.closest('.settings-row');
    apiKeyRow.parentNode.insertBefore(envInfoDiv, apiKeyRow.nextSibling);
  }
  
  // Show/hide ENV info message
  if (envInfoDiv) {
    envInfoDiv.style.display = show ? 'block' : 'none';
  }
  
  // Disable/enable input fields
  if (show) {
    apiKeyField.disabled = true;
    apiKeyField.placeholder = 'Will be loaded from OPENAI_API_KEY in .env';
    
    apiBaseUrlField.disabled = true;
    apiBaseUrlField.placeholder = 'Will be loaded from OPENAI_API_BASE in .env';
    
    modelNameField.disabled = true;
    modelNameField.placeholder = 'Will be loaded from MODEL_NAME in .env';
  } else {
    apiKeyField.disabled = false;
    apiKeyField.placeholder = 'Enter your API key';
    
    apiBaseUrlField.disabled = false;
    apiBaseUrlField.placeholder = 'https://api.openai.com/v1';
    
    modelNameField.disabled = false;
    modelNameField.placeholder = 'gpt-4o';
  }
}

/**
 * Initialize and fetch available Ollama models
 * @param {string} baseURL - The Ollama API base URL
 */
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
    
    // Set a timeout to avoid hanging indefinitely
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection to Ollama timed out')), 3000)
    );
    
    try {
      // Race the model fetch against the timeout
      const models = await Promise.race([
        provider.listModels(),
        timeoutPromise
      ]);
      
      ollamaModels = models;
      
      // Store in settings
      settingsManager.updateSetting('ollamaModels', models);
      
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
  } catch (error) {
    console.error('Error initializing Ollama models:', error);
    return false;
  }
}

/**
 * Update the Ollama model selector with available models
 * @param {Array} models - Array of available Ollama models
 */
function updateOllamaModelSelector(models) {
  // Clear existing options
  ollamaModelSelector.innerHTML = '';
  
  if (!models || models.length === 0) {
    ollamaModelSelector.innerHTML = '<option value="">No models available</option>';
    return;
  }
  
  // Add each model as an option
  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model.name;
    option.textContent = model.name;
    ollamaModelSelector.appendChild(option);
  });
}

// Setup resume directory selector
function setupResumeDirectorySelector() {
  // Add directory selector to page-resume
  const resumePage = document.getElementById('page-resume');
  if (!resumePage) return;
  
  // Create directory selector container
  const directorySelectorContainer = document.createElement('div');
  directorySelectorContainer.className = 'directory-selector-container';
  directorySelectorContainer.style.marginBottom = '20px';
  
  // Create directory selector elements
  const directoryLabel = document.createElement('div');
  directoryLabel.innerHTML = '<strong>Resume Directory:</strong> <span id="current-directory">(Not set)</span>';
  
  const directoryButtons = document.createElement('div');
  directoryButtons.className = 'action-buttons';
  directoryButtons.style.marginTop = '10px';
  
  // Create buttons
  const selectDirButton = document.createElement('button');
  selectDirButton.id = 'select-directory';
  selectDirButton.className = 'settings-button';
  selectDirButton.textContent = 'Select Directory';
  
  const loadResumeButton = document.createElement('button');
  loadResumeButton.id = 'load-resume';
  loadResumeButton.className = 'settings-button';
  loadResumeButton.textContent = 'Load Resume';
  loadResumeButton.style.display = 'none'; // Hide initially
  
  // Add buttons to container
  directoryButtons.appendChild(selectDirButton);
  directoryButtons.appendChild(loadResumeButton);
  
  // Add elements to container
  directorySelectorContainer.appendChild(directoryLabel);
  directorySelectorContainer.appendChild(directoryButtons);
  
  // Insert directory selector before the file input (not before the parent)
  if (input) {
    resumePage.insertBefore(directorySelectorContainer, input);
  } else {
    // Fallback - just append to the resume page
    resumePage.appendChild(directorySelectorContainer);
  }
  
  // Add event listeners to buttons
  selectDirButton.addEventListener('click', handleSelectDirectory);
  loadResumeButton.addEventListener('click', handleLoadResume);
  
  // Update directory display
  updateDirectoryDisplay();
}

// Update directory display with current directory from settings
function updateDirectoryDisplay() {
  const directorySpan = document.getElementById('current-directory');
  const loadResumeButton = document.getElementById('load-resume');
  
  if (!directorySpan || !loadResumeButton) return;
  
  const directoryPath = settingsManager.getResumeDirectory();
  
  if (directoryPath) {
    directorySpan.textContent = directoryPath;
    loadResumeButton.style.display = 'inline-block';
  } else {
    directorySpan.textContent = '(Not set)';
    loadResumeButton.style.display = 'none';
  }
}

// Handle selecting a resume directory
async function handleSelectDirectory() {
  try {
    // Detect browser type
    const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    
    if (isFirefox) {
      // Firefox-friendly approach using regular file input
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.pdf';
      
      // Create a promise to handle the file selection
      const filePromise = new Promise((resolve) => {
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files.length > 0) {
            resolve(e.target.files[0]);
          } else {
            resolve(null);
          }
        });
        
        // Trigger the file dialog
        fileInput.click();
      });
      
      // Wait for file selection
      const file = await filePromise;
      
      if (!file) {
        // User canceled the operation
        return;
      }
      
      // Save file name as the "directory" (we'll just use the file name in Firefox)
      const directoryPath = file.name;
      settingsManager.saveResumeDirectory('Firefox: Selected File');
      settingsManager.saveResumeFile(file.name);
      
      // Process the file directly
      const out = document.getElementById('output');
      out.textContent = 'Parsing…';
      const buf = await file.arrayBuffer();
      
      try {
        const pdfjsLib = await import('./pdf.mjs');
        
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += content.items.map(item => item.str).join(' ') + '\n';
        }
      
        const parsedResume = ViewerCore.toMarkdown(fullText);
        out.textContent = parsedResume;
        
        // Store the parsed resume in settings
        settingsManager.updateSetting('parsedResume', parsedResume);
        
        // Store the file for Firefox users
        settingsManager.updateSetting('firefoxResumeFile', {
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
          content: await file.text()
        });
        
        // Add copy button
        addCopyButton(out);
        
        // Update display
        updateDirectoryDisplay();
        
        // Show success message
        showStatusMessage('Resume loaded successfully!', true);
      } catch (error) {
        out.textContent = `Error parsing PDF: ${error.message}`;
        showStatusMessage('Error parsing PDF: ' + error.message, false);
      }
    } else if (window.showDirectoryPicker) {
      // Chrome/Edge approach using File System Access API
      // Show directory picker
      const directoryHandle = await window.showDirectoryPicker();
      
      // Save the directory path
      const directoryPath = directoryHandle.name;
      
      // Store directory handle for later use
      settingsManager.updateSetting('resumeDirectoryHandle', directoryHandle);
      settingsManager.saveResumeDirectory(directoryPath);
      
      // Update display
      updateDirectoryDisplay();
      
      // Show success message
      showStatusMessage('Resume directory set successfully!', true);
    } else {
      // Fallback for other browsers
      alert('Advanced directory selection is not supported in this browser. Using file selection instead.');
      
      // Use the Firefox approach
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.pdf';
      fileInput.click();
      
      // We don't await the result here, as that would require duplicating the Firefox code
      // The user can use the regular file input if this fails
    }
  } catch (error) {
    console.error('Error selecting directory/file:', error);
    showStatusMessage('Error: ' + error.message, false);
  }
}

// Handle loading resume from the selected directory
async function handleLoadResume() {
  try {
    // Get the directory handle
    const directoryHandle = settingsManager.getSetting('resumeDirectoryHandle');
    
    if (!directoryHandle) {
      alert('Resume directory not set or access expired. Please select the directory again.');
      return;
    }
    
    // Show file picker within the directory
    const fileHandle = await directoryHandle.getFileHandle('resume.pdf', { create: false })
      .catch(async () => {
        // If resume.pdf doesn't exist, show a file picker
        alert('resume.pdf not found in directory. Please select a PDF file.');
        
        // Try to get all PDF files in the directory
        const pdfFiles = [];
        for await (const entry of directoryHandle.values()) {
          if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
            pdfFiles.push(entry);
          }
        }
        
        if (pdfFiles.length === 0) {
          throw new Error('No PDF files found in the directory.');
        }
        
        // If only one PDF file, use that
        if (pdfFiles.length === 1) {
          return pdfFiles[0];
        }
        
        // Let the user select which PDF to use
        const fileIndex = prompt(
          `Multiple PDF files found. Enter the number of the file to use:\n${
            pdfFiles.map((file, index) => `${index + 1}. ${file.name}`).join('\n')
          }`,
          '1'
        );
        
        const selectedIndex = parseInt(fileIndex) - 1;
        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= pdfFiles.length) {
          throw new Error('Invalid selection.');
        }
        
        return pdfFiles[selectedIndex];
      });
    
    // Get the file
    const file = await fileHandle.getFile();
    
    // Save the file path
    settingsManager.saveResumeFile(file.name);
    
    // Process the PDF file
    const out = document.getElementById('output');
    out.textContent = 'Parsing…';
    const buf = await file.arrayBuffer();
    
    try {
      const pdfjsLib = await import('./pdf.mjs');
      
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(' ') + '\n';
      }
    
      const parsedResume = ViewerCore.toMarkdown(fullText);
      out.textContent = parsedResume;
      
      // Store the parsed resume in settings
      settingsManager.updateSetting('parsedResume', parsedResume);
      
      // Add copy button
      addCopyButton(out);
      
      // Show success message
      showStatusMessage('Resume loaded successfully!', true);
    } catch (error) {
      out.textContent = `Error parsing PDF: ${error.message}`;
      showStatusMessage('Error parsing PDF: ' + error.message, false);
    }
  } catch (error) {
    console.error('Error loading resume:', error);
    showStatusMessage('Error loading resume: ' + error.message, false);
  }
}

// Try to load the last used resume on startup
async function tryLoadLastResume() {
  if (settingsManager.hasResumeDirectory() && settingsManager.getLastResumeFile()) {
    try {
      // Try to load the resume
      await handleLoadResume();
    } catch (error) {
      console.error('Error auto-loading resume:', error);
      // Don't show error message to avoid confusion on startup
    }
  }
}

// Handle Agentic Workflow toggle
function handleAgenticWorkflowToggle() {
  const agenticToggle = document.getElementById('agentic-workflow-toggle');
  settingsManager.updateSetting('agenticWorkflow', agenticToggle.checked);
}

function handleSaveApiSettings() {
  const apiKey = document.getElementById('api-key').value.trim();
  const apiBaseUrl = document.getElementById('api-base-url').value.trim();
  const modelName = document.getElementById('model-name').value.trim();
  const providerType = document.getElementById('api-provider').value;
  const temperature = document.getElementById('temperature-setting').value;

  // For Ollama, LMStudio, and ENV providers, API key is optional
  if (!apiKey && providerType !== 'Ollama' && providerType !== 'LMStudio' && providerType !== 'ENV') {
    showStatusMessage('Please enter a valid API key', false, apiStatusMessage);
    return;
  }
  
  // Save to settings manager
  settingsManager.updateSettings({
    apiProvider: providerType,
    apiKey: apiKey,
    apiBaseUrl: apiBaseUrl || AIProviderFactory.getProviderDefaults(providerType).baseURL,
    modelName: modelName || AIProviderFactory.getProviderDefaults(providerType).defaultModel,
    modelTemperature: temperature
  });
  
  // Special handling for ENV provider - use the ENVProvider directly
  if (providerType === 'ENV') {
    // Create a new API instance with the ENV provider
    const api = new AgentsAPI('', '', '', 'ENV'); // The values don't matter for ENV provider
    ViewerCore.setAgentsAPI(api);
    
    // Show a special message for ENV provider
    showStatusMessage('API settings saved. Using values from .env file.', true, apiStatusMessage);
    addMessage('API settings updated to use values from .env file.');
    return;
  }
  
  // Regular handling for other providers
  const api = new AgentsAPI(
    apiKey, 
    apiBaseUrl || AIProviderFactory.getProviderDefaults(providerType).baseURL, 
    modelName || AIProviderFactory.getProviderDefaults(providerType).defaultModel, 
    providerType
  );
  ViewerCore.setAgentsAPI(api);
  
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

/**
 * Setup all event listeners for the application
 */
function setupEventListeners() {
  // API settings event listeners
  if (saveApiSettingsButton) {
    saveApiSettingsButton.addEventListener('click', handleSaveApiSettings);
  }
  
  if (apiProviderSelect) {
    apiProviderSelect.addEventListener('change', handleProviderChange);
  }
  
  if (refreshOllamaModelsButton) {
    refreshOllamaModelsButton.addEventListener('click', handleRefreshOllamaModels);
  }
  
  if (ollamaModelSelector) {
    ollamaModelSelector.addEventListener('change', handleOllamaModelChange);
  }
  
  // Temperature slider event listener
  const temperatureSlider = document.getElementById('temperature-setting');
  const temperatureValueDisplay = document.getElementById('temperature-value');
  if (temperatureSlider && temperatureValueDisplay) {
    temperatureSlider.addEventListener('input', function() {
      temperatureValueDisplay.textContent = this.value;
    });
  }
  
  // Theme toggle event listener
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('change', handleThemeToggle);
  }
  
  // Agentic workflow toggle event listener
  const agenticToggle = document.getElementById('agentic-workflow-toggle');
  if (agenticToggle) {
    agenticToggle.addEventListener('change', handleAgenticWorkflowToggle);
  }
  
  // Output generation event listeners
  if (generateOutputButton) {
    generateOutputButton.addEventListener('click', handleGenerateOutput);
  }
  
  if (copyOutputButton) {
    copyOutputButton.addEventListener('click', handleCopyOutput);
  }
  
  if (clearOutputButton) {
    clearOutputButton.addEventListener('click', handleClearOutput);
  }
  
  // Application data event listeners
  if (refreshDataButton) {
    refreshDataButton.addEventListener('click', handleRefreshData);
  }
  
  if (copyDataButton) {
    copyDataButton.addEventListener('click', handleCopyData);
  }
  
  if (clearDataButton) {
    clearDataButton.addEventListener('click', handleClearData);
  }
  
  // Chat event listeners
  if (sendButton) {
    sendButton.addEventListener('click', handleSendMessage);
  }
  
  if (chatInput) {
    chatInput.addEventListener('keyup', function(event) {
      if (event.key === 'Enter') {
        handleSendMessage();
      }
    });
  }
}

/**
 * Handle provider change in dropdown
 */
function handleProviderChange() {
  const providerType = apiProviderSelect.value;
  const defaults = AIProviderFactory.getProviderDefaults(providerType);
  
  // Update UI based on provider selection
  document.getElementById('api-base-url').value = defaults.baseURL;
  
  // Only change model if current model is empty
  const currentModel = document.getElementById('model-name').value;
  if (!currentModel) {
    document.getElementById('model-name').value = defaults.defaultModel;
  }
  
  // Toggle Ollama model selector visibility
  toggleOllamaModelSelector(providerType === 'Ollama');
  
  // Toggle ENV fields if ENV provider is selected
  toggleENVFields(providerType === 'ENV');
  
  // If switching to Ollama, initialize models
  if (providerType === 'Ollama') {
    initializeOllamaModels(defaults.baseURL);
  }
}

/**
 * Handle refresh Ollama models button click
 */
function handleRefreshOllamaModels() {
  const baseURL = document.getElementById('api-base-url').value || 'http://localhost:11434';
  initializeOllamaModels(baseURL);
}

/**
 * Handle Ollama model selection change
 */
function handleOllamaModelChange() {
  const selectedModel = ollamaModelSelector.value;
  if (selectedModel) {
    document.getElementById('model-name').value = selectedModel;
  }
}

/**
 * Handle theme toggle 
 */
function handleThemeToggle() {
  const darkMode = themeToggle.checked;
  
  // Update body class
  if (darkMode) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  
  // Save setting
  settingsManager.updateSetting('darkMode', darkMode);
}

/**
 * Add a message to the chatbox
 * @param {string} text - Message text
 * @param {boolean} isAI - Whether this is an AI message
 */
function addMessage(text, isAI = true) {
  if (!chatbox) return;
  
  const message = document.createElement('div');
  message.className = `chat-message ${isAI ? 'ai-message' : 'user-message'}`;
  message.textContent = text;
  chatbox.appendChild(message);
  
  // Scroll to bottom
  chatbox.scrollTop = chatbox.scrollHeight;
}

/**
 * Handle send message button click
 */
async function handleSendMessage() {
  if (!chatInput || !chatInput.value.trim()) return;
  
  const userMessage = chatInput.value.trim();
  chatInput.value = '';
  
  // Add user message to chat
  addMessage(userMessage, false);
  
  // Add a "thinking" message
  const thinkingMessage = document.createElement('div');
  thinkingMessage.className = 'chat-message ai-message';
  thinkingMessage.textContent = 'Thinking...';
  chatbox.appendChild(thinkingMessage);
  
  try {
    // Get the API
    const api = ViewerCore.getAgentsAPI();
    
    if (!api) {
      thinkingMessage.textContent = 'Error: API not initialized. Please check your settings.';
      return;
    }
    
    // Send message to AI
    const response = await api.sendMessage(userMessage);
    
    // Replace thinking message with response
    thinkingMessage.textContent = response;
  } catch (error) {
    console.error('Error sending message:', error);
    thinkingMessage.textContent = `Error: ${error.message}`;
  }
  
  // Scroll to bottom
  chatbox.scrollTop = chatbox.scrollHeight;
}

/**
 * Handle generate output button click
 */
async function handleGenerateOutput() {
  try {
    // Check if we have form data
    if (!ViewerCore.formData) {
      showStatusMessage('No form data available. Please visit a site with a form first.', false);
      return;
    }
    
    // Show loading state
    outputSummary.textContent = 'Generating output...';
    outputFields.textContent = 'Please wait...';
    
    // Get the AI API
    const api = ViewerCore.getAgentsAPI();
    
    if (!api) {
      showStatusMessage('API not initialized. Please check your settings.', false);
      return;
    }
    
    // Check if agentic workflow is enabled
    const useAgentic = settingsManager.getSetting('agenticWorkflow');
    
    // Get resume content if available
    const resumeContent = settingsManager.getSetting('parsedResume') || '';
    
    let aiResponse;
    if (useAgentic) {
      // Use the form filling tools from form-filling-tools.js
      // This requires importing the module dynamically
      const FormFillingTools = await import('./form-filling-tools.js');
      aiResponse = await FormFillingTools.fillFormWithTools(
        api,
        resumeContent,
        ViewerCore.formData.autofillableFields
      );
    } else {
      // Use the traditional prompt-based approach
      const prompt = generatePrompt(resumeContent, ViewerCore.formData.autofillableFields);
      aiResponse = await api.sendMessage(prompt);
    }
    
    // Display the AI output
    ViewerCore.displayAIOutput(aiResponse, outputSummary, outputFields);
  } catch (error) {
    console.error('Error generating output:', error);
    outputSummary.textContent = 'Error generating output: ' + error.message;
    outputFields.textContent = '';
  }
}

/**
 * Handle copy output button click
 */
function handleCopyOutput() {
  try {
    // Get the AI output
    const aiOutput = ViewerCore.aiGeneratedOutput;
    
    if (!aiOutput) {
      showStatusMessage('No output to copy.', false);
      return;
    }
    
    // Convert to JSON string
    const outputText = JSON.stringify(aiOutput, null, 2);
    
    // Copy to clipboard
    navigator.clipboard.writeText(outputText)
      .then(() => {
        showStatusMessage('Output copied to clipboard.', true);
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
        showStatusMessage('Failed to copy output: ' + err.message, false);
      });
  } catch (error) {
    console.error('Error copying output:', error);
    showStatusMessage('Error copying output: ' + error.message, false);
  }
}

/**
 * Handle clear output button click
 */
function handleClearOutput() {
  ViewerCore.clearAIOutput(outputSummary, outputFields);
  showStatusMessage('Output cleared.', true);
}

/**
 * Handle refresh data button click
 */
function handleRefreshData() {
  try {
    // Get the latest data from background script
    chrome.runtime.sendMessage({ action: 'getFormData' }, response => {
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError);
        showStatusMessage('Error refreshing data: ' + chrome.runtime.lastError.message, false);
        return;
      }
      
      if (response && response.success) {
        // Store the form data
        ViewerCore.formData = response.data;
        
        // Display the data
        ViewerCore.displayFormData(response.data, applicationData);
        
        showStatusMessage('Data refreshed successfully.', true);
      } else {
        showStatusMessage('No form data available.', false);
      }
    });
  } catch (error) {
    console.error('Error refreshing data:', error);
    showStatusMessage('Error refreshing data: ' + error.message, false);
  }
}

/**
 * Handle copy data button click 
 */
function handleCopyData() {
  try {
    // Get the application data
    const data = ViewerCore.formData;
    
    if (!data) {
      showStatusMessage('No data to copy.', false);
      return;
    }
    
    // Convert to JSON string
    const dataText = JSON.stringify(data, null, 2);
    
    // Copy to clipboard
    navigator.clipboard.writeText(dataText)
      .then(() => {
        showStatusMessage('Data copied to clipboard.', true);
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
        showStatusMessage('Failed to copy data: ' + err.message, false);
      });
  } catch (error) {
    console.error('Error copying data:', error);
    showStatusMessage('Error copying data: ' + error.message, false);
  }
}

/**
 * Handle clear data button click
 */
function handleClearData() {
  try {
    // Clear the data
    ViewerCore.formData = null;
    applicationData.innerHTML = 'No data available.';
    
    // Clear from localStorage
    localStorage.removeItem('extractedHTML');
    
    showStatusMessage('Data cleared.', true);
  } catch (error) {
    console.error('Error clearing data:', error);
    showStatusMessage('Error clearing data: ' + error.message, false);
  }
}

// Initialize the viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', initViewer);