import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/supabase.js', () => ({
  supabase: { auth: { signUp: vi.fn() } },
}));
vi.mock('../services/api.js', () => ({
  apiRequest: vi.fn(),
}));

import { supabase } from '../services/supabase.js';
import { apiRequest } from '../services/api.js';
import { SignupPage } from './AuthPages.jsx';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  apiRequest.mockResolvedValue({ data: { allowed: true } });
  supabase.auth.signUp.mockResolvedValue({ error: null });
});

it('sends accepted policy state with signup so the database can timestamp it', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><SignupPage /></MemoryRouter>);
  await user.type(screen.getByLabelText('Full name'), 'Ada Student');
  await user.type(screen.getByLabelText('College email'), 'ada@kongu.edu');
  await user.type(screen.getByLabelText('Password'), 'safe-password-123');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: /Create account/ }));

  await waitFor(() => expect(supabase.auth.signUp).toHaveBeenCalled());
  expect(supabase.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
    email: 'ada@kongu.edu',
    options: expect.objectContaining({
      data: { full_name: 'Ada Student', terms_accepted: true },
    }),
  }));
  expect(await screen.findByText(/Check your college inbox/)).toBeTruthy();
});

it('does not submit signup when the policy checkbox is not selected', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><SignupPage /></MemoryRouter>);
  await user.type(screen.getByLabelText('Full name'), 'Ada Student');
  await user.type(screen.getByLabelText('College email'), 'ada@kongu.edu');
  await user.type(screen.getByLabelText('Password'), 'safe-password-123');
  await user.click(screen.getByRole('button', { name: /Create account/ }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Accept the Terms and Privacy Policy to continue.');
  expect(apiRequest).not.toHaveBeenCalled();
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});
