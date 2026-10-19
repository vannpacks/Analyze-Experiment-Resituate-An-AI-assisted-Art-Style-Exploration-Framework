'use client';

import { useEffect, useState } from 'react';
import { apiFetchJson } from '../utils/api';
import styles from './SettingsPanel.module.css';

const FIELDS = [
  ['openai_api_key', 'OpenAI API key'],
  ['bfl_api_key_1', 'BFL API key'],
  ['bfl_api_key_2', 'BFL API key 2 (optional)'],
];

function EyeIcon({ off }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {off ? (
        <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
      ) : (
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
      )}
    </svg>
  );
}

export default function SettingsPanel({ title = 'Set up Style-AER', submitLabel = 'Start', onSaved }) {
  const [values, setValues] = useState({ openai_api_key: '', bfl_api_key_1: '', bfl_api_key_2: '' });
  const [visible, setVisible] = useState({});
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetchJson('/settings').then(setStatus).catch((error) => setMessage(error.message));
  }, []);

  const update = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  const toggle = (name) => setVisible((current) => ({ ...current, [name]: !current[name] }));

  const hasOpenaiKey = Boolean(status?.openai?.configured || values.openai_api_key.trim());
  const hasBflKey = Boolean(
    status?.bfl?.configured || values.bfl_api_key_1.trim() || values.bfl_api_key_2.trim()
  );

  const save = async (event) => {
    event.preventDefault();
    if (!hasOpenaiKey || !hasBflKey) {
      setMessage('OpenAI and at least one BFL key are required.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const updates = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value.trim().length > 0)
      );
      const updatedStatus = await apiFetchJson('/settings', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      setStatus(updatedStatus);
      setValues({ openai_api_key: '', bfl_api_key_1: '', bfl_api_key_2: '' });
      const setup = await apiFetchJson('/setup/status');
      if (setup.configured) {
        onSaved?.();
      } else {
        setMessage('OpenAI and at least one BFL key are required.');
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.description}>
        To run the AER-demo, please paste your OpenAI API key and BFL API key. You can obtain an
        OpenAI API key{' '}
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">here</a>
        , and a BFL key{' '}
        <a href="https://dashboard.bfl.ai/" target="_blank" rel="noreferrer">here</a>
        . Your key is stored locally on this computer and never shared.
      </p>
      <p className={styles.note}>
        <strong>Important:</strong> The text and images will be sent to OpenAI and Black Forest
        Labs. You may turn off the training option when setting up your key. Please use it
        according to your needs.
      </p>
      <form onSubmit={save}>
        {FIELDS.map(([name, label]) => (
          <div key={name} className={styles.field}>
            <input
              id={name}
              name={name}
              type={visible[name] ? 'text' : 'password'}
              value={values[name]}
              onChange={update}
              autoComplete="off"
              spellCheck={false}
              className={styles.input}
            />
            <label htmlFor={name} className={styles.label}>{label}</label>
            <button
              type="button"
              className={styles.toggle}
              onClick={() => toggle(name)}
              aria-label={visible[name] ? `Hide ${label}` : `Show ${label}`}
            >
              <EyeIcon off={visible[name]} />
            </button>
          </div>
        ))}
        <p className={styles.hint}>Leave a field blank to keep its current key. Enter a new key to replace it.</p>
        <button type="submit" className={styles.submit} disabled={saving || !hasOpenaiKey || !hasBflKey}>
          {saving ? 'Saving...' : submitLabel}
        </button>
      </form>
      {status && (
        <p className={styles.status}>
          OpenAI: {status.openai?.configured ? status.openai.masked : 'not configured'} · BFL:{' '}
          {status.bfl?.configured ? status.bfl.masked : 'not configured'}
        </p>
      )}
      {message && <p className={styles.error} role="alert">{message}</p>}
    </>
  );
}
