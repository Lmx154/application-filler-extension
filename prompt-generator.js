/**
 * prompt-generator.js
 * Handles the generation of AI prompts for form filling based on resume data
 */

/**
 * Generate an AI prompt based on resume data and form fields
 * @param {boolean} isLocalModel - Whether we're using a local model like Ollama or LMStudio
 * @returns {string} The generated prompt or error message
 */
export function generatePrompt(isLocalModel = false) {
  // Get the resume data
  const resume = localStorage.getItem('parsedResume') || '';
  
  // Get the form data
  const extractedData = localStorage.getItem('extractedHTML');
  let forms = [];
  let autofillableFields = [];
  
  if (extractedData) {
    try {
      const parsedData = JSON.parse(extractedData);
      forms = parsedData.forms || [];
      autofillableFields = parsedData.autofillableFields || [];
      
      console.log("Form data detected:", {
        formCount: forms.length,
        autofillableFieldsCount: autofillableFields.length
      });
    } catch (error) {
      console.error('Error parsing form data:', error);
      return 'Error: Could not parse form data';
    }
  } else {
    return 'Error: No form data available. Please extract form data first.';
  }
  
  // Create a set to track field IDs we've already added to prevent duplicates
  const processedFieldIds = new Set();
  
  // Collect the form fields
  const formFields = [];
  
  // First add all autofillable fields
  if (autofillableFields.length > 0) {
    autofillableFields.forEach(field => {
      // Use name or ID as the field identifier, with fallbacks for dynamic JS forms
      let fieldIdentifier = field.name || field.id || '';
      
      // If the field has no ID/name but has a path, use a portion of the path as identifier
      if (!fieldIdentifier && field.path) {
        // Extract the last part of the path that might contain a useful identifier
        const pathParts = field.path.split('>');
        const lastPart = pathParts[pathParts.length - 1].trim();
        if (lastPart.includes('id=')) {
          fieldIdentifier = lastPart.match(/id=["']([^"']+)["']/)?.[1] || '';
        } else if (lastPart.includes('class=')) {
          fieldIdentifier = lastPart.match(/class=["']([^"']+)["']/)?.[1] || '';
        }
      }
      
      // If we still don't have an identifier, use something unique
      if (!fieldIdentifier) {
        fieldIdentifier = `field_${autofillableFields.indexOf(field)}`;
      }
      
      // Only add this field if we haven't processed it already
      if (!processedFieldIds.has(fieldIdentifier)) {
        processedFieldIds.add(fieldIdentifier);
        
        const fieldLabel = field.label || fieldIdentifier;
        formFields.push({
          id: fieldIdentifier,
          label: fieldLabel,
          type: field.type
        });
      }
    });
  } else if (forms.length > 0) {
    // Fallback to listing all form fields if no autofillable fields were detected
    forms.forEach(form => {
      form.fields.forEach(field => {
        // Use name or ID as the field identifier, with fallbacks
        let fieldIdentifier = field.name || field.id || '';
        
        // If the field has no ID/name but has a path, use a portion of the path as identifier
        if (!fieldIdentifier && field.path) {
          // Extract the last part of the path that might contain a useful identifier
          const pathParts = field.path.split('>');
          const lastPart = pathParts[pathParts.length - 1].trim();
          if (lastPart.includes('id=')) {
            fieldIdentifier = lastPart.match(/id=["']([^"']+)["']/)?.[1] || '';
          } else if (lastPart.includes('class=')) {
            fieldIdentifier = lastPart.match(/class=["']([^"']+)["']/)?.[1] || '';
          }
        }
        
        // If we still don't have an identifier, use something unique
        if (!fieldIdentifier) {
          fieldIdentifier = `field_${forms.indexOf(form)}_${form.fields.indexOf(field)}`;
        }
        
        // Only add this field if we haven't processed it already
        if (!processedFieldIds.has(fieldIdentifier)) {
          processedFieldIds.add(fieldIdentifier);
          
          const fieldLabel = field.label || fieldIdentifier;
          formFields.push({
            id: fieldIdentifier,
            label: fieldLabel,
            type: field.type
          });
        }
      });
    });
  } else {
    return 'Error: No form fields found. Please extract a form first.';
  }

  // For local models, use the simplified prompt structure
  if (isLocalModel) {
    // Import the formatPrompt function from agents-api.js (client-side only)
    if (typeof window !== 'undefined' && window.formatPrompt) {
      return window.formatPrompt(resume, formFields);
    }
    
    // Fallback to a simpler prompt structure for local models
    let prompt = `TASK: Fill job application form using resume information.

RESUME:
${resume}

FORM FIELDS TO FILL:
`;

    formFields.forEach(field => {
      // Include both ID and label for context
      const labelText = field.label && field.label.trim() !== '' 
        ? `${field.label} (${field.id})` 
        : field.id;
      
      prompt += `- ${labelText} (${field.type})\n`;
    });

    prompt += `
INSTRUCTIONS:
1. Use ONLY information from the resume
2. For each field ID, provide a suitable value
3. Mark unknown fields as "No information available" with Low confidence
4. Do not make up information

RESPONSE FORMAT:
Return a JSON object with this structure:
{
  "fields": [
    {
      "id": "field_id",
      "value": "value from resume",
      "confidence": "High/Medium/Low"
    }
  ],
  "summary": "Brief resume analysis"
}`;

    return prompt;
  }
  
  // For cloud models, use the detailed prompt
  let prompt = `I need you to fill out a job application form using my resume information. 

RESUME CONTENT:
${resume}

FORM FIELDS:
`;

  formFields.forEach(field => {
    prompt += `- ${field.label} (Field ID/Name: "${field.id}", Type: ${field.type})\n`;
  });
  
  prompt += `\nINSTRUCTIONS:
1. Analyze my resume and provide values for each form field based ONLY on information found in my resume.
2. For each field, use EXACTLY the field ID/name I provided above as the "id" in your response.
3. If a field has no corresponding information in my resume, mark its value as "No information available" with Low confidence.
4. DO NOT make up or invent any information that is not explicitly mentioned in my resume.

RESPONSE FORMAT:
Return only a raw JSON object in this structure:
{
  "fields": [
    {
      "id": "EXACT_FIELD_ID",
      "value": "value from resume",
      "confidence": "High/Medium/Low"
    },
    ...more fields...
  ],
  "summary": "Brief summary of how well the resume matches the form fields"
}

IMPORTANT: Your response must be only the raw JSON object, with no extra text, comments, or formatting.`;

  return prompt;
}

