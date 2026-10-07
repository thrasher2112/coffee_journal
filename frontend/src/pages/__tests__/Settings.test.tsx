import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsPage } from '../Settings';

const api = vi.hoisted(() => ({ exportData: vi.fn(), importData: vi.fn(), fetchSetups: vi.fn() }));

vi.mock('../../lib/api', () => ({
  exportData: api.exportData,
  importData: api.importData,
  fetchSetups: api.fetchSetups,
  createSetup: vi.fn(),
  updateSetup: vi.fn(),
  deleteSetup: vi.fn(),
  NetworkError: class extends Error {},
  AuthError: class extends Error {},
  ApiError: class extends Error {}
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: '1', email: 'me@example.com' }, logout: vi.fn() })
}));

const importLocal = vi.fn();
vi.mock('../../hooks/useLocalBrewStore', () => ({
  useLocalBrewStore: () => ({ brews: [], unsynced: [], importLocal })
}));

vi.mock('../../hooks/useBrewSync', () => ({
  useBrewSync: () => ({ syncNow: vi.fn() })
}));

vi.mock('../../contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    preferences: { temperatureUnit: 'celsius', grinders: [], preferredGrinder: null },
    setPreference: vi.fn(),
    addGrinder: vi.fn(),
    removeGrinder: vi.fn(),
    setPreferredGrinder: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined)
  })
}));

const SETUP = {
  id: 's1',
  name: 'Office',
  brew_style: 'espresso',
  ratio: 2,
  dose_g: 18,
  grinder_name: null,
  grind_setting: null,
  target_time_s: null,
  machine_profile: null,
  created_at: '2026-10-07T00:00:00Z',
  updated_at: '2026-10-07T00:00:00Z'
};

function openModal() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole('button', { name: /back up \/ restore/i }));
}

async function restoreFile(contents: unknown) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([JSON.stringify(contents)], 'backup.json', { type: 'application/json' });
  // jsdom's File has no text(); the modal relies on it.
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify(contents) });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

describe('Settings backup / restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchSetups.mockResolvedValue([]);
  });

  it('writes a version-2 backup that includes setups', async () => {
    api.exportData.mockResolvedValue({
      beans: [{ id: 'b1', name: 'Bean' }],
      brews: [],
      preferences: null,
      setups: [SETUP]
    });
    let captured: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      captured = blob;
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    openModal();
    fireEvent.click(screen.getByRole('button', { name: /download backup/i }));

    await waitFor(() => expect(captured).toBeDefined());
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(captured as Blob);
    });
    const backup = JSON.parse(text);
    expect(backup.version).toBe(2);
    expect(backup.setups).toEqual([SETUP]);
    expect(backup.beans).toHaveLength(1);
    expect(await screen.findByText(/1 setup\b/)).toBeInTheDocument();
  });

  it('still writes a v2 backup (empty setups) from a server that sends none', async () => {
    api.exportData.mockResolvedValue({ beans: [], brews: [], preferences: null });
    let captured: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      captured = blob;
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    openModal();
    fireEvent.click(screen.getByRole('button', { name: /download backup/i }));

    await waitFor(() => expect(captured).toBeDefined());
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(captured as Blob);
    });
    expect(JSON.parse(text).setups).toEqual([]);
  });

  it('restores a v2 file, sending setups and reporting skipped ones', async () => {
    api.importData.mockResolvedValue({
      status: 'imported',
      counts: { beans: 1, brews: 0, setups: 1, setups_skipped: 1 }
    });

    openModal();
    await restoreFile({
      version: 2,
      beans: [{ id: 'b1', name: 'Bean' }],
      brews: [],
      setups: [SETUP, { ...SETUP, id: 's2', name: 'office' }],
      preferences: null
    });

    await waitFor(() => expect(api.importData).toHaveBeenCalledTimes(1));
    const sent = api.importData.mock.calls[0][0];
    expect(sent.setups).toHaveLength(2);
    expect(sent.beans).toHaveLength(1);
    expect(
      await screen.findByText(/Restored 1 bean, 0 brews and 1 setup\. 1 setup already existed/)
    ).toBeInTheDocument();
  });

  it('restores a v1 file with no setups unchanged', async () => {
    api.importData.mockResolvedValue({
      status: 'imported',
      counts: { beans: 2, brews: 1, setups: 0, setups_skipped: 0 }
    });

    openModal();
    await restoreFile({
      version: 1,
      beans: [{ id: 'b1', name: 'A' }, { id: 'b2', name: 'B' }],
      brews: [{ id: 'r1' }],
      preferences: null
    });

    await waitFor(() => expect(api.importData).toHaveBeenCalledTimes(1));
    const sent = api.importData.mock.calls[0][0];
    expect('setups' in sent).toBe(false);
    expect(sent.beans).toHaveLength(2);
    expect(sent.brews).toHaveLength(1);
    const restoreStatus = await screen.findByText(/Restored 2 beans and 1 brew\./);
    expect(restoreStatus.textContent).not.toMatch(/setup/i);
  });

  it('says setups were not restored when an older server returns no setup counts', async () => {
    api.importData.mockResolvedValue({ status: 'imported', counts: { beans: 1, brews: 0 } });

    openModal();
    await restoreFile({ version: 2, beans: [{ id: 'b1', name: 'Bean' }], brews: [], setups: [SETUP] });

    expect(
      await screen.findByText(/setups were not restored because the server does not support them/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/0 setups/)).toBeNull();
  });

  it('tolerates a server that returns no counts', async () => {
    api.importData.mockResolvedValue(undefined);

    openModal();
    await restoreFile({ version: 1, beans: [], brews: [{ id: 'r1' }] });

    expect(await screen.findByText(/Restored 0 beans and 1 brew\./)).toBeInTheDocument();
  });

  it('keeps backup / restore working when the setups list fails to load', async () => {
    api.fetchSetups.mockRejectedValue(new Error('offline'));
    api.exportData.mockResolvedValue({ beans: [], brews: [], preferences: null });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    openModal();

    expect(await screen.findByText(/couldn.t load your setups/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /measurement preferences/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /download backup/i }));
    expect(await screen.findByText(/backed up 0 beans/i)).toBeInTheDocument();
  });

  it('shows the setups section', async () => {
    api.fetchSetups.mockResolvedValue([SETUP]);
    render(<SettingsPage />);
    expect(await screen.findByText('Office · Espresso')).toBeInTheDocument();
  });
});
