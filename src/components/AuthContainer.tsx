import React, { useState } from 'react';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { User } from '../types';

interface AuthContainerProps {
  onAuthSuccess: (user: User) => void;
}

type AuthMode = 'login' | 'signup';

export function AuthContainer({ onAuthSuccess }: AuthContainerProps): JSX.Element {
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  const handleLoginSuccess = (user: User) => {
    onAuthSuccess(user);
  };

  const handleSignupSuccess = (user: User) => {
    onAuthSuccess(user);
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
