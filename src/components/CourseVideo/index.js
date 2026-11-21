import React, { useEffect, useState } from 'react';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import VIDEOS from './videos';
import styles from './styles.module.css';

// Owner-only "Watch lecture" link on the bootcamp pages. The lecture videos sit
// in a private OneDrive folder that only the owner's Microsoft account can open.
// The folder's address is never in the site code: the owner turns the link on
// once per browser by opening any page with
//   #lecture-videos=https://<tenant>-my.sharepoint.com/personal/<account>
// and off again with #lecture-videos=off. Everyone else sees nothing.

const KEY = 'qf-lecture-videos';
const HASH = '#lecture-videos=';
const PREFIX = 'Quant_Finance_Bootcamp/';
const FOLDER = 'Documents/Joyeb Kashyeb/Quant_Journey_Meehul/Quant Finance Videos';
// Only a OneDrive for Business root is accepted, so a crafted link can never
// point the button at some other site.
const BASE_RE = /^https:\/\/[a-z0-9-]+-my\.sharepoint\.com\/personal\/[A-Za-z0-9_]+$/;

function readBase() {
  try {
    const v = window.localStorage.getItem(KEY);
    return v && BASE_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

function takeHash() {
  const { hash, pathname, search } = window.location;
  if (!hash.startsWith(HASH)) return;
  const value = decodeURIComponent(hash.slice(HASH.length)).trim().replace(/\/+$/, '');
  try {
    if (value === 'off') window.localStorage.removeItem(KEY);
    else if (BASE_RE.test(value)) window.localStorage.setItem(KEY, value);
  } catch { /* storage blocked */ }
  // Drop the address from the URL bar and history.
  window.history.replaceState(null, '', pathname + search);
}

function oneDriveLink(base, file) {
  const { origin, pathname } = new URL(base);
  const folder = `${pathname}/${FOLDER}`;
  const id = file ? `${folder}/${file}` : folder;
  const parent = file ? `&parent=${encodeURIComponent(folder)}` : '';
  return `${origin}${pathname}/_layouts/15/onedrive.aspx?id=${encodeURIComponent(id)}${parent}`;
}

export default function CourseVideo() {
  const { metadata } = useDoc();
  const source = metadata.source || '';
  const at = source.indexOf(PREFIX);
  const entry = at >= 0 ? VIDEOS[source.slice(at + PREFIX.length)] : null;

  const [base, setBase] = useState(null);
  useEffect(() => {
    takeHash();
    setBase(readBase());
  }, []);

  if (!entry || !base) return null;
  const [file, minutes] = entry;
  const title = file.replace(/\.mp4$/i, '');

  return (
    <div className={styles.box}>
      <a className={styles.watch} href={oneDriveLink(base, file)} target="_blank" rel="noopener noreferrer">
        ▶ Watch lecture
      </a>
      <span className={styles.meta}>
        {title}
        {minutes > 0 && ` · ${minutes} min`}
      </span>
      <a className={styles.all} href={oneDriveLink(base, null)} target="_blank" rel="noopener noreferrer">
        All lectures
      </a>
      <span className={styles.note}>Only you see this. Opens your private OneDrive.</span>
    </div>
  );
}
