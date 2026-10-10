import { MantineProvider } from '@mantine/core';
import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import ConsentPage, { CONSENT_PDF } from '../ConsentPage';

vi.mock('../ui/studyContext', () => ({ useStudyProgress: () => null, useUpcomingCell: () => null }));

function renderConsent() {
  const setAnswer = vi.fn();
  const advance = vi.fn();
  render(
    <MantineProvider>
      <ConsentPage parameters={undefined} setAnswer={setAnswer} advance={advance} answers={{}} useTrrack={(() => undefined) as never} />
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
  test('shows only the key information and the consent sentence; the rest is in the PDF', () => {
    renderConsent();
    const text = screen.getByTestId('consent-text').textContent as string;
    ['Voluntary Participation', 'physically located in the United States', 'Compensation is not provided if you withdraw early',
      'Minimal risks such as eye strain or fatigue', 'By clicking ‘Continue’ or ‘I Agree’, you are consenting to be in the study.']
      .forEach((phrase) => expect(text).toContain(phrase));
    expect(screen.getByTestId('consent-key-information').querySelectorAll('li')).toHaveLength(6);
    // the form's long sections are no longer on the page
    ['Confidentiality', 'Georgia Institute of Technology IRB', 'There are no costs to you', 'What Am I Being Asked To Do?',
      'Flowchart Visualization'].forEach((phrase) => expect(text).not.toContain(phrase));
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    // whatever may change between rounds is left out
    expect(text).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/minutes/i);
    expect(text).not.toMatch(/Duration/);
    // the two buttons
    expect(screen.getByTestId('consent-agree')).toBeTruthy();
    expect(screen.getByTestId('consent-decline')).toBeTruthy();
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

  test('"I agree" is clickable at once, stores Accept and advances', () => {
    const { setAnswer, advance } = renderConsent();
    expect(setAnswer).toHaveBeenLastCalledWith({ status: false, answers: {} });
    const agree = screen.getByTestId('consent-agree') as HTMLButtonElement;
    expect(agree.disabled).toBe(false);
    expect(agree.textContent).toBe('I agree');
    fireEvent.click(agree);
    expect(setAnswer).toHaveBeenLastCalledWith({ status: true, answers: { accept: 'Accept' } });
    expect(advance).toHaveBeenCalledTimes(1);
  });

  test('"I do not agree" explains how to leave and does not advance', () => {
    const { setAnswer, advance } = renderConsent();
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
