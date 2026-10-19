'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SettingsPanel from '../../components/SettingsPanel';
import styles from './page.module.css';

function SetupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <SettingsPanel onSaved={() => router.replace(searchParams.get('returnTo') || '/')} />
      </div>
    </main>
  );
}

export default function SetupPage() {
  return <Suspense fallback={<main className={styles.page}>Loading setup...</main>}><SetupPageContent /></Suspense>;
}
