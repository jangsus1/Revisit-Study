# Cluster Flow Stimulus Gallery

This study is not a study: it is a reviewer page for the stimuli used by the
**cluster-flow staircase** experiment, where each participant runs one cue x density cell.

The next page shows, for one seed, the five grouping cues: **proximity** (the control: the gapped
MATLAB layout, grey dots, solid links), **rect** (outlines around each cluster), **color** (a
CIELAB hue per cluster), **shape** (filled circle, hollow square, open cross) and **edge**
(dashed between-cluster links). Every cue except proximity uses the **even** layout, where the gap
between neighbouring clusters equals the spacing inside a cluster, so only the cue groups.

Each row puts the grouped **stimulus A** (24 items in 6 clusters, wired into a directed flow) next
to its **stimulus B** baseline, built exactly as a trial builds it: B's items are sampled inside
A's bounding box with a spacing matched to A, and B's links are chosen to match A's link length
(plus A's outline ink for rect).

- **Seed** picks the display; the same seed always produces exactly the same pair.
- **N_B** sets the number of items in the baseline (the staircase varies it between 8 and 48).
- **Hue rotation** turns the colour wheel (each participant gets their own rotation, 0 to 59°).
- **sparse / dense** switches the extra within-cluster arrows and the backbone skip links on.
- **A first / B first** and **Play trial** run one trial in place with the real timing: fixation
  500 ms, first stimulus 200 ms, noise mask 150 ms, blank 250 ms, second stimulus 200 ms,
  blank 400 ms.

Under each panel the footers print the generator diagnostics (seed, attempts, layout, cluster
sizes, jitter, gaps and traversal order for A; field, spacing and link target for B) and the ink
and spacing metrics (ink by nodes, links and outlines, link length, nearest-neighbour distances,
mean pairwise distance, convex-hull area). The bold line under each row gives B relative to A.

Press **Next** to open the gallery.
