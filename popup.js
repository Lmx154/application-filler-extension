// Import PDF.js as a module
import * as pdfjsLib from './pdf.mjs';

// Set the worker source to the worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs';

const input = document.getElementById('fileInput');
const out = document.getElementById('output');
const openViewerButton = document.getElementById('openViewer');
const extractDataButton = document.getElementById('extractData');

// Handle the "Open Full-Page Viewer" button click
openViewerButton.addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("viewer.html")
  });
});

// Handle the "Extract HTML Data" button click
extractDataButton.addEventListener('click', async () => {
  // Get current active tab
  try {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tabs || tabs.length === 0) {
      console.error("No active tab found");
      return;
    }

    const activeTab = tabs[0];
    
    // Inject and execute the script to extract form fields and autofill data
    chrome.scripting.executeScript({
      target: {tabId: activeTab.id},
      func: extractFormData
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.error("Script injection error:", chrome.runtime.lastError);
        return;
      }

      if (results && results[0] && results[0].result) {
        // Store the form data in localStorage
        localStorage.setItem('extractedHTML', JSON.stringify(results[0].result));
        localStorage.setItem('pageUrl', activeTab.url);
        localStorage.setItem('pageTitle', activeTab.title);
        
        // Open the viewer page to display the data
        chrome.tabs.create({
          url: chrome.runtime.getURL("viewer.html?section=application")
        });
      } else {
        console.error("Failed to extract form data");
      }
    });
  } catch (error) {
    console.error("Error extracting form data:", error);
  }
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
  const standaloneFields = document.querySelectorAll('body > input:not(form input), body > select:not(form select), body > textarea:not(form textarea), [role="form"] input, [role="form"] select, [role="form"] textarea, .form input, .form select, .form textarea');
  
  if (standaloneFields.length > 0) {
    const virtualForm = {
      id: 'virtual_form',
      name: 'Standalone Fields',
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
    
    const fieldName = field.name.toLowerCase();
    const fieldId = field.id.toLowerCase();
    const placeholder = (field.placeholder || '').toLowerCase();
    const fieldType = field.type;
    
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
    
    // Check if any pattern matches field name, id, or placeholder
    for (const pattern of autofillPatterns) {
      if (fieldName.includes(pattern) || 
          fieldId.includes(pattern) || 
          placeholder.includes(pattern)) {
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
    
    // Check for parent label (when input is inside label)
    let parent = field.parentElement;
    while (parent) {
      if (parent.tagName === 'LABEL') {
        // Get text content excluding child input values
        return Array.from(parent.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent.trim())
          .join(' ')
          .trim();
      }
      
      // Check if there's a label-like element nearby
      const labelLike = parent.querySelector('.label, .form-label, .field-label');
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
}

input.addEventListener('change', async () => {
  const file = input.files[0];
  if (!file || file.type !== 'application/pdf') {
    out.textContent = 'Please select a PDF file.';
    return;
  }

  out.textContent = 'Parsing…';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n';
  }

  out.textContent = toMarkdown(fullText);
});

function toMarkdown(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l)
    .map(l => {
      if (/^[-•*]\s*/.test(l)) {
        return '- ' + l.replace(/^[-•*]\s*/, '');
      }
      if (l === l.toUpperCase() && l.length < 50) {
        return '## ' + l;
      }
      return l;
    })
    .join('\n\n');
}