/**
 * Estimate token count for a text string
 * @param {string} text - The text to count tokens in
 * @returns {number} The estimated token count
 */
export function countTokens(text) {
  if (!text) return 0;
  
  // Remove extra whitespace
  const cleanedText = text.trim().replace(/\s+/g, ' ');
  
  // Split by spaces to count words
  const words = cleanedText.split(/\s+/);
  
  // Count punctuation and special characters
  let specialCharCount = 0;
  const specialCharsRegex = /[!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]/g;
  const matches = cleanedText.match(specialCharsRegex);
  if (matches) {
    specialCharCount = matches.length;
  }
  
  // Estimate tokens (this is a rough approximation)
  // On average for English text, 1 token is approximately 4 characters
  const charCount = cleanedText.length;
  const estimatedTokens = Math.ceil(charCount / 4);
  
  return estimatedTokens;
}

/**
 * Calculate token usage for a prompt and response
 * @param {string} prompt - The prompt sent to the API
 * @param {string} response - The response received
 * @returns {Object} Token usage statistics
 */
export function calculateTokenUsage(prompt, response) {
  const promptTokens = countTokens(prompt);
  const responseTokens = countTokens(response);
  const totalTokens = promptTokens + responseTokens;
  
  return {
    promptTokens,
    responseTokens,
    totalTokens
  };
}