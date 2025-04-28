/**
 * settings-manager.js
 * Centralized settings management for the application filler extension
 * Created: April 27, 2025
 */

/**
 * Application Settings Manager
 * Handles saving, loading, and managing all application settings
 */
class SettingsManager {
  constructor() {
    this.settings = {
      // Resume settings
      resumeDirectory: '',
      lastResumeFile: '',
      parsedResume: '',
      
      // API settings
      apiProvider: 'Ollama', // Default to Ollama
      apiKey: '',
      apiBaseUrl: 'http://localhost:11434',
      modelName: 'gemma3:4b',
      modelTemperature: 0.7,
      
      // UI settings
      darkMode: true,
      agenticWorkflow: true,
      
      // Application data
      extractedHTML: null,
      pageUrl: null,
      pageTitle: null,
      
      // AI output
      aiGeneratedOutput: null,
      
      // Last updated timestamp
      lastUpdated: new Date().toISOString()
    };
    
    // Load settings from storage
    this.loadSettings();
  }
  
  /**
   * Load all settings from storage
   */
  loadSettings() {
    try {
      // Try to load settings from localStorage
      const savedSettings = localStorage.getItem('appSettings');
      if (savedSettings) {
        this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
        console.log('Settings loaded successfully.');
      } else {
        console.log('No saved settings found. Using defaults.');
      }
      
      // Load legacy settings that might not be in the appSettings object
      this.migrateFromLegacySettings();
      
      return true;
    } catch (error) {
      console.error('Error loading settings:', error);
      return false;
    }
  }
  
  /**
   * Migrate from legacy settings format (individual localStorage items)
   */
  migrateFromLegacySettings() {
    // List of legacy settings to migrate
    const legacySettings = [
      { key: 'parsedResume', target: 'parsedResume' },
      { key: 'apiKey', target: 'apiKey' },
      { key: 'apiBaseUrl', target: 'apiBaseUrl' },
      { key: 'modelName', target: 'modelName' },
      { key: 'apiProvider', target: 'apiProvider' },
      { key: 'darkMode', target: 'darkMode', parser: val => val === 'true' },
      { key: 'agenticWorkflow', target: 'agenticWorkflow', parser: val => val === 'true' },
      { key: 'extractedHTML', target: 'extractedHTML' },
      { key: 'pageUrl', target: 'pageUrl' },
      { key: 'pageTitle', target: 'pageTitle' },
      { key: 'aiGeneratedOutput', target: 'aiGeneratedOutput', parser: JSON.parse },
      { key: 'modelTemperature', target: 'modelTemperature', parser: parseFloat }
    ];
    
    // Check each legacy setting
    let updatedFromLegacy = false;
    legacySettings.forEach(setting => {
      const value = localStorage.getItem(setting.key);
      if (value !== null) {
        // Parse the value if a parser is provided
        const parsedValue = setting.parser ? setting.parser(value) : value;
        this.settings[setting.target] = parsedValue;
        updatedFromLegacy = true;
        
        // Don't remove legacy settings yet to maintain backwards compatibility
        // localStorage.removeItem(setting.key);
      }
    });
    
    if (updatedFromLegacy) {
      console.log('Migrated from legacy settings.');
      this.saveSettings();
    }
  }
  
