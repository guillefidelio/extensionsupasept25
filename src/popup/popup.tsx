import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from '../components/AuthContext';
import { AuthContainer } from '../components/AuthContainer';
import { User } from '../types';
import './popup.css';

// Main extension interface for authenticated users
function MainExtensionInterface(): JSX.Element {
  const { authState, logout } = useAuth();
  const { user } = authState;

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="main-interface">
      <div className="header">
        <div className="user-info">
          <div className="user-avatar">
            {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
          </div>
          <div className="user-details">
            <h3 className="user-name">{user?.name || 'User'}</h3>
            <p className="user-email">{user?.email}</p>
          </div>
        </div>
        <button 
          className="logout-button"
          onClick={handleLogout}
          title="Sign out"
        >
          <span className="logout-icon">🚪</span>
        </button>
      </div>
      
      <div className="extension-content">
        <h2>AI Review Replier</h2>
        <p>Welcome! Your extension is ready to help with review responses.</p>
        
        <div className="status-indicator">
          <div className="status-dot connected"></div>
          <span>Connected to ReviewRepl.ai</span>
        </div>
        
        <div className="quick-actions">
          <button className="action-button primary">
            📝 Generate Response
          </button>
          <button className="action-button secondary">
            ⚙️ Settings
          </button>
        </div>
        
        <div className="info-section">
          <h4>How to use:</h4>
          <ol>
            <li>Navigate to a Google My Business review page</li>
            <li>Click the extension icon when a review is detected</li>
            <li>Choose your response mode (Simple or Pro)</li>
            <li>Click "Generate Response" to create an AI-powered reply</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

// Loading state component
function LoadingState(): JSX.Element {
  return (
    <div className="loading-container">
      <div className="loading-spinner"></div>
      <p>Loading extension...</p>
    </div>
  );
}

// Main popup component with authentication logic
function PopupContent(): JSX.Element {
  const { authState } = useAuth();
  const { isAuthenticated, isLoading, error } = authState;

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-icon">⚠️</div>
        <h3>Authentication Error</h3>
        <p>{error}</p>
        <button 
          className="retry-button"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthContainer 
        onAuthSuccess={(user: User) => {
          // This will be handled by the AuthContext
          console.log('User authenticated:', user);
        }}
      />
    );
  }

  return <MainExtensionInterface />;
}

// Main popup component wrapped with authentication provider
function Popup(): JSX.Element {
  return (
    <AuthProvider>
      <div className="popup-container">
        <PopupContent />
      </div>
    </AuthProvider>
  );
}

// Render the popup
const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<Popup />);
}
