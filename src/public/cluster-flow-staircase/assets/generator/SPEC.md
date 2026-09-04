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
   RDOT+2 px of a non-endpoint dot, layout not fitting the canvas) are discarded and the next
   derived seed is tried; the attempt count is recorded.
5. The whole layout is scaled by 0.6 into a 480 x 360 px canvas for single-fixation viewing.
6. Dense variant: +2 extra rank-respecting within-group arrows per cluster, backbone skip links
   (order[i] -> order[i+2]) with p = 0.3.
7. Grouping cues (hull, rect, color, edge, shape) are applied after layout.
8. Stimulus B: N_B dots scattered uniformly in the same canvas with the same minimum spacing, one
   random directed spanning tree (plus matched extra arrows when dense), cue features assigned
   without spatial structure.
9. Colour polarity is inverted: white ground, #666666 dots, #111111 links, #333333 hull strokes,
   and the colour-cue palette is equalised to the dot's relative luminance (Y = 0.133). The trial
   page surround is light grey (#E6E6E6) so no bright or dark flash occurs between phases.
