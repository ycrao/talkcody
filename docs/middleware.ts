import { createI18nMiddleware } from "fumadocs-core/i18n/middleware";
import { i18n } from "@/lib/i18n";

export default createI18nMiddleware({
  ...i18n,
  format: (locale, path) => {
    // Remove all leading slashes to avoid double slashes
    const cleanPath = path.replace(/^\/+/, "");
    return `/${locale}${cleanPath ? "/" + cleanPath : ""}`;
  },
});

export const config = {
  // Matcher ignoring `/_next/`, `/api/`, and static assets
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
