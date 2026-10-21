// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RentalReport } from './rental-report';

const report = {
  generatedAt: '2026-10-21T10:30:00.000Z', scope: 'all-time' as const, totalRequests: 7, submittedRequestsEver: 3,
  statuses: [{ status: 'Draft', count: 4 }, { status: 'Submitted', count: 3 }],
  sources: [{ source: 'Phone', count: 5 }, { source: 'Not recorded', count: 2 }],
  invoicing: {
    recognizedRevenuePesewas: 18900, paymentsReceivedPesewas: 9100, outstandingPesewas: 9800,
    standingInvoiceCount: 2, draftInvoiceCount: 1, voidedInvoiceCount: 0, reconciles: true,
  },
  unavailableMetrics: [
    { metric: 'Quotations issued and acceptance rate', reason: 'Quotation records exist per request.' },
    { metric: 'Vehicle utilisation', reason: 'No fleet availability calendar is modelled.' },
  ],
};

afterEach(() => cleanup());

describe('RentalReport', () => {
  it('shows persisted request aggregates and distinguishes unavailable metrics from zero', () => {
    render(<RentalReport report={report} />);
    expect(screen.getByRole('heading', { name: 'Rental request report' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Rental request records' })).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === 'P' && /Requests ever submitted:\s*3/.test(element.textContent ?? ''))).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === 'LI' && /Draft:\s*4/.test(element.textContent ?? ''))).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === 'LI' && /Phone:\s*5/.test(element.textContent ?? ''))).toBeTruthy();
    expect(screen.getByText(/GH₵ 189\.00/)).toBeTruthy();
    expect(screen.getByText(/GH₵ 98\.00/)).toBeTruthy();
    expect(screen.getByText(/Quotations issued and acceptance rate:/)).toBeTruthy();
    expect(screen.getByText(/Vehicle utilisation:/)).toBeTruthy();
    expect(screen.getByText(/not as zero/)).toBeTruthy();
  });

  it('renders a zero request count honestly when no records exist', () => {
    render(<RentalReport report={{ ...report, totalRequests: 0, submittedRequestsEver: 0, statuses: [], sources: [] }} />);
    expect(screen.getByLabelText('0 total rental requests')).toBeTruthy();
    expect(screen.getByText('No rental requests have been recorded.')).toBeTruthy();
  });
});
