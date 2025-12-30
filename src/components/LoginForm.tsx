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
      <div className="glass-card">
        <div className="text-center py-10 px-5">
          <div className="text-5xl mb-4">🔒</div>
          <h3 className="text-destructive font-semibold text-lg mb-3">Account Temporarily Locked</h3>
          <p className="text-muted-foreground mb-5">
            Too many failed login attempts. Please try again in{' '}
            <strong>{lockoutTime} minute{lockoutTime !== 1 ? 's' : ''}</strong>.
          </p>
          <div className="mt-5">
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-destructive transition-all duration-1000 ease-linear" 
                style={{ width: `${(lockoutTime / 15) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-foreground mb-2">Welcome Back</h2>
        <p className="text-sm text-muted-foreground">Sign in to your account to continue</p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            className={`w-full h-10 px-3 py-2 bg-background border rounded-md text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${errors.email ? 'border-destructive' : 'border-input'}`}
            placeholder="Enter your email"
            disabled={isLoading}
            autoComplete="email"
          />
          {errors.email && (
            <span className="text-xs text-destructive mt-1">{errors.email}</span>
          )}
        </div>
        
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            className={`w-full h-10 px-3 py-2 bg-background border rounded-md text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${errors.password ? 'border-destructive' : 'border-input'}`}
            placeholder="Enter your password"
            disabled={isLoading}
            autoComplete="current-password"
          />
          {errors.password && (
            <span className="text-xs text-destructive mt-1">{errors.password}</span>
          )}
        </div>
        
        {generalError && (
          <div className="flex items-center p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            <span className="mr-2">⚠️</span>
            {generalError}
          </div>
        )}
        
        <button
          type="submit"
          className="w-full h-11 px-5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"></div>
              Signing In...
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </form>
      
      <div className="text-center mt-6 pt-6 border-t border-border">
        <p className="text-sm text-muted-foreground">
          Don't have an account?{' '}
          <button
            type="button"
            className="text-primary underline hover:text-primary/80 font-medium transition-colors bg-transparent border-none cursor-pointer"
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
