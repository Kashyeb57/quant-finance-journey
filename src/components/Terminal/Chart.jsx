import React, { useEffect, useRef } from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import styles from './styles.module.css';

/*
 * Price chart — TradingView's free embeddable Advanced Chart widget.
 * No API keys, no proxy: the widget loads live data directly. We re-inject it
 * whenever the symbol or the site's light/dark theme changes.
 */
export default function Chart({ symbol }) {
  const ref = useRef(null);
  const { colorMode } = useColorMode();

  useEffect(() => {
    const container = ref.current;
    if (!container) return undefined;
    container.innerHTML =
      '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const script = document.createElement('script');
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: 'D',
      timezone: 'Etc/UTC',
      theme: colorMode === 'dark' ? 'dark' : 'light',
      style: '1',
      locale: 'en',
      allow_symbol_change: true,
      hide_side_toolbar: false,
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);
    return () => {
      if (container) container.innerHTML = '';
    };
  }, [symbol, colorMode]);

  return <div className={styles.chartWrap} ref={ref} />;
}
