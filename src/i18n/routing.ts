import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  // The app router tree has no [locale] segment: the locale is resolved from
  // the NEXT_LOCALE cookie instead of the URL, so paths stay clean (/agenda).
  localePrefix: 'never'
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
