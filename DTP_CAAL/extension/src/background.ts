chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeElement') {
    try {
      // Forward the request to our Node.js backend
      fetch('http://localhost:3000/api/v1/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          elementHtml: request.payload?.elementHtml || '',
          parentHtml: request.payload?.parentHtml || '',
          pageUrl: sender.tab?.url || request.payload?.pageUrl || ''
        })
      })
      .then(async response => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Server error ${response.status}: ${text.substring(0, 100)}`);
        }
        return response.json();
      })
      .then(data => sendResponse(data))
      .catch(error => {
        console.error('Error analyzing element:', error);
        sendResponse({ error: 'Failed to analyze element', details: error.message });
      });
      
      return true; // Indicates we will send response asynchronously
    } catch (err: any) {
      console.error('Sync error in background script:', err);
      sendResponse({ error: 'Internal extension error', details: err.message });
    }
  }
});
