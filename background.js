// Background script to handle API requests without CORS issues
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "makeApiCall") {
    const { url, method, headers, body } = request;
    
    // Determine if this is a local API call
    const isLocalCall = url.includes('localhost') || 
                       url.includes('127.0.0.1') || 
                       url.includes('::1');
    
    // Prepare fetch options with proper CORS settings
    const options = {
      method: method || "POST",
      headers: headers || {},
      // Add mode and credentials for local API calls
      mode: isLocalCall ? 'cors' : 'same-origin',
      credentials: isLocalCall ? 'omit' : 'same-origin'
    };
    
    // Add body if provided
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    console.log(`Making API request to: ${url}`, options);
    
    fetch(url, options)
    .then(response => {
      console.log(`Response from ${url}:`, {
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()].reduce((obj, [key, val]) => {
          obj[key] = val;
          return obj;
        }, {})
      });
      
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
  
  // Handle form detection message from content script
  else if (request.action === "formDetected") {
    console.log("Form detected:", request.formData);
    
    // Store the form data in local storage
    chrome.storage.local.set({
      extractedHTML: JSON.stringify(request.formData),
      pageUrl: sender.tab ? sender.tab.url : null,
      pageTitle: sender.tab ? sender.tab.title : null,
      detectionTime: Date.now()
    });
    
    // Update the badge to indicate forms are available
    if (request.formData.pageAnalysis.autofillableFieldsCount > 0) {
      chrome.action.setBadgeText({ 
        text: request.formData.pageAnalysis.autofillableFieldsCount.toString(),
        tabId: sender.tab.id
      });
      chrome.action.setBadgeBackgroundColor({ color: "#4285f4" });
      
      // Optional: show a notification
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon-128.png",
        title: "Form Detected",
        message: `Detected ${request.formData.pageAnalysis.autofillableFieldsCount} autofillable fields on this page.`,
        priority: 0
      });
    }
    
    // No need to send a response here as the content script isn't expecting one
  }
});

// Listen for tab updates to reset badge and trigger form scanning
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Reset badge when page starts loading
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: "", tabId });
  }
});