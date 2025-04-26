// Simple API client for OpenAI Agents
class AgentsAPI {
  constructor(apiKey, baseURL, model = "gpt-4o") {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.model = model;
    this.conversation = [];
  }

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
          
          // Extract the assistant's message
          const data = response.data;
          const assistantMessage = data.choices[0].message.content;
          
          // Add assistant response to conversation history
          this.conversation.push({ role: "assistant", content: assistantMessage });
          
          resolve(assistantMessage);
        });
      });
    } catch (error) {
      console.error("Error in API call:", error);
      return "Sorry, there was an error communicating with the AI service.";
    }
  }

  clearConversation() {
    this.conversation = [];
  }
}

export default AgentsAPI;