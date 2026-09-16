import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { AppErrorException } from '../../../lib/contracts/envelope';
import { requireUserContext } from '../../../lib/auth/require-user';
import { getDb } from '../../../lib/db/client';
import { ProfileRepository } from '../../../lib/repositories/profile-repository';
import { ExportButton } from './export-button';
import { ImportPanel } from './import-panel';
import { MeasurementsPanel } from './measurements-panel';
import { SignOutButton } from './sign-out-button';
import { UnitChoices } from './unit-choices';

/**
 * Settings (M3-09, #66), task 2.
 *
 * The unit preference is read **server-side** and painted into the initial render, which is the
 * card's requirement and the only way the first pixel is in the athlete's unit. A client fetch that
 * patched the numbers in afterwards would show every weighted screen in kg for a frame — and on a
 * 220 lb lifter's history page that flash is a different workout, briefly.
 */
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  let context;
  try {
    context = await requireUserContext();
  } catch (error) {
    if (error instanceof AppErrorException && error.appError.code === 'UNAUTHENTICATED') {
      redirect('/sign-in');
    }
    throw error;
  }

  const profile = await new ProfileRepository(getDb(), context.claims).getProfile(context.userId);
  const unit = profile?.preferredUnit ?? 'kg';

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          {profile?.displayName ? profile.displayName : profile?.email ?? 'This account'}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Display units</CardTitle>
          <CardDescription>
            Weights are stored in kilograms. This setting changes only how they are shown and typed,
            so switching it never touches a logged set, a personal record, or a queued mutation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UnitChoices initialUnit={unit} />
        </CardContent>
      </Card>

      <ImportPanel />

      <ExportButton />

      <Card>
        <CardHeader>
          <CardTitle>Body measurements</CardTitle>
          <CardDescription>
            Weight, body fat, and girths are stored on the server — one row per
            day and kind, so correcting a measurement overwrites it instead of
            stacking a duplicate.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <MeasurementsPanel unit={unit} />
          <p className="text-xs text-muted-foreground">
            The legacy dashboard had no measurements to import: the storage key
            its summary screen read was never written by any code in that app —
            those figures were invented at render time (whole-estate audit,
            2026-09-16). What the legacy keys really held arrived through the
            importer above, and the guest-mode flag is device-local state with
            nothing to archive.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signing out</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Signing out ends this account&apos;s session on <strong>every device</strong>, not just
            this browser. There is no per-device sign-out.
          </p>
          <SignOutButton />
          <p className="text-xs text-muted-foreground">
            Anything still queued on this device is sent before the form submits only if the tab was
            open long enough to drain; work logged seconds ago may stay queued here until you sign
            back in.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <Link href="/history" className="underline underline-offset-4">
          Your workout history
        </Link>{' '}
        shows everything this account has logged, including imported sessions.
      </p>
    </main>
  );
}
