import random
import numpy as np

def get_random_varieties(n=4):
    base_values = np.linspace(0, 1, n + 2)[1:-1]  # Exclude 0 and 1 for better spread
    perturbation = np.random.uniform(-0.05, 0.15, n)  # Small random offset
    varieties = sorted(np.clip(base_values + perturbation, 0, 1))  # Keep within [0,1]
    return varieties


def get_random_seed(n=1):
    seeds = []
    for i in range(n):
        seed = random.randint(0, 1000000)
        seeds.append(seed)
    return seeds

    
def parse_formatted_text(text):
    data_dict = {}
    lines = text.strip().split("\n")
    for line in lines:
        if ": " in line:
            key, value = line.split(": ", 1)
            data_dict[key.strip()] = value.strip()
        else:
            # Handle multi-line values properly
            if data_dict:
                last_key = list(data_dict.keys())[-1]
                data_dict[last_key] += " " + line.strip()
    return data_dict

