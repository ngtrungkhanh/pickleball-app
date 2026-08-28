import { describe, expect, it, vi } from 'vitest';
import { navigateToAnalysis, type AnalysisNavigationEvent } from '../analysis-navigation';

function navigationEvent(overrides: Partial<AnalysisNavigationEvent> = {}): AnalysisNavigationEvent {
  return {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

describe('navigateToAnalysis', () => {
  it('navigates immediately on a normal click without preparing cache', () => {
    const event = navigationEvent();
    const navigate = vi.fn();

    expect(navigateToAnalysis(event, navigate)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/analysis');
  });

  it('keeps browser behavior for a modified click', () => {
    const event = navigationEvent({ ctrlKey: true });
    const navigate = vi.fn();

    expect(navigateToAnalysis(event, navigate)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
