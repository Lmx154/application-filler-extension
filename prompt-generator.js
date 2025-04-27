/**
 * prompt-generator.js
 * Handles the generation of AI prompts for form filling based on resume data
 */

/**
 * Generate an AI prompt based on resume data and form fields
 * @returns {string} The generated prompt or error message
 */
export function generatePrompt() {
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
  
  // Generate a prompt for the AI
  let prompt = `I need you to fill out a job application form using my resume information. 

RESUME CONTENT:
${resume}

FORM FIELDS:
`;

  // Create a set to track field IDs we've already added to prevent duplicates
  const processedFieldIds = new Set();
  
  // First add all autofillable fields to the prompt
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
        prompt += `- ${fieldLabel} (Field ID/Name: "${fieldIdentifier}", Type: ${field.type})\n`;
      }
    });
  } else if (forms.length > 0) {
    // Fallback to listing all form fields if no autofillable fields were detected
    forms.forEach(form => {
      prompt += `Form: ${form.name || form.id}\n`;
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
          prompt += `- ${fieldLabel} (Field ID/Name: "${fieldIdentifier}", Type: ${field.type})\n`;
        }
      });
    });
  } else {
    return 'Error: No form fields found. Please extract a form first.';
  }
  
  prompt += `\nINSTRUCTIONS:\r\n1. Analyze my resume and provide values for each form field based ONLY on information found in my resume.\r\n2. For each field, use EXACTLY the field ID/name I provided above as the \"id\" in your response.\r\n3. If a field has no corresponding information in my resume, mark its value as \"No information available\" with Low confidence.\r\n4. DO NOT make up or invent any information that is not explicitly mentioned in my resume.\r\n\r\nJSON RESPONSE STRUCTURE:\r\n{\r\n  \"fields\": [\r\n    {\r\n      \"id\": \"EXACT_FIELD_ID\",\r\n      \"value\": \"value from resume\",\r\n      \"confidence\": \"High/Medium/Low\"\r\n    },\r\n    ...more fields...\r\n  ],\r\n  \"summary\": \"Brief summary of how well the resume matches the form fields\"\r\n}\r\n\r\nCRITICAL FORMATTING INSTRUCTIONS:\r\n- Your response MUST be ONLY the JSON object described above.\r\n- Start the response *immediately* with the opening curly brace '{'.\r\n- End the response *immediately* with the closing curly brace '}'.\r\n- There should be absolutely NO text, comments, or explanations before the opening '{' or after the closing '}'.\r\n\r\nRemember: Only the raw JSON object.`;

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