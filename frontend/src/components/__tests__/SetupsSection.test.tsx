import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SetupsSection, buildInput } from '../SetupsSection';

const api = vi.hoisted(() => ({
  fetchSetups: vi.fn(),
  createSetup: vi.fn(),
  updateSetup: vi.fn(),
  deleteSetup: vi.fn()
}));

vi.mock('../../lib/api', () => ({
  ...api,
  NetworkError: class NetworkError extends Error {},
  AuthError: class AuthError extends Error {},
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super(`Request failed: ${status}`);
      this.status = status;
    }
  }
}));

vi.mock('../../contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    preferences: {
      temperatureUnit: 'celsius',
      grinders: ['Extractamundo Dos!', 'Niche Zero'],
      preferredGrinder: 'Niche Zero'
    }
  })
}));

import { ApiError, AuthError, NetworkError } from '../../lib/api';

const OFFICE = {
  id: 's1',
  name: 'Office',
  brew_style: 'espresso',
  ratio: 3,
  dose_g: 18,
  grinder_name: 'Extractamundo Dos!',
  grind_setting: null,
  target_time_s: 36,
  machine_profile: null,
  created_at: '2026-10-07T00:00:00Z',
  updated_at: '2026-10-07T00:00:00Z'
};

const MINIMAL = {
  id: 's2',
  name: 'Plain V60',
  brew_style: 'pour-over',
  ratio: 16,
  dose_g: null,
  grinder_name: null,
  grind_setting: null,
  target_time_s: null,
  machine_profile: null,
  created_at: '2026-10-07T00:00:00Z',
  updated_at: '2026-10-07T00:00:00Z'
};

const apiError = (status: number) => new ApiError(status);

async function renderLoaded(setups: unknown[] = [OFFICE, MINIMAL]) {
  api.fetchSetups.mockResolvedValue(setups);
  render(<SetupsSection />);
  // Wait for the load to settle: rows, or the empty state.
  if (setups.length) await screen.findAllByRole('listitem');
  else await screen.findByText(/no setups yet/i);
}

