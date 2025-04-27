// Simple API client for AI service providers
class BaseAIProvider {
  constructor(apiKey, baseURL, model) {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.model = model;
    this.conversation = [];
  }

  async sendMessage(userMessage) {
    // This is an abstract method that each provider will implement
    throw new Error("Method 'sendMessage' must be implemented by subclass");
  }

  clearConversation() {
    this.conversation = [];
  }
}

class OpenAIProvider extends BaseAIProvider {
  async sendMessage(userMessage) {
    try {
      // Add user message to conversation history
      this.conversation.push({ role: "user", content: userMessage });

      // Prepare the request payload
      const payload = {
        model: this.model,
        messages: this.conversation,
        stream: false
      };

      // Use the background script to make the API call
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/chat/completions`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`
          },
          body: payload
        }, response => {
          if (chrome.runtime.lastError) {
            console.error("Runtime error:", chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
            return;
          }
          
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "API call failed";
            console.error("API Error:", errorMsg);
            reject(new Error(errorMsg));
            return;
          }
          
          // Handle different response formats
          if (response.isText) {
            // The response is in text format
            const textResponse = response.data.text;
            console.log("Received text response:", textResponse);
            
            // Add assistant response to conversation history
            this.conversation.push({ role: "assistant", content: textResponse });
            
            resolve(textResponse);
          } else {
            // Standard JSON response format
            try {
              // Extract the assistant's message
              const data = response.data;
              const assistantMessage = data.choices[0].message.content;
              
              // Add assistant response to conversation history
              this.conversation.push({ role: "assistant", content: assistantMessage });
              
              resolve(assistantMessage);
            } catch (error) {
              console.error("Error processing API response:", error, "Response:", response);
              reject(new Error("Failed to process API response: " + error.message));
            }
          }
        });
      });
    } catch (error) {
      console.error("Error in API call:", error);
      return "Sorry, there was an error communicating with the AI service.";
    }
  }
}

class OpenAIAzureProvider extends BaseAIProvider {
  async sendMessage(userMessage) {
    try {
      // Add user message to conversation history
      this.conversation.push({ role: "user", content: userMessage });

      // Prepare the request payload - Azure format
      const payload = {
        messages: this.conversation,
        max_tokens: 1000,
        temperature: 0.7,
        frequency_penalty: 0,
        presence_penalty: 0,
        top_p: 0.95,
        stop: null
      };

      // Extract deployment name from model field for Azure
      const deploymentName = this.model; // For Azure, this is the deployment name

      // Use the background script to make the API call
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/openai/deployments/${deploymentName}/chat/completions?api-version=2023-05-15`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": this.apiKey
          },
          body: payload
        }, response => {
          if (chrome.runtime.lastError) {
            console.error("Runtime error:", chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
            return;
          }
          
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "API call failed";
            console.error("API Error:", errorMsg);
            reject(new Error(errorMsg));
            return;
          }
          
          // Azure response handling
          try {
            const data = response.data;
            const assistantMessage = data.choices[0].message.content;
            
            // Add assistant response to conversation history
            this.conversation.push({ role: "assistant", content: assistantMessage });
            
            resolve(assistantMessage);
          } catch (error) {
            console.error("Error processing Azure API response:", error, "Response:", response);
            reject(new Error("Failed to process Azure API response: " + error.message));
          }
        });
      });
    } catch (error) {
      console.error("Error in Azure API call:", error);
      return "Sorry, there was an error communicating with the Azure OpenAI service.";
    }
  }
}

class AnthropicProvider extends BaseAIProvider {
  async sendMessage(userMessage) {
    try {
      // Add user message to conversation history
      this.conversation.push({ role: "user", content: userMessage });

      // Convert conversation history to Anthropic format
      const messages = this.conversation.map(msg => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content
      }));

      // Prepare the request payload for Anthropic
      const payload = {
        model: this.model,
        messages: messages,
        max_tokens: 1000
      };

      // Use the background script to make the API call
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/v1/messages`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: payload
        }, response => {
          // Handle Anthropic response
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "Anthropic API call failed";
            reject(new Error(errorMsg));
            return;
          }
          
          try {
            const assistantMessage = response.data.content[0].text;
            
            // Add assistant response to conversation history
            this.conversation.push({ role: "assistant", content: assistantMessage });
            
            resolve(assistantMessage);
          } catch (error) {
            console.error("Error processing Anthropic API response:", error);
            reject(new Error("Failed to process Anthropic API response"));
          }
        });
      });
    } catch (error) {
      console.error("Error in Anthropic API call:", error);
      return "Sorry, there was an error communicating with the Anthropic service.";
    }
  }
}

