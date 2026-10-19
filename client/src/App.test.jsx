import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App.jsx';
afterEach(cleanup);
describe('Lendly landing page', () => {
  it('shows the borrowing promise, student benefits, and campus categories', () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /Good things are/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Make campus life a little easier.' })).toBeInTheDocument();
    expect(screen.getByText('Books & notes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Join your campus/i })).toHaveAttribute('href', '/signup');
  });

  it('shows the setup state when the campus support contact is not configured', async () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    fireEvent.click(screen.getByRole('link', { name: 'Contact' }));
    expect(await screen.findByRole('heading', { name: 'Contact Lendly' })).toBeInTheDocument();
    expect(screen.getByText('The campus support contact has not been configured yet.')).toBeInTheDocument();
  });
});