const OFFLINE = 'Setups can only be changed while online';

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('SetupsSection', () => {
  beforeEach(() => {
    // Reset implementations too, so one test's mockResolvedValue cannot leak into the next.
    Object.values(api).forEach((fn) => fn.mockReset());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists setups with a formatted summary', async () => {
    await renderLoaded();

    const office = screen.getByText('Office · Espresso').closest('li') as HTMLElement;
    expect(
      within(office).getByText('18 g → 54 g, 1:3, 0:36, Extractamundo Dos!')
    ).toBeInTheDocument();

    const plain = screen.getByText('Plain V60 · Pour over').closest('li') as HTMLElement;
    expect(within(plain).getByText('1:16')).toBeInTheDocument();
  });

  it('formats decimal ratios without trailing zeros and includes grind setting and machine', async () => {
    await renderLoaded([
      { ...OFFICE, ratio: 2.5, dose_g: 18, grind_setting: '5.5', machine_profile: 'Lever, 9 bar' }
    ]);
    expect(
      screen.getByText('18 g → 45 g, 1:2.5, 0:36, Extractamundo Dos! @ 5.5, Lever, 9 bar')
    ).toBeInTheDocument();
  });

  it('shows an empty state when there are no setups', async () => {
    await renderLoaded([]);
    expect(screen.getByText(/no setups yet/i)).toBeInTheDocument();
  });

  it('creates a setup, accepting a decimal ratio and sending blank optionals as null', async () => {
    await renderLoaded([]);
    api.createSetup.mockResolvedValue({ ...MINIMAL, id: 's9', name: 'Home', brew_style: 'espresso', ratio: 2.5 });

    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    type('Setup name', '  Home ');
    type('Brew style', 'espresso');
    type('Ratio (1:x)', '2.5');
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));

    await waitFor(() => expect(api.createSetup).toHaveBeenCalledTimes(1));
    expect(api.createSetup).toHaveBeenCalledWith({
      name: 'Home',
      brew_style: 'espresso',
      ratio: 2.5,
      dose_g: null,
      grinder_name: null,
      grind_setting: null,
      target_time_s: null,
      machine_profile: null
    });
    // New row appears and the form closes.
    expect(await screen.findByText('Home · Espresso')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save setup/i })).toBeNull();
  });

  it('sends every filled field on create, including time as seconds', async () => {
    await renderLoaded([]);
    api.createSetup.mockResolvedValue(OFFICE);

    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    type('Setup name', 'Office');
    type('Brew style', 'espresso');
    type('Ratio (1:x)', '3');
    type('Dose (g)', '18.5');
    fireEvent.change(screen.getByLabelText('Target time minutes'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Target time seconds'), { target: { value: '36' } });
    type('Grinder', 'Extractamundo Dos!');
    type('Grind setting', '4.2');
    type('Machine profile', 'Lever');
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));

    await waitFor(() => expect(api.createSetup).toHaveBeenCalledTimes(1));
    expect(api.createSetup).toHaveBeenCalledWith({
      name: 'Office',
      brew_style: 'espresso',
      ratio: 3,
      dose_g: 18.5,
      grinder_name: 'Extractamundo Dos!',
      grind_setting: '4.2',
      target_time_s: 36,
      machine_profile: 'Lever'
    });
  });

  it('limits the style choices to the known presets', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    const options = within(screen.getByLabelText('Brew style'))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['pour-over', 'aeropress', 'french-press', 'espresso']);
  });

  it('offers preference grinders as suggestions', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    const listId = screen.getByLabelText('Grinder').getAttribute('list') as string;
    const values = Array.from(document.querySelectorAll(`datalist#${listId} option`)).map(
      (o) => (o as HTMLOptionElement).value
    );
    expect(values).toEqual(['Extractamundo Dos!', 'Niche Zero']);
  });

  it('does not submit an invalid form', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));
    expect(await screen.findByText(/enter a name/i)).toBeInTheDocument();

    type('Setup name', 'X');
    type('Ratio (1:x)', '0');
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));
    expect(await screen.findByText(/ratio must be greater than 0/i)).toBeInTheDocument();
    expect(api.createSetup).not.toHaveBeenCalled();
  });

  it('shows the computed yield live', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    type('Ratio (1:x)', '2.5');
    type('Dose (g)', '18');
    expect(screen.getByText(/yield: 45 g/i)).toBeInTheDocument();
  });

  it('edit prefills the form and sends null for a cleared optional field, only changed fields', async () => {
    await renderLoaded([{ ...OFFICE, grind_setting: '5', machine_profile: 'Lever' }]);
    api.updateSetup.mockResolvedValue({ ...OFFICE, grind_setting: null, machine_profile: 'Lever' });

    fireEvent.click(screen.getByRole('button', { name: /edit office/i }));
    expect(screen.getByLabelText('Setup name')).toHaveValue('Office');
    expect(screen.getByLabelText('Grind setting')).toHaveValue('5');
    expect(screen.getByLabelText('Ratio (1:x)')).toHaveValue(3);
    expect(screen.getByLabelText('Target time seconds')).toHaveValue(36);

    type('Grind setting', '');
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));

    await waitFor(() => expect(api.updateSetup).toHaveBeenCalledTimes(1));
    expect(api.updateSetup).toHaveBeenCalledWith('s1', { grind_setting: null });
    expect(api.createSetup).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('button', { name: /save setup/i })).toBeNull());
  });

  it('edit can clear the target time', async () => {
    await renderLoaded([OFFICE]);
    api.updateSetup.mockResolvedValue({ ...OFFICE, target_time_s: null });

    fireEvent.click(screen.getByRole('button', { name: /edit office/i }));
    fireEvent.change(screen.getByLabelText('Target time seconds'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Target time minutes'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));

    await waitFor(() => expect(api.updateSetup).toHaveBeenCalledWith('s1', { target_time_s: null }));
  });

  it('shows the duplicate-name message on 409 and keeps the form open', async () => {
    await renderLoaded([]);
    api.createSetup.mockRejectedValue(apiError(409));

    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    type('Setup name', 'Office');
    type('Ratio (1:x)', '2');
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));

    expect(await screen.findByText('You already have a setup with that name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save setup/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Setup name')).toHaveValue('Office');
  });

  it('shows the online-only message on a NetworkError', async () => {
    await renderLoaded([]);
    api.createSetup.mockRejectedValue(new NetworkError());

    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    type('Setup name', 'Office');
    type('Ratio (1:x)', '2');
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));

    expect(await screen.findByText('Setups can only be changed while online')).toBeInTheDocument();
  });

  it('shows a generic message on other errors', async () => {
    await renderLoaded([]);
    api.createSetup.mockRejectedValue(apiError(500));

    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    type('Setup name', 'Office');
    type('Ratio (1:x)', '2');
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));

    expect(await screen.findByText(/could not save the setup/i)).toBeInTheDocument();
  });

  it('removes a row after delete is confirmed', async () => {
    await renderLoaded();
    api.deleteSetup.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    fireEvent.click(screen.getByRole('button', { name: /delete office/i }));

    await waitFor(() => expect(api.deleteSetup).toHaveBeenCalledWith('s1'));
    await waitFor(() => expect(screen.queryByText('Office · Espresso')).toBeNull());
    expect(screen.getByText('Plain V60 · Pour over')).toBeInTheDocument();
  });

  it('keeps the row when delete is cancelled', async () => {
    await renderLoaded();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    fireEvent.click(screen.getByRole('button', { name: /delete office/i }));

    expect(api.deleteSetup).not.toHaveBeenCalled();
    expect(screen.getByText('Office · Espresso')).toBeInTheDocument();
  });

  it('keeps the row and says why when delete fails offline', async () => {
    await renderLoaded();
    api.deleteSetup.mockRejectedValue(new NetworkError());
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    fireEvent.click(screen.getByRole('button', { name: /delete office/i }));

    expect(await screen.findByText('Setups can only be changed while online')).toBeInTheDocument();
    expect(screen.getByText('Office · Espresso')).toBeInTheDocument();
  });

  it('rejects a ratio above 30 and a whitespace-only name', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));

    type('Setup name', '   ');
    type('Ratio (1:x)', '2');
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));
    expect(await screen.findByText(/enter a name/i)).toBeInTheDocument();

    type('Setup name', 'Weak');
    type('Ratio (1:x)', '31');
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));
    expect(await screen.findByText(/ratio can be at most 30/i)).toBeInTheDocument();
    expect(api.createSetup).not.toHaveBeenCalled();
  });

  it('rejects a fractional target time', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    type('Setup name', 'Office');
    type('Ratio (1:x)', '2');
    fireEvent.change(screen.getByLabelText('Target time seconds'), { target: { value: '36.5' } });
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));

    expect(await screen.findByText(/whole seconds/i)).toBeInTheDocument();
    expect(api.createSetup).not.toHaveBeenCalled();
  });

  it('counts characters, not UTF-16 units, against the 80-character name limit', async () => {
    await renderLoaded([]);
    api.createSetup.mockResolvedValue(MINIMAL);
    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    type('Setup name', '☕'.repeat(40) + '🫘'.repeat(40)); // 80 code points, 120 UTF-16 units
    type('Ratio (1:x)', '2');
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));
    await waitFor(() => expect(api.createSetup).toHaveBeenCalledTimes(1));
  });

  it('asks for a number when a numeric field holds something unparseable', () => {
    const base = {
      name: 'X',
      brew_style: 'espresso',
      ratio: '2',
      dose: '',
      target_time_s: '' as const,
      grinder_name: '',
      grind_setting: '',
      machine_profile: ''
    };
    expect(buildInput({ ...base, ratio: 'abc' })).toMatch(/enter a number/i);
    expect(buildInput({ ...base, dose: '1e' })).toMatch(/enter a number/i);
    expect(buildInput(base)).toMatchObject({ ratio: 2, dose_g: null });
  });

  it('asks the user to sign in again on a 401', async () => {
    await renderLoaded([]);
    api.createSetup.mockRejectedValue(new AuthError());
    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    type('Setup name', 'Office');
    type('Ratio (1:x)', '2');
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));

    expect(await screen.findByText(/sign in again/i)).toBeInTheDocument();
    expect(screen.queryByText(OFFLINE)).toBeNull();
  });

  it('focuses the name field when the form opens', async () => {
    await renderLoaded([OFFICE]);
    fireEvent.click(screen.getByRole('button', { name: /add setup/i }));
    expect(screen.getByLabelText('Setup name')).toHaveFocus();
  });

  it('names the form by its heading and announces loading', async () => {
    let resolve!: (v: unknown[]) => void;
    api.fetchSetups.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<SetupsSection />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading setups/i);
    resolve([]);
    fireEvent.click(await screen.findByRole('button', { name: /add setup/i }));
    expect(screen.getByRole('form', { name: 'New setup' })).toBeInTheDocument();
  });

  it('locks Cancel and the row actions while a save is in flight, then closes the same form', async () => {
    await renderLoaded([OFFICE, MINIMAL]);
    let finish!: (v: unknown) => void;
    api.updateSetup.mockReturnValue(new Promise((r) => (finish = r)));

    fireEvent.click(screen.getByRole('button', { name: /edit office/i }));
    type('Grind setting', '7');
    fireEvent.click(screen.getByRole('button', { name: /save setup/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled());
    expect(screen.getByRole('button', { name: /edit plain v60/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /edit office/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete office/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save setup/i })).toBeDisabled();

    finish({ ...OFFICE, grind_setting: '7' });
    await waitFor(() => expect(screen.queryByRole('button', { name: /save setup/i })).toBeNull());
    expect(screen.getByRole('button', { name: /edit plain v60/i })).toBeEnabled();
    expect(screen.getByText(/@ 7|, 7/)).toBeInTheDocument();
  });

  it('locks the actions while a delete is in flight', async () => {
    await renderLoaded([OFFICE, MINIMAL]);
    let finish!: () => void;
    api.deleteSetup.mockReturnValue(new Promise<void>((r) => (finish = r)));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    fireEvent.click(screen.getByRole('button', { name: /delete office/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /add setup/i })).toBeDisabled());
    expect(screen.getByRole('button', { name: /edit plain v60/i })).toBeDisabled();

    finish();
    await waitFor(() => expect(screen.queryByText('Office · Espresso')).toBeNull());
    expect(screen.getByRole('button', { name: /add setup/i })).toBeEnabled();
  });

  it('shows each row\'s own target time when switching between edit forms', async () => {
    await renderLoaded([OFFICE, { ...MINIMAL, target_time_s: 125 }, { ...MINIMAL, id: 's3', name: 'Zed' }]);

    fireEvent.click(screen.getByRole('button', { name: /edit office/i }));
    expect(screen.getByLabelText('Target time minutes')).toHaveValue(0);
    expect(screen.getByLabelText('Target time seconds')).toHaveValue(36);

    fireEvent.click(screen.getByRole('button', { name: /edit plain v60/i }));
    expect(screen.getByLabelText('Setup name')).toHaveValue('Plain V60');
    expect(screen.getByLabelText('Target time minutes')).toHaveValue(2);
    expect(screen.getByLabelText('Target time seconds')).toHaveValue(5);

    // A row without a time must not inherit the previous one's.
    fireEvent.click(screen.getByRole('button', { name: /edit zed/i }));
    expect(screen.getByLabelText('Setup name')).toHaveValue('Zed');
    expect(screen.getByLabelText('Target time minutes')).toHaveValue(null);
    expect(screen.getByLabelText('Target time seconds')).toHaveValue(null);
  });

  it('retries the load after a failure', async () => {
    api.fetchSetups.mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce([OFFICE]);
    render(<SetupsSection />);
    fireEvent.click(await screen.findByRole('button', { name: /retry/i }));

    expect(await screen.findByText('Office · Espresso')).toBeInTheDocument();
    expect(api.fetchSetups).toHaveBeenCalledTimes(2);
  });

  it('shows a quiet message when the list cannot be loaded', async () => {
    api.fetchSetups.mockRejectedValue(new NetworkError());
    render(<SetupsSection />);
    expect(await screen.findByText(/couldn.t load your setups/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add setup/i })).toBeNull();
  });
});
