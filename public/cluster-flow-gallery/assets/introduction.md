# Cluster Flow Stimulus Gallery

This study is not a study: it is a reviewer page for the stimuli used by the
**cluster-flow staircase** experiment, where each participant runs one cue x density cell.

The next page shows, for one seed, the five grouping cues: **proximity** (the control: grey dots and
solid links, with a gap of two within-cluster spacings between clusters), **rect** (outlines around
each cluster), **color** (one colour per cluster from a tilted ellipse in CIELAB, so hue, chroma and
lightness all differ), **shape** (six of seven filled marks per display, one per cluster: circle,
square, diamond, triangle, star, Y and pentagon; the pool is shown at the top of the gallery) and **edge** (dashed between-cluster links). Every cue except proximity uses the **even** layout, where the gap
between neighbouring clusters equals the spacing inside a cluster, so only the cue groups.

No two links of any display cross, touch or overlap.

Each row puts the grouped **stimulus A** (24 items in 6 clusters, wired into a directed flow) next
to its **stimulus B** baseline, built exactly as a trial builds it. B is the same for every cue:
its items are sampled inside the bounding box of the even-layout A of the seed, with a spacing
matched to it, and its links match that A's link length; only B's colours, marks or dashes follow
the cue. Proximity's A is spread wider than its B, and rect A's outlines are not made up for.

- **Seed** picks the display; the same seed always produces exactly the same pair.
- **N_B** sets the number of items in the baseline (the staircase varies it between 8 and 48).
- **Colour rotation** moves the six colours along the ellipse (each participant gets their own
  rotation, 0 to 59°; 60° would move every colour on to the next).
- **sparse / dense** switches the extra within-cluster arrows and the backbone skip links on.
- **A first / B first** and **Play trial** run one trial in place with the real timing: fixation
  500 ms, first stimulus 200 ms, noise mask 150 ms, blank 250 ms, second stimulus 200 ms,
  blank 400 ms.

The gallery draws everything at its 800 x 640 design size. In the experiment the whole trial stage
is scaled uniformly to 21 cm wide when the participant matched a bank card on the screen-size page
(and to fit the window either way), and the first trial of practice, of the main block and after
every break waits for a key press or click; neither happens in this preview.

Under each panel the footers print the generator diagnostics (seed, attempts, layout, cluster
sizes, jitter, gaps and traversal order for A; field, spacing and link target for B) and the ink
and spacing metrics (ink by nodes, links and outlines, link length, nearest-neighbour distances,
mean pairwise distance, convex-hull area). The bold line under each row gives B relative to A.

Press **Next** to open the gallery.
