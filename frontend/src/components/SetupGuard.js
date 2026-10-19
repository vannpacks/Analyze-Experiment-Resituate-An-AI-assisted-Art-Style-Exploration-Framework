'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetchJson } from '../utils/api';
import styles from './SetupGuard.module.css';

export default function SetupGuard({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState({ loading: true, configured: false, error: '' });

  const checkStatus = async () => {
    setState({ loading: true, configured: false, error: '' });
    try {
      const status = await apiFetchJson('/setup/status');
      setState({ loading: false, configured: status.configured, error: '' });
      if (!status.configured && pathname !== '/setup') {
        router.replace(`/setup/?returnTo=${encodeURIComponent(pathname || '/')}`);
      }
    } catch (error) {
      setState({ loading: false, configured: false, error: error.message });
    }
  };

  useEffect(() => {
    checkStatus();
  }, [pathname]);

  if (pathname === '/setup' || pathname === '/setup/') {
    return children;
  }
  if (state.loading) {
    return <div className={styles.loadingContainer}><p>Checking Style-AER setup...</p></div>;
  }
  if (state.error) {
    return (
      <div className={styles.loadingContainer}>
        <p>{state.error}</p>
        <button type="button" onClick={checkStatus}>Retry</button>
      </div>
    );
  }
  return state.configured ? children : null;
}
