// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardingCodeInput } from './boarding-code-input';

afterEach(() => cleanup());

function Harness({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return <BoardingCodeInput onChange={setValue} onComplete={onComplete} value={value} />;
}

describe('BoardingCodeInput (DRV-03 / D-079)', () => {
  it('fills slots as digits are typed and fires onComplete at six digits', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const input = screen.getByLabelText('Boarding code from the passenger');
    fireEvent.change(input, { target: { value: '12345' } });
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '123456' } });
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('accepts a pasted code and strips non-digits and overflow', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const input = screen.getByLabelText('Boarding code from the passenger');
    fireEvent.change(input, { target: { value: '12-34 5678' } });
    expect((input as HTMLInputElement).value).toBe('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('shakes when invalidPulse rises after a rejected verification', () => {
    const { container, rerender } = render(
      <BoardingCodeInput invalidPulse={0} onChange={() => {}} value="000000" />,
    );
    expect(container.querySelector('.rt-shake')).toBeNull();
    rerender(<BoardingCodeInput invalidPulse={1} onChange={() => {}} value="000000" />);
    expect(container.querySelector('.rt-shake')).not.toBeNull();
  });
});
