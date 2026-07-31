// components/AuthGuard.js
'use client';

import { useState, useEffect } from 'react';
import styles from './AuthGuard.module.css';

export default function AuthGuard({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authRequired, setAuthRequired] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 檢查認證狀態
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // 檢查本地認證狀態
        const localAuth = sessionStorage.getItem('style_authenticated');
        
        // 檢查後端是否需要認證
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/config`, {
          method: 'GET',
        });

        if (response.ok) {
          const data = await response.json();
          setAuthRequired(data.auth_required);
          
          if (data.auth_required) {
            // 如果需要認證，檢查本地認證狀態
            if (localAuth === 'true') {
              setIsAuthenticated(true);
            } else {
              setShowModal(true);
            }
          } else {
            // 不需要認證，直接通過
            setIsAuthenticated(true);
          }
        } else {
          // 無法連接後端，假設需要認證
          setAuthRequired(true);
          if (localAuth === 'true') {
            setIsAuthenticated(true);
          } else {
            setShowModal(true);
          }
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        // 錯誤情況下檢查本地認證狀態
        const localAuth = sessionStorage.getItem('style_authenticated');
        if (localAuth === 'true') {
          setIsAuthenticated(true);
        } else {
          setAuthRequired(true);
          setShowModal(true);
        }
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!credentials.username.trim() || !credentials.password.trim()) {
      setError('Please enter both username and password');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 認證成功，保存到 sessionStorage
        sessionStorage.setItem('style_authenticated', 'true');
        setIsAuthenticated(true);
        setShowModal(false);
        setCredentials({ username: '', password: '' });
      } else {
        setError(data.message || 'Invalid credentials');
      }
    } catch (error) {
      console.error('Auth error:', error);
      setError('Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  };



  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  // 如果已認證或不需要認證，顯示子組件
  if (isAuthenticated) {
    return children;
  }

  // 顯示認證 modal
  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modalContainer}>
        <div className={styles.modalContent}>
          <div className={styles.modalHeader}>
            <div className={styles.logo}>
              <span className={styles.logoIcon}>✦</span>
              <span className={styles.logoText}>Style</span>
            </div>
            <h2 className={styles.modalTitle}>Access Required</h2>
          </div>

          <form onSubmit={handleSubmit} className={styles.authForm}>
            <div className={styles.inputGroup}>
              <label htmlFor="username" className={styles.inputLabel}>
                Username
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={credentials.username}
                onChange={handleInputChange}
                className={styles.authInput}
                placeholder="Enter username"
                autoComplete="username"
                disabled={submitting}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="password" className={styles.inputLabel}>
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={credentials.password}
                onChange={handleInputChange}
                className={styles.authInput}
                placeholder="Enter password"
                autoComplete="current-password"
                disabled={submitting}
              />
            </div>

            {error && (
              <div className={styles.errorMessage}>
                {error}
              </div>
            )}

            <button 
              type="submit" 
              className={styles.submitButton}
              disabled={submitting || !credentials.username.trim() || !credentials.password.trim()}
            >
              {submitting ? 'Verifying...' : 'Access Service'}
            </button>
          </form>

          <div className={styles.modalFooter}>
            <p className={styles.footerText}>
              This service requires authorization to access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}