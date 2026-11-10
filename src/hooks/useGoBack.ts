import { useNavigate } from 'react-router-dom';

/**
 * The app's ← Back buttons: back to wherever you came from, like the browser's Back button (never
 * "up" to a fixed page, which made two pages send you back and forth between each other). Opened
 * straight from a link, with nothing to go back to: `fallback` instead.
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  return () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
