import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MinSecInput } from '../MinSecInput';

describe('MinSecInput', () => {
  it('splits a stored seconds value into minutes and seconds fields', () => {
    render(<MinSecInput label="Bloom time" valueSeconds={185} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Bloom time minutes')).toHaveValue(3);
    expect(screen.getByLabelText('Bloom time seconds')).toHaveValue(5);
  });

  it('reports the combined seconds when minutes changes', () => {
    const onChange = vi.fn();
    render(<MinSecInput label="Bloom time" valueSeconds={185} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Bloom time minutes'), { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith(245); // 4*60 + 5
  });

  it('reports the combined seconds when seconds changes', () => {
    const onChange = vi.fn();
    render(<MinSecInput label="Bloom time" valueSeconds={185} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Bloom time seconds'), { target: { value: '30' } });
    expect(onChange).toHaveBeenCalledWith(210); // 3*60 + 30
  });

  it('treats a blank value as blank fields', () => {
    render(<MinSecInput label="Bloom time" valueSeconds="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Bloom time minutes')).toHaveValue(null);
    expect(screen.getByLabelText('Bloom time seconds')).toHaveValue(null);
  });

  it('hides the visible label when hideLabel is set, but keeps aria-labels', () => {
    render(<MinSecInput label="Agitation time" hideLabel valueSeconds={0} onChange={vi.fn()} />);
    expect(screen.queryByText('Agitation time')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Agitation time minutes')).toBeInTheDocument();
  });

  // Regression: deriving the displayed minutes/seconds straight from
  // valueSeconds on every render meant clearing one field always left the
  // other holding a number, so the pair could round-trip to "0:00" but
  // never back to fully blank once it had held any value.
  it('can be cleared back to a blank duration', () => {
    const onChange = vi.fn();
    render(<MinSecInput label="Bloom time" valueSeconds={45} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Bloom time seconds'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Bloom time minutes'), { target: { value: '' } });

    expect(onChange).toHaveBeenLastCalledWith('');
  });
});
