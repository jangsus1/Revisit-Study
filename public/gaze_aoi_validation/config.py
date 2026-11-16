"""
gaze_aoi_validation (2026-11-15): does anchoring webcam calibration at the task's areas of interest (AOIs) improve
accuracy there? Chart-free pilot for the scatterplot_gaze methods claim.

Design (within participant, same frames):
  calibration = 9 grid dots + 6 AOI dots (y label, 4 plot quadrants, x label) + 6 control dots (side margins,
  outside the trial frame), 21 dots in random order. Models fitted on the same session:
    main = all 21 (drives nothing on screen; logged as x/y)
    grid = 9 grid dots           (common practice)
    aoi  = grid + AOI dots (15)   (our method)
    ctrl = grid + control dots (15) (same number of dots, away from the AOIs)
  test = 48 arrow targets on an empty trial frame (no data, no text): 24 inside the AOI regions (plot 12,
  y label 6, x label 6) and 24 in the side margins, plus 3 check dots (plot centre, x label, y label) before each
  of the 4 blocks. Each target: blue dot -> tiny arrow (up/down/left/right) -> mask -> arrow key; fingers rest on
  the arrow keys for the whole block (2026-11-16: letters + typing replaced, pilot 1 showed keyboard glances).
  A correct arrow = the eyes were on the target (chance 25 %). Prediction: aoi < ctrl inside the AOIs,
  ctrl <= aoi in the margins (crossover), both < grid.

Run `python config.py` to regenerate config.json (seeded). Shared UI components come from scatterplot_gaze.
"""
import json
import random

random.seed(20261115)

G = 'scatterplot_gaze/assets/'
V = 'gaze_aoi_validation/assets/'
DIRS = ['up', 'down', 'left', 'right']
N_BLOCKS = 4
VARIANTS = {'grid': ['grid'], 'aoi': ['grid', 'aoi'], 'ctrl': ['grid', 'ctrl']}
FAIL = 'https://app.prolific.com/submissions/complete?cc=C1N03H9S'      # placeholder: same as the timing study
DONE = 'https://app.prolific.com/submissions/complete?cc=C1OCRYTV'      # placeholder: same as the timing study

U = random.uniform


def target(region, i, **kw):
    if region == 'plot':
        t = dict(u=U(0.08, 0.92), v=U(0.08, 0.92))
    elif region == 'yLabel':
        t = dict(u=U(0.2, 0.8), v=U(0.1, 0.9))
    elif region == 'xLabel':
        t = dict(u=U(0.1, 0.9), v=U(0.25, 0.75))
    else:  # margin
        t = dict(u=U(0.25, 0.75), v=U(0.12, 0.88))
    t = {k: round(v, 3) for k, v in t.items()}
    return dict(id=f'{region}{kw.get("side", "")}_{i}', region=region, **t, **kw)


