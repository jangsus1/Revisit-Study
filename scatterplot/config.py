import json
import os
from collections import defaultdict
import numpy as np

current_dir = os.path.dirname(os.path.abspath(__file__))


def generate_base_components():
    """Generate base components: bubble, plain, and phase3"""
    return {
        "bubble": {
            "type": "react-component",
            "path": "scatterplot/assets/phase2.jsx",
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
        "plain": {
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


def create_default_components():
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
            "path": "scatterplot/assets/phase2_intro.md",
            "response": []
        },
        "phase2_examples": {
            "type": "markdown",
            "path": "scatterplot/assets/phase2_examples.md",
            "response": []
        },
        "phase2_main": {
            "type": "markdown",
            "path": "scatterplot/assets/phase2_main.md",
            "response": []
        },
        "phase3_intro": {
            "type": "markdown",
            "path": "scatterplot/assets/phase3_intro.md",
            "response": []
        },
        "attentionCheck": {
            "type": "questionnaire",
            "instruction": "Please answer the following questions about the introduction you just read. You must correctly answer both questions to continue.",
            "response": [
                {
                    "id": "attention_q1",
                    "prompt": "What is the range of the correlation coefficient (r) that we will use in the experiment?",
                    "required": True,
                    "location": "aboveStimulus",
                    "type": "radio",
                    "options": [
                        "1 to 7",
                        "0 to 10",
                        "0 to 1",
                        "-1 to +1"
                    ],
                    "withDivider": True
                },
                {
                    "id": "attention_q2",
                    "prompt": "What makes a correlation stronger?",
                    "required": True,
                    "location": "aboveStimulus",
                    "type": "radio",
                    "options": [
                        "The steeper the line",
                        "The smaller the correlation coefficient is",
                        "The closer r is to 1",
                        "The more data points there are",
                    ],
                    "withDivider": True
                }
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


def generate_scatterplot_data(corr, direction, n_points=50, min_distance=0.04, max_attempts=50):
    """
    Generate scatterplot coordinates with target correlation near corr*0.1.
    The actual correlation will be within ±0.1 of the target correlation.

    Args:
        corr: Integer correlation level (e.g., 2, 4, 6, 8)
        direction: "pos" or "neg" for positive/negative correlation
        exp: Experiment number (for uniqueness)
        n_points: Number of points in scatterplot
        min_distance: Minimum distance between points (to avoid overlap)
        max_attempts: Maximum attempts to achieve target correlation

    Returns:
        tuple: (coordinates_list, actual_correlation)
        coordinates_list: List of [x, y] pairs, each in [0, 1] range
        actual_correlation: Will be within [target_corr - 0.1, target_corr + 0.1]
    """
    base_target_corr = corr * 0.1
    if direction == "neg":
        base_target_corr = -base_target_corr

    # Allow variance: target can vary within ±0.1 of base
    # This creates controlled variance while ensuring we stay within bounds
    variance_range = 0.1
    min_target = base_target_corr - variance_range
    max_target = base_target_corr + variance_range

    # Clamp to valid correlation range [-1, 1]
    min_target = max(-0.99, min_target)
    max_target = min(0.99, max_target)

    # Try multiple times to get correlation within acceptable range
    for attempt in range(max_attempts):
        # Generate a target correlation within the acceptable range (with some randomness)
        # This creates variance while ensuring we're within ±0.1 of base
        if attempt < max_attempts // 2:
            # First half: try to get close to base target
            target_corr = base_target_corr + \
                np.random.uniform(-variance_range * 0.5, variance_range * 0.5)
        else:
            # Second half: allow more variance within the acceptable range
            target_corr = np.random.uniform(min_target, max_target)

        # Clamp target correlation
        target_corr = np.clip(target_corr, -0.99, 0.99)

        # Generate correlated bivariate normal data
        mean = [0, 0]
        cov = [[1.0, target_corr], [target_corr, 1.0]]

        # Generate initial data
        try:
            data = np.random.multivariate_normal(mean, cov, n_points)
        except np.linalg.LinAlgError:
            # If covariance matrix is not positive definite, use identity and add correlation manually
            data = np.random.randn(n_points, 2)
            # Add correlation by mixing the variables
            data[:, 1] = target_corr * data[:, 0] + \
                np.sqrt(max(0.01, 1 - target_corr**2)) * data[:, 1]

        # Scale to [0, 1] range
        data_ranges = data.max(axis=0) - data.min(axis=0)
        # Avoid division by zero
        data_ranges[data_ranges == 0] = 1.0
        data = (data - data.min(axis=0)) / data_ranges

        # Check for overlapping points and adjust
        if len(data) > 1:
            # Calculate pairwise distances using numpy
            diff = data[:, np.newaxis, :] - data[np.newaxis, :, :]
            distances = np.sqrt(np.sum(diff**2, axis=2))
            np.fill_diagonal(distances, np.inf)
            min_dist = distances.min()

            # If points are too close, jitter them
            if min_dist < min_distance:
                for _ in range(5):  # Try jittering up to 5 times
                    too_close = distances < min_distance
                    for i in range(len(data)):
                        close_indices = np.where(too_close[i])[0]
                        if len(close_indices) > 0:
                            # Add small random jitter
                            jitter = np.random.normal(0, min_distance * 0.5, 2)
                            data[i] += jitter
                            data[i] = np.clip(data[i], 0, 1)

                    # Recalculate distances
                    diff = data[:, np.newaxis, :] - data[np.newaxis, :, :]
                    distances = np.sqrt(np.sum(diff**2, axis=2))
                    np.fill_diagonal(distances, np.inf)
                    min_dist = distances.min()
                    if min_dist >= min_distance:
                        break

        # Calculate actual correlation using numpy
        corr_matrix = np.corrcoef(data[:, 0], data[:, 1])
        actual_corr = corr_matrix[0, 1]

        # Check if correlation is within acceptable range (±0.1 of base target)
        if min_target <= actual_corr <= max_target:
            # Found acceptable correlation, use this data
            coordinates = [[float(x), float(y)] for x, y in data]
            return coordinates, float(actual_corr)

    # If we couldn't find one within range after max_attempts, use the last one
    # (This should rarely happen, but provides a fallback)
    coordinates = [[float(x), float(y)] for x, y in data]
    return coordinates, float(actual_corr)


def create_phase1_components():
    """Create phase 1 components: plain scatterplots"""
    components = {}
    for corr in [2, 4, 6, 8]:
        for i in range(6):  # for phase 1
            for direction in ["pos"]:
                # Generate scatterplot coordinates with target correlation
                coordinates, actual_correlation = generate_scatterplot_data(
                    corr, direction)
                components[f"plain_{corr}_{i}_{direction}"] = {
                    "baseComponent": "plain",
                    "parameters": {
                        "coordinates": coordinates,
                        "example": False,
                        "correlation": actual_correlation,
                        "seconds": 5
                    }
                }
    return components


def create_phase2_components():
    """Create phase 2 components: bubble scatterplots with labels"""
    labels = [
        # Neutral
        ['As the usage of internet increases, so does the homicide rate in the city.',
            'Increasing internet usage', 'Higher homicide rate in the city'],
        ['People who eat more cheese, tend to be better at dancing.',
            'Eating more cheese', 'Better at dancing'],
        ['The more students wear glasses, the later the gym closes on campus.',
            'More students wearing glasses', 'Gym closing later on campus'],
        ['A city with more lawyers, tends to have more trees.',
            'Having more lawyers in a city', 'Having more trees in the city'],

        # Positive
        ['The more often students eat breakfast, the higher their GPAs are.',
            'Eating breakfast more often', 'Having a higher GPA'],
        ['A worker with a longer commute, tends to be more stressed.',
            'Commuting for a longer time', 'Being more stressed'],
        ['People who sleep more, tend to be happier with their lives.',
            'Sleeping more', 'Being happier with life'],
        ['As the number of environmental regulations increases, so does the air quality in the city.',
            'Having more environmental regulations', 'Improving air quality in the city'],

        # New Neutral
        ['The more people buy socks, the more pigeons appear in the park.',
            'Buying more socks', 'Seeing more pigeons in the park'],
        ['As the number of cats in the city increases, the library\'s carpet gets replaced more often.',
            'Number of cats in city', 'Library carpet replacement frequency'],

        # Semi-positive
        ['The more drivers wear seatbelts, the more survivors there are in accidents.',
            'Percentage of drivers wearing seatbelts', 'More accident survivors'],
        ['The more probiotic yogurt people buy, the more toilet paper sales go up.',
            'Probiotic yogurt sales', 'Toilet paper sales'],
    ]

    components = defaultdict(dict)
    for corr in [4, 6, 8]:
        for i in range(2):  # for phase 2
            for direction in ["pos"]:
                for label_idx, label in enumerate(labels):
                    label_text, x, y = label
                    # Generate scatterplot coordinates with target correlation
                    coordinates, actual_correlation = generate_scatterplot_data(
                        corr, direction)
                    for label_time in [0, 2, 5]:
                        components[label_text][f"phase2_{corr}_{i}_{direction}_{label_idx}_{label_time}"] = {
                            "baseComponent": "bubble",
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
                                "label_seconds": label_time
                            }
                        }
    return components


def create_phase2_example_components():
    """Create 2 example tasks for phase 2"""
    example_labels = [
        ['The more hours people spend exercising, the better their health becomes.',
            'Hours spent exercising', 'Health score'],
        ['Students who study more hours per week tend to have higher test scores.',
            'Hours studied per week', 'Test scores'],
    ]

    example_seconds = [2, 5]

    components = {}
    for idx, label in enumerate(example_labels):
        label_text, x, y = label
        # Use correlation level 5 (0.5) for examples
        coordinates, actual_correlation = generate_scatterplot_data(5, "pos")
        components[f"phase2_example_{idx + 1}"] = {
            "baseComponent": "bubble",
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
                "label_seconds": example_seconds[idx]
            }
        }
    return components


def create_phase3_components():
    """Create phase 3 components: text-only belief questions with only X, Y, label"""
    labels = [
        # Neutral
        ['As the usage of internet increases, so does the homicide rate in the city.',
            'Increasing internet usage', 'Higher homicide rate in the city'],
        ['People who eat more cheese, tend to be better at dancing.',
            'Eating more cheese', 'Better at dancing'],
        ['The more students wear glasses, the later the gym closes on campus.',
            'More students wearing glasses', 'Gym closing later on campus'],
        ['A city with more lawyers, tends to have more trees.',
            'Having more lawyers in a city', 'Having more trees in the city'],

        # Positive
        ['The more often students eat breakfast, the higher their GPAs are.',
            'Eating breakfast more often', 'Having a higher GPA'],
        ['A worker with a longer commute, tends to be more stressed.',
            'Commuting for a longer time', 'Being more stressed'],
        ['People who sleep more, tend to be happier with their lives.',
            'Sleeping more', 'Being happier with life'],
        ['As the number of environmental regulations increases, so does the air quality in the city.',
            'Having more environmental regulations', 'Improving air quality in the city'],

        # New Neutral
        ['The more people buy socks, the more pigeons appear in the park.',
            'Buying more socks', 'Seeing more pigeons in the park'],
        ['As the number of cats in the city increases, the library\'s carpet gets replaced more often.',
            'Number of cats in city', 'Library carpet replacement frequency'],

        # Semi-positive
        ['The more drivers wear seatbelts, the more survivors there are in accidents.',
            'Percentage of drivers wearing seatbelts', 'More accident survivors'],
        ['The more probiotic yogurt people buy, the more toilet paper sales go up.',
            'Probiotic yogurt sales', 'Toilet paper sales'],
    ]

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
    groups = [{
        "id": label[:30],
        "order": "latinSquare",
        "numSamples": 1,
        "components": list(phase2_components[label].keys())
    } for label in phase2_components.keys()]

    # Create list of example component names
    example_component_names = list(phase2_example_components.keys())

    sequence = {
        "order": "fixed",
        "components": [
            "consent",
            "introduction",
            {
                "id": "attentionCheck",
                "order": "fixed",
                "components": ["attentionCheck"],
                "skip": [
                    {
                        "name": "attentionCheck",
                        "check": "response",
                        "comparison": "notEqual",
                        "responseId": "attention_q1",
                        "value": "0 to 1",
                        "to": "end"
                    },
                    {
                        "name": "attentionCheck",
                        "check": "response",
                        "comparison": "notEqual",
                        "responseId": "attention_q2",
                        "value": "The closer r is to 1",
                        "to": "end"
                    }
                ]
            },
            "phase1_intro",
            {
                "id": "phase1",
                "order": "latinSquare",
                "components": list(phase1_components.keys())
            },
            "phase2_intro",
            "phase2_examples",
            *example_component_names,  # Add the 2 example tasks
            "phase2_main",
            {
                "id": "phase2",
                "order": "latinSquare",
                "components": groups
            },
            "phase3_intro",
            {
                "id": "phase3",
                "order": "latinSquare",
                "components": list(phase3_components.keys())
            },
            "demographics"
        ],
    }
    return sequence


# Generate components
default_components = create_default_components()
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


# Optional: Set Prolific redirection URL
prolificRedirection = "https://app.prolific.com/submissions/complete?cc=C12B2Y1Z"


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
