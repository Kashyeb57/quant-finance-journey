import {getJson, postJson} from './api';

export function getBrainStatus(opts) {
  return getJson('/_m/brain/status', opts);
}

export function setBrainEnabled(enabled, token) {
  return postJson('/_m/brain/control', {enabled}, {token});
}

// The local runner is a separate, read-only service, not a /_m/* backend.
// Fixed address prevents accidentally forwarding owner credentials elsewhere.
export async function getLocalBrainStatus(signal) {
  const response = await fetch('http://127.0.0.1:8767/status', {cache: 'no-store', signal});
  if (!response.ok) throw new Error(`Local runner returned HTTP ${response.status}`);
  const report = await response.json();
  return {report, online: Date.now() - Date.parse(report.updated_at) < 120000,
    seen_at: report.updated_at, enabled: null, orders: [], local: true};  // the website's switch is not visible locally
}
