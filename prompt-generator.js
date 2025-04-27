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
  let prompt = `I need your help to fill out an application form using information from my resume. 

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
  
  prompt += `\nPlease analyze the resume and provide values for these form fields based ONLY on information present in the resume. 
For each field, use EXACTLY the field ID/name I provided in the "Field ID/Name" as the key in your JSON response.
For example, if I have a field with Field ID/Name: "_systemfield_email" or "d727c1e4-3750-4506-88be-1180535fc608", use that exact value as the key in your JSON.

For each field, provide:
1. The exact field ID/name as the key
2. The suggested value based on the resume content
3. Your confidence level (High/Medium/Low) for this mapping

If a field has no corresponding information in the resume, mark it as "No information available" with Low confidence.
Do NOT make up or invent any information that is not explicitly in the resume.

This is a JavaScript-based form with dynamically generated field IDs, so it's CRITICAL that you use the exact field ID/name I provided.

IMPORTANT: Return ONLY a valid JSON object without any markdown formatting (no \`\`\` characters). Your entire response should be parseable as JSON.
Format your response exactly as follows:
{
  "fields": [
    {
      "id": "EXACT_FIELD_ID_OR_NAME",
      "value": "suggested value from resume",
      "confidence": "High/Medium/Low"
    },
    ...
  ],
  "summary": "A brief summary of how well the resume matches the form fields overall."
}`;

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