class GoogleProvider extends BaseAIProvider {
  async sendMessage(userMessage) {
    try {
      // Add user message to conversation history
      this.conversation.push({ role: "user", content: userMessage });

      // Convert conversation to Google's format
      const messages = this.conversation.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      // Prepare the request payload for Google AI
      const payload = {
        model: this.model,
        contents: messages,
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
          topP: 0.95
        }
      };

      // Use the background script to make the API call
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/v1beta/models/${this.model}:generateContent`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`
          },
          body: payload
        }, response => {
          // Handle Google AI response
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "Google API call failed";
            reject(new Error(errorMsg));
            return;
          }
          
          try {
            const assistantMessage = response.data.candidates[0].content.parts[0].text;
            
            // Add assistant response to conversation history
            this.conversation.push({ role: "assistant", content: assistantMessage });
            
            resolve(assistantMessage);
          } catch (error) {
            console.error("Error processing Google API response:", error);
            reject(new Error("Failed to process Google API response"));
          }
        });
      });
    } catch (error) {
      console.error("Error in Google API call:", error);
      return "Sorry, there was an error communicating with the Google AI service.";
    }
  }
}

class XAIProvider extends BaseAIProvider {
  async sendMessage(userMessage) {
    try {
      // Add user message to conversation history
      this.conversation.push({ role: "user", content: userMessage });

      // Prepare the request payload for XAI (similar to OpenAI format)
      const payload = {
        model: this.model,
        messages: this.conversation,
        max_tokens: 1000
      };

      // Use the background script to make the API call
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/chat/completions`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`
          },
          body: payload
        }, response => {
          // Handle XAI response
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "XAI API call failed";
            reject(new Error(errorMsg));
            return;
          }
          
          try {
            const assistantMessage = response.data.choices[0].message.content;
            
            // Add assistant response to conversation history
            this.conversation.push({ role: "assistant", content: assistantMessage });
            
            resolve(assistantMessage);
          } catch (error) {
            console.error("Error processing XAI API response:", error);
            reject(new Error("Failed to process XAI API response"));
          }
        });
      });
    } catch (error) {
      console.error("Error in XAI API call:", error);
      return "Sorry, there was an error communicating with the XAI service.";
    }
  }
}

class OllamaProvider extends BaseAIProvider {
  constructor(apiKey = '', baseURL = 'http://localhost:11434', model = 'llama3') {
    super(apiKey, baseURL, model);
    // Track available models
    this.availableModels = [];
    // Fetch available models when initializing
    this.refreshAvailableModels();
    console.log("Initialized Ollama provider with model:", model, "at URL:", baseURL);
  }

  async refreshAvailableModels() {
    try {
      const models = await this.listModels();
      this.availableModels = models.map(model => model.name);
      console.log("Available Ollama models:", this.availableModels);
    } catch (error) {
      console.error("Failed to fetch Ollama models:", error);
    }
  }

  async sendMessage(userMessage) {
    try {
      console.log("Sending message to Ollama:", this.model, this.baseURL);
      
      // Add user message to conversation history
      this.conversation.push({ role: "user", content: userMessage });

      // Prepare the request payload for Ollama chat API
      const payload = {
        model: this.model,
        messages: this.conversation,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.95
        }
      };

      // Use the background script to make the API call
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/api/chat`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": chrome.runtime.getURL("")
          },
          body: payload
        }, response => {
          // Handle Ollama response
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "Ollama API call failed";
            console.error("Ollama API error:", errorMsg);
            reject(new Error(errorMsg));
            return;
          }
          
          try {
            console.log("Ollama response received:", response.data);
            let assistantMessage = response.data.message?.content || 
                                    response.data.response || 
                                    "No response content from Ollama";
            
            // Clean up potential markdown code blocks
            assistantMessage = assistantMessage.trim();
            if (assistantMessage.startsWith("```json") && assistantMessage.endsWith("```")) {
              assistantMessage = assistantMessage.substring(7, assistantMessage.length - 3).trim();
            } else if (assistantMessage.startsWith("```") && assistantMessage.endsWith("```")) {
              // Handle case where ``` is used without 'json'
              assistantMessage = assistantMessage.substring(3, assistantMessage.length - 3).trim();
            }

