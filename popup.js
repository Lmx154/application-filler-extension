// Import the needed modules
import * as pdfjsLib from './pdf.mjs';

// Set the worker source to the worker file (needed for PDF functionality in other parts)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs';

// Get DOM elements
const extractApplicationButton = document.getElementById('extractApplication');
const openSettingsButton = document.getElementById('openSettings');

// Handle the "Extract Application" button click
extractApplicationButton.addEventListener('click', async () => {
  // Get current active tab
  try {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tabs || tabs.length === 0) {
      console.error("No active tab found");
      return;
    }

    const activeTab = tabs[0];
    
    // Update button text to show we're working
    const originalText = extractApplicationButton.textContent;
    extractApplicationButton.textContent = "Extracting...";
    extractApplicationButton.disabled = true;
    
    // First check if we already have data from the MutationObserver
    chrome.storage.local.get(['extractedHTML', 'pageUrl', 'pageTitle', 'detectionTime'], (data) => {
      // If we have recent data (less than 10 seconds old) for this page, use it
      const currentTime = Date.now();
      const isRecentData = data.detectionTime && 
                          (currentTime - data.detectionTime < 10000) && 
                          data.pageUrl === activeTab.url;
      
      if (isRecentData && data.extractedHTML) {
        console.log("Using recently detected form data");
        // Store the form data in localStorage for viewer.html
        localStorage.setItem('extractedHTML', data.extractedHTML);
        localStorage.setItem('pageUrl', data.pageUrl);
        localStorage.setItem('pageTitle', data.pageTitle);
        
        // Reset button
        extractApplicationButton.textContent = originalText;
        extractApplicationButton.disabled = false;
        
        // Open the viewer page to display the data
        chrome.tabs.create({
          url: chrome.runtime.getURL("viewer.html?section=application")
        });
      } else {
        // Send a message to the content script to force a scan
        chrome.tabs.sendMessage(activeTab.id, { action: "scanForForms" }, (response) => {
          // Check for error
          if (chrome.runtime.lastError) {
            console.error("Error communicating with content script:", chrome.runtime.lastError);
            
            // Fallback to the old method - inject and execute the script
            chrome.scripting.executeScript({
              target: {tabId: activeTab.id},
              func: extractFormData
            }, (results) => {
              handleScriptResults(results);
            });
            return;
          }
          
          // If we got a response from the content script
          if (response && response.success) {
            console.log("Received form data from content script");
            
            // Store the form data in localStorage and chrome.storage.local
            const formData = response.formData;
            localStorage.setItem('extractedHTML', JSON.stringify(formData));
            localStorage.setItem('pageUrl', activeTab.url);
            localStorage.setItem('pageTitle', activeTab.title);
            
            chrome.storage.local.set({
              extractedHTML: JSON.stringify(formData),
              pageUrl: activeTab.url,
              pageTitle: activeTab.title,
              detectionTime: Date.now()
            });
            
            // Reset button
            extractApplicationButton.textContent = originalText;
            extractApplicationButton.disabled = false;
            
            // Open the viewer page to display the data
            chrome.tabs.create({
              url: chrome.runtime.getURL("viewer.html?section=application")
            });
          } else {
            console.error("Failed to get form data from content script");
            
            // Fallback to the old method - inject and execute the script
            chrome.scripting.executeScript({
              target: {tabId: activeTab.id},
              func: extractFormData
            }, (results) => {
              handleScriptResults(results);
            });
          }
        });
      }
    });
    
    // Helper function to handle the script execution results
    function handleScriptResults(results) {
      if (chrome.runtime.lastError) {
        console.error("Script injection error:", chrome.runtime.lastError);
        extractApplicationButton.textContent = "Error: " + chrome.runtime.lastError.message;
        setTimeout(() => {
          extractApplicationButton.textContent = originalText;
          extractApplicationButton.disabled = false;
        }, 3000);
        return;
      }

      if (results && results[0] && results[0].result) {
        // Store the form data in localStorage
        localStorage.setItem('extractedHTML', JSON.stringify(results[0].result));
        localStorage.setItem('pageUrl', activeTab.url);
        localStorage.setItem('pageTitle', activeTab.title);
        
        // Also store in chrome.storage.local for persistence
        chrome.storage.local.set({
          extractedHTML: JSON.stringify(results[0].result),
          pageUrl: activeTab.url,
          pageTitle: activeTab.title,
          detectionTime: Date.now()
        });
        
        // Reset button state
        extractApplicationButton.textContent = originalText;
        extractApplicationButton.disabled = false;
        
        // Open the viewer page to display the data
        chrome.tabs.create({
          url: chrome.runtime.getURL("viewer.html?section=application")
        });
      } else {
        console.error("Failed to extract form data");
        extractApplicationButton.textContent = "No form data found";
        setTimeout(() => {
          extractApplicationButton.textContent = originalText;
          extractApplicationButton.disabled = false;
        }, 3000);
      }
    }
  } catch (error) {
    console.error("Error extracting form data:", error);
    extractApplicationButton.textContent = "Error: " + error.message;
    setTimeout(() => {
      extractApplicationButton.textContent = "Extract Application";
      extractApplicationButton.disabled = false;
    }, 3000);
  }
});

