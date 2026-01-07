import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from '../components/AuthContext';
import { AuthContainer } from '../components/AuthContainer';
import { AuthSuccessPayload } from '../types';
import '../styles/globals.css';
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

  const handleSettingsClick = () => {
    window.open('https://www.boltreply.io/dashboard', '_blank');
  };

  const handleModeClick = () => {
    window.open('https://www.boltreply.io/dashboard/answering-mode', '_blank');
  };

  return (
    <div className="flex flex-col h-full bg-muted/50 p-6">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-semibold text-base shadow-sm">
            {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
          </div>
          <div className="flex flex-col">
            <h3 className="text-sm font-semibold text-foreground m-0">{user?.name || 'User'}</h3>
            <p className="text-xs text-muted-foreground m-0">{user?.email}</p>
          </div>
        </div>
        <button 
          className="h-9 px-3 flex items-center gap-2 hover:bg-accent hover:text-foreground text-muted-foreground rounded-md transition-colors text-sm font-medium"
          onClick={handleLogout}
          title="Sign out"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Sign out</span>
        </button>
      </div>
      
      <div className="glass-card flex-1 flex flex-col gap-6 overflow-y-auto">
        <div className="flex flex-col items-center text-center">
            <img 
              src="../icons/boltreplyainameicon.png" 
              alt="Bolt Reply AI" 
              className="h-16 mb-4 object-contain"
            />
            <p className="text-sm text-muted-foreground">Welcome! Your extension is ready to help with review responses.</p>
        </div>
        
        {/* Credits Display */}
        <div 
          className="flex items-center justify-between p-3 h-[72px] bg-gradient-to-br from-background to-secondary hover:from-gray-200 hover:to-gray-200 border border-border rounded-lg cursor-pointer transition-all duration-200"
          onClick={handleSettingsClick}
          title="Change or update subscription"
        >
          <div className="flex flex-col justify-center">
            <span className="font-semibold text-sm text-primary">
              Credits: {user?.credits_available !== undefined ? user.credits_available : '...'} remaining
            </span>
            <span className="text-xs text-muted-foreground italic">Change or update your subscription in the dashboard</span>
          </div>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="text-muted-foreground"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </div>

        {/* Answering Mode Display */}
        <div 
          className="flex items-center justify-between p-3 h-[72px] bg-background/30 backdrop-blur-[12px] border border-border rounded-lg cursor-pointer hover:bg-gray-200 transition-all duration-200"
          onClick={handleModeClick}
          title="Click to change answering mode"
        >
          <div className="flex flex-col justify-center">
            <span className="text-sm font-semibold text-primary capitalize">
              Active Answering Mode: {user?.answering_mode || 'Simple'}
            </span>
            <span className="text-xs text-muted-foreground italic">Change your answering mode from the dashboard</span>
          </div>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="text-muted-foreground"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </div>

        <div className="flex gap-3">
          <button 
            className="flex-1 h-9 px-3 py-2 bg-secondary/50 text-secondary-foreground hover:bg-secondary border border-input rounded-md font-medium text-sm transition-colors"
            onClick={handleSettingsClick}
          >
            ⚙️ Settings
          </button>
        </div>
        
        <div className="glass-inner bg-background/50">
          <h4 className="text-sm font-medium text-foreground mb-3">How to use:</h4>
          <ol className="list-decimal pl-5 space-y-2 text-xs text-muted-foreground">
            <li>Navigate to your Google Business review page</li>
            <li>The extension will automatically detect reviews</li>
            <li>Click "Bolt Reply" in the unanswered individual review view</li>
            <li>Change your preferred answering mode in the Dashboard</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

// Loading state component
function LoadingState(): JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center p-10">
      <div className="h-8 w-8 border-4 border-muted border-t-primary rounded-full animate-spin mb-4"></div>
      <p className="text-sm text-muted-foreground">Loading extension...</p>
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
      <div className="flex flex-col items-center justify-center h-full p-10 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h3 className="text-lg font-semibold text-destructive mb-3">Authentication Error</h3>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <button 
          className="h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors"
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
        onAuthSuccess={(authData: AuthSuccessPayload) => {
          // Authenticated successfully
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
      <div className="w-[400px] h-[600px] overflow-hidden bg-background">
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
