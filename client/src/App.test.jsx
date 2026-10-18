import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App.jsx';
describe('Lendly landing page',()=>{it('shows the borrowing promise and campus categories',()=>{render(<MemoryRouter><App/></MemoryRouter>);expect(screen.getByRole('heading',{name:/Good things are/i})).toBeInTheDocument();expect(screen.getByText('Books & notes')).toBeInTheDocument();expect(screen.getByRole('link',{name:/Join your campus/i})).toHaveAttribute('href','/signup')})});
