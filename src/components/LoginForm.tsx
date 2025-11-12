import React, { useState, useEffect, useRef } from 'react';
import { signIn, getRemainingLockoutTime } from '../utils/auth';
import { LoginFormData, FormErrors, AuthSuccessPayload } from '../types';

interface LoginFormProps {
  onLoginSuccess: (authData: AuthSuccessPayload) => void;
  onSwitchToSignup: () => void;
}

export function LoginForm({ onLoginSuccess, onSwitchToSignup }: LoginFormProps): JSX.Element {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: ''
  });
  
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string>('');
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTime, setLockoutTime] = useState(0);
  const lockoutIntervalRef = useRef<number | null>(null);

  const clearLockoutInterval = () => {
    if (lockoutIntervalRef.current !== null) {
      window.clearInterval(lockoutIntervalRef.current);
      lockoutIntervalRef.current = null;
    }
  };

  // Check for account lockout on component mount
  useEffect(() => {
    checkLockoutStatus();

    return () => {
      clearLockoutInterval();
    };
  }, []);

  const checkLockoutStatus = async () => {
    clearLockoutInterval();

    const remainingTime = await getRemainingLockoutTime();
    if (remainingTime > 0) {
      setIsLocked(true);
      setLockoutTime(remainingTime);
      
      // Update lockout time every minute
      lockoutIntervalRef.current = window.setInterval(async () => {
        const newTime = await getRemainingLockoutTime();
        if (newTime <= 0) {
          setIsLocked(false);
          setLockoutTime(0);
          clearLockoutInterval();
        } else {
          setLockoutTime(newTime);
        }
      }, 60000);
      
      return;
    }

    setIsLocked(false);
    setLockoutTime(0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear field-specific error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
    
    // Clear general error when user interacts with form
    if (generalError) {
      setGeneralError('');
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);
    setGeneralError('');
    
    try {
      const response = await signIn(formData.email, formData.password);
      
      if (response.success && response.user) {
        onLoginSuccess({
          user: response.user,
          token: response.token,
          tokenExpiry: response.tokenExpiry
        });
      } else {
        setGeneralError(response.error || 'Login failed. Please try again.');
        
        // Check if account is now locked
        if (response.error?.includes('Account temporarily locked')) {
          await checkLockoutStatus();
        }
      }
    } catch (error) {
      setGeneralError('An unexpected error occurred. Please try again.');
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLocked) {
    return (
      <div className="login-form-container">
        <div className="lockout-message">
          <div className="lockout-icon">🔒</div>
          <h3>Account Temporarily Locked</h3>
          <p>
            Too many failed login attempts. Please try again in{' '}
            <strong>{lockoutTime} minute{lockoutTime !== 1 ? 's' : ''}</strong>.
          </p>
          <div className="lockout-timer">
            <div className="timer-bar">
              <div 
                className="timer-progress" 
                style={{ width: `${(lockoutTime / 15) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-form-container">
      <div className="login-header">
        <h2>Welcome Back</h2>
        <p>Sign in to your account to continue</p>
      </div>
      
      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label htmlFor="email" className="form-label">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            className={`form-input ${errors.email ? 'error' : ''}`}
            placeholder="Enter your email"
            disabled={isLoading}
            autoComplete="email"
          />
          {errors.email && (
            <span className="error-message">{errors.email}</span>
          )}
        </div>
        
        <div className="form-group">
          <label htmlFor="password" className="form-label">
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            className={`form-input ${errors.password ? 'error' : ''}`}
            placeholder="Enter your password"
            disabled={isLoading}
            autoComplete="current-password"
          />
          {errors.password && (
            <span className="error-message">{errors.password}</span>
          )}
        </div>
        
        {generalError && (
          <div className="general-error">
            <span className="error-icon">⚠️</span>
            {generalError}
          </div>
        )}
        
        <button
          type="submit"
          className="login-button"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className="loading-spinner"></span>
              Signing In...
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </form>
      
      <div className="login-footer">
        <p>
          Don't have an account?{' '}
          <button
            type="button"
            className="link-button"
            onClick={onSwitchToSignup}
            disabled={isLoading}
          >
            Sign up here
          </button>
        </p>
      </div>
    </div>
  );
}
