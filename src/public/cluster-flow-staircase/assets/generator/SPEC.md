# Cluster Flow Stimuli — source specification

This is the original design README the generator is ported from (MATLAB source:
`Pilot3.2_final/Codes/numberEstimate_May8_16_EXP.m`, `setCoordinates_proxi`, `numDistributer`).
Deviations adopted for the reVISit study are listed at the end.

Six clusters of dots are laid out as the MATLAB does, ordered by spatial adjacency, and wired
into a directed flow: one link between consecutive groups, and a connected directed tree inside
each group. Everything is deterministic given a single integer **seed**.

## 1. Fixed parameters

| Parameter | Value | Origin |
|---|---|---|
| `NTOTAL` items | 24 | `totalRefNum` |
| `NCLUST` clusters | 6, on a 2 x 3 meta-grid | `numDistributer(6,·)` |
| `INTER` (`interDist`) | 100 px | within-cluster lattice pitch |
| `RDOT` (`radius_clusterDots`) | 10 px (20 px dot) | drawn with `FillOval` |
| `RATIO` (`customizedRatio`) | 1.2 (fixed) | between-cluster spacing multiplier |
| `JITTER` (`jitterRange`) | uniform integer 3-15 px, drawn once per seed | per-node position jitter |
| ground colour | RGB 80 80 80 | `Grey` |
| dot colour | RGB 200 200 200 | `color_proxi` |
| links per backbone step | 1 (fixed) | |
| skip-link probability | 0 (fixed) | |
| extra within-group arrows | 0 (fixed) | |
| link style | solid black `#111`, 2 px, straight, black arrowhead | one style for every link |

Cluster sizes are always in {3,4,5,6} and sum to 24.

## 2. Random-number conventions

All draws come from one seeded PRNG (mulberry32). MATLAB-shaped helpers:

```
rnd()        -> uniform [0,1)
randi(n)     -> integer 1..n              (MATLAB randi)
randperm(n)  -> random permutation 0..n-1 (0-indexed)
uj(r)        -> uniform in [-r, +r]
```

`JITTER` is drawn from a separate stream so that changing it does not reshuffle every later draw:

```
JITTER = 3 + floor( mulberry32(seed*7919 + 13)() * 13 )     // 3..15
```

## 3. Cluster sizes — `numDistributer(6, 24)`, live branch only

```
gs12 = [[3,4,5],[3,6,3]]      gs11 = [[3,4,4],[3,5,3]]
gs13 = [[3,4,6],[3,5,5],[4,5,4]]
gs10 = [[3,3,4]]               gs14 = [[3,5,6],[4,4,6],[4,5,5]]
gs9  = [[3,3,3]]               gs15 = [[3,6,6],[4,5,6],[5,5,5]]

rows = [ pick(gs12) ++ pick(gs12),     // 12 + 12
         pick(gs11) ++ pick(gs13),     // 11 + 13
         pick(gs10) ++ pick(gs14),     // 10 + 14
         pick(gs9)  ++ pick(gs15) ]    //  9 + 15
draw = randi(16)                       // probabilities [4 6 3 3]
sizes = rows[0] if draw<=4, rows[1] if draw<=10, rows[2] if draw<=13, else rows[3]
sizes = sizes[randperm(6)]
```

## 4. Within-cluster node placement

Cluster *i* (0-based) is one of the fixed 2-wide templates on a `D = INTER` lattice. Clusters
0-2 use the **Up** forms (`s = -1`), clusters 3-5 the **Down** forms (`s = +1`).

```
c4 = [[0,0],[D,0],[0,s*D],[D,s*D]]

n=3 : pick( [[0,0],[D,0],[0,s*D]] , [[0,0],[D,0],[D,s*D]] )
n=4 : c4
n=5 : c4 ++ pick( [0,s*2D] , [D,s*2D] )
n=6 : c4 ++ [0,s*2D] ++ [D,s*2D]
```

Every node then receives independent jitter: `x += round(uj(JITTER)); y += round(uj(JITTER));`

## 5. Cluster extents and spacing

Extents are measured on the jittered node centres:

```
spanX[i] = max(x) - min(x)
spanY[i] = max(y) - min(y)
mdx[i]   = spanX[i]
mry[i]   = spanY[i]
mdy[i]   = (sizes[i] > 4) ? spanY[i]/2 : spanY[i]
gapX(a,b) = round( max(mdx[a],mdx[b]) * RATIO + (mdx[a] + mdx[b]) / 2 )
gapY(c)   = round( max(mdy[c],mdy[c+3]) * RATIO + (mry[c] + mry[c+3]) / 2 )
```

