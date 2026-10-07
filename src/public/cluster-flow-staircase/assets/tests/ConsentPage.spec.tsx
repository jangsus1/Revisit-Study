import { MantineProvider } from '@mantine/core';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import ConsentPage, { CONSENT_PDF, ConsentPageParameters } from '../ConsentPage';

vi.mock('../ui/studyContext', () => ({ useStudyProgress: () => null, useUpcomingCell: () => null }));

function renderConsent(parameters?: ConsentPageParameters) {
  const setAnswer = vi.fn();
  const advance = vi.fn();
  render(
    <MantineProvider>
      <ConsentPage parameters={parameters} setAnswer={setAnswer} advance={advance} answers={{}} useTrrack={(() => undefined) as never} />
    </MantineProvider>,
  );
  return { setAnswer, advance };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ConsentPage', () => {
  test('shows the form text without duration or compensation amounts', () => {
    renderConsent();
    const text = screen.getByTestId('consent-text').textContent as string;
    ['Flowchart Visualization', 'physically located in the United States', 'Compensation is not provided if you withdraw early',
      'full compensation will not be given to those who withdraw early', 'Georgia Institute of Technology IRB', 'cxiong@gatech.edu',
      'IRB@gatech.edu', 'There are no costs to you', 'you are consenting to be in the study']
      .forEach((phrase) => expect(text).toContain(phrase));
    // whatever may change between rounds is left out
    expect(text).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/minutes/i);
    expect(text).not.toMatch(/Duration/);
    expect(screen.getByTestId('consent-key-information').querySelectorAll('li')).toHaveLength(6);
  });

  test('links the PDF for viewing or download without embedding it', () => {
    renderConsent();
    const link = screen.getByTestId('consent-pdf-link');
    expect(link.getAttribute('href')).toBe(`/${CONSENT_PDF}`);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('download')).toBe('consent-form.pdf');
    expect(link.textContent).toContain('View or download the consent form (PDF)');
    expect(document.querySelector('iframe, embed, object')).toBeNull();
  });

  test('"I agree" waits for the computed reading time, then stores Accept and advances', () => {
    const { setAnswer, advance } = renderConsent();
    expect(setAnswer).toHaveBeenLastCalledWith({ status: false, answers: {} });
    const agree = screen.getByTestId('consent-agree') as HTMLButtonElement;
    expect(agree.disabled).toBe(true);
    // about 560 words at 240 per minute: more than two minutes
    const seconds = Number((agree.textContent as string).match(/(\d+) s$/)?.[1]);
    expect(seconds).toBeGreaterThan(120);
    act(() => { vi.advanceTimersByTime(seconds * 1000); });
    expect(agree.disabled).toBe(false);
    fireEvent.click(agree);
    expect(setAnswer).toHaveBeenLastCalledWith({ status: true, answers: { accept: 'Accept' } });
    expect(advance).toHaveBeenCalledTimes(1);
  });

  test('"I do not agree" explains how to leave and does not advance', () => {
    const { setAnswer, advance } = renderConsent({ readingSeconds: 1 });
    fireEvent.click(screen.getByTestId('consent-decline'));
    expect(screen.getByTestId('consent-declined').textContent).toContain('close this tab');
    expect(screen.getByTestId('consent-declined').textContent).toContain('Prolific');
    expect(screen.queryByTestId('consent-agree')).toBeNull();
    expect(advance).not.toHaveBeenCalled();
    expect(setAnswer).not.toHaveBeenCalledWith(expect.objectContaining({ status: true }));
    // and back to the form
    fireEvent.click(screen.getByRole('button', { name: 'Go back to the consent form' }));
    expect(screen.getByTestId('consent-agree')).toBeTruthy();
  });
});
