import json
import os
from collections import defaultdict
import numpy as np

# fix all seeds
np.random.seed(42)

current_dir = os.path.dirname(os.path.abspath(__file__))

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


def generate_base_components():
    """Generate base components: phase2, phase1, and phase3"""
    return {
        "phase2": {
            "type": "react-component",
            "path": "scatterplot/assets/phase2_background.jsx",
            "response": [
                {
                    "id": "answer",
                    "prompt": "",
                    "required": True,
                    "location": "sidebar",
                    "type": "reactive"
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
                    "location": "sidebar",
                    "type": "reactive"
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
                    "location": "sidebar",
                    "type": "reactive"
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
            "path": "scatterplot3/assets/consent.md",
            "nextButtonText": "I agree",
            "response": []
        },
        "introduction": {
            "type": "markdown",
            "path": "scatterplot3/assets/introduction.md",
            "response": []
        },
        "phase1_intro": {
            "type": "markdown",
            "path": "scatterplot3/assets/phase1_intro.md",
            "response": []
        },
        "phase2_intro": {
            "type": "markdown",
            "path": "scatterplot3/assets/phase2_intro.md",
            "response": []
        },
        "phase2_examples": {
            "type": "markdown",
            "path": "scatterplot3/assets/phase2_examples.md",
            "response": []
        },
        "phase2_main": {
            "type": "markdown",
            "path": "scatterplot3/assets/phase2_main.md",
            "response": []
        },
        "phase3_intro": {
            "type": "markdown",
            "path": "scatterplot3/assets/phase3_intro.md",
            "response": []
        },
        "attentionCheckFailed": {
            "type": "react-component",
            "path": "scatterplot3/assets/attentionCheck.jsx",
            "parameters": {
                "link": fail_link
            },
            "response": [
                {
                    "id": "attention_check_failed_1",
                    "prompt": "",
                    "required": True,
                    "location": "sidebar",
                    "type": "reactive"
                }
            ],
            "instructionLocation": "belowStimulus",
            "nextButtonLocation": "belowStimulus",
        },
        "attentionCheck2": {
            "type": "questionnaire",
            "response": [
                {
                    "id": "attention_q2",
                    "prompt": "What makes a correlation stronger?",
                    "required": True,
                    "location": "aboveStimulus",
                    "type": "radio",
                    "options": [
                        "The steeper the line",
                        "The more data points there are",
                        "The smaller the correlation coefficient is",
                        "The closer r is to 1"
                    ],
                    "withDivider": True
                }
            ]
        },
        "attentionCheck1": {
            "type": "questionnaire",
            "response": [
                {
                    "id": "attention_q1",
                    "prompt": "What is the range of the correlation coefficient (r) that we will use in the experiment?",
                    "required": True,
                    "location": "aboveStimulus",
                    "type": "radio",
                    "options": [
                        "-1 to +1",
                        "1 to 7",
                        "0 to 1",
                        "0 to 10"
                    ],
                    "withDivider": True
                },
            ]
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
    """Create phase 1 components: plain scatterplots with evenly distributed correlations"""
    components = {}
    for corr in [2, 4, 6, 8]:
        base_target = corr * 0.1
        variance_range = 0.04
        min_target = base_target - variance_range
        max_target = base_target + variance_range

        # Clamp to valid correlation range [-1, 1]
        min_target = max(0.01, min_target)  # Ensure positive for phase 1
        max_target = min(0.99, max_target)

        # Generate evenly distributed target correlations
        num_scatterplots = 3
        target_correlations = np.linspace(
            min_target, max_target, num_scatterplots)

        for i in range(num_scatterplots):
            for direction in ["pos"]:
                # Generate scatterplot coordinates with evenly distributed target correlation
                coordinates, actual_correlation = generate_scatterplot_data(
                    target_correlation=target_correlations[i])
                components[f"plain_{corr}_{i}_{direction}"] = {
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
    """Create phase 2 components: scatterplots with labels"""

    components = defaultdict(dict)
    for corr in [2, 4, 6, 8]:
        base_target = corr * 0.1
        variance_range = 0.04
        min_target = base_target - variance_range
        max_target = base_target + variance_range

        # Clamp to valid correlation range [-1, 1]
        min_target = max(0.01, min_target)  # Ensure positive for phase 2
        max_target = min(0.99, max_target)

        # Calculate total number of scatterplots per correlation level
        num_experiments = 2
        num_labels = len(labels)
        total_scatterplots = num_experiments * num_labels
        label_seconds = 0

        # Generate evenly distributed target correlations
        target_correlations = np.linspace(min_target, max_target, total_scatterplots)
        target_idx = 0

        for i in range(num_experiments):  # for phase 2
            for direction in ["pos"]:
                for label_idx, label in enumerate(labels):
                    label_text, x, y = label
                    coordinates, actual_correlation = generate_scatterplot_data(target_correlation=target_correlations[target_idx])
                    target_idx += 1
                    components[label_text][f"phase2_{corr}_{i}_{direction}_{label_idx}_{label_seconds}"] = {
                        "baseComponent": "phase2",
                        "parameters": {
                            "coordinates": coordinates,
                            "example": False,
                            "correlation": actual_correlation,
                            "label": label_text,
                            "X": x,
                            "Y": y,
                            "corr": corr,
                            "exp": i,
                            "direction": direction,
                            "seconds": 5,
                            "label_seconds": label_seconds,
                            "type": "continuous" ## continuous or discrete
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

    example_seconds = 2.5

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
                "seconds": 5,
                "label_seconds": example_seconds
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
    """Generate the study sequence"""
    unrevealed_groups = [{
        "id": f"{label[0][:30]}",
        "order": "latinSquare",
        "numSamples": 1,
        "components": list(phase2_components[label[0]].keys())
    } for label in labels]

    # Create list of example component names
    example_component_names = list(phase2_example_components.keys())

    sequence = {
        "order": "fixed",
        "components": [
            "consent",
            "introduction",
            {
                "id": "attentionCheck1",
                "order": "fixed",
                "components": ["attentionCheck1", "attentionCheckFailed"],
                "skip": [
                    {
                        "name": "attentionCheck1",
                        "check": "response",
                        "comparison": "equal",
                        "responseId": "attention_q1",
                        "value": "0 to 1",
                        "to": "attentionCheck2"
                    }
                ]
            },
            {
                "id": "attentionCheck2",
                "order": "fixed",
                "components": ["attentionCheck2", "attentionCheckFailed"],
                "skip": [
                    {
                        "name": "attentionCheck2",
                        "check": "response",
                        "comparison": "equal",
                        "responseId": "attention_q2",
                        "value": "The closer r is to 1",
                        "to": "phase3_intro"
                    }
                ]
            },
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
                "order": "random",
                "components": unrevealed_groups
            },

            "demographics"
        ],
    }
    return sequence


# Optional: Set Prolific redirection URL
prolificRedirection = "https://app.prolific.com/submissions/complete?cc=C17DENOG"
prolificRedirectionFailedAttentionCheck = "https://app.prolific.com/submissions/complete?cc=CASYDYPP"


# Generate components
default_components = create_default_components(prolificRedirectionFailedAttentionCheck)
phase1_components = create_phase1_components()
phase2_components = create_phase2_components()
phase2_example_components = create_phase2_example_components()
phase3_components = create_phase3_components()

# Combine all components
components = default_components | phase1_components | phase2_example_components | phase3_components

for component in phase2_components.values():
    components |= component

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
