// Background script to handle API requests without CORS issues
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "makeApiCall") {
    const { url, method, headers, body } = request;
    
    fetch(url, {
      method: method || "POST",
      headers: headers || {},
      body: JSON.stringify(body)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      // Check Content-Type header to determine how to process the response
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        return response.json().then(data => ({ data, contentType }));
      } else {
        // Handle text/plain or other formats
        return response.text().then(text => ({ text, contentType }));
      }
    })
    .then(responseData => {
      if (responseData.data) {
        // It's JSON data
        sendResponse({ success: true, data: responseData.data, contentType: responseData.contentType });
      } else {
        // It's text data
        sendResponse({ 
          success: true, 
          data: { text: responseData.text }, 
          contentType: responseData.contentType,
          isText: true
        });
      }
    })
    .catch(error => {
      console.error("API error:", error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Required for async sendResponse
  }
});