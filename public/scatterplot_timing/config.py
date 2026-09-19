import json
import os
from collections import defaultdict
import numpy as np

# fix all seeds
np.random.seed(42)

current_dir = os.path.dirname(os.path.abspath(__file__))


# (blur_before, blur_after, label_display) in seconds; trial length = sum. 47 conditions.
CONDITIONS = [
    (5,0,0),(4,1,0),(4,0,1),(3,1,1),(3,0,2),(2,1,2),(2,0,3),(1,1,3),(1,0,4),(0,1,4),(0,0,5),
    (5,1,0),(5,0,1),(4,1,1),(4,0,2),(3,1,2),(3,0,3),(2,1,3),(2,0,4),(1,1,4),(1,0,5),(0,1,5),
    (5,1,1),(5,0,2),(4,1,2),(4,0,3),(3,1,3),(3,0,4),(2,1,4),(2,0,5),(1,1,5),
    (5,1,2),(5,0,3),(4,1,3),(4,0,4),(3,1,4),(3,0,5),(2,1,5),
    (5,1,3),(5,0,4),(4,1,4),(4,0,5),(3,1,5),
    (5,1,4),(5,0,5),(4,1,5),
    (5,1,5),
]
assert len(CONDITIONS) == 47 and len(set(CONDITIONS)) == 47
CONDITIONS_PER_PARTICIPANT = 12
N_SCHEMES = len(CONDITIONS)          # one scheme per Latin-square row
BASELINE_SECONDS = 5                 # labels never shown, same coordinates as the revealed trial


def cond_name(c):
    before, after, display = c
    return f"{before}_{after}_{display}"


