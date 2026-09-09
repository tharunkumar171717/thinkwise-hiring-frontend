import { useEffect } from "react";

const BASE_TITLE = "Thinkwise Hiring Desk";

/**
 * Sets document.title to `${pageTitle} | Thinkwise Hiring Desk`.
 * Resets to the base title on unmount.
 */
export function useDocumentTitle(pageTitle?: string | null) {
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} | ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [pageTitle]);
}
