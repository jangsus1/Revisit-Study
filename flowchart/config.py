
import json
import os

current_dir = os.path.dirname(os.path.abspath(__file__))


def create_components():
    """Create the simplified components: consent, survey_intro, demographics, and flowchart"""
    return {
        "consent": {
            "type": "markdown",
            "path": "flowchart/assets/consent.md",
            "nextButtonText": "I agree",
            "response": []
        },
        "survey_intro": {
            "type": "markdown",
            "path": "flowchart/assets/introduction.md",
            "response": []
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
        },
        "flowchart": {
            "type": "react-component",
            "path": "flowchart/assets/flowchart.tsx",
            "response": [
                {
                    "id": "answer",
                    "prompt": "",
                    "required": True,
                    "location": "sidebar",
                    "type": "reactive"
                }
            ]
        }
    }


def create_sequence():
    """Create the study sequence with consent, survey_intro, demographics, and flowchart"""
    return {
        "order": "fixed",
        "components": [
            "consent",
            "survey_intro",
            "demographics",
            "flowchart"
        ]
    }


# Generate components and sequence
components = create_components()
sequence = create_sequence()

print(f"Total number of components: {len(components)}")
print(f"Components: {list(components.keys())}")
print(f"Sequence: {sequence['components']}")


# Optional: Set Prolific redirection URL
prolificRedirection = "https://app.prolific.com/submissions/complete?cc=C12B2Y1Z"


# Write the config.json file
with open(os.path.join(current_dir, "config.json"), "r") as f:
    config = json.load(f)

# Update the config with our components and sequence
config['components'] = components
config['sequence'] = sequence

# Update study end message if prolificRedirection is set
if 'prolificRedirection' in locals():
    config['uiConfig'][
        'studyEndMsg'] = f"**Thank you for completing the study. You may click this link and return to Prolific**: [{prolificRedirection}]({prolificRedirection})"

# Write the updated config
with open(os.path.join(current_dir, "config.json"), "w") as f:
    json.dump(config, f, indent=4)

print("Config file updated successfully!")