def build_schemes():
    """47 schemes. Scheme s holds 12 conditions, all 12 labels, a corr rotation and an exp
    pattern. Condition j of scheme s is CONDITIONS[(s + 5*j) % 47] (47 is prime, so across the 47
    schemes every condition sits in every slot exactly once -> each condition is seen by 12 of every
    47 participants). reVISit's `latinSquare` + `numSamples: 1` over the scheme blocks hands the
    schemes out evenly across participants."""
    corrs = [2, 4, 6, 8]
    schemes = []
    for s in range(N_SCHEMES):
        trials = []
        for j in range(CONDITIONS_PER_PARTICIPANT):
            cond = CONDITIONS[(s + 5 * j) % N_SCHEMES]
            label_idx = (s + j) % len(labels)                 # 12 distinct labels, rotating start
            corr = corrs[(j + s) % 4]                          # 3 labels per corr level, rotating
            exp = (j + s // 4) % 2
            trials.append(dict(label_idx=label_idx, corr=corr, exp=exp, cond=cond))
        schemes.append(trials)
    return schemes


labels = [
    # Neutral / Spurious
    ['As the usage of internet increases, so does the homicide rate in the city.',
     'Internet usage', 'Homicide rate in the city'],
    ['People who eat more cheese, tend to be better at dancing.',
     'Cheese consumption', 'Dancing ability'],
    ['The more students wear glasses, the later the gym closes on campus.',
     'Number of students wearing glasses', 'Gym closing time'],
    ['A city with more lawyers, tends to have more trees.',
     'Number of lawyers in a city', 'Number of trees in the city'],
    ['The more people buy socks, the more pigeons appear in the park.',
     'Number of socks sold', 'Number of pigeons in the park'],
    ['As the number of cats in the city increases, the library\'s carpet gets replaced more often.',
     'Number of cats in city', 'Library carpet replacement frequency'],

    # Positive
    ['The more often students eat breakfast, the higher their GPAs are.',
     'Breakfast frequency', 'GPA'],
    ['A worker with a longer commute, tends to be more stressed.',
     'Commuting time', 'Stress level'],
    ['People who sleep more, tend to be happier with their lives.',
     'Sleeping time', 'Happiness level'],
    ['As the number of environmental regulations increases, so does the air quality in the city.',
     'Number of environmental regulations', 'Air quality in the city'],
    ['The more drivers wear seatbelts, the more survivors there are in accidents.',
     'Seatbelt usage rate', 'Number of survivors in car accidents'],
    ['The more probiotic yogurt people buy, the more toilet paper sales go up.',
     'Probiotic yogurt sales', 'Toilet paper sales'],
]


SCHEMES = build_schemes()


def generate_base_components():
    """Generate base components: phase2, phase1, and phase3"""
    return {
        "phase2": {
            "type": "react-component",
            "path": "scatterplot/assets/phase2_timing.jsx",
            "response": [
                {
                    "id": "answer",
                    "prompt": "",
                    "required": True,
                    "location": "belowStimulus",
                    "type": "reactive",
                    "hidden": True
                }
            ],
            "instructionLocation": "belowStimulus",
            "nextButtonLocation": "belowStimulus"
        },
        "phase1": {
            "type": "react-component",
            "path": "scatterplot/assets/phase1.jsx",
            "response": [
                {
                    "id": "answer",
                    "prompt": "",
                    "required": True,
                    "location": "belowStimulus",
                    "type": "reactive",
                    "hidden": True
                }
            ],
            "instructionLocation": "belowStimulus",
            "nextButtonLocation": "belowStimulus"
        },
        "phase3": {
            "type": "react-component",
            "path": "scatterplot/assets/phase3.jsx",
            "response": [
                {
                    "id": "answer",
                    "prompt": "",
                    "required": True,
                    "location": "belowStimulus",
                    "type": "reactive",
                    "hidden": True
                }
            ],
            "instructionLocation": "belowStimulus",
            "nextButtonLocation": "belowStimulus"
        }
    }


def create_default_components(fail_link):
    """Create default components: consent, introduction, and demographics"""
    return {
        "consent": {
            "type": "markdown",
            "path": "scatterplot/assets/consent.md",
            "nextButtonText": "I agree",
            "response": []
        },
        "introduction": {
            "type": "markdown",
            "path": "scatterplot/assets/introduction.md",
            "response": []
        },
        "phase1_intro": {
            "type": "markdown",
            "path": "scatterplot/assets/phase1_intro.md",
            "response": []
        },
        "phase2_intro": {
            "type": "markdown",
            "path": "scatterplot_timing/assets/phase2_intro.md",
            "response": []
        },
        "phase2_examples": {
            "type": "markdown",
            "path": "scatterplot/assets/phase2_examples.md",
            "response": []
        },
        "phase2_main": {
            "type": "markdown",
            "path": "scatterplot_timing/assets/phase2_main.md",
            "response": []
        },
        "phase3_intro": {
            "type": "markdown",
            "path": "scatterplot/assets/phase3_intro.md",
            "response": []
        },
        "attentionCheck": {
            # Reading text + both comprehension questions on one page. reVISit training mode:
            # Next becomes "Check Answer"; wrong answers show "Please try again." and Next stays
            # locked until both are correct (trainingAttempts -1 = unlimited). No fail page;
            # wrong attempts are logged in incorrectAnswers / checkAnswer.attemptsUsed.
            "type": "markdown",
            "path": "scatterplot_timing/assets/attention_check.md",
            "provideFeedback": True,
            "trainingAttempts": -1,
            "allowFailedTraining": False,
            "response": [
                {
                    "id": "attention_q1",
                    "prompt": "What is the range of the correlation coefficient (r) that we will use in the experiment?",
                    "required": True,
                    "location": "belowStimulus",
                    "type": "radio",
                    "options": [
                        "-1 to +1",
                        "1 to 7",
                        "0 to 1",
                        "0 to 10"
                    ],
                    "withDivider": True
                },
                {
                    "id": "attention_q2",
                    "prompt": "What makes a correlation stronger?",
                    "required": True,
                    "location": "belowStimulus",
                    "type": "radio",
                    "options": [
                        "The steeper the line",
                        "The more data points there are",
                        "The smaller the correlation coefficient is",
                        "The closer r is to 1"
                    ],
                    "withDivider": True
                }
            ],
            "correctAnswer": [
                {"id": "attention_q1", "answer": "0 to 1"},
                {"id": "attention_q2", "answer": "The closer r is to 1"}
            ],
            "instructionLocation": "belowStimulus",
            "nextButtonLocation": "belowStimulus",
        },
        "demographics": {
            "type": "markdown",
            "path": "shared/blank.md",
            "response": [
                {
                    "id": "gender",
                    "prompt": "What is your **gender**?",
                    "required": True,
                    "location": "aboveStimulus",
                    "type": "radio",
                    "withOther": True,
                    "options": [
                        "Woman",
                        "Man",
                        "Prefer not to say"
                    ],
                    "withDivider": True
                },
                {
                    "id": "age",
                    "prompt": "What is your **age**?",
                    "required": True,
                    "location": "aboveStimulus",
                    "type": "radio",
                    "options": [
                        "Under 18 years",
                        "18-24 years",
                        "25-34 years",
                        "35-44 years",
                        "45-54 years",
                        "55-64 years",
                        "65 years or older",
                        "Prefer not to say"
                    ],
                    "withDivider": True
                },
                {
                    "id": "education",
                    "prompt": "What is the **highest degree or level of education** you have completed?",
                    "required": True,
                    "location": "aboveStimulus",
                    "type": "radio",
                    "withOther": True,
                    "options": [
                        "Less than high school",
                        "High school diploma or equivalent",
                        "Bachelor's degree or equivalent",
                        "Master's degree or equivalent",
                        "Doctoral degree or equivalent"
                    ],
                    "withDivider": True
                }
            ]
        }
    }


def generate_scatterplot_data(n_points=50, min_distance=0.04, max_attempts=200, target_correlation=0.1):
    """
    Generate scatterplot coordinates with target correlation as accurately as possible.
    Uses iterative refinement to achieve the target correlation within ±0.02 tolerance.

    Args:
        n_points: Number of points in scatterplot
        min_distance: Minimum distance between points (to avoid overlap)
        max_attempts: Maximum attempts to achieve target correlation
        target_correlation: Target correlation value (should be in [-1, 1])

    Returns:
        tuple: (coordinates_list, actual_correlation)
        coordinates_list: List of [x, y] pairs, each in [0, 1] range
        actual_correlation: Actual correlation achieved (should be very close to target)
    """
    # Clamp target correlation to valid range
    target_corr = np.clip(target_correlation, -0.99, 0.99)
    tolerance = 0.02  # Target accuracy: within ±0.02 of target

    best_data = None
    best_corr = None
    best_error = float('inf')

    # Try multiple times to get correlation as close as possible to target
    for attempt in range(max_attempts):
        # Use the target correlation directly, with slight variation for diversity
        # but keep it very close to target for accuracy
        if attempt < max_attempts // 4:
            # First quarter: use target exactly
            current_target = target_corr
        elif attempt < max_attempts // 2:
            # Second quarter: very small variation (±0.01)
            current_target = target_corr + np.random.uniform(-0.01, 0.01)
        else:
            # Remaining attempts: slightly larger variation (±0.02) but still close
            current_target = target_corr + np.random.uniform(-0.02, 0.02)

        current_target = np.clip(current_target, -0.99, 0.99)

        # Generate correlated bivariate normal data using Cholesky decomposition
        # This is more numerically stable than using covariance matrix directly
        try:
            # Use Cholesky decomposition for better numerical stability
            L = np.array(
                [[1.0, 0.0], [current_target, np.sqrt(max(0.01, 1 - current_target**2))]])
            z = np.random.randn(n_points, 2)
            data = z @ L.T
        except (np.linalg.LinAlgError, ValueError):
            # Fallback: use direct correlation method
            data = np.random.randn(n_points, 2)
            data[:, 1] = current_target * data[:, 0] + \
                np.sqrt(max(0.01, 1 - current_target**2)) * data[:, 1]

        # Scale to [0, 1] range using z-score normalization then linear scaling
        # This preserves correlation better than min-max scaling
        # First standardize
        data_mean = data.mean(axis=0)
        data_std = data.std(axis=0)
        data_std[data_std == 0] = 1.0  # Avoid division by zero
        data_standardized = (data - data_mean) / data_std

        # Then scale to [0, 1] range
        # Use a fixed scale factor to preserve correlation structure
        scale_factor = 3.0  # Use 3 sigma range to cover most of the distribution
        data_scaled = (data_standardized / scale_factor) + 0.5
        data_scaled = np.clip(data_scaled, 0, 1)

        # Fine-tune to ensure full [0,1] range while preserving correlation
        data_ranges = data_scaled.max(axis=0) - data_scaled.min(axis=0)
        if data_ranges[0] < 0.5 or data_ranges[1] < 0.5:
            # If range is too small, use min-max scaling but preserve correlation
            data_min = data_scaled.min(axis=0)
            data_max = data_scaled.max(axis=0)
            data_ranges = data_max - data_min
            data_ranges[data_ranges == 0] = 1.0
            data = (data_scaled - data_min) / data_ranges
        else:
            data = data_scaled

        # Check for overlapping points and adjust (minimal jitter to preserve correlation)
        if len(data) > 1:
            diff = data[:, np.newaxis, :] - data[np.newaxis, :, :]
            distances = np.sqrt(np.sum(diff**2, axis=2))
            np.fill_diagonal(distances, np.inf)
            min_dist = distances.min()

            if min_dist < min_distance:
                # Use very small jitter to avoid significantly changing correlation
                jitter_scale = min_distance * 0.3  # Smaller jitter
                for jitter_attempt in range(3):  # Fewer jitter attempts
                    too_close = distances < min_distance
                    for i in range(len(data)):
                        close_indices = np.where(too_close[i])[0]
                        if len(close_indices) > 0:
                            # Add very small random jitter
                            jitter = np.random.normal(0, jitter_scale, 2)
                            data[i] += jitter
                            data[i] = np.clip(data[i], 0, 1)

                    # Recalculate distances
                    diff = data[:, np.newaxis, :] - data[np.newaxis, :, :]
                    distances = np.sqrt(np.sum(diff**2, axis=2))
                    np.fill_diagonal(distances, np.inf)
                    min_dist = distances.min()
                    if min_dist >= min_distance:
                        break

        # Calculate actual correlation
        corr_matrix = np.corrcoef(data[:, 0], data[:, 1])
        actual_corr = corr_matrix[0, 1]

        # Check if this is the best match so far
        error = abs(actual_corr - target_corr)
        if error < best_error:
            best_error = error
            best_data = data.copy()
            best_corr = actual_corr

            # If we're within tolerance, return immediately
            if error <= tolerance:
                coordinates = [[float(x), float(y)] for x, y in best_data]
                return coordinates, float(best_corr)

    # Return the best match found
    if best_data is not None:
        coordinates = [[float(x), float(y)] for x, y in best_data]
        return coordinates, float(best_corr)
    else:
        # Fallback (should never happen)
        coordinates = [[float(x), float(y)] for x, y in data]
        return coordinates, float(actual_corr)


def create_phase1_components():
    """Create phase 1 components: phase1 scatterplots with evenly distributed correlations
    Creates exactly 4*3 = 12 scatterplots (4 correlation levels * 3 scatterplots each)"""
    components = {}
    for corr in [2, 4, 6, 8]:  # 4 correlation levels
        base_target = corr * 0.1
        variance_range = 0.04
        min_target = base_target - variance_range
        max_target = base_target + variance_range

        # Clamp to valid correlation range [-1, 1]
        min_target = max(0.01, min_target)  # Ensure positive for phase 1
        max_target = min(0.99, max_target)

        # Generate evenly distributed target correlations
        num_scatterplots = 3  # 3 scatterplots per correlation level
        target_correlations = np.linspace(
            min_target, max_target, num_scatterplots)

        for i in range(num_scatterplots):
            for direction in ["pos"]:
                # Generate scatterplot coordinates with evenly distributed target correlation
                coordinates, actual_correlation = generate_scatterplot_data(
                    target_correlation=target_correlations[i])
                components[f"phase1_{corr}_{i}_{direction}"] = {
                    "baseComponent": "phase1",
                    "parameters": {
                        "coordinates": coordinates,
                        "example": False,
                        "correlation": actual_correlation,
                        "seconds": 5
                    }
                }
    return components


def create_phase2_components():
    """Phase 2 components, generated only for (label, corr, exp, condition) tuples that some scheme
    uses, plus one baseline (labels never shown, 5 s) per (label, corr, exp).
    Naming: phase2_{label_idx}_{corr}_{exp}_{before}_{after}_{display} and phase2_{label_idx}_{corr}_{exp}_base.
    Coordinates are generated once per (corr, label_idx, exp) with the same seeds as the other studies."""
    needed = {}
    for trials in SCHEMES:
        for t in trials:
            needed.setdefault((t["label_idx"], t["corr"], t["exp"]), set()).add(t["cond"])

    coords = {}
    for corr in [2, 4, 6, 8]:
        base_target = corr * 0.1
        min_target = max(0.01, base_target - 0.04)
        max_target = min(0.99, base_target + 0.04)
        target_correlations = np.linspace(min_target, max_target, len(labels) * 2)
        target_idx = 0
        for label_idx in range(len(labels)):
            for exp in range(2):
                np.random.seed(hash((corr, label_idx, exp)) % (2**32))
                coords[(label_idx, corr, exp)] = generate_scatterplot_data(target_correlation=target_correlations[target_idx])
                target_idx += 1
    np.random.seed(42)

    components = {}
    for (label_idx, corr, exp), conds in needed.items():
        label_text, x, y = labels[label_idx]
        coordinates, actual_correlation = coords[(label_idx, corr, exp)]
        common = {
            "coordinates": coordinates, "example": False, "correlation": actual_correlation,
            "label": label_text, "X": x, "Y": y, "corr": corr, "exp": exp, "label_idx": label_idx, "direction": "pos",
        }
        for cond in sorted(conds):
            before, after, display = cond
            components[f"phase2_{label_idx}_{corr}_{exp}_{cond_name(cond)}"] = {
                "baseComponent": "phase2",
                "parameters": {
                    **common,
                    "seconds": before + display + after,
                    "label_start": before,
                    "label_end": before + display,
                    "blur_before": before, "label_display": display, "blur_after": after,
                }
            }
        components[f"phase2_{label_idx}_{corr}_{exp}_base"] = {
            "baseComponent": "phase2",
            "parameters": {
                **common,
                "seconds": BASELINE_SECONDS,
                "label_start": BASELINE_SECONDS, "label_end": BASELINE_SECONDS,
                "blur_before": BASELINE_SECONDS, "label_display": 0, "blur_after": 0,
            }
        }
    return components


def create_phase2_example_components():
    """Create 2 example tasks for phase 2 with evenly distributed correlations"""
    example_labels = [
        ['The more hours people spend exercising, the better their health becomes.',
            'Hours spent exercising', 'Health score'],
        ['Students who study more hours per week tend to have higher test scores.',
            'Hours studied per week', 'Test scores'],
    ]

    example_conditions = [(2, 0, 3), (1, 1, 3)]

    # Use correlation level 5 (0.5) for examples, evenly distribute across [0.4, 0.6]
    base_target = 5 * 0.1  # 0.5
    variance_range = 0.04
    min_target = base_target - variance_range  # 0.4
    max_target = base_target + variance_range  # 0.6

    # Generate evenly distributed target correlations
    num_examples = len(example_labels)
    target_correlations = np.linspace(min_target, max_target, num_examples)

    components = {}
    for idx, label in enumerate(example_labels):
        label_text, x, y = label
        # Generate scatterplot coordinates with evenly distributed target correlation
        coordinates, actual_correlation = generate_scatterplot_data(
            target_correlation=target_correlations[idx])
        components[f"phase2_example_{idx + 1}"] = {
            "baseComponent": "phase2",
            "parameters": {
                "coordinates": coordinates,
                "example": True,
                "correlation": actual_correlation,
                "label": label_text,
                "X": x,
                "Y": y,
                "corr": 5,
                "exp": 0,
                "direction": "pos",
                "seconds": sum(example_conditions[idx]),
                "label_start": example_conditions[idx][0],
                "label_end": example_conditions[idx][0] + example_conditions[idx][2],
                "blur_before": example_conditions[idx][0],
                "label_display": example_conditions[idx][2],
                "blur_after": example_conditions[idx][1],
            }
        }
    return components


def create_phase3_components():
    """Create phase 3 components: text-only belief questions with only X, Y, label"""

    components = {}
    for label_idx, label in enumerate(labels):
        label_text, x, y = label
        components[f"phase3_{label_idx}"] = {
            "baseComponent": "phase3",
            "parameters": {
                "label": label_text,
                "X": x,
                "Y": y
            }
        }
    return components


def sequence_generator(phase1_components, phase2_components, phase2_example_components, phase3_components):
    """Generate the study sequence with scheme-based random for phase 2.

    Phase 2: 47 (blur_before, blur_after, label_display) conditions, 10 per participant.
    47 scheme blocks (see build_schemes); each holds 12 revealed trials + 12 matched baselines,
    interleaved randomly. The phase2 block uses order=latinSquare with numSamples=1, so
    reVISit deals the schemes out evenly (each scheme once per 47 participants).
    """

    # Each scheme gets ONE fixed, pre-shuffled order in which the two trials that share a
    # scatterplot (revealed + baseline) are at least MIN_GAP positions apart, so nobody sees the
    # same plot twice in a row. reVISit's "random" order cannot enforce that constraint, so the
    # shuffle is done here (seeded per scheme) and the block is emitted as "fixed".
    MIN_GAP = 4
    schemes = []
    for si, trials in enumerate(SCHEMES):
        pairs = []
        for t in trials:
            stem = f"phase2_{t['label_idx']}_{t['corr']}_{t['exp']}"
            pairs.append((f"{stem}_{cond_name(t['cond'])}", f"{stem}_base"))
        rng = np.random.RandomState(1000 + si)
        flat = [c for pr in pairs for c in pr]
        for _ in range(100000):
            order = list(rng.permutation(flat))
            pos = {c: i for i, c in enumerate(order)}
            if all(abs(pos[a] - pos[b]) >= MIN_GAP for a, b in pairs):
                break
        else:
            raise RuntimeError(f"could not separate pairs in scheme {si}")
        schemes.append({"id": f"scheme_{si}", "order": "fixed", "components": order})

    # Create list of example component names
    example_component_names = list(phase2_example_components.keys())

    sequence = {
        "order": "fixed",
        "components": [
            "consent",
            "attentionCheck",
            "phase3_intro",
            {
                "id": "phase3",
                "order": "random",
                "components": list(phase3_components.keys())
            },

            "phase1_intro",
            {
                "id": "phase1",
                "order": "random",
                "components": list(phase1_components.keys())
            },

            "phase2_intro",
            "phase2_examples",
            *example_component_names,  # Add the 2 example tasks

            "phase2_main",
            {
                "id": "phase2",
                "order": "latinSquare",
                "numSamples": 1,
                "components": schemes
            },

            "demographics"
        ],
    }
    return sequence


# Optional: Set Prolific redirection URL
prolificRedirection = "https://app.prolific.com/submissions/complete?cc=C1OCRYTV"
prolificRedirectionFailedAttentionCheck = "https://app.prolific.com/submissions/complete?cc=CASYDYPP"


# Generate components
default_components = create_default_components(
    prolificRedirectionFailedAttentionCheck)
phase1_components = create_phase1_components()
phase2_components = create_phase2_components()  # Now returns flat dict
phase2_example_components = create_phase2_example_components()
phase3_components = create_phase3_components()

# Combine all components (phase2_components is now a flat dict)
components = default_components | phase1_components | phase2_example_components | phase3_components | phase2_components

# Generate sequence
sequence = sequence_generator(
    phase1_components, phase2_components, phase2_example_components, phase3_components)
baseComponents = generate_base_components()

print(f"Total number of components: {len(components)}")
print(f"Components: {list(components.keys())[:10]}...")  # Print first 10
print(f"Sequence structure: {len(sequence['components'])} top-level items")

# Collect all correlation values from components
correlation_values = []
for comp_name, comp_data in components.items():
    if isinstance(comp_data, dict) and 'parameters' in comp_data:
        params = comp_data['parameters']
        if 'correlation' in params:
            correlation_values.append(params['correlation'])

# Print histogram of correlation values with fine granularity
if correlation_values:
    corr_array = np.array(correlation_values)
    print(f"\n{'='*60}")
    print(f"Correlation Values Histogram")
    print(f"{'='*60}")
    print(f"Total correlations: {len(correlation_values)}")
    print(f"Min: {corr_array.min():.4f}, Max: {corr_array.max():.4f}, Mean: {corr_array.mean():.4f}, Std: {corr_array.std():.4f}")

    # Create histogram with fine granularity (100 bins)
    bins = 100
    hist, bin_edges = np.histogram(
        corr_array, bins=bins, range=(corr_array.min(), corr_array.max()))

    # Find max count for scaling
    max_count = hist.max()

    # Print histogram
    print(f"\nHistogram (bins: {bins}):")
    print(f"{'Bin Range':<20} {'Count':<10} {'Bar'}")
    print("-" * 60)

    for i in range(len(hist)):
        bin_start = bin_edges[i]
        bin_end = bin_edges[i + 1]
        count = hist[i]
        # Create bar representation (scaled to 50 chars max)
        bar_length = int(50 * count / max_count) if max_count > 0 else 0
        bar = "█" * bar_length
        print(f"[{bin_start:7.4f}, {bin_end:7.4f})  {count:<10} {bar}")

    print(f"\n{'='*60}")
else:
    print("\nNo correlation values found in components.")


# Write the config.json file
with open(os.path.join(current_dir, "config.json"), "r") as f:
    config = json.load(f)

# Update the config with our components and sequence
config['components'] = components
config['sequence'] = sequence
config['baseComponents'] = baseComponents

# Update study end message if prolificRedirection is set
if 'prolificRedirection' in locals():
    config['uiConfig'][
        'studyEndMsg'] = f"**Thank you for completing the study. You may click this link and return to Prolific**: [{prolificRedirection}]({prolificRedirection})"

# Write the updated config
with open(os.path.join(current_dir, "config.json"), "w") as f:
    json.dump(config, f, indent=4)

print("Config file updated successfully!")