            // Add assistant response to conversation history
            this.conversation.push({ role: "assistant", content: assistantMessage });
            
            resolve(assistantMessage);
          } catch (error) {
            console.error("Error processing Ollama API response:", error, "Response:", response);
            reject(new Error("Failed to process Ollama API response: " + error.message));
          }
        });
      });
    } catch (error) {
      console.error("Error in Ollama API call:", error);
      return "Sorry, there was an error communicating with the Ollama service.";
    }
  }

  // Text generation without conversation context
  async generateText(prompt, options = {}) {
    const defaultOptions = {
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 2048,
      stream: false
    };

    const requestOptions = { ...defaultOptions, ...options };

    try {
      const payload = {
        model: this.model,
        prompt,
        ...requestOptions
      };

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/api/generate`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload
        }, response => {
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "Ollama generate API call failed";
            reject(new Error(errorMsg));
            return;
          }

          try {
            resolve(response.data.response);
          } catch (error) {
            console.error("Error processing Ollama generate response:", error);
            reject(new Error("Failed to process Ollama generate response"));
          }
        });
      });
    } catch (error) {
      console.error("Error in Ollama generate call:", error);
      throw error;
    }
  }

  // Create embeddings for text
  async createEmbedding(input) {
    try {
      const payload = {
        model: this.model,
        prompt: input
      };

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/api/embeddings`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload
        }, response => {
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "Ollama embeddings API call failed";
            reject(new Error(errorMsg));
            return;
          }

          try {
            resolve(response.data.embedding);
          } catch (error) {
            console.error("Error processing Ollama embeddings response:", error);
            reject(new Error("Failed to process Ollama embeddings response"));
          }
        });
      });
    } catch (error) {
      console.error("Error in Ollama embeddings call:", error);
      throw error;
    }
  }

  // List all available models
  async listModels() {
    try {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/api/tags`,
          method: "GET",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": chrome.runtime.getURL("")
          }
        }, response => {
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "Ollama tags API call failed";
            reject(new Error(errorMsg));
            return;
          }

          try {
            resolve(response.data.models || []);
          } catch (error) {
            console.error("Error processing Ollama tags response:", error);
            reject(new Error("Failed to process Ollama tags response"));
          }
        });
      });
    } catch (error) {
      console.error("Error listing Ollama models:", error);
      throw error;
    }
  }

  // Get model information
  async getModelInfo(modelName) {
    try {
      const payload = {
        name: modelName || this.model
      };

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/api/show`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload
        }, response => {
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "Ollama show API call failed";
            reject(new Error(errorMsg));
            return;
          }

          try {
            resolve(response.data);
          } catch (error) {
            console.error("Error processing Ollama show response:", error);
            reject(new Error("Failed to process Ollama show response"));
          }
        });
      });
    } catch (error) {
      console.error("Error getting Ollama model info:", error);
      throw error;
    }
  }

  // Pull a model from Ollama repository
  async pullModel(modelName) {
    try {
      const payload = {
        name: modelName
      };

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/api/pull`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload
        }, response => {
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "Ollama pull API call failed";
            reject(new Error(errorMsg));
            return;
          }

          // Pull might return 200 OK early while download continues
          resolve(true);
        });
      });
    } catch (error) {
      console.error("Error pulling Ollama model:", error);
      throw error;
    }
  }

  // List running models
  async listRunningModels() {
    try {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/api/ps`,
          method: "GET",
          headers: { "Content-Type": "application/json" }
        }, response => {
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "Ollama ps API call failed";
            reject(new Error(errorMsg));
            return;
          }

          try {
            resolve(response.data.models || []);
          } catch (error) {
            console.error("Error processing Ollama ps response:", error);
            reject(new Error("Failed to process Ollama ps response"));
          }
        });
      });
    } catch (error) {
      console.error("Error listing running Ollama models:", error);
      throw error;
    }
  }

  // Get Ollama version
  async getVersion() {
    try {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/api/version`,
          method: "GET",
          headers: { "Content-Type": "application/json" }
        }, response => {
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "Ollama version API call failed";
            reject(new Error(errorMsg));
            return;
          }

          try {
            resolve(response.data.version);
          } catch (error) {
            console.error("Error processing Ollama version response:", error);
            reject(new Error("Failed to process Ollama version response"));
          }
        });
      });
    } catch (error) {
      console.error("Error getting Ollama version:", error);
      throw error;
    }
  }
}

class LMStudioProvider extends BaseAIProvider {
  async sendMessage(userMessage) {
    try {
      // Add user message to conversation history
      this.conversation.push({ role: "user", content: userMessage });

      // Prepare the request payload for LM Studio (compatible with OpenAI format)
      const payload = {
        messages: this.conversation,
        temperature: 0.7,
        max_tokens: 1000,
        stream: false
      };

      // Use the background script to make the API call
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "makeApiCall",
          url: `${this.baseURL}/v1/chat/completions`,
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: payload
        }, response => {
          // Handle LM Studio response
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "LM Studio API call failed";
            reject(new Error(errorMsg));
            return;
          }
          
          try {
            const assistantMessage = response.data.choices[0].message.content;
            
            // Add assistant response to conversation history
            this.conversation.push({ role: "assistant", content: assistantMessage });
            
            resolve(assistantMessage);
          } catch (error) {
            console.error("Error processing LM Studio API response:", error);
            reject(new Error("Failed to process LM Studio API response"));
          }
        });
      });
    } catch (error) {
      console.error("Error in LM Studio API call:", error);
      return "Sorry, there was an error communicating with the LM Studio service.";
    }
  }
}

// Provider factory to create the appropriate provider
class AIProviderFactory {
  static createProvider(providerType, apiKey, baseURL, model) {
    switch (providerType) {
      case 'OpenAI':
        return new OpenAIProvider(apiKey, baseURL, model);
      case 'OpenAIAzure':
        return new OpenAIAzureProvider(apiKey, baseURL, model);
      case 'Google':
        return new GoogleProvider(apiKey, baseURL, model);
      case 'XAI':
        return new XAIProvider(apiKey, baseURL, model);
      case 'Anthropic':
        return new AnthropicProvider(apiKey, baseURL, model);
      case 'Ollama':
        return new OllamaProvider(apiKey, baseURL, model);
      case 'LMStudio':
        return new LMStudioProvider(apiKey, baseURL, model);
      default:
        console.warn(`Unknown provider type: ${providerType}, falling back to OpenAI`);
        return new OpenAIProvider(apiKey, baseURL, model);
    }
  }
  
  // Get default settings for a specific provider
  static getProviderDefaults(providerType) {
    const defaults = {
      OpenAI: {
        baseURL: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o'
      },
      OpenAIAzure: {
        baseURL: 'https://YOUR_RESOURCE_NAME.openai.azure.com',
        defaultModel: 'gpt-4'
      },
      Google: {
        baseURL: 'https://generativelanguage.googleapis.com',
        defaultModel: 'gemini-pro'
      },
      XAI: {
        baseURL: 'https://api.groq.com/openai',
        defaultModel: 'llama3-8b-8192'
      },
      Anthropic: {
        baseURL: 'https://api.anthropic.com',
        defaultModel: 'claude-3-opus-20240229'
      },
      Ollama: {
        baseURL: 'http://localhost:11434',
        defaultModel: 'gemma3:4b'
      },
      LMStudio: {
        baseURL: 'http://localhost:1234',
        defaultModel: 'default'
      }
    };
    
    return defaults[providerType] || defaults.OpenAI;
  }
}

// Legacy support - this is the original export class
class AgentsAPI {
  constructor(apiKey, baseURL, model = "gpt-4o", providerType = "OpenAI") {
    this.provider = AIProviderFactory.createProvider(providerType, apiKey, baseURL, model);
  }

  async sendMessage(userMessage) {
    return await this.provider.sendMessage(userMessage);
  }

  clearConversation() {
    this.provider.clearConversation();
  }
}

export default AgentsAPI;
export { AIProviderFactory };