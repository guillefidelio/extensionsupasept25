import React from 'react';
import { LoginForm } from './LoginForm';
import { AuthSuccessPayload } from '../types';
import { useAuth } from './AuthContext';

interface AuthContainerProps {
  onAuthSuccess: (authData: AuthSuccessPayload) => void;
}

export function AuthContainer({ onAuthSuccess }: AuthContainerProps): JSX.Element {
  const { login } = useAuth();

  const handleLoginSuccess = (authData: AuthSuccessPayload) => {
    login(authData);
    onAuthSuccess(authData);
  };

  return (
    <div className="h-full bg-muted/50 p-6 overflow-y-auto flex flex-col justify-center">
      <LoginForm onLoginSuccess={handleLoginSuccess} />
    </div>
  );
}