### 5a. RAW centres (verbatim MATLAB, including its index swap) — NOT USED in this study

The source fills `distX(col_i,row_i)` but reads it back as `(row,col)`, so the gaps for 1->2
and 4->5 come from the wrong pair.

### 5b. ADJUSTED centres — USED

```
rowGap = max(dY)
top = [0, gapX(0,1), gapX(0,1)+gapX(1,2)]
bot = [0, gapX(3,4), gapX(3,4)+gapX(4,5)]
centre each row on its own midpoint:  top -= mean(top[0],top[2]); bot -= mean(bot[0],bot[2])
C0..C2 = (top[k], 0)      C3..C5 = (bot[k], rowGap)
```

Each cluster's node set is translated so its centroid sits on its centre.

## 6. Group ordering — adjacency first

Greedy nearest-neighbour chain over the six centroids:

```
start = argmin_i (Cx[i] + Cy[i])              // top-left cluster
order = [start]
while |order| < 6: append the unvisited cluster nearest to order[last]
```

## 7. Within-group arrows — connected, acyclic

```
attach = randperm(n)          // order in which nodes join the tree
topo   = randperm(n)          // one random topological order for the cluster
rank[m[topo[q]]] = q
for k = 1 .. n-1:
    other = attach[ floor(rnd()*k) ]
    addArrow( m[attach[k]], m[other] )
addArrow(u, v):  s = lower-rank of {u,v},  t = the other;  arrow s -> t
sources[g] = nodes with no incoming within-group arrow
sinks[g]   = nodes with no outgoing within-group arrow
```

## 8. Between-group links — the backbone

```
for i = 0 .. 4:
    A = order[i],  B = order[i+1]
    source = the node in sinks[A]   nearest to centroid(B)
    target = the node in sources[B] nearest to centroid(A)
    link A -> B  from source to target
```

## 9. Rendering

* Dots: `r = RDOT`, fill `#C8C8C8`, on `#505050`.
* Links: straight segment from the source dot's edge to the target dot's edge (each end trimmed
  by `RDOT + 4`), `#111111`, 2 px, filled black arrowhead at the target.

## Deviations adopted for the reVISit study

