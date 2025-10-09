import OfflinePage from '@/app/[locale]/(pwa)/offline/page';
import { routing } from '@/lib/i18n/config';

export default function OfflineRoot() {
  return <OfflinePage params={{ locale: routing.defaultLocale }} />;
}