def assign_arrows(ts):
    """Each direction equally often (12 targets -> 3 each), in random order."""
    dirs = (DIRS * (len(ts) // 4 + 1))[:len(ts)]
    random.shuffle(dirs)
    for t, d in zip(ts, dirs):
        t['arrow'] = d


def checks(b):
    return [dict(id=f'check_{p}_{b}', region='check', point=p) for p in ('plot', 'yLabel', 'xLabel')]


# 48 main targets, dealt stratified over the 4 blocks, shuffled within a block
pools = {
    'plot': [target('plot', i) for i in range(12)],
    'yLabel': [target('yLabel', i) for i in range(6)],
    'xLabel': [target('xLabel', i) for i in range(6)],
    'marginL': [target('margin', i, side='L') for i in range(12)],
    'marginR': [target('margin', i, side='R') for i in range(12)],
}
blocks = [[] for _ in range(N_BLOCKS)]
k = 0
for name, pool in pools.items():
    random.shuffle(pool)
    for t in pool:
        blocks[k % N_BLOCKS].append(t)
        k += 1
for b in blocks:
    random.shuffle(b)
    assign_arrows(b)
assert sum(len(b) for b in blocks) == 48 and all(len(b) == 12 for b in blocks)

practice = [target('plot', 'p1'), target('margin', 'p2', side='L'), dict(id='check_p', region='check', point='plot'),
            target('yLabel', 'p3'), target('margin', 'p4', side='R'), target('xLabel', 'p5'),
            target('plot', 'p6'), target('margin', 'p7', side='R'), target('plot', 'p8')]
assign_arrows([t for t in practice if t['region'] != 'check'])

hidden = lambda rid, prompt: [dict(id=rid, prompt=prompt, required=True, location='belowStimulus', type='reactive', hidden=True)]
rc = lambda path, params=None, resp=None: {k: v for k, v in dict(
    type='react-component', path=path, parameters=params, response=resp if resp is not None else [],
    instructionLocation='belowStimulus', nextButtonLocation='belowStimulus').items() if v is not None}

components = {
    'fullscreen': rc(G + 'FullScreen.tsx', resp=hidden('fullscreen', 'Full screen')),
    'consent': dict(type='markdown', path=V + 'consent.md', nextButtonText='I agree', response=[]),
    'intro': rc(G + 'IntroPage.tsx', dict(
        kicker='About 10 minutes', title='Where are you looking?',
        bullets=['Your **webcam** estimates where you look on the screen. Video never leaves your computer; nothing is recorded.',
                 'You will look at **blue dots**. Each turns into a **tiny arrow** for a split second; press the **arrow key** that points the same way.',
                 'You answer with the **arrow keys only**: rest your fingers on them before each part, so you never need to look down.',
                 'First a short practice, then the camera setup, then **4 short parts** (about 1 minute each).',
                 'During the eye tracking, **keep your head still** and move only your eyes.'],
        button='Start the practice', headStill=False)),
    'arrows_practice': rc(V + 'ArrowTargets.tsx', dict(block=0, nBlocks=N_BLOCKS, practice=True, targets=practice),
                           hidden('targets', 'Arrow targets')),
    'webcamPermission': rc(G + 'WebcamPermission.tsx', dict(failLink=FAIL), hidden('webcamPermission', 'Webcam permission')),
    'gazeCalibration': rc(G + 'GazeCalibration.tsx', dict(maxAttempts=3, acceptPctW=0.08, variants=VARIANTS),
                          hidden('calibration', 'Calibration result')),
    **{f'arrows_{b + 1}': rc(V + 'ArrowTargets.tsx', dict(block=b + 1, nBlocks=N_BLOCKS, targets=checks(b + 1) + blocks[b]),
                              hidden('targets', 'Arrow targets')) for b in range(N_BLOCKS)},
    'gazeFinalCheck': rc(G + 'GazeFinalCheck.tsx', dict(taskDots=True), hidden('finalCheck', 'End-of-session accuracy check')),
    'gazeEnd': rc(G + 'GazeEnd.tsx', resp=hidden('gazeEnd', 'Eye tracking finished')),
}

with open('../scatterplot_gaze_basic/config.json') as f:
    basic = json.load(f)
components['demographics'] = basic['components']['demographics']

config = {
    '$schema': basic['$schema'],
    'studyMetadata': {
        'title': 'Webcam gaze accuracy at areas of interest (chart-free validation)',
        'version': 'pilot',
        'authors': ['Minsuk Chang'],
        'date': '2026-11-15',
        'description': 'Arrow targets on an empty chart frame; models fitted on grid, grid + AOI and grid + control calibration dots compared on the same frames',
        'organizations': ['Georgia Institute of Technology'],
    },
    'uiConfig': {**basic['uiConfig'],
                 'studyEndMsg': f'**Thank you for completing the study. You may click this link and return to Prolific**: [{DONE}]({DONE})'},
    'studyRules': basic['studyRules'],
    'components': components,
    'sequence': {'order': 'fixed', 'components': ['fullscreen', 'consent', 'intro', 'arrows_practice', 'webcamPermission',
                                                  'gazeCalibration', *[f'arrows_{b + 1}' for b in range(N_BLOCKS)],
                                                  'gazeFinalCheck', 'gazeEnd', 'demographics']},
}
for k in ('trainingFailedMsg', 'trainingFailedRedirectURL', 'trainingFailedRedirectDelay'):
    config['uiConfig'].pop(k, None)

with open('config.json', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
print('wrote config.json:', len(components), 'components')
