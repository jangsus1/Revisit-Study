/**
 * The consent page: the text of the study's consent form (public/cluster-flow-staircase/assets/
 * consent-form.pdf) in the Panel layout, verbatim except for the parts that may change between
 * recruitment rounds, which are left out: the duration bullet and sentences and the compensation
 * amounts (the sentence on withdrawing early is kept). A link opens or downloads the PDF; it is not
 * embedded. "I agree" is clickable at once (no minimum reading time on this page) and stores
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <h2 style={{
        margin: '0 0 6px', fontSize: 18, fontWeight: 750, color: UI.ink,
      }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 16.5, lineHeight: 1.55, color: '#343a40' }}>{children}</div>
    </section>
  );
}

function Key({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li style={{ marginBottom: 4 }}>
      <strong style={{ color: UI.ink }}>{`${label}: `}</strong>
      {children}
    </li>
  );
}

/** The consent form's text (without duration and compensation amounts). */
export function ConsentText() {
  return (
    <div data-testid="consent-text">
      <div style={{ fontSize: 16, color: UI.muted }}>
        <strong style={{ color: UI.ink }}>Project Title:</strong>
        {' '}
        Flowchart Visualization
      </div>

      <div
        data-testid="consent-key-information"
        style={{
          marginTop: 14, padding: '12px 18px', borderRadius: 10, background: '#f1f6fd', border: `1.5px solid ${UI.accent}33`,
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

      <Section title="What Am I Being Asked To Do?">
        You are being asked to be a volunteer in a research study. This page will give you key
        information to help you decide if you would like to participate. Your participation is
        voluntary. As you read, please feel free to ask any questions you may have about the research.
      </Section>

      <Section title="What Is This Study About and What Procedures Will You Be Asked to Follow?">
        The purpose of this study is to analyze how people use visualization in Large Language Model
        (LLM) agent development and to determine which visualization design best supports those tasks.
        If you decide to be in this study, your part will involve interacting with a visualization
        interface and answering interview questions about your experience.
      </Section>

      <Section title="Are There Any Risks or Discomforts You Might Experience by Being in this Study?">
        The risks involved are no greater than those involved in daily activities such as using a
        computer. You may experience minor eye strain or fatigue from looking at the screen; however,
        you are allowed to take breaks as needed to minimize this discomfort.
      </Section>

      <Section title="What Are the Reasons You Might Want to Volunteer For This Study?">
        You are not likely to benefit in any way from joining this study. However, your participation
        may assist researchers in understanding how to better design visualizations for LLM
        development.
      </Section>

      <Section title="Compensation to You">
        Please note that full compensation will not be given to those who withdraw early or do not
        complete the study.
      </Section>

      <Section title="Confidentiality">
        The following procedures will be followed to keep your personal information confidential in
        this study: We will comply with any applicable laws and regulations regarding
        confidentiality. To protect your privacy, your records will be kept under a code number rather
        than by name. Your records will be kept in locked files, and unless you give specific consent
        otherwise, only study staff will be allowed to look at them. Your name and any other fact that
        might point to you will not appear when the results of this study are presented or published.
        You should be aware that the experiment is not being run from a &lsquo;secure&rsquo; https
        server of the kind typically used to handle credit card transactions, so there is a small
        possibility that responses could be viewed by unauthorized third parties, such as computer
        hackers. In general, the web page software will log as header lines the IP address of the
        machine you use to access this page, but otherwise, no other information will be stored unless
        you explicitly enter it. The Georgia Institute of Technology IRB and the Office of Human
        Research Protections may review study records during required reviews.
      </Section>

      <Section title="Costs to You">
        There are no costs to you, other than your time, for being in this study.
      </Section>

      <Section title="Questions about the Study">
        If you have any questions about the study, you may contact PI Ya Yang Xiong at
        {' '}
        <a href="mailto:cxiong@gatech.edu">cxiong@gatech.edu</a>
        . If you have any questions about your rights as a research subject, you may contact the
        Georgia Institute of Technology Office of Research Integrity Assurance at
        {' '}
        <a href="mailto:IRB@gatech.edu">IRB@gatech.edu</a>
        .
      </Section>

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
