/**
 * Instruction page in the study's single layout (Panel): "Task N of 3", a title, 2-4 short bullets, an
 * optional example image and one button that advances. Text comes from the component parameters in
 * config.py, so every intro page looks the same. **bold** is supported inside bullets.
 */
import { Button } from '@mantine/core';
import { Fragment, useEffect } from 'react';
import { StimulusParams } from '../../../store/types';
import { PREFIX } from '../../../utils/Prefix';
import { HeadStillNotice, Panel } from './FullScreen';

type Params = { kicker?: string; title: string; bullets?: string[]; image?: string; button?: string; headStill?: boolean };

/** Minimal **bold** markup. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (i % 2 === 1
        // eslint-disable-next-line react/no-array-index-key
        ? <strong key={i} style={{ color: '#222' }}>{part}</strong>
        // eslint-disable-next-line react/no-array-index-key
        : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

function IntroPage({ parameters, setAnswer, advance }: StimulusParams<Params>) {
  const {
    kicker, title, bullets = [], image, button = 'Continue', headStill = false,
  } = parameters;
  useEffect(() => { setAnswer({ status: true, answers: {} }); }, [setAnswer]);

  return (
    <Panel
      kicker={kicker}
      title={title}
      maxWidth={680}
      actions={<Button size="lg" onClick={() => advance?.()}>{button}</Button>}
    >
      <ul style={{
        textAlign: 'left', margin: '4px auto 0', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8,
      }}
      >
        {bullets.map((b) => <li key={b}><Rich text={b} /></li>)}
      </ul>
      {headStill && <HeadStillNotice />}
      {image && (
        <img
          src={image.startsWith('http') ? image : `${PREFIX}${image}`}
          alt=""
          style={{
            display: 'block', margin: '22px auto 0', maxWidth: '100%', maxHeight: '36vh', borderRadius: 8, border: '1px solid #eee',
          }}
        />
      )}
    </Panel>
  );
}

export default IntroPage;
