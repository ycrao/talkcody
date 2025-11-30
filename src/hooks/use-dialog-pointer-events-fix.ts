// src/hooks/use-dialog-pointer-events-fix.ts
import { useEffect } from 'react';

export function useDialogPointerEventsFix() {
  useEffect(() => {
    const fixPointerEvents = () => {
      const hasOpenDialog = document.querySelector('[data-state="open"][role="dialog"]');

      if (!hasOpenDialog) {
        document.body.style.pointerEvents = '';
      }
    };

    const observer = new MutationObserver(() => {
      setTimeout(fixPointerEvents, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'style'],
    });

    return () => observer.disconnect();
  }, []);
}
