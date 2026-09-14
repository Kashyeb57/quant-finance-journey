import React from 'react';
import {Redirect} from '@docusaurus/router';

// The Tools page had a single entry, so it was folded into Resources.
// Kept as a redirect so existing links and bookmarks still land somewhere useful.
export default function ToolsPage() {
  return <Redirect to="/resources" />;
}
