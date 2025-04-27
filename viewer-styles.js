/**
 * viewer-styles.js
 * Handles dynamic styling and UI enhancements for the viewer
 */

/**
 * Add copy button to the output container
 * @param {HTMLElement} outputElement - The output element to attach the button to
 */
export function addCopyButton(outputElement) {
  // Remove any existing copy button
  const existingBtn = document.getElementById('copyBtn');
  if (existingBtn) {
    existingBtn.remove();
  }
  
  // Create copy button
  const copyBtn = document.createElement('button');
  copyBtn.id = 'copyBtn';
  copyBtn.textContent = 'Copy to Clipboard';
  copyBtn.style.marginTop = '10px';
  copyBtn.style.padding = '8px 16px';
  copyBtn.style.cursor = 'pointer';
  copyBtn.style.backgroundColor = 'var(--primary-color)';
  copyBtn.style.color = 'white';
  copyBtn.style.border = 'none';
  copyBtn.style.borderRadius = '4px';
  
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(outputElement.textContent).then(() => {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 2000);
    });
  });
  
  // Insert before output
  outputElement.parentNode.insertBefore(copyBtn, outputElement.nextSibling);
}

/**
 * Show a status message in the settings page
 * @param {string} message - The message to display
 * @param {boolean} isSuccess - Whether the message is a success or error
 * @param {HTMLElement} messageElement - The element to display the message in
 */
export function showStatusMessage(message, isSuccess = true, messageElement) {
  messageElement.textContent = message;
  messageElement.style.display = 'block';
  
  if (isSuccess) {
    messageElement.classList.add('status-success');
    messageElement.classList.remove('status-error');
  } else {
    messageElement.classList.add('status-error');
    messageElement.classList.remove('status-success');
  }
  
  // Hide the message after 3 seconds
  setTimeout(() => {
    messageElement.style.display = 'none';
  }, 3000);
}

/**
 * Apply confidence-based styling to output fields
 * @param {string} confidence - High, Medium, or Low confidence level
 * @returns {string} The CSS class to apply
 */
export function getConfidenceClass(confidence) {
  const lowerConfidence = (confidence || '').toLowerCase();
  
  if (lowerConfidence === 'high') {
    return 'high-confidence';
  } else if (lowerConfidence === 'medium') {
    return 'medium-confidence';
  } else {
    return 'low-confidence';
  }
}

/**
 * Add dynamic styles to the output display
 */
export function addOutputStyles() {
  // Add some styling for the output
  const style = document.createElement('style');
  style.textContent = `
    .output-section {
      margin-bottom: 30px;
      padding: 15px;
      background-color: var(--secondary-background);
      border-radius: 5px;
    }
    
    .output-summary-content {
      line-height: 1.5;
    }
    
    .token-usage {
      margin-top: 20px;
      padding: 10px 15px;
      background-color: rgba(0, 0, 0, 0.05);
      border-radius: 5px;
      border-left: 4px solid var(--primary-color);
    }
    
    .token-usage h4 {
      margin-top: 0;
      margin-bottom: 10px;
      color: var(--primary-color);
    }
    
    .token-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }
    
    .token-stat {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 0;
    }
    
    .total-tokens {
      margin-top: 8px;
      font-weight: bold;
      border-top: 1px solid var(--border-color);
      padding-top: 8px;
    }
    
    .token-value {
      font-family: monospace;
      background: rgba(0, 0, 0, 0.07);
      padding: 2px 8px;
      border-radius: 4px;
    }
    
    .raw-response {
      margin-top: 15px;
      padding: 10px;
      background-color: rgba(0, 0, 0, 0.05);
      border-radius: 5px;
    }
    
    .raw-response pre {
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .output-fields-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    
    .output-fields-table th,
    .output-fields-table td {
      text-align: left;
      padding: 10px;
      border-bottom: 1px solid var(--border-color);
    }
    
    .high-confidence {
      background-color: rgba(76, 175, 80, 0.1);
    }
    
    .medium-confidence {
      background-color: rgba(255, 193, 7, 0.1);
    }
    
    .low-confidence {
      background-color: rgba(244, 67, 54, 0.1);
    }
  `;
  document.head.appendChild(style);
}

/**
 * Add styling for application data display
 */
export function addApplicationDataStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .page-info {
      margin-bottom: 20px;
      padding: 10px;
      background-color: var(--secondary-background);
      border-radius: 5px;
    }
    
    .summary-container {
      margin-bottom: 20px;
    }
    
    .summary-stats {
      display: flex;
      justify-content: space-around;
      margin: 15px 0;
    }
    
    .summary-stat {
      text-align: center;
      padding: 10px;
      background-color: var(--secondary-background);
      border-radius: 5px;
      min-width: 80px;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: var(--primary-color);
    }
    
    .autofill-table, .fields-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
    }
    
    .autofill-table th, .autofill-table td, 
    .fields-table th, .fields-table td {
      text-align: left;
      padding: 8px;
      border-bottom: 1px solid var(--border-color);
    }
    
    .form-container {
      margin-bottom: 10px;
      border: 1px solid var(--border-color);
      border-radius: 5px;
    }
    
    .form-summary {
      padding: 10px;
      cursor: pointer;
      background-color: var(--secondary-background);
      display: flex;
      justify-content: space-between;
    }
    
    .form-details {
      padding: 10px;
    }
    
    .form-metadata {
      margin-bottom: 10px;
      padding: 10px;
      background-color: var(--secondary-background);
      border-radius: 5px;
    }
    
    .autofillable-row {
      background-color: rgba(66, 133, 244, 0.1);
    }
    
    .required-row {
      font-weight: 500;
    }
    
    .field-count {
      background-color: var(--primary-color);
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.8em;
    }
  `;
  
  document.head.appendChild(style);
}