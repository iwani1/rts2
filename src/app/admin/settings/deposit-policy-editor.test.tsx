// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DepositPolicyEditor } from './deposit-policy-editor';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('DepositPolicyEditor', () => {
  it('starts unconfigured and saves only a selected explicit no-deposit choice with a reason', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ policy: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ setting: { configured: true } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<DepositPolicyEditor companyId="company-1" />);

    expect(await screen.findByText('Current state: Not configured')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Deposit requirement'), { target: { value: 'NOT_REQUIRED' } });
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Operator approved no deposit for rentals' } });
    fireEvent.submit(screen.getByLabelText('Reason for change').closest('form')!);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Deposit policy saved.'));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      key: 'rental.deposit_policy', value: { kind: 'NOT_REQUIRED' }, reason: 'Operator approved no deposit for rentals',
    });
  });

  it('requires stage and accepts explicit fixed amounts only in whole pesewas', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ policy: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ setting: { configured: true } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<DepositPolicyEditor companyId="company-1" />);
    await screen.findByText('Current state: Not configured');
    fireEvent.change(screen.getByLabelText('Deposit requirement'), { target: { value: 'FIXED_AMOUNT' } });
    fireEvent.change(screen.getByLabelText('Deposit amount (GHS pesewas)'), { target: { value: '50000' } });
    fireEvent.change(screen.getByLabelText('Deposit due'), { target: { value: 'BEFORE_CONFIRMATION' } });
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Operator approved deposit before confirmation' } });
    fireEvent.submit(screen.getByLabelText('Reason for change').closest('form')!);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Deposit policy saved.'));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).value).toEqual({
      kind: 'FIXED_AMOUNT', amountPesewas: 50000, collectionStage: 'BEFORE_CONFIRMATION',
    });
  });
});
