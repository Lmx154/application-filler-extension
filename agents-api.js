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
  constructor(apiKey = '', baseURL = 'http://localhost:11434', model = 'mistral-nemo:12b-instruct-2407-q4_0') {
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

      // Get custom temperature from localStorage if available
      const temperature = parseFloat(localStorage.getItem('modelTemperature')) || 0.7;
      console.log(`Using temperature: ${temperature}`);

      // Prepare the request payload for Ollama chat API
      const payload = {
        model: this.model,
        messages: this.conversation,
        stream: false,
        options: {
          temperature: temperature,
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

  /**
   * Send a function calling message to Mistral models
   * @param {Array} messages - Array of message objects
   * @param {Array} tools - Array of tool definitions
   * @param {Object} options - Options for the function calling
   * @returns {Promise<Object>} - The response from the API
   */
  async sendFunctionCallingMessage(messages, tools, options = {}) {
    try {
      const isMistralModel = this.model.toLowerCase().includes('mistral') || 
                            this.model.toLowerCase().includes('nemo');
      
      if (!isMistralModel) {
        console.warn('Function calling is optimized for Mistral models, falling back to standard chat');
        return await this.sendMessage(messages[messages.length-1].content);
      }
      
      console.log("Using Mistral function calling format with", tools.length, "tools");
      
      // Format the system message to emphasize function calling but without JavaScript syntax
      let hasSystemMessage = false;
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'system') {
          hasSystemMessage = true;
          // Remove JavaScript-specific instructions which might confuse the model's tool head
          messages[i].content += "\n\nIMPORTANT: You MUST use the tools provided to complete your task.";
          break;
        }
      }
      
      // Add a system message if none exists
      if (!hasSystemMessage) {
        messages.unshift({
          role: 'system',
          content: 'You are a helpful assistant that uses the provided tools to complete tasks efficiently.'
        });
      }
      
      // CRITICAL: Ensure all required parameters are included for function calling
      const requestBody = {
        model: this.model,
        messages: messages,
        tools: tools,                       // Required: tool definitions array
        tool_choice: options.tool_choice || "auto",  // Required: auto or required 
        options: {
          temperature: options.temperature || 0.25,   // Lower temperature for more reliable tool use
          top_p: options.top_p || 0.95
        },
        stream: false
      };
      
      console.log("Sending Mistral function call request:", JSON.stringify(requestBody, null, 2).substring(0, 500) + "...");

      // Send the request to the Ollama API
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
          body: requestBody
        }, response => {
          if (chrome.runtime.lastError) {
            console.error("Runtime error in function calling:", chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
            return;
          }
          
          if (!response || !response.success) {
            const errorMsg = (response && response.error) || "API call failed";
            console.error("API Error in function calling:", errorMsg);
            reject(new Error(errorMsg));
            return;
          }
          
          try {
            console.log("Mistral function calling raw response:", response.data);
            
            // Handle Mistral's response format
            if (response.data && response.data.message) {
              const messageData = response.data.message;
              
              // Check if we have tool_calls in the response
              if (messageData.tool_calls && messageData.tool_calls.length > 0) {
                console.log("Detected native tool_calls in Mistral response:", messageData.tool_calls);
                return resolve({
                  content: messageData.content || '',
                  tool_calls: messageData.tool_calls
                });
              } 
              
              // If content contains JSON-like function calls, attempt to parse them
              const content = messageData.content || '';
              
              // Try to parse any function calls from the text response
              const functionCalls = this.extractFunctionCallsFromText(content);
              if (functionCalls.length > 0) {
                console.log("Extracted function calls from text:", functionCalls);
                return resolve({
                  content: content,
                  tool_calls: functionCalls.map(fc => ({
                    id: `auto_${Math.random().toString(36).substring(2, 10)}`,
                    type: "function",
                    function: {
                      name: fc.function_name,
                      arguments: JSON.stringify(fc.arguments)
                    }
                  }))
                });
              }
              
              // No function calls found
              return resolve({
                content: content,
                tool_calls: []
              });
            }
            
            resolve({ content: "Error: Unexpected response format from Ollama" });
          } catch (error) {
            console.error("Error processing function calling response:", error);
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error("Error in sendFunctionCallingMessage:", error);
      throw error;
    }
  }

  /**
   * Extract function calls from text response when Mistral doesn't use proper format
   * @param {string} text - The text response from the model
   * @returns {Array} Array of extracted function calls
   */
  extractFunctionCallsFromText(text) {
    const functionCalls = [];
    
    // Try different patterns to extract function calls
    
    // Pattern 1: Function calls with parentheses like fill_field("id", "value")
    const fnPattern = /(\w+)\s*\(\s*(?:['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?(?:\s*,\s*['"]([^'"]+)['"])?)\s*\)/g;
    let match;
    while ((match = fnPattern.exec(text)) !== null) {
      const fnName = match[1];
      const args = {};
      
      // Handle different functions
      if (fnName === 'fill_field') {
        if (match[2]) args.field_id = match[2];
        if (match[3]) args.value = match[3];
        if (match[4]) args.confidence = match[4];
        else args.confidence = "Medium";
      } else if (fnName === 'search_resume') {
        if (match[2]) args.query = match[2];
      } else if (fnName === 'get_resume_section') {
        if (match[2]) args.section_name = match[2];
      } else if (fnName === 'check_field') {
        if (match[2]) args.field_id = match[2];
      }
      
      functionCalls.push({
        function_name: fnName,
        arguments: args
      });
    }
    
    // Pattern 2: Look for field ID and value explicitly mentioned
    if (functionCalls.length === 0) {
      const fieldIdPattern = /field id:\s*[`'"]([\w-]+)[`'"]/i;
      const valuePattern = /value[^:]*:\s*[`'"]([^`'"]+)[`'"]/i;
      
      const fieldIdMatch = text.match(fieldIdPattern);
      const valueMatch = text.match(valuePattern);
      
      if (fieldIdMatch && valueMatch) {
        functionCalls.push({
          function_name: "fill_field",
          arguments: {
            field_id: fieldIdMatch[1],
            value: valueMatch[1],
            confidence: "Medium"
          }
        });
      }
    }
    
    return functionCalls;
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

class ENVProvider extends OpenAIProvider {
  constructor() {
    // Attempt to load settings from .env file
    try {
      // Initialize with empty values
      let apiKey = '';
      let baseURL = 'https://api.openai.com/v1';
      let model = 'gpt-4o';
      
      // Try to fetch the .env file content using XMLHttpRequest (browser compatible)
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '.env', false);  // Synchronous request
      xhr.send();
      
      if (xhr.status === 200) {
        const envFileContent = xhr.responseText;
        console.log("ENV file loaded successfully");
        
        // Parse .env file content
        const envVars = {};
        envFileContent.split('\n').forEach(line => {
          line = line.trim();
          // Skip comments and empty lines
          if (line && !line.startsWith('//') && !line.startsWith('#')) {
            const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
            if (match) {
              const key = match[1];
              let value = match[2];
              // Remove quotes if present
              if ((value.startsWith('"') && value.endsWith('"')) || 
                  (value.startsWith("'") && value.endsWith("'"))) {
                value = value.substring(1, value.length - 1);
              }
              envVars[key] = value;
            }
          }
        });
        
        // Get settings from parsed env vars
        apiKey = envVars.OPENAI_API_KEY || '';
        baseURL = envVars.OPENAI_API_BASE || 'https://api.openai.com/v1';
        model = envVars.MODEL_NAME || 'gpt-4o';
        
        console.log(`ENV provider initialized with model: ${model}`);
      } else {
        console.warn("Failed to load .env file, using default settings");
      }
      
      // Call the OpenAI provider constructor with the loaded settings
      super(apiKey, baseURL, model);
      
    } catch (error) {
      console.error("Error initializing ENV provider:", error);
      // Fall back to default OpenAI settings if there's an error
      super('', 'https://api.openai.com/v1', 'gpt-4o');
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
      case 'ENV':
        return new ENVProvider();
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
      },
      ENV: {
        baseURL: '',  // Will be loaded from .env
        defaultModel: '' // Will be loaded from .env
      }
    };
    
    return defaults[providerType] || defaults.OpenAI;
  }
}

/**
 * Format a complex prompt for local models with clearer structure
 * @param {string} resumeContent - The resume content
 * @param {Array} formFields - Array of form field objects
 * @returns {string} A formatted prompt that's easier for local models to process
 */
function formatPrompt(resumeContent, formFields) {
  let prompt = `TASK: Fill out job application form fields based on resume information.

RESUME:
${resumeContent}

FORM FIELDS TO FILL:
`;

  // Add each form field with clearer formatting
  formFields.forEach(field => {
    // Include both label and ID for better context
    const labelText = field.label && field.label.trim() !== '' 
      ? `${field.label} (${field.id})` 
      : field.id;
    
    prompt += `- ${labelText} (${field.type})\n`;
  });

  prompt += `
INSTRUCTIONS:
1. Use ONLY information found in the resume
2. For each field ID, provide a suitable value from the resume
3. Mark fields with "No information available" if nothing matches
4. Provide confidence level (High/Medium/Low) for each field

RESPONSE FORMAT:
Return a JSON object with this structure:
{
  "fields": [
    {
      "id": "exact_field_id",
      "value": "value from resume",
      "confidence": "High/Medium/Low"
    },
    ...more fields...
  ],
  "summary": "Brief analysis of resume-form match"
}`;

  return prompt;
}

// Legacy support - this is the original export class
class AgentsAPI {
  constructor(apiKey, baseURL, model = "gpt-4o", providerType = "OpenAI") {
    this.provider = AIProviderFactory.createProvider(providerType, apiKey, baseURL, model);
    this.modelName = model; // Store model name for reference
  }

  async sendMessage(userMessage) {
    return await this.provider.sendMessage(userMessage);
  }
  
  /**
   * Send a message with function calling capabilities
   * @param {Array} messages - Array of message objects
   * @param {Array} tools - Array of tool definitions
   * @param {Object} options - Options for the function calling
   * @returns {Promise<Object>} - The response from the API
   */
  async sendFunctionCallingMessage(messages, tools, options = {}) {
    // If the provider has its own function calling implementation, use it
    if (this.provider.sendFunctionCallingMessage) {
      return await this.provider.sendFunctionCallingMessage(messages, tools, options);
    }
    
    // Fallback for providers that don't support function calling
    console.warn("Function calling not supported by provider, using regular message sending");
    const lastUserMessage = messages.filter(msg => msg.role === "user").pop();
    if (lastUserMessage) {
      const response = await this.provider.sendMessage(lastUserMessage.content);
      return { content: response, tool_calls: [] };
    }
    
    throw new Error("No user message found for function calling fallback");
  }

  /**
   * Send a conversation to the model
   * @param {Array} conversation - The conversation history
   * @param {Object} options - Additional options for the API call
   * @returns {Promise<string|Object>} - The model's response
   */
  async sendConversation(conversation, options = {}) {
    // Check if this is a tool-equipped message for a Mistral/Nemo model
    const isMistralModel = this.modelName && 
      (this.modelName.toLowerCase().includes('mistral') ||
       this.modelName.toLowerCase().includes('nemo'));
    
    // If this has tools and is for a Mistral model, use the function calling method
    if (options.tools && isMistralModel) {
      console.log("Using function calling method for Mistral model with tools");
      return await this.sendFunctionCallingMessage(
        conversation,
        options.tools,
        {
          tool_choice: options.tool_choice || "auto",
          temperature: options.temperature || 0.25 // Keep temperature low for better tool use
        }
      );
    }
    
    // For normal conversation without tools, or non-Mistral models
    console.log("Using normal sendMessage for conversation");
    
    // Find the last user message
    const lastUserMessage = conversation.filter(msg => msg.role === "user").pop();
    
    if (lastUserMessage) {
      // Use the provider's conversation handling if available
      if (this.provider.sendConversation) {
        return await this.provider.sendConversation(conversation, options);
      }
      
      // Set the entire conversation history in the provider
      if (conversation.length > 0) {
        this.provider.clearConversation();
        this.provider.conversation = [...conversation];
      }
      
      // Send just the last user message (provider will have the history)
      return await this.provider.sendMessage(lastUserMessage.content);
    }
    
    throw new Error("No user message found in conversation");
  }

  clearConversation() {
    this.provider.clearConversation();
  }
}

export default AgentsAPI;
export { AIProviderFactory };