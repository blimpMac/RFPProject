import { useCallback, useEffect, useState } from 'react';
import type {
  SettingsResponse,
  StaffUser,
  StaffUsersResponse,
} from '../../../shared/contracts/accounts';
import { get } from '../../lib/api';

export function useAccountDirectory(enabled: boolean) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [accountResult, settingsResult] = await Promise.all([
        get<StaffUsersResponse>('staff-users'),
        get<SettingsResponse>('settings'),
      ]);
      setUsers(accountResult.users);
      const submission = settingsResult.settings.find(
        (setting) => setting.key === 'submission_options',
      );
      setDepartments(
        Array.isArray(submission?.value.departments)
          ? (submission.value.departments as string[])
          : [],
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load staff accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return { users, departments, loading, error, setError, load };
}
