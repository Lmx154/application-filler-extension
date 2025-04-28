/**
 * form-filling-tools.js
 * A tool-based agent system for form filling with models of any size
 */

/**
 * Collection of tools that AI models can use to interact with resume data and form fields
 */
class FormFillingTools {
  /**
   * Initialize the form filling tools system with Mistral-specific setup
   * @param {Object} apiProvider - The AI provider instance from agents-api.js
   * @param {string} resumeContent - The parsed resume content
   * @param {Array} formFields - Array of form fields to fill
   * @param {Function} [onProgressUpdate] - Optional callback for progress updates
   */
  constructor(apiProvider, resumeContent, formFields, onProgressUpdate = null) {
    this.apiProvider = apiProvider;
    this.resumeContent = resumeContent;
    this.formFields = formFields;
    this.onProgressUpdate = onProgressUpdate;
    
    // State tracking
    this.currentFieldIndex = 0;
    this.completedFields = [];
    this.currentState = 'initial';
    this.completionStatus = 0;
    
    // Resume analysis cache
    this.resumeAnalysis = null;
    
    // Detect if using a Mistral model by checking either modelName or model property
    const modelId = (this.apiProvider.modelName || this.apiProvider.model || '').toLowerCase();
    this.isMistralModel = /mistral|nemo/.test(modelId);
    
    // Configure Mistral-specific options if using Mistral
    if (this.isMistralModel) {
      this.useMistralFunctionCalling = true;
      // Create the tools list once and reuse it
      this.mistralTools = this.generateMistralToolDefinitions();
      console.log("Detected Mistral model, enabling Mistral function calling");
    }
  }
  