1. Gap pair indices are the correct ones (the MATLAB index swap is treated as a bug).
2. Rows share one baseline and are centred on their own midpoints (5b).
3. No spring relaxation and no slot reassignment (the README's section 9 is dropped): only
   adjustments that can be stated in one sentence in a paper are used.
4. Displays failing occlusion invariants (dot centres < 2.4*RDOT apart, an arrow passing within
   RDOT+2 px of a non-endpoint dot, layout not fitting the canvas; the link clearance is widened
   for larger marks by 20) are discarded and the next
   derived seed is tried; the attempt count is recorded.
5. The whole layout is scaled into the canvas for single-fixation viewing. *Superseded by 16:*
   originally 0.6 into 480 x 360 px.
6. Dense variant: +2 extra rank-respecting within-group arrows per cluster, backbone skip links
   (order[i] -> order[i+2]) with p = 0.3.
7. Grouping cues are applied after layout: `proximity` (control, nothing added), `rect`, `color`,
   `shape`, `edge`. The convex-hull cue (`hull`) and the name `none` are superseded (dropped).
8. Stimulus B: N_B dots, one random directed spanning tree (plus matched extra arrows when dense),
   cue features assigned without spatial structure. *Placement and links revised by 13 to 15.*
9. Colour polarity is inverted: white ground, #111111 links, #333333 rect strokes. The trial page
   surround is light grey (#E6E6E6) so no bright or dark flash occurs between phases. *The
   #666666 dot grey and the Okabe-Ito luminance-matched palette are superseded by 11.*
10. **Even layout.** Every cue except `proximity` places the clusters so that the edge-to-edge gap
    between neighbouring clusters equals the within-cluster pitch `INTER`: horizontal centroid
    distance `(maxX - meanX)_a + INTER + (meanX - minX)_b`, and each column placed on its own with
    `(maxY - meanY)_top + INTER + (meanY - minY)_bottom` (the planned `rowGap = max` over columns
    left up to 1.3 INTER of extra gap in columns of short clusters, i.e. proximity grouping, so the
    rows are aligned on their facing edges instead). Templates and jitter are those of the grouped
    layout of the same seed. `proximity` keeps sections 5 and 5b. *The proximity layout is
    superseded by 17.*
11. *Superseded by 18.* **Palette.** Six colours on a CIELAB circle centred on the neutral axis: L* = 50, chroma 29
    (the largest whole chroma at which every hue is inside sRGB), hues `hueOffset + 60 k`, as in the
    colour-wheel method of Zhang & Luck (2008). `hueOffset` is drawn once per participant in
    [0, 60). The default node grey is #777777 (L* = 50), so colour and grey displays differ in hue
    only.
12. *Shapes superseded by 20; lines kept.* **Shapes and lines.** Shape cue marks: filled circle (r = RDOT), hollow square (outer side
    r * sqrt(pi), outline 0.25 r inside it) and open cross (bars 2 x 1.1 r long, 0.25 r wide), one
    of each mark class, each on two clusters. Edge cue: between-cluster links dashed with Sterzik
    et al. (IEEE TVCG 2024, Table 4) asynchronous dashing level 3 of 13 (dash 10.9 of a 40 px
    period), period halved to 20 px (dash 5.45, gap 14.55), round caps, lengths excluding caps.
13. **B field and spacing.** B's dots are sampled inside A's dot-centre bounding box (clipped to
    the canvas margin) with minimum spacing `min(B_MAX_SPACING, B_SPACING_FACTOR * sqrt(area / N_B))`,
    never below the invariant floor (factor 0.8, cap 67.5 px). The tree grows outward from a random
    point of the field so every joining node has placed neighbours nearby.
14. **B ink targeting.** *The outline term is dropped by 19.* B's total visible link length aims at
    `(A_linkLength + A_outlineInk / linkWidth) * E_B / E_A`: each link goes to the one of the 10 nearest usable candidates whose
    length best meets the remaining budget per remaining link, skipping nodes that already carry 4
    links while others are usable. Without an A (stand-alone B) links go to a random one of the 3
    nearest usable dots. B must therefore always be regenerated with its A (`generateTrialPair`).
15. **Metrics.** `measureDisplay` reports node, link (dash duty cycle and arrowheads included) and
    outline ink, visible link length, nearest-neighbour and pairwise distances and convex-hull area,
    from the same geometry the renderer draws (`geometry.ts`).
16. **Larger single-location canvas.** SCALE 0.9 into a 720 x 540 px canvas (*800 x 640 since
    17*); A and B are shown one
    after the other at the same place, separated by a 150 ms white-noise mask (3 px grey blocks,
    seeded by `hashSeed(seedA, seedB, 'mask')`).
17. **Proximity gap.** The `proximity` cue uses the same centre placement as the even layout (10)
    with an edge-to-edge gap of `PROXIMITY_GAP` = 2 pitches instead of one, horizontally and in
    every column. Sections 5 and 5b (`customizedRatio` 1.2) gave gaps as small as 0.87 pitch
    (median 1.4) once jitter and the halved height of 5- and 6-dot clusters were applied, so the
    groups were not clearly separated. The canvas grows to 800 x 640 px, which holds the widest and
    tallest proximity layout (744 x 632 px with the margin) and the tallest even layout, so no
    cluster-size draw is rejected for leaving the canvas.
18. **Colour ellipse.** The colour cue samples six colours from an ellipse in CIELAB: a planar
    slice through the colour solid tilted out of the a*b* plane, centre (L* 56, a* 4.3, b* 4.1),
    major radius 60 in the a*b* plane at hue angle 154.5 degrees, minor radius 40.5 perpendicular
    to it and tilted 36 degrees towards +L*. Lightness (32 to 80), chroma (about 27 to 63) and hue
    all change around it. The parameters come from a seeded search that maximises the smallest
    CIEDE2000 difference between any two of six samples spaced evenly along the ellipse, over every
    rotation, with the whole ellipse inside sRGB and L* in [30, 80]: the worst pair is about 28
    CIEDE2000 apart, against about 17.5 on the best fixed-L*, fixed-chroma circle (11). The six
    samples sit at equal arc lengths (in CIELAB) from `hueOffset`, now in degrees of the perimeter
    (60 moves every colour on to the next), still drawn once per participant in [0, 60). The grey
    node stays #777777 (L* 50).
19. **No outline ink in B.** B's link budget is A's visible link length scaled by the link counts,
    without A's rect outlines: making up for them took B's links 2.4 times as long as A's, so they
    crossed and B looked cluttered. Rect B is now built exactly like proximity B (grey circles,
    local links), and rect A carries about 1.5 times B's ink (B/A ink 0.66 sparse, 0.72 dense).
20. *Marks superseded by 23; the outline-accurate clearance is kept.* **Six shapes.** The shape cue gives every cluster its own mark from a seeded permutation of
    six: circle, square and triangle, each filled and outlined. The square has the circle's area
    (side r * sqrt(pi)); the upward equilateral triangle has circumradius 1.35 r, three quarters
    of the circle's area, because an equal-area triangle (1.56 r) would reach the arrowheads, which
    stop 1.4 r from the centre. Outlines are 0.25 r wide, drawn inside the filled footprint. The
    link-clearance invariant (4) is measured from the link's centre line to the outline of each
    mark (not its centre), with the circle's margin of 0.2 r, so a link never grazes a triangle tip
    or a square corner; for circles the rule is unchanged. B's links clear the largest mark around
    every dot (21).
21. **One B for every cue.** B's field and link budget come from a reference A: the plain
    even-layout display of `seedA` (grey circles, no cue), not from the trial's own A. B's links
    keep the usual margin from a disc of the largest mark's reach (a triangle tip, 1.35 r) around
    every dot, and colours, marks and dashes are drawn only after the geometry. So for the same
    seeds every cue gets exactly the same B dots and links, and only B's features differ. For
    `proximity`, whose A is spread wider by the two-pitch gaps (17), B therefore covers about 0.56
    of A's convex-hull area at N_B = 24 (mean nearest-neighbour distance 0.92 of A's, link length
    0.81 to 0.88 of A's); for the other cues the reference has A's own geometry (B/A hull 0.98).
22. **No crossing links.** A fourth invariant: no two links of a display may cross, touch or
    overlap. It is measured on the drawn centre lines (each link trimmed by `RDOT + 4` at both
    ends): two links that share no endpoint must keep their centre lines at least one link width
    (`LINK_GAP`, 1.8 px) apart, and two links that share an endpoint must not run back along each
    other (the far end of either may not come within `LINK_GAP` of the other). Since every display
    passes `checkInvariants`, A and B never show a crossing. The builders avoid crossings
    themselves, so the invariant rarely has to reject a seed: A's within-cluster tree tries the
    randomly drawn earlier node first and then the other earlier nodes in turn; a backbone link
    tries the sink-source pairs in order of their distance sum (the nearest pair of section 8
    first); a dense extra arrow whose link would cross counts as a failed draw; a skip link with no
    usable pair is left out. Where it has a choice, A also prefers links that clear every other dot
    by the largest mark's reach, as B always did (21). B's tree and dense extras only consider
    candidates that cross no earlier link. Over 200 seeds, mean (max) attempts per A were, before
    and after: sparse 8.0 to 8.6 (35 to 47) and dense 18.3 to 21.4 (101 to 138) before; 6.8 to 7.4
    (33 to 37) for both densities after. Before, 90 to 93 % of sparse and all dense A displays,
    and 76 % (sparse) and 91 % (dense) of B displays, had at least one crossing. Dense A now has
    32.2 links on average (5.62 between clusters) instead of 33.7 (6.0): about 8.6 of the 12
    requested within-cluster extras and 0.6 of the 1.2 expected skip links fit without crossing.
    Dense B is matched to that: 9 extra arrows per 24 nodes (was 12) and 5.62 / 32.2 of its arrows
    dashed under the edge cue (was 6.2 / 36.2).
23. **Seven filled shapes.** The shape cue's pool is seven filled silhouettes from the user's
    reference sheet: circle, square, diamond (a rhombus 0.6 as wide as tall), upward triangle,
    five-point star (inner radius 0.42 of the outer), a thick three-armed Y (stem down, arms up-left
    and up-right, arm width 0.7 of the arm length, flat ends) and a pentagon (one vertex up). The
    outlined marks are dropped. Every stimulus A of the shape cue draws six distinct marks from the
    pool at random (a seeded permutation of seven, the first six go to clusters 0 to 5), and its B
    draws each node's mark at random from the same six (`generateTrialPair` passes them, read back
    with `shapeSubset(displayA)`; no new stored field is needed since A's node shapes record them).
    Each mark has the circle's area unless that would take it further than 1.35 RDOT from its
    centre (`MARK_MAX_R`; arrowheads stop at 1.4 RDOT). Areas relative to the circle, and reach in
    RDOT: circle 1.00 (1.00), square 1.00 (1.25), pentagon 1.00 (1.15), Y 0.98 (1.35), triangle 0.75
    (1.35), star 0.72 (1.35), diamond 0.70 (1.35). Node ink uses the exact polygon areas. The link
    clearance (4) is measured to each polygon's outline with an even-odd point-in-polygon test, so
    the concave star and Y are covered, and the builders' disc of the largest reach is 1.35 RDOT.
