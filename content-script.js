// Content script to detect and extract dynamically loaded forms
console.log("Form extractor content script loaded");

// Store information about detected forms
let detectedForms = {
  initial: false,  // Whether initial scan has been completed
  forms: [],       // Forms detected 
  dynamicFormData: null, // Data structure for dynamic forms
  observing: false // Whether we're currently observing DOM changes
};

// Function to extract form data - similar to the function in popup.js but enhanced
function extractFormData() {
  console.log("Extracting form data from current DOM");
  
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
  // This is key for handling applications like Ashby which use React/Angular forms
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
  
  // Helper function to get a CSS selector path for an element (useful for debugging)
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

// Start monitoring for DOM changes to detect dynamic form loading
function startFormObserver() {
  if (detectedForms.observing) {
    return; // Already observing
  }
  
  console.log("Starting MutationObserver to detect dynamic forms");
  
  // Create a mutation observer to detect when forms are added to the DOM
  const observer = new MutationObserver((mutations) => {
    let significantChange = false;
    
    for (const mutation of mutations) {
      // Check for added nodes that might contain forms or form elements
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the node is a form or has form elements
            if (node.tagName === 'FORM' || 
                node.querySelector('form, input:not([type="hidden"]), select, textarea')) {
              significantChange = true;
              break;
            }
          }
        }
      }
      
      if (significantChange) break;
    }
    
    if (significantChange) {
      // Wait a moment for the DOM to stabilize
      clearTimeout(window.formDetectionTimeout);
      window.formDetectionTimeout = setTimeout(() => {
        const newFormData = extractFormData();
        
        // Compare with previous scan to see if forms have been added
        if (detectedForms.dynamicFormData) {
          if (newFormData.pageAnalysis.totalFields > detectedForms.dynamicFormData.pageAnalysis.totalFields) {
            console.log("Detected new form fields:", 
              newFormData.pageAnalysis.totalFields - detectedForms.dynamicFormData.pageAnalysis.totalFields);
            
            // Store the new data
            detectedForms.dynamicFormData = newFormData;
            
            // Send a message to the background script/popup about the new form data
            chrome.runtime.sendMessage({
              action: "formDetected",
              formData: newFormData
            });
          }
        } else {
          // First scan
          detectedForms.dynamicFormData = newFormData;
          
          if (newFormData.pageAnalysis.totalFields > 0) {
            // Send a message to the background script/popup about the form data
            chrome.runtime.sendMessage({
              action: "formDetected",
              formData: newFormData
            });
          }
        }
      }, 500);
    }
  });
  
  // Observe everything
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'id'] // Just key attributes that might affect visibility
  });
  
  detectedForms.observing = true;
}

// Function to run an initial form scan
function initialFormScan() {
  console.log("Running initial form scan");
  
  // Extract form data
  const formData = extractFormData();
  
  // Store the data
  detectedForms.initial = true;
  detectedForms.dynamicFormData = formData;
  
  if (formData.pageAnalysis.totalFields > 0) {
    // Send a message to the background script/popup about the form data
    chrome.runtime.sendMessage({
      action: "formDetected",
      formData: formData
    });
  }
  
  // Start the observer to detect dynamic changes
  startFormObserver();
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "scanForForms") {
    // Force a new scan
    console.log("Received request to scan for forms");
    const formData = extractFormData();
    
    // Store the data
    detectedForms.dynamicFormData = formData;
    
    // Send response back
    sendResponse({
      success: true,
      formData: formData
    });
    
    // Start the observer if not already running
    if (!detectedForms.observing) {
      startFormObserver();
    }
  }
  
  // Return true to indicate we might respond asynchronously
  return true;
});

// Run the initial scan when DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialFormScan);
} else {
  // DOM is already loaded
  initialFormScan();
}

// Also scan when the page is fully loaded (including images)
window.addEventListener('load', () => {
  // Wait a moment for possible post-load scripts to run
  setTimeout(() => {
    console.log("Running post-load form scan");
    const formData = extractFormData();
    
    // Only update if we found more fields than in the initial scan
    if (detectedForms.dynamicFormData &&
        formData.pageAnalysis.totalFields > detectedForms.dynamicFormData.pageAnalysis.totalFields) {
      
      detectedForms.dynamicFormData = formData;
      
      // Send a message about the updated form data
      chrome.runtime.sendMessage({
        action: "formDetected",
        formData: formData
      });
    }
  }, 1000);
});