import { useState, useEffect } from 'react'
import './App.css'

interface ElementSummary {
  id: string;
  tagName: string;
  text: string;
}

interface TechItem {
  name: string;
  category: string;
}

interface AnalysisResult {
  isAccessible: boolean;
  issueTitle?: string;
  explanation?: string;
  suggestedFixCode?: string;
  fixReasoning?: string;
}

function App() {
  const [elements, setElements] = useState<ElementSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [techStack, setTechStack] = useState<TechItem[]>([]);
  const [isStackExpanded, setIsStackExpanded] = useState(true);

  useEffect(() => {
    scanPage();
    return () => {
      clearHighlights();
    };
  }, []);

  const scanPage = async () => {
    setLoading(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'scanElements' }, (response) => {
          setLoading(false);
          if (chrome.runtime.lastError) {
             setError('Failed to connect to page. Make sure to refresh the page after loading the extension.');
             return;
          }
          if (response && response.elements) {
            setElements(response.elements);
            setTechStack(response.techStack || []);
            setError(null);
          }
        });
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      setLoading(false);
      setError(err.message);
    }
  };

  const clearHighlights = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'clearHighlights' });
      }
    } catch (e) {
      // ignore
    }
  };

  const analyzeElement = async (id: string) => {
    setSelectedId(id);
    setAnalysis(null);
    setLoading(true);
    setCopied(false);
    // Note: intentionally NOT clearing error here so the banner stays visible while retrying

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'analyzeSpecificElement', payload: { id } }, (response) => {
          if (response && response.context) {
             chrome.runtime.sendMessage({
                action: 'analyzeElement',
                payload: response.context
             }, (bgResponse) => {
                setLoading(false);
                if (bgResponse && bgResponse.error) {
                   setError(`${bgResponse.error}${bgResponse.details ? `: ${bgResponse.details}` : ''}`);
                } else if (bgResponse) {
                   setAnalysis(bgResponse);
                   setError(null); // Clear error on success
                }
             });
          } else {
             setLoading(false);
             setError('Could not extract context from element.');
          }
        });
      } else {
         setLoading(false);
      }
    } catch (err: any) {
      setLoading(false);
      setError(err.message);
    }
  };

  const copyToClipboard = () => {
    if (analysis?.suggestedFixCode) {
      navigator.clipboard.writeText(analysis.suggestedFixCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const retryLastAction = () => {
    if (selectedId) {
      analyzeElement(selectedId);
    } else {
      scanPage();
    }
  };

  const groupedTech = techStack.reduce((acc, curr) => {
    if (!acc[curr.category]) acc[curr.category] = [];
    acc[curr.category].push(curr.name);
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>
          <img src="/CAAL_LOGO.png" alt="CAAL Logo" width="24" height="24" style={{ borderRadius: '4px', marginRight: '8px' }} />
          Context-Aware Accessibility Linter
        </h1>
        <button onClick={scanPage} className="rescan-btn" disabled={loading}>Rescan Page</button>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button 
            className="retry-btn" 
            onClick={retryLastAction}
            disabled={loading}
          >
            {loading ? 'Retrying...' : 'Try Again'}
          </button>
        </div>
      )}

      <div className="main-content">
        <div className="elements-list">
          {techStack.length > 0 && (
            <div className="tech-stack-container">
              <h2 
                className="collapsible-header" 
                onClick={() => setIsStackExpanded(!isStackExpanded)}
              >
                <span>Detected Stack</span>
                <svg 
                  width="14" 
                  height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                  style={{ transform: isStackExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </h2>
              
              {isStackExpanded && (
                <div className="tech-grid">
                  {Object.entries(groupedTech).map(([category, items]) => (
                    <div key={category} className="tech-category">
                      <h3>{category}</h3>
                      <ul>
                        {items.map(item => (
                          <li key={item}>
                            <span className="tech-icon"></span>
                            <span className="tech-name">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <h2>Found Elements ({elements.length})</h2>
          <div className="list-container">
            {elements.length === 0 && !error && <p className="placeholder" style={{padding: '16px'}}>No interactive elements found or page not loaded.</p>}
            {elements.map(el => (
              <button 
                key={el.id} 
                className={`element-item ${selectedId === el.id ? 'selected' : ''}`}
                onClick={() => analyzeElement(el.id)}
                disabled={loading && selectedId === el.id}
              >
                <span className="tag-badge">{el.tagName}</span>
                <span className="element-text">{el.text}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="analysis-panel">
          <h2>Analysis Result</h2>
          
          {loading && <div className="loading">Processing...</div>}
          
          {!loading && !analysis && !selectedId && (
            <div className="placeholder">Select an element to analyze</div>
          )}

          {!loading && analysis && (
            <div className="analysis-result">
              <div className={`status ${analysis.isAccessible ? 'pass' : 'fail'}`}>
                {analysis.isAccessible ? 'Accessible' : 'Accessibility Issue Found'}
              </div>
              
              {!analysis.isAccessible && (
                <>
                  <h3>{analysis.issueTitle}</h3>
                  <p className="explanation">{analysis.explanation}</p>
                  
                  {analysis.suggestedFixCode && (
                    <div className="code-block">
                      <div className="code-header">
                        <span>Suggested Fix</span>
                        <button onClick={copyToClipboard} className={`copy-btn ${copied ? 'copied' : ''}`}>
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <pre><code>{analysis.suggestedFixCode}</code></pre>
                    </div>
                  )}
                  {analysis.fixReasoning && (
                    <div className="fix-reasoning">
                      <strong>How this fixes the issue:</strong> {analysis.fixReasoning}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
