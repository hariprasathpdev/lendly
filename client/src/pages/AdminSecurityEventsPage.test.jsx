import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminSecurityEventsPage from './AdminSecurityEventsPage.jsx';
import { apiRequest } from '../services/api.js';

vi.mock('../services/api.js', () => ({ apiRequest: vi.fn() }));

describe('AdminSecurityEventsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockImplementation(async (_path, options) => {
      if (options?.method === 'PATCH') return { status: 'under_review' };
      return { events: [{
        id: 'event-1', eventType: 'admin_access_denied', source: 'admin_api', severity: 'medium', status: 'open',
        occurrenceCount: 3, firstSeenAt: '2026-10-18T10:00:00.000Z', lastSeenAt: '2026-10-18T10:30:00.000Z',
        actor: { fullName: 'Campus student' },
      }], total: 1 };
    });
  });

  it('shows campus event details and can move an event into review', async () => {
    render(<MemoryRouter><AdminSecurityEventsPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: /attempted an admin action/i })).toBeInTheDocument();
    expect(screen.getByText(/Occurrences:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/admin/security-events/event-1/review', {
      method: 'PATCH', body: { action: 'review' },
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Event moved to the review queue.');
  });
});
