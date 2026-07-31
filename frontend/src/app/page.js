'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Generate a random projectId
    const generateProjectId = () => {
      const timestamp = Date.now().toString(36);
      const randomStr = Math.random().toString(36).substring(2, 8);
      return `${timestamp}${randomStr}`;
    };

    const projectId = generateProjectId();
    console.log('Generated new projectId:', projectId);
    
    // Redirect directly to analysis page
    router.replace(`/project/${projectId}`);
  }, [router]);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      backgroundColor: '#f5f5f5',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        padding: '2rem',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <span style={{ fontSize: '2rem' }}>✦</span>
          <span style={{ fontSize: '1.5rem', marginLeft: '0.5rem', fontWeight: '600' }}>Style</span>
        </div>
        <p style={{ color: '#666', margin: 0 }}>Initializing...</p>
      </div>
    </div>
  );
}