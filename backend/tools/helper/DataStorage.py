import json
# read captioning txt
import os

def read_captioning(file_path):
    with open(file_path, "r") as f:
        captioning_text = f.read()
    return captioning_text

def write_captioning(file_path, captioning_text):
    with open(file_path, "w") as f:
        f.write(captioning_text)

def read_ideas(file_path):
    # read into list of ideas using json
    if not os.path.exists(file_path):
        return []
    with open(file_path, "r") as f:
        return json.load(f)

def write_ideas(file_path, idea):
  # read dict of ideas from file first
    all_ideas = read_ideas(file_path)
    # append new idea to list
    all_ideas.append(idea)
    # write list of ideas into file
    with open(file_path, "w") as f:
        json.dump(all_ideas, f, indent=4)
    
def write_seeds(file_path, seeds):
    # write list of seeds into file
    with open(file_path, "w") as f:
        json.dump(seeds, f, indent=4)

def read_seed(file_path):
    # read into list of seeds
    if not os.path.exists(file_path):
        return None
    with open(file_path, "r") as f:
        return json.load(f)

def write_keywords(file_path, keywords):
    with open(file_path, "w") as f:
        json.dump(keywords, f, indent=4)
 
def read_keywords(file_path):
    # read into list of keywords

    if not os.path.exists(file_path):
        return []
    with open(file_path, "r") as f:
        return json.load(f) 

def write_prompt_overview(file_path, prompt_overview):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w") as f:
        json.dump(prompt_overview, f, indent=4)

def read_prompt_overview(file_path):
    # read into list of keywords
    if not os.path.exists(file_path):
        return []
    with open(file_path, "r") as f:
        return json.load(f)

def read_content_keywords(file_path):
    # read into list of keywords
    if not os.path.exists(file_path):
        return []
    with open(file_path, "r") as f:
        labels = []
        keywords = json.load(f)
        for area in keywords["Content"]:
            for keyword in keywords["Content"][area]:
                labels.append(keyword)
        return labels
    
def read_links(file_path):
    # read into list of links
    if not os.path.exists(file_path):
        return []
    with open(file_path, "r") as f:
        # return [line.split(",") for line in f.read().splitlines()]
        # use json
        return json.load(f)

def write_links(file_path, links):
    # write list of links into file
    all_links = read_links(file_path)
    all_links.append(links)
    with open(file_path, "w") as f:
        # for link in all_links:
        #     f.write(",".join(link) + "\n")
        # use json
        json.dump(all_links, f, indent=4)
            
def get_design_idea(hero_id, index):
    # get first line from text
    text = read_ideas(f"output/{hero_id:03d}/idea.json")[index]
    
    text = text.split('\n', 1)[0]
    # remove star * from text
    text = text.replace("*", "") 
    return text

# def get_keyword(hero_id, index):
#     # get first line from text
#     keywords = read_keywords(f"output/{hero_id:03d}/keywords.json")[index]
    
#     return keywords[0]