  /**
   * Helper to always call the function-calling endpoint for Mistral/Nemo models
   * @param {Array} conversation - The conversation history
   * @returns {Promise<Object>} - The model's response
   */
  async callModel(conversation) {
    return await this.apiProvider.sendFunctionCallingMessage(
      conversation,
      this.generateMistralToolDefinitions(),
      { tool_choice: "auto", temperature: 0.25 }
    );
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
      
      // ──► 1. append IMPORTANT-line only once
      const importantLine = 'IMPORTANT: You MUST use the tools provided to complete your task.';
      let hasSystem = false;
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'system') {
          hasSystem = true;
          if (!messages[i].content.includes(importantLine)) {
            messages[i].content += "\n\n" + importantLine;
          }
          break;
        }
      }
      if (!hasSystem) {
        messages.unshift({ role: 'system', content: importantLine });
      }
      
      // CRITICAL: Ensure all required parameters are included for function calling
      const requestBody = {
        model: this.model,
        messages: messages,
        tools: tools,                       // Required: tool definitions array
        tool_choice: options.tool_choice || "auto",  // Required: auto or required 
        options: {
          temperature: options.temperature ?? 0.25,   // Lower temperature for more reliable tool use
          top_p: options.top_p ?? 0.95
        },
        stream: false
      };
      
      console.log("Sending Mistral function call request:", JSON.stringify(requestBody, null, 2).substring(0, 500) + "...");
    } catch (error) {
      console.error("Error sending function calling message:", error);
      throw error;
    }
  }

  /**
   * Generate a system message with available tools and current state
   * @returns {string} The system message
   */
  generateSystemMessage() {
    const baseMessage = `You are a form-filling assistant with access to the following tools:

1. analyze_resume() - Analyzes the resume to extract key information
2. get_resume_section(section_name) - Gets a specific section from the resume (e.g., "education", "experience", "skills")
3. get_next_field() - Gets the next field to fill out in the form
4. check_field(field_id) - Gets details about a specific field
5. fill_field(field_id, value, confidence) - Fills a field with a value and confidence rating
6. list_fields() - Lists all fields in the form
7. search_resume(query) - Searches the resume for specific information
8. save_progress() - Saves current progress and returns a summary

Current state: ${this.currentState}
Fields completed: ${this.completedFields.length}/${this.formFields.length}`;

    // For Mistral models, use simpler tool calling instructions with no JS syntax
    if (this.isMistralModel) {
      return baseMessage + `\n\nFollow these steps REPEATEDLY:
1. Call get_next_field to get the field_id and details of the next form field.
2. Based on the field details, decide what information is needed from the resume.
3. Use analyze_resume or search_resume to find the required information.
4. Call fill_field with the field_id from step 1, the value from step 3, and a confidence rating.
5. If get_next_field indicates no fields remain, stop.`;
    }

    return baseMessage + `\n\nFollow these steps REPEATEDLY:
1. Call \`get_next_field()\` to get the \`field_id\` and details of the next form field.
2. Based on the field details, decide what information is needed (e.g., 'full name', 'email', 'job title').
3. Use \`analyze_resume()\` or \`search_resume(query='...')\` to find the required information in the resume content.
4. Call \`fill_field(field_id='THE_EXACT_ID_FROM_STEP_1', value='THE_VALUE_FROM_STEP_3', confidence='...')\`. **CRITICAL: Use the exact \`field_id\` you received from \`get_next_field()\` in step 1.**
5. If \`get_next_field()\` indicates no fields remain, stop.

**IMPORTANT:**
- **ALWAYS use the \`field_id\` provided by \`get_next_field()\` when calling \`fill_field()\`.**
- Do NOT invent field IDs.
- Do NOT ask the user for information; use the tools to find it in the resume.`;
  }

  /**
   * Generate the initial prompt to start the form filling process
   * @returns {string} The initial prompt
   */
  generateInitialPrompt() {
    // For Mistral models, use much simpler instructions with no JS syntax
    if (this.isMistralModel) {
      return `I need you to fill out a form using information from a resume. There are ${this.formFields.length} fields to fill.

Start by calling get_next_field to get the first field that needs to be filled.`;
    }

    // For other models
    return `I need you to fill out a form using information from a resume. There are ${this.formFields.length} fields to fill.

You have tools available to:
1. Analyze the resume
2. Get specific resume sections
3. Get form fields to fill
4. Fill fields with values

First, analyze the resume to understand the candidate's background, then proceed to fill form fields one by one. Use the get_next_field() tool to start.`;
  }
  
  /**
   * Run the form filling agent with tool-based approach
   * @returns {Promise<Object>} The results of the form filling process
   */
  async runToolBasedAgent() {
    try {
      // Start with initial message to kick off the process
      const initialPrompt = this.generateInitialPrompt();
      const systemMessage = this.generateSystemMessage();
      
      // Store the conversation history
      const conversation = [
        { role: "system", content: systemMessage },
        { role: "user", content: initialPrompt }
      ];
      
      let response;
      if (this.useMistralFunctionCalling) {
        response = await this.callModel(conversation);
      } else {
        response = await this.sendMessage(conversation);
      }
      
      // Process the response and continue the conversation as needed
      return await this.handleAgentResponse(response, conversation);
    } catch (error) {
      console.error("Error running form filling agent:", error);
      return {
        fields: this.completedFields,
        summary: "Error running form filling agent: " + error.message,
        error: true
      };
    }
  }
  
  /**
   * Generate tool definitions in Mistral format
   * @returns {Array} Array of tool definitions
   */
  generateMistralToolDefinitions() {
    return [
      {
        "type": "function",
        "function": {
          "name": "analyze_resume",
          "description": "Analyzes the resume to extract key information",
          "parameters": {
            "type": "object",
            "properties": {},
            "required": []
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "get_resume_section",
          "description": "Gets a specific section from the resume",
          "parameters": {
            "type": "object",
            "properties": {
              "section_name": {
                "type": "string",
                "description": "The section to retrieve (e.g., 'education', 'experience', 'skills')"
              }
            },
            "required": ["section_name"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "get_next_field",
          "description": "Gets the next field to fill out in the form",
          "parameters": {
            "type": "object",
            "properties": {},
            "required": []
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "check_field",
          "description": "Gets details about a specific field",
          "parameters": {
            "type": "object",
            "properties": {
              "field_id": {
                "type": "string",
                "description": "The ID of the field to check"
              }
            },
            "required": ["field_id"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "fill_field",
          "description": "Fills a field with a value and confidence rating",
          "parameters": {
            "type": "object",
            "properties": {
              "field_id": {
                "type": "string",
                "description": "The ID of the field to fill"
              },
              "value": {
                "type": "string",
                "description": "The value to fill the field with"
              },
              "confidence": {
                "type": "string",
                "description": "High, Medium, or Low confidence",
                "enum": ["High", "Medium", "Low"]
              }
            },
            "required": ["field_id", "value"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "list_fields",
          "description": "Lists all fields in the form",
          "parameters": {
            "type": "object",
            "properties": {},
            "required": []
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "search_resume",
          "description": "Searches the resume for specific information",
          "parameters": {
            "type": "object",
            "properties": {
              "query": {
                "type": "string",
                "description": "The search query"
              }
            },
            "required": ["query"]
          }
        }
      },
      {
        "type": "function",
        "function": {
          "name": "save_progress",
          "description": "Saves current progress and returns a summary",
          "parameters": {
            "type": "object",
            "properties": {},
            "required": []
          }
        }
      }
    ];
  }
  
  /**
   * Send a message using the API provider
   * @param {Array} conversation - The conversation history
   * @returns {Promise<string>} The model's response
   */
  async sendMessage(conversation) {
    try {
      // Make sure we're maintaining the system message in all API calls
      if (!conversation.some(msg => msg.role === "system")) {
        // Add a default system message if none exists
        conversation.unshift({ 
          role: "system", 
          content: this.generateSystemMessage() 
        });
      }
      
      // CRITICAL: Always include tools and required parameters for Mistral models
      if (this.useMistralFunctionCalling && this.mistralTools) {
        const options = { 
          tools: this.mistralTools,    // Always include tools array
          tool_choice: "auto",         // Required - let model decide when to use tools
          temperature: 0.25            // Lower temperature for more reliable tool use
        };
        
        // If we have a sendFunctionCallingMessage method, use it
        if (this.apiProvider.sendFunctionCallingMessage) {
          console.log("Sending message with Mistral function calling format");
          return await this.apiProvider.sendFunctionCallingMessage(
            conversation, 
            this.mistralTools, 
            options
          );
        } 
        // Otherwise use sendConversation with tools parameter
        else if (this.apiProvider.sendConversation) {
          console.log("Sending conversation with tools parameter");
          return await this.apiProvider.sendConversation(conversation, options);
        }
      }
      
      // For non-Mistral models or when tools aren't defined
      if (this.apiProvider.sendConversation) {
        return await this.apiProvider.sendConversation(conversation);
      }
      
      // Last resort - send just the last message
      const lastUserMessage = conversation.filter(msg => msg.role === "user").pop();
      if (lastUserMessage) {
        return await this.apiProvider.sendMessage(lastUserMessage.content);
      }
      
      throw new Error("No user message found in conversation");
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  }
  
  /**
   * Extract tool calls from the agent's response
   * @param {string|Object} response - The agent's response (string or object with tool_calls)
   * @returns {Array} Array of tool calls
   */
  extractToolCalls(response) {
    // If the response is an object with tool_calls (Mistral format)
    if (typeof response === 'object' && response.tool_calls) {
      console.log("Detected native Mistral function calling format");
      const toolCalls = [];
      
      for (const toolCall of response.tool_calls) {
        if (toolCall.function && toolCall.function.name) {
          const tool = toolCall.function.name;
          
          // Parse the arguments - handle both string and object formats
          const rawArgs = toolCall.function.arguments ?? {};
          let args = {};
          
          if (typeof rawArgs === 'string') {
            try {
              args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
            } catch (e) {
              console.error("Error parsing Mistral tool arguments as string", e, rawArgs);
            }
          } else if (typeof rawArgs === 'object') {
            args = rawArgs; // Already parsed, just use it directly
          }
          
          toolCalls.push({ 
            id: toolCall.id,  // Keep the id for proper tool reply chaining
            tool, 
            args 
          });
        }
      }
      
      return toolCalls;
    }
    
    // If the response is a string (fallback to text parsing)
    if (typeof response === 'string') {
      const toolCalls = [];
      
      // Try to parse pure JSON action format (Mistral Nemo alternate format)
      try {
        // Check if response has a JSON object with an "action" field
        const jsonMatch = response.match(/{[\s\S]*?"action"[\s]*:[\s]*"([^"]+)"[\s\S]*?}/);
        if (jsonMatch) {
          const actionJson = jsonMatch[0];
          const parsedAction = JSON.parse(actionJson);
          
          if (parsedAction && parsedAction.action) {
            const toolName = parsedAction.action;
            const validTools = [
              "analyze_resume", "get_resume_section", "get_next_field", 
              "check_field", "fill_field", "list_fields", 
              "search_resume", "save_progress"
            ];
            
            if (validTools.includes(toolName)) {
              // Extract arguments from the JSON, excluding the action itself
              const args = { ...parsedAction };
              delete args.action;
              
              // Add to tool calls with a generated id
              toolCalls.push({ 
                id: `auto_${Math.random().toString(36).substring(2, 10)}`,
                tool: toolName, 
                args 
              });
              console.log(`Detected JSON action format: ${toolName}`, args);
              
              // Return early since we found a valid JSON action
              return toolCalls;
            }
          }
        }
      } catch (e) {
        console.log("Failed to parse JSON action format", e);
        // Continue with other formats if JSON parsing fails
      }
      
      // HACK: Check for mistral-style tool blocks
      const mistralToolPattern = /Tool:\s+([a-zA-Z_\\]+)(?:\s+Parameters:)?\s*(?:{[^}]+})?/g;
      let mistralMatches = response.matchAll(mistralToolPattern);
      
      for (const match of Array.from(mistralMatches)) {
        const toolName = match[1].trim().replace('\\', '');
        const validTools = [
          "analyze_resume", "get_resume_section", "get_next_field", 
          "check_field", "fill_field", "list_fields", 
          "search_resume", "save_progress"
        ];
        
        if (validTools.includes(toolName)) {
          // Try to find parameters in the next 200 chars after the tool name
          const startIndex = match.index + match[0].length;
          const nextSection = response.substring(startIndex, startIndex + 200);
          
          // Look for JSON-like parameters
          let args = {};
          const paramMatch = nextSection.match(/Parameters:\s*({[^}]+})/);
          if (paramMatch) {
            try {
              args = JSON.parse(paramMatch[1]);
            } catch (e) {
              // If JSON parse fails, try simpler extraction for key-value pairs
              const paramPairs = paramMatch[1].match(/\"([^\"]+)\":\s*\"([^\"]+)\"/g) || [];
              paramPairs.forEach(pair => {
                const [key, value] = pair.split(':').map(s => s.trim().replace(/\"/g, ''));
                if (key && value) args[key] = value;
              });
            }
          }
          
          // Extract query parameter for search_resume from plain text if not found in JSON
          if (toolName === 'search_resume' && !args.query) {
            const queryMatch = nextSection.match(/query[: "']+(.*?)["']/i);
            if (queryMatch) args.query = queryMatch[1];
          }
          
          // For field_id with fill_field
          if (toolName === 'fill_field' && !args.field_id) {
            // Look for field_id in the surrounding text
            const fieldIdMatch = nextSection.match(/field_id[: "']+(application-[^"']+)["']/i);
            if (fieldIdMatch) {
              args.field_id = fieldIdMatch[1];
              
              // Also try to find value
              const valueMatch = nextSection.match(/value[: "']+(.*?)["']/i);
              if (valueMatch) args.value = valueMatch[1];
              
              // And confidence
              const confidenceMatch = nextSection.match(/confidence[: "']+(.*?)["']/i);
              if (confidenceMatch) args.confidence = confidenceMatch[1];
            }
          }
          
          // Add to tool calls
          toolCalls.push({ tool: toolName, args });
        }
      }
      
      // Standard parsing - match direct tool calls: tool_name(args)
      if (toolCalls.length === 0) {
        const directCallPattern = /([a-zA-Z_]+)\(([^)]*)\)/g;
        let matches = response.matchAll(directCallPattern);
        
        for (const match of Array.from(matches)) {
          const tool = match[1].trim();
          const argsStr = match[2].trim();
          const args = this.parseArgs(tool, argsStr);
          
          if (args !== null) {
            toolCalls.push({ tool, args });
          }
        }

        // Match tool calls within code blocks: ```python\n...tool_name(args)...\n```
        const codeBlockPattern = /```(?:python|javascript)?\s*([\s\S]*?)\s*```/g;
        matches = response.matchAll(codeBlockPattern);

        for (const codeBlockMatch of Array.from(matches)) {
          const codeContent = codeBlockMatch[1];
          // Find tool calls within the code block content
          const innerCallPattern = /([a-zA-Z_]+)\(([^)]*)\)/g;
          const innerMatches = codeContent.matchAll(innerCallPattern);
          for (const match of Array.from(innerMatches)) {
            const tool = match[1].trim();
            const argsStr = match[2].trim();
            const args = this.parseArgs(tool, argsStr);
            
            if (args !== null && !toolCalls.some(tc => tc.tool === tool && JSON.stringify(tc.args) === JSON.stringify(args))) {
              toolCalls.push({ tool, args });
            }
          }
        }
      }
      
      // If still no tool calls found, let's look for structured blocks that might indicate tool usage
      if (toolCalls.length === 0) {
        // Look for "Next field:" followed by "Tool: get_next_field"
        if (response.includes("Next field:") && response.includes("get_next_field")) {
          toolCalls.push({ tool: "get_next_field", args: {} });
        }
        
        // Look for field ID and value patterns that might indicate fill_field intent
        const fieldPattern = /ID:\s*(application-[^\n]+)\n-\s*Value:\s*([^\n]+)/i;
        const fieldMatch = response.match(fieldPattern);
        if (fieldMatch) {
          const fieldId = fieldMatch[1];
          const value = fieldMatch[2];
          
          // Look for confidence
          const confidencePattern = /Confidence:\s*(\w+)/i;
          const confidenceMatch = response.match(confidencePattern);
          const confidence = confidenceMatch ? confidenceMatch[1] : "Medium";
          
          toolCalls.push({ 
            tool: "fill_field", 
            args: { field_id, value, confidence } 
          });
        }
      }
      
      return toolCalls;
    }
    
    // If no tool calls were found, return empty array
    return [];
  }

  /**
   * Parse arguments from a tool call string
   * @param {string} tool - The tool name
   * @param {string} argsStr - The arguments string
   * @returns {Object} Parsed arguments
   */
  parseArgs(tool, argsStr) {
    // Skip invalid tools
    const validTools = [
      "analyze_resume", "get_resume_section", "get_next_field", 
      "check_field", "fill_field", "list_fields", 
      "search_resume", "save_progress"
    ];
    
    if (!validTools.includes(tool)) {
      return null;
    }
    
    try {
      // Try to parse as JSON first
      if (argsStr.trim().startsWith('{') && argsStr.trim().endsWith('}')) {
        return JSON.parse(argsStr);
      }
      
      // Different tools have different expected arguments
      switch (tool) {
        case 'analyze_resume':
          return {}; // No arguments needed
        
        case 'get_resume_section': 
          return { section_name: argsStr.replace(/['"]/g, '') }; // Clean quotes
        
        case 'get_next_field':
          return {}; // No arguments needed
        
        case 'check_field':
          return { field_id: argsStr.replace(/['"]/g, '') }; // Clean quotes
        
        case 'fill_field': {
          // Handle various formats for fill_field arguments
          if (argsStr.includes(',')) {
            // If comma separated, split by commas respecting quotes
            const parts = splitCsvRespectingQuotes(argsStr);
            if (parts.length >= 2) {
              return {
                field_id: parts[0],
                value: parts[1],
                confidence: parts[2] || 'Medium'
              };
            }
          } 
          
          // Try to detect key=value pattern
          const keyValuePairs = argsStr.match(/(\w+)\s*=\s*["']([^"']+)["']/g);
          if (keyValuePairs) {
            const args = {};
            keyValuePairs.forEach(pair => {
              const [key, value] = pair.split('=').map(s => s.trim().replace(/^["']|["']$/g, ''));
              args[key] = value;
            });
            return args;
          }
          
          // If all else fails, try to parse as positional arguments
          return {
            field_id: 'unknown',
            value: argsStr.replace(/^["']|["']$/g, ''), 
            confidence: 'Low'
          };
        }
        
        case 'list_fields':
          return {}; // No arguments needed
        
        case 'search_resume': {
          // Handle various formats for search_resume
          if (argsStr.includes('query') || argsStr.includes('=')) {
            const queryMatch = argsStr.match(/query\s*=\s*["']([^"']+)["']/);
            if (queryMatch) {
              return { query: queryMatch[1] };
            }
          }
          return { query: argsStr.replace(/^["']|["']$/g, '') }; // Clean quotes
        }
        
        case 'save_progress':
          return {}; // No arguments needed
        
        default:
          return {}; 
      }
    } catch (e) {
      console.error(`Error parsing arguments for ${tool}: ${e.message}`);
      return {};
    }
  }

  /**
   * Handle the agent's response and execute any tool calls
   * @param {string|Object} response - The agent's response
   * @param {Array} conversation - The conversation history
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Results of the form filling process
   */
  async handleAgentResponse(response, conversation, options = {}) {
    try {
      // Initialize tracking variables
      const maxAttempts = options.maxAttempts || 15; // Max attempts per field
      const maxConsecutiveErrors = options.maxConsecutiveErrors || 5; // Max consecutive errors
      const maxRunTime = options.maxRunTime || 5 * 60 * 1000; // 5 minutes max runtime
      
      // Setup timeout for max runtime
      const startTime = Date.now();
      let consecutiveErrorCount = 0;
      let attemptCount = 0;
      const fieldAttempts = new Map(); // Track attempts per field
      const completedFields = new Map(); // Track completed fields
      
      // Store current message for retry purposes
      let currentResponse = response;
      
      // Handle each tool call until done or max attempts reached
      while (attemptCount < maxAttempts) {
        // Check if max runtime exceeded
        if (Date.now() - startTime > maxRunTime) {
          console.warn(`Max runtime (${maxRunTime}ms) exceeded. Terminating form filling.`);
          break;
        }
        
        // Extract tool calls from response
        const toolCalls = this.extractToolCalls(currentResponse);
        
        // If no tool calls found, just add the response to conversation and stop
        if (!toolCalls || toolCalls.length === 0) {
          console.log("No tool calls found in response");
          conversation.push({ role: "assistant", content: typeof currentResponse === 'object' ? 
                            (currentResponse.content || JSON.stringify(currentResponse)) : 
                            currentResponse });
          break;
        }
        
        // Process each tool call
        for (const toolCall of toolCalls) {
          // Increment attempt counter
          attemptCount++;
          
          try {
            // Execute the tool
            const toolResult = await this.executeTool(toolCall.tool, toolCall.args || {});
            
            // If filling a field, track completion
            if (toolCall.tool === 'fill_field' && toolCall.args && toolCall.args.field_id) {
              const fieldId = toolCall.args.field_id;
              const value = toolCall.args.value;
              const confidence = toolCall.args.confidence || 'Medium';
              
              // Add to completed fields
              completedFields.set(fieldId, { 
                id: fieldId, 
                value, 
                confidence 
              });
              
              // Update progress
              this.completionStatus = Math.round((completedFields.size / this.formFields.length) * 100);
              if (this.onProgressUpdate) {
                this.onProgressUpdate(this.completionStatus);
              }
            }
            
            // If we got a get_next_field and no fields remain, we're done
            if (toolCall.tool === 'get_next_field' && 
                toolResult && 
                typeof toolResult === 'object' &&
                toolResult.remaining === 0) {
              console.log("All fields filled. Form filling complete.");
              break;
            }
            
            // ──► 2. Echo assistant function-call WITH empty content field
            conversation.push({
              role: "assistant",
              content: '',              // ★ REQUIRED for Mistral
              tool_calls: [{
                id: toolCall.id || `call_${Math.random().toString(36).substring(2, 10)}`,
                type: "function",
                function: {
                  name: toolCall.tool,
                  arguments: toolCall.args || {}  // Keep as object, don't stringify
                }
              }]
            });
            
            // Add the tool result with proper format
            conversation.push({
              role: "tool",
              tool_call_id: toolCall.id || conversation[conversation.length-1].tool_calls[0].id,
              content: JSON.stringify(toolResult)
            });
            
            // Reset consecutive error counter after successful tool execution
            consecutiveErrorCount = 0;
          } catch (error) {
            console.error(`Error executing tool ${toolCall.tool}:`, error);
            
            // Track field-specific failures for fill_field
            if (toolCall.tool === 'fill_field' && toolCall.args && toolCall.args.field_id) {
              const fieldId = toolCall.args.field_id;
              fieldAttempts.set(fieldId, (fieldAttempts.get(fieldId) || 0) + 1);
              
              // If too many attempts on this field, skip it
              if (fieldAttempts.get(fieldId) >= 3) {
                console.warn(`Skipping field ${fieldId} after ${fieldAttempts.get(fieldId)} failed attempts`);
                // Still use proper assistant/tool format for error handling
                // Add error message as assistant content
                conversation.push({
                  role: "assistant",
                  content: `Error filling field "${fieldId}" after multiple attempts.`
                });
              } else {
                // Add error message as assistant content
                conversation.push({
                  role: "assistant",
                  content: `Error when using ${toolCall.tool}: ${error.message}.`
                });
              }
            } else {
              // Add error message as assistant content for non-fill_field tools
              conversation.push({
                role: "assistant",
                content: `Error when using ${toolCall.tool}: ${error.message}.`
              });
            }
            
            // Increment consecutive error counter
            consecutiveErrorCount++;
            
            // If too many consecutive errors, abort
            if (consecutiveErrorCount >= maxConsecutiveErrors) {
              console.warn(`${maxConsecutiveErrors} consecutive errors reached. Aborting form filling.`);
              break;
            }
          }
        }
        
        // Get next agent response
        try {
          if (this.useMistralFunctionCalling) {
            currentResponse = await this.callModel(conversation);
          } else {
            currentResponse = await this.sendMessage(conversation);
          }
        } catch (error) {
          console.error("Error getting agent response:", error);
          break;
        }
      }
      
      // Return the final results
      return {
        fields: Array.from(completedFields.values()),
        summary: `Form filling ${completedFields.size >= this.formFields.length ? 'complete' : 'partially complete'}. Filled ${completedFields.size}/${this.formFields.length} fields.`,
        error: false
      };
    } catch (error) {
      console.error("Error in handleAgentResponse:", error);
      return {
        fields: [],
        summary: `Error handling agent response: ${error.message}`,
        error: true
      };
    }
  }

  /**
   * Execute a tool based on name and arguments
   * @param {string} tool - The name of the tool to execute
   * @param {Object} args - The arguments for the tool
   * @returns {Promise<any>} The result of the tool execution
   */
  async executeTool(tool, args) {
    console.log(`Executing tool: ${tool} with args:`, args);
    
    try {
      switch (tool) {
        case 'analyze_resume':
          return await this.analyzeResume();
        
        case 'get_resume_section':
          return await this.getResumeSection(args.section_name);
        
        case 'get_next_field':
          return await this.getNextField();
        
        case 'check_field':
          return await this.checkField(args.field_id);
        
        case 'fill_field':
          return await this.fillField(args.field_id, args.value, args.confidence);
        
        case 'list_fields':
          return await this.listFields();
        
        case 'search_resume':
          return await this.searchResume(args.query);
        
        case 'save_progress':
          return await this.saveProgress();
        
        default:
          throw new Error(`Unknown tool: ${tool}`);
      }
    } catch (error) {
      console.error(`Error executing tool ${tool}:`, error);
      throw error;
    }
  }

  /**
   * Analyze the resume to extract key information
   * @returns {Promise<Object>} The analysis results
   */
  async analyzeResume() {
    // Use in-memory cache if already analyzed
    if (this.resumeAnalysis) {
      return this.resumeAnalysis;
    }
    
    // Simulate analysis - in a real implementation, this would use an AI model to analyze the resume
    try {
      // Simple regex-based extraction
      const nameMatch = this.resumeContent.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)+)/m);
      const emailMatch = this.resumeContent.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
      const phoneMatch = this.resumeContent.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      const locationMatch = this.resumeContent.match(/, ([A-Z]{2})\b/);
      const educationMatch = this.resumeContent.match(/Bachelor|Master|PhD|Associate/i);
      
      // Extract simple data
      const analysis = {
        name: nameMatch ? nameMatch[0] : null,
        email: emailMatch ? emailMatch[0] : null,
        phone: phoneMatch ? phoneMatch[0] : null,
        location: locationMatch ? locationMatch[1] : null,
        education: educationMatch ? educationMatch[0] : null,
      };
      
      // Cache the results
      this.resumeAnalysis = analysis;
      
      return analysis;
    } catch (error) {
      console.error("Error analyzing resume:", error);
      return { error: "Failed to analyze resume: " + error.message };
    }
  }

  /**
   * Get a specific section from the resume
   * @param {string} sectionName - The name of the section to retrieve
   * @returns {Promise<Object>} The section content
   */
  async getResumeSection(sectionName) {
    try {
      // Convert section name to lowercase for case-insensitive matching
      const section = sectionName.toLowerCase();
      
      // Find sections in the resume using heuristics - this is simplified
      // In a real implementation, we would use more sophisticated NLP to identify sections
      let result = null;
      
      // Simple regex for common sections
      const sectionMap = {
        'education': /Education[\s\S]*?(?=Experience|\n\s*\n)/i,
        'experience': /Experience[\s\S]*?(?=Projects|Skills|\n\s*\n)/i,
        'skills': /Skills[\s\S]*?(?=\n\s*\n|$)/i,
        'projects': /Projects[\s\S]*?(?=Skills|Organizations|\n\s*\n)/i,
        'contact': /^[\s\S]*?(?=Education|Experience|\n\s*\n)/i
      };
      
      // Try to match the requested section
      if (section in sectionMap) {
        const match = this.resumeContent.match(sectionMap[section]);
        result = match ? match[0] : "Section not found";
      } else {
        result = "Unknown section: " + sectionName;
      }
      
      return { section: sectionName, content: result };
    } catch (error) {
      console.error(`Error getting resume section '${sectionName}':`, error);
      return { error: `Failed to get section '${sectionName}': ${error.message}` };
    }
  }

  /**
   * Get the next field to fill
   * @returns {Promise<Object>} The next field to fill
   */
  async getNextField() {
    try {
      // If we've filled all fields, return null
      if (this.currentFieldIndex >= this.formFields.length) {
        return { 
          message: "All fields have been processed.", 
          remaining: 0 
        };
      }
      
      // Get the current field
      const field = this.formFields[this.currentFieldIndex];
      
      // Increment field index for next time
      this.currentFieldIndex++;
      
      // Return field information
      return {
        field_id: field.id,
        label: field.label || field.id,
        type: field.type,
        required: field.required || false,
        field_index: this.currentFieldIndex - 1,
        remaining: this.formFields.length - this.currentFieldIndex
      };
    } catch (error) {
      console.error("Error getting next field:", error);
      return { error: "Failed to get next field: " + error.message };
    }
  }

  /**
   * Check a specific field
   * @param {string} fieldId - The ID of the field to check
   * @returns {Promise<Object>} The field details
   */
  async checkField(fieldId) {
    try {
      // Find the field with the given ID
      const field = this.formFields.find(f => f.id === fieldId);
      
      if (!field) {
        return { error: `Field with ID "${fieldId}" not found.` };
      }
      
      return {
        field_id: field.id,
        label: field.label || field.id,
        type: field.type,
        required: field.required || false,
        autocomplete: field.autocomplete || null
      };
    } catch (error) {
      console.error(`Error checking field '${fieldId}':`, error);
      return { error: `Failed to check field '${fieldId}': ${error.message}` };
    }
  }

  /**
   * Fill a field with a value
   * @param {string} fieldId - The ID of the field to fill
   * @param {string} value - The value to fill the field with
   * @param {string} confidence - The confidence level (High/Medium/Low)
   * @returns {Promise<Object>} The result of the fill operation
   */
  async fillField(fieldId, value, confidence = 'Medium') {
    try {
      // Find the field with the given ID
      const field = this.formFields.find(f => f.id === fieldId);
      
      if (!field) {
        return { error: `Field with ID "${fieldId}" not found.` };
      }
      
      // Add field to completed fields
      this.completedFields.push({
        id: fieldId,
        value,
        confidence: confidence || 'Medium'
      });
      
      // Update completion status
      this.completionStatus = Math.round((this.completedFields.length / this.formFields.length) * 100);
      
      // Call progress callback if provided
      if (this.onProgressUpdate) {
        this.onProgressUpdate(this.completionStatus);
      }
      
      return { 
        field_id: fieldId, 
        value, 
        confidence,
        status: "filled",
        message: `Field '${fieldId}' filled with value '${value}'`
      };
    } catch (error) {
      console.error(`Error filling field '${fieldId}':`, error);
      return { error: `Failed to fill field '${fieldId}': ${error.message}` };
    }
  }

  /**
   * List all fields in the form
   * @returns {Promise<Object>} List of all fields
   */
  async listFields() {
    try {
      const fields = this.formFields.map(field => ({
        field_id: field.id,
        label: field.label || field.id,
        type: field.type,
        required: field.required || false
      }));
      
      return { 
        fields,
        total: fields.length,
        completed: this.completedFields.length,
        remaining: fields.length - this.completedFields.length
      };
    } catch (error) {
      console.error("Error listing fields:", error);
      return { error: "Failed to list fields: " + error.message };
    }
  }

  /**
   * Search the resume for specific information
   * @param {string} query - The search query
   * @returns {Promise<Object>} The search results
   */
  async searchResume(query) {
    try {
      // Simple text search - in a real implementation, this would be more sophisticated
      const regex = new RegExp(query, 'i');
      const matches = [];
      
      // Split resume into lines for context
      const lines = this.resumeContent.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          // Get a bit of context (lines before and after)
          const startIdx = Math.max(0, i - 2);
          const endIdx = Math.min(lines.length - 1, i + 2);
          const contextLines = lines.slice(startIdx, endIdx + 1);
          
          matches.push({
            text: contextLines.join('\n'),
            confidence: 'Medium' // Simple implementation, always Medium confidence
          });
        }
      }
      
      // If no direct matches, look for related terms
      if (matches.length === 0) {
        const relatedTerms = getRelatedTerms(query);
        for (const term of relatedTerms) {
          const termRegex = new RegExp(term, 'i');
          for (let i = 0; i < lines.length; i++) {
            if (termRegex.test(lines[i])) {
              matches.push({
                text: lines[i],
                confidence: 'Low' // Lower confidence for related terms
              });
              break; // Just get the first match for each related term
            }
          }
        }
      }
      
      return { 
        query, 
        matches: matches.length > 0 ? matches : [{ text: "No matches found", confidence: "Low" }]
      };
    } catch (error) {
      console.error(`Error searching resume for '${query}':`, error);
      return { error: `Failed to search resume for '${query}': ${error.message}` };
    }
  }

  /**
   * Save current progress and return a summary
   * @returns {Promise<Object>} Summary of the current progress
   */
  async saveProgress() {
    try {
      return {
        total_fields: this.formFields.length,
        completed_fields: this.completedFields.length,
        completion_percentage: this.completionStatus,
        fields: this.completedFields
      };
    } catch (error) {
      console.error("Error saving progress:", error);
      return { error: "Failed to save progress: " + error.message };
    }
  }
}

/**
 * Safely split CSV values respecting quoted strings
 * @param {string} s - The string to split
 * @returns {Array<string>} - Array of trimmed values
 */
function splitCsvRespectingQuotes(s) {
  const re = /"([^"]*(?:""[^"]*)*)"|([^,]+)/g;
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1] !== undefined ? m[1].replace(/""/g, '"') : m[2]);
  }
  return out.map(t => t.trim());
}

/**
 * Get a friendly description of what a tool does
 * @param {string} toolName - The name of the tool
 * @returns {string} A description of the tool
 */
function getToolDescription(toolName) {
  const descriptions = {
    'analyze_resume': 'analyze the resume',
    'get_resume_section': 'extract a specific section from the resume',
    'get_next_field': 'get the next form field to fill out',
    'check_field': 'check details about a specific field',
    'fill_field': 'fill a form field with a value',
    'list_fields': 'list all available form fields',
    'search_resume': 'search for specific information in the resume',
    'save_progress': 'save progress and get a summary'
  };
  
  return descriptions[toolName] || `use the ${toolName} tool`;
}

/**
 * Get related terms for a search query
 * @param {string} query - The original search query
 * @returns {Array} Array of related terms
 */
function getRelatedTerms(query) {
  // Simple mapping of some common terms to related terms
  const relatedTermsMap = {
    'name': ['full name', 'first name', 'last name'],
    'email': ['e-mail', 'contact', 'electronic mail'],
    'phone': ['telephone', 'cell', 'mobile', 'contact number'],
    'address': ['location', 'residence', 'mailing address', 'city', 'state', 'zip'],
    'education': ['degree', 'university', 'college', 'school', 'academic', 'qualification'],
    'experience': ['work', 'job', 'employment', 'career', 'professional'],
    'skills': ['abilities', 'competencies', 'expertise', 'proficiencies', 'qualifications'],
    'projects': ['works', 'assignments', 'portfolio']
  };
  
  // Check if the query matches any key
  for (const [key, relatedTerms] of Object.entries(relatedTermsMap)) {
    if (query.toLowerCase().includes(key)) {
      return relatedTerms;
    }
  }
  
  // If no direct match, return some basic variations
  return [
    query + 's', // Pluralize
    query.replace(/s$/, ''), // Singularize
    query.toLowerCase(),
    query.toUpperCase()
  ];
}

/**
 * Run a form filling process with tool-based agent approach
 * @param {Object} apiProvider - The AI provider from agents-api.js
 * @param {string} resumeContent - The resume content
 * @param {Array} formFields - The form fields to fill
 * @param {Object} options - Options for the form filling process
 * @returns {Promise<Object>} - The results of form filling
 */
export async function fillFormWithTools(apiProvider, resumeContent, formFields, options = {}) {
  try {
    console.log("Starting tool-based form filling with", formFields.length, "fields");
    
    // Create tools instance
    const tools = new FormFillingTools(apiProvider, resumeContent, formFields);
    
    // Run the tool-based agent
    const results = await tools.runToolBasedAgent();
    
    return results;
  } catch (error) {
    console.error("Error in tool-based form filling:", error);
    return {
      fields: [],
      summary: "An error occurred during form filling: " + error.message,
      error: true
    };
  }
}

// Export the FormFillingTools class for advanced usage
export { FormFillingTools };