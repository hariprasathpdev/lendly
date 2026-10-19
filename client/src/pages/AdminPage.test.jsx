import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPage from './AdminPage.jsx';
import { apiRequest } from '../services/api.js';

vi.mock('../services/api.js', () => ({ apiRequest: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdminPage listing moderation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockImplementation(async (path) => {
      if (path === '/admin/overview') return { counts: {
        students: 0, activeBookings: 0, listingsToReview: 0, reportsToReview: 0,
        disputesToReview: 0, refundsToReview: 0, securityEventsToReview: 0,
        overdueBookings: 0, feesToReview: 0,
      } };
      if (path === '/admin/listings?status=approved') return { listings: [{
        id: 'listing-1', title: 'Portable projector', description: 'A working projector for campus presentations.',
        condition: 'good', pricePerDay: 20, depositAmount: 0, lateFeePerDay: 0,
        handoverLocation: 'Library entrance', rules: null, status: 'approved', createdAt: '2026-10-18T10:00:00.000Z',
        category: { name: 'Electronics' }, owner: { fullName: 'Campus student' }, photos: [],
      }] };
      return { listings: [] };
    });
  });

  it('archives an approved listing only after an admin records a reason', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><AdminPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Approved listings' }));
    expect(await screen.findByRole('heading', { name: 'Portable projector' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason for removal'), { target: { value: 'Does not meet campus safety rules.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove listing' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/admin/listings/listing-1/remove', {
      method: 'PATCH', body: { reason: 'Does not meet campus safety rules.' },
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Listing removed from the campus marketplace.');
  });
});