  /**
   * Save all settings to storage
   */
  saveSettings() {
    try {
      // Update lastUpdated timestamp
      this.settings.lastUpdated = new Date().toISOString();
      
      // Save to localStorage
      localStorage.setItem('appSettings', JSON.stringify(this.settings));
      console.log('Settings saved successfully.');
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  }
  
  /**
   * Get a specific setting
   * @param {string} key - The setting key to retrieve
   * @param {any} defaultValue - Default value if setting doesn't exist
   * @returns {any} The setting value or default value
   */
  getSetting(key, defaultValue = null) {
    return key in this.settings ? this.settings[key] : defaultValue;
  }
  
  /**
   * Update a specific setting
   * @param {string} key - The setting key to update
   * @param {any} value - The new value
   * @returns {boolean} True if successful, false otherwise
   */
  updateSetting(key, value) {
    try {
      this.settings[key] = value;
      
      // Also update legacy setting for backward compatibility
      if (typeof value === 'object') {
        localStorage.setItem(key, JSON.stringify(value));
      } else {
        localStorage.setItem(key, String(value));
      }
      
      return this.saveSettings();
    } catch (error) {
      console.error(`Error updating setting ${key}:`, error);
      return false;
    }
  }
  
  /**
   * Update multiple settings at once
   * @param {Object} settingsObject - Object containing key-value pairs to update
   * @returns {boolean} True if successful, false otherwise
   */
  updateSettings(settingsObject) {
    try {
      // Update settings object
      this.settings = { ...this.settings, ...settingsObject };
      
      // Also update legacy settings for backward compatibility
      Object.entries(settingsObject).forEach(([key, value]) => {
        if (typeof value === 'object') {
          localStorage.setItem(key, JSON.stringify(value));
        } else {
          localStorage.setItem(key, String(value));
        }
      });
      
      return this.saveSettings();
    } catch (error) {
      console.error('Error updating settings:', error);
      return false;
    }
  }
  
  /**
   * Save resume directory path
   * @param {string} directoryPath - The directory path to save
   * @returns {boolean} True if successful, false otherwise
   */
  saveResumeDirectory(directoryPath) {
    return this.updateSetting('resumeDirectory', directoryPath);
  }
  
  /**
   * Get the resume directory path
   * @returns {string} The resume directory path
   */
  getResumeDirectory() {
    return this.getSetting('resumeDirectory', '');
  }
  
  /**
   * Save resume file path
   * @param {string} filePath - The file path to save
   * @returns {boolean} True if successful, false otherwise
   */
  saveResumeFile(filePath) {
    // Extract just the filename for display purposes
    const fileName = filePath.split('\\').pop().split('/').pop();
    
    return this.updateSettings({
      lastResumeFile: filePath,
      lastResumeFileName: fileName
    });
  }
  
  /**
   * Get the last resume file path
   * @returns {string} The last resume file path
   */
  getLastResumeFile() {
    return this.getSetting('lastResumeFile', '');
  }
  
  /**
   * Check if a resume directory is set
   * @returns {boolean} True if a resume directory is set, false otherwise
   */
  hasResumeDirectory() {
    const dir = this.getResumeDirectory();
    return dir !== null && dir !== '';
  }
  
  /**
   * Export all settings to a JSON file
   * @returns {Object} Settings object for export
   */
  exportSettings() {
    // Create a copy of settings without sensitive information
    const exportableSettings = { ...this.settings };
    
    // Remove sensitive information
    delete exportableSettings.apiKey;
    
    // Return the exportable settings
    return exportableSettings;
  }
  
  /**
   * Import settings from a JSON object
   * @param {Object} settingsObject - The settings object to import
   * @returns {boolean} True if successful, false otherwise
   */
  importSettings(settingsObject) {
    try {
      // Validate the settings object
      if (!settingsObject || typeof settingsObject !== 'object') {
        throw new Error('Invalid settings object');
      }
      
      // Keep the current API key if not provided
      if (!settingsObject.apiKey) {
        settingsObject.apiKey = this.settings.apiKey;
      }
      
      // Update settings
      return this.updateSettings(settingsObject);
    } catch (error) {
      console.error('Error importing settings:', error);
      return false;
    }
  }
  
  /**
   * Reset settings to default values
   * @returns {boolean} True if successful, false otherwise
   */
  resetSettings() {
    try {
      // Clear localStorage
      localStorage.clear();
      
      // Reinitialize settings
      this.settings = {
        // Resume settings
        resumeDirectory: '',
        lastResumeFile: '',
        parsedResume: '',
        
        // API settings
        apiProvider: 'Ollama',
        apiKey: '',
        apiBaseUrl: 'http://localhost:11434',
        modelName: 'gemma3:4b',
        modelTemperature: 0.7,
        
        // UI settings
        darkMode: true,
        agenticWorkflow: true,
        
        // Application data
        extractedHTML: null,
        pageUrl: null,
        pageTitle: null,
        
        // AI output
        aiGeneratedOutput: null,
        
        // Last updated timestamp
        lastUpdated: new Date().toISOString()
      };
      
      // Save the default settings
      return this.saveSettings();
    } catch (error) {
      console.error('Error resetting settings:', error);
      return false;
    }
  }
}

// Create and export a singleton instance
const settingsManager = new SettingsManager();
export default settingsManager;