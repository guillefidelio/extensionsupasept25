import React, { useState } from 'react';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { AuthSuccessPayload } from '../types';
import { useAuth } from './AuthContext';

interface AuthContainerProps {
  onAuthSuccess: (authData: AuthSuccessPayload) => void;
}

type AuthMode = 'login' | 'signup';

export function AuthContainer({ onAuthSuccess }: AuthContainerProps): JSX.Element {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const { login } = useAuth();

  const handleLoginSuccess = (authData: AuthSuccessPayload) => {
    login(authData);
    onAuthSuccess(authData);
  };

  const handleSignupSuccess = (authData: AuthSuccessPayload) => {
    login(authData);
    onAuthSuccess(authData);
  };

  const switchToSignup = () => {
    setAuthMode('signup');
  };

  const switchToLogin = () => {
    setAuthMode('login');
  };

  return (
    <div className="auth-container">
      {authMode === 'login' ? (
        <LoginForm
          onLoginSuccess={handleLoginSuccess}
          onSwitchToSignup={switchToSignup}
        />
      ) : (
        <SignupForm
          onSignupSuccess={handleSignupSuccess}
          onSwitchToLogin={switchToLogin}
        />
      )}
    </div>
  );
}
