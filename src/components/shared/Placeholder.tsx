import { Screen } from './Screen';
import { AppHeader } from './AppHeader';
import { EmptyState } from './EmptyState';
import type { IconName } from '../ui/icon';

/** Temporary scaffold for screens not yet rebuilt. */
export function Placeholder({ title, icon = 'hammer-wrench' }: { title: string; icon?: IconName }) {
  return (
    <Screen>
      <AppHeader title={title} />
      <EmptyState icon={icon} title={title} description="Màn hình đang được dựng lại." />
    </Screen>
  );
}