// Handle the "Applytron Settings" button click
openSettingsButton.addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("viewer.html?section=settings")
  });
});

// Function to extract form fields and autofill data from the page
function extractFormData() {
  // Create a result object to store all forms and fields
  const result = {
    forms: [],
    autofillableFields: [],
    pageAnalysis: {
      totalForms: 0,
      totalFields: 0,
      autofillableFieldsCount: 0,
      requiredFieldsCount: 0
    }
  };

  // Get all forms in the document
  const forms = document.forms;
  result.pageAnalysis.totalForms = forms.length;

  // Process each form
  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    const formData = {
      id: form.id || `form_${i}`,
      name: form.name || '',
      method: form.method || '',
      action: form.action || '',
      fields: []
    };

    // Get all input elements within the form
    const inputElements = form.querySelectorAll('input, select, textarea');
    
    for (let j = 0; j < inputElements.length; j++) {
      const field = inputElements[j];
      result.pageAnalysis.totalFields++;
      
      // Skip hidden, submit, reset, and button inputs
      if (field.type === 'hidden' || field.type === 'submit' || 
          field.type === 'reset' || field.type === 'button' ||
          field.type === 'image') {
        continue;
      }

      // Create a field object with relevant attributes
      const fieldData = {
        tagName: field.tagName.toLowerCase(),
        type: field.type || '',
        id: field.id || '',
        name: field.name || '',
        placeholder: field.placeholder || '',
        value: field.value || '',
        required: field.required || false,
        autocomplete: field.getAttribute('autocomplete') || '',
        label: getFieldLabel(field),
        autofillable: isLikelyAutofillable(field)
      };

      // Count required fields
      if (fieldData.required) {
        result.pageAnalysis.requiredFieldsCount++;
      }

      // Count autofillable fields
      if (fieldData.autofillable) {
        result.pageAnalysis.autofillableFieldsCount++;
        result.autofillableFields.push(fieldData);
      }

      formData.fields.push(fieldData);
    }

    // Only add the form if it has visible fields
    if (formData.fields.length > 0) {
      result.forms.push(formData);
    }
  }

  // Also look for standalone input fields outside of forms
  // that might be part of dynamically generated forms
  const standaloneFields = document.querySelectorAll(
    'body > input:not(form input), ' + 
    'body > select:not(form select), ' + 
    'body > textarea:not(form textarea), ' + 
    '[role="form"] input, [role="form"] select, [role="form"] textarea, ' + 
    '.form input, .form select, .form textarea, ' + 
    // Additional selectors for React/Angular based forms
    '[class*="form"] input, [class*="form"] select, [class*="form"] textarea, ' +
    '[data-testid*="form"] input, [data-testid*="form"] select, [data-testid*="form"] textarea, ' +
    // Elements with likely form-related attributes
    '[aria-required="true"], [required], [aria-invalid]'
  );
  
  if (standaloneFields.length > 0) {
    const virtualForm = {
      id: 'virtual_form',
      name: 'Dynamically Generated Fields',
      fields: []
    };

    for (let i = 0; i < standaloneFields.length; i++) {
      const field = standaloneFields[i];
      result.pageAnalysis.totalFields++;
      
      // Skip hidden, submit, reset, and button inputs
      if (field.type === 'hidden' || field.type === 'submit' || 
          field.type === 'reset' || field.type === 'button' ||
          field.type === 'image') {
        continue;
      }

      // Create a field object with relevant attributes
      const fieldData = {
        tagName: field.tagName.toLowerCase(),
        type: field.type || '',
        id: field.id || '',
        name: field.name || '',
        placeholder: field.placeholder || '',
        value: field.value || '',
        required: field.required || field.getAttribute('aria-required') === 'true' || false,
        autocomplete: field.getAttribute('autocomplete') || '',
        label: getFieldLabel(field),
        autofillable: isLikelyAutofillable(field),
        // Add some extra info for debugging dynamic forms
        path: getElementPath(field),
        parentElement: field.parentElement ? {
          tagName: field.parentElement.tagName,
          id: field.parentElement.id || '',
          className: field.parentElement.className || ''
        } : null
      };

      // Count required fields
      if (fieldData.required) {
        result.pageAnalysis.requiredFieldsCount++;
      }

      // Count autofillable fields
      if (fieldData.autofillable) {
        result.pageAnalysis.autofillableFieldsCount++;
        result.autofillableFields.push(fieldData);
      }

      virtualForm.fields.push(fieldData);
    }

    // Only add the virtual form if it has fields
    if (virtualForm.fields.length > 0) {
      result.forms.push(virtualForm);
    }
  }

  return result;

  // Helper function to determine if a field is likely to be autofillable
  function isLikelyAutofillable(field) {
    // Check if field has autocomplete attribute
    if (field.getAttribute('autocomplete') && 
        field.getAttribute('autocomplete') !== 'off') {
      return true;
    }
    
    const fieldName = (field.name || '').toLowerCase();
    const fieldId = (field.id || '').toLowerCase();
    const placeholder = (field.placeholder || '').toLowerCase();
    const fieldType = field.type;
    const ariaLabel = (field.getAttribute('aria-label') || '').toLowerCase();
    
    // Common autofillable field patterns
    const autofillPatterns = [
      // Personal info
      'name', 'fullname', 'firstname', 'fname', 'first-name', 'first_name',
      'lastname', 'lname', 'last-name', 'last_name', 'middle', 
      'email', 'mail', 'e-mail', 'phone', 'mobile', 'tel', 'telephone',
      'zip', 'zipcode', 'postal', 'post-code', 'postcode',
      'address', 'street', 'city', 'state', 'country', 'province',
      'birth', 'birthday', 'dob', 'date-of-birth', 'gender', 'sex',
      
      // Payment
      'card', 'credit', 'credit-card', 'cc-', 'ccnum', 'cardnumber',
      'cvv', 'cvc', 'cvv2', 'csc', 'expiry', 'expiration',
      
      // Account
      'user', 'username', 'userid', 'login', 'password', 'pwd', 'pass',
      
      // Occupation
      'occupation', 'job', 'title', 'position', 'role', 'company',
      'organization', 'employer'
    ];
    
    // Check if any pattern matches field name, id, placeholder or aria-label
    for (const pattern of autofillPatterns) {
      if (fieldName.includes(pattern) || 
          fieldId.includes(pattern) || 
          placeholder.includes(pattern) ||
          ariaLabel.includes(pattern)) {
        return true;
      }
    }
    
    // Check field types that are commonly autofilled
    if (['text', 'email', 'tel', 'url', 'number', 'date', 
         'password', 'search'].includes(fieldType)) {
      return true;
    }
    
    return false;
  }
  
  // Helper function to get field label text
  function getFieldLabel(field) {
    // First check for explicit label with 'for' attribute
    if (field.id) {
      const label = document.querySelector(`label[for="${field.id}"]`);
      if (label && label.textContent.trim()) {
        return label.textContent.trim();
      }
    }
    
    // Check for aria-label attribute
    if (field.getAttribute('aria-label')) {
      return field.getAttribute('aria-label').trim();
    }
    
    // Check for aria-labelledby attribute
    const ariaLabelledBy = field.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelElement = document.getElementById(ariaLabelledBy);
      if (labelElement && labelElement.textContent.trim()) {
        return labelElement.textContent.trim();
      }
    }
    
    // Check for parent label (when input is inside label)
    let parent = field.parentElement;
    let depth = 0;
    const maxDepth = 4; // Limit how far up we go to avoid performance issues
    
    while (parent && depth < maxDepth) {
      depth++;
      
      if (parent.tagName === 'LABEL') {
        // Get text content excluding child input values
        return Array.from(parent.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent.trim())
          .join(' ')
          .trim();
      }
      
      // Check if there's a label-like element nearby
      const labelLike = parent.querySelector('.label, .form-label, .field-label, [class*="label"], [class*="Label"]');
      if (labelLike && labelLike.textContent.trim()) {
        return labelLike.textContent.trim();
      }
      
      // Move up one level
      parent = parent.parentElement;
      
      // Avoid going too far up the DOM tree
      if (parent === document.body) {
        break;
      }
    }
    
    // If no label found, use name, id, or placeholder as fallback
    return field.placeholder || field.name || field.id || '';
  }
  
  // Helper function to get a CSS selector path for an element
  function getElementPath(element) {
    if (!element) return '';
    
    const path = [];
    let currentElement = element;
    
    while (currentElement && currentElement !== document.body && path.length < 6) {
      let selector = currentElement.tagName.toLowerCase();
      
      if (currentElement.id) {
        selector += '#' + currentElement.id;
      } else if (currentElement.className && typeof currentElement.className === 'string') {
        // Convert class list to array and filter out empty strings
        const classes = currentElement.className.split(' ').filter(item => item);
        if (classes.length > 0) {
          // Limit to max 2 classes to keep selector reasonably short
          const classSelectors = classes.slice(0, 2).map(c => '.' + c).join('');
          selector += classSelectors;
        }
      }
      
      path.unshift(selector);
      currentElement = currentElement.parentElement;
    }
    
    return path.join(' > ');
  }
}

// Check if we have any stored data to show badge
document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
    if (tabs && tabs.length > 0) {
      const activeTab = tabs[0];
      
      // Check if we have stored data for this page
      chrome.storage.local.get(['extractedHTML', 'pageUrl'], (data) => {
        if (data.pageUrl === activeTab.url && data.extractedHTML) {
          try {
            const formData = JSON.parse(data.extractedHTML);
            if (formData.pageAnalysis && formData.pageAnalysis.autofillableFieldsCount > 0) {
              extractApplicationButton.textContent = `Extract Application (${formData.pageAnalysis.autofillableFieldsCount} fields)`;
            }
          } catch (error) {
            console.error("Error parsing stored form data:", error);
          }
        }
      });
    }
  });
});
