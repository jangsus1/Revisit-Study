/**
 * The consent page: the "Key information" box of the study's consent form
 * (public/cluster-flow-staircase/assets/consent-form.pdf; verbatim, without the duration and
 * compensation bullets, which may change between recruitment rounds), a link that opens or
 * downloads the full PDF (not embedded), and the consent sentence. The form's other sections are
 * only in the PDF (since 2026-10-09; before, the page showed them all). "I agree" is clickable at once (no minimum reading time on this page) and stores
 * `accept: 'Accept'`, as the earlier radio-button consent did; "I do not agree" explains how to
 * leave and does not advance.
 */
import { Button } from '@mantine/core';
import { IconFileDownload } from '@tabler/icons-react';
import { ReactNode, useEffect, useState } from 'react';
import type { StimulusParams } from '../../../store/types';
import { PREFIX } from '../../../utils/Prefix';
import { Panel } from './ui/Panel';
import { UI } from './ui/theme';

/** The consent form PDF, relative to the deployment's base path. */
export const CONSENT_PDF = 'cluster-flow-staircase/assets/consent-form.pdf';

function Key({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li style={{ marginBottom: 4 }}>
      <strong style={{ color: UI.ink }}>{`${label}: `}</strong>
      {children}
    </li>
  );
}

/** The consent page's text: the key information and the consent sentence. */
export function ConsentText() {
  return (
    <div data-testid="consent-text">
      <div
        data-testid="consent-key-information"
        style={{
          marginTop: 4, padding: '12px 18px', borderRadius: 10, background: '#f1f6fd', border: `1.5px solid ${UI.accent}33`,
        }}
      >
        <div style={{
          fontSize: 14, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: UI.accent, marginBottom: 6,
        }}
        >
          Key information
        </div>
        <ul style={{
          margin: 0, paddingLeft: 20, fontSize: 16, lineHeight: 1.5, color: '#343a40',
        }}
        >
          <Key label="Voluntary Participation">Consent is being sought for research purposes, and participation is voluntary.</Key>
          <Key label="Location">In order to participate in the study, you must be physically located in the United States at the time of participation.</Key>
          <Key label="Purpose">To analyze how people use visualization in LLM agent development and find out which visualization design best supports those tasks.</Key>
          <Key label="Procedures">You will interact with visualizations online or answer personal experiences through an interview.</Key>
          <Key label="Risks">Minimal risks such as eye strain or fatigue.</Key>
          <Key label="Note">Compensation is not provided if you withdraw early.</Key>
        </ul>
      </div>

      <p style={{
        marginTop: 20, fontSize: 17, fontWeight: 700, color: UI.ink,
      }}
      >
        By clicking &lsquo;Continue&rsquo; or &lsquo;I Agree&rsquo;, you are consenting to be in the study.
      </p>
    </div>
  );
}

export default function ConsentPage({ setAnswer, advance }: StimulusParams<undefined>) {
  const [declined, setDeclined] = useState(false);

  // Nothing is valid until "I agree": Enter cannot advance the page.
  useEffect(() => {
    setAnswer({ status: false, answers: {} });
  }, [setAnswer]);

  const agree = () => {
    setAnswer({ status: true, answers: { accept: 'Accept' } });
    advance?.();
  };

  return (
    <Panel
      testId="consent-page"
      kicker="Consent"
      title="Consent Form"
      maxWidth={780}
      alignLeft
      actions={declined ? undefined : (
        <>
          <Button size="lg" onClick={agree} data-testid="consent-agree">I agree</Button>
          <Button size="lg" variant="subtle" color="gray" onClick={() => setDeclined(true)} data-testid="consent-decline">
            I do not agree
          </Button>
        </>
      )}
    >
      <div style={{
        display: 'flex', justifyContent: 'flex-end', marginBottom: 4,
      }}
      >
        <a
          data-testid="consent-pdf-link"
          href={`${PREFIX}${CONSENT_PDF}`}
          target="_blank"
          rel="noreferrer"
          download="consent-form.pdf"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600, color: UI.accent,
          }}
        >
          <IconFileDownload size={18} />
          View or download the consent form (PDF)
        </a>
      </div>
      <ConsentText />
      {declined && (
        <div
          data-testid="consent-declined"
          style={{
            marginTop: 20, padding: '14px 18px', borderRadius: 10, background: '#fff4e6', border: '1.5px solid #fd7e14', color: '#7a3e00', fontSize: 17,
          }}
        >
          <strong>You chose not to take part.</strong>
          {' '}
          Thank you for your time. Please close this tab, or return to Prolific and withdraw from the
          study there.
          <div style={{ marginTop: 10 }}>
            <Button variant="subtle" onClick={() => setDeclined(false)}>Go back to the consent form</